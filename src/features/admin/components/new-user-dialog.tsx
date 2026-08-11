import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Plus, X } from 'lucide-react';
import { z } from 'zod';

import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/components/ui/form';
import { Input } from '@/shared/components/ui/input';
import { Select } from '@/shared/components/ui/select';
import { errorMessage } from '@/shared/lib/errors';
import { className as formatClassName } from '@/shared/utils/format';
import type { EmploymentType, Gender, GuardianRelationship } from '@/shared/types';

import { CAPABILITIES, CAPABILITY_LABEL, type Capability } from '../api/administrators.service';
import type { CreatedAccount, ProvisionableRole } from '../api/users.service';
import { useClasses } from '../hooks/use-admin-academics';
import { useStudentOptions, useUserProvisioning } from '../hooks/use-admin-users';
import { CredentialDialog } from './credential-dialog';

/**
 * Account creation, for all three roles.
 *
 * One component rather than three because the differences are a handful of
 * fields at the bottom of an otherwise identical form — the identity block, the
 * email rules and the credential hand-off are the same whoever is being added,
 * and three copies of that would drift.
 *
 * Note what is *not* here: a password field. The administrator never chooses a
 * credential on someone else's behalf. The server mints one, returns it once,
 * and this dialog hands it over.
 */

const RELATIONSHIPS: { value: GuardianRelationship; label: string }[] = [
  { value: 'father', label: 'Father' },
  { value: 'mother', label: 'Mother' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'other', label: 'Other' },
];

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full time' },
  { value: 'part_time', label: 'Part time' },
  { value: 'contract', label: 'Contract' },
  { value: 'visiting', label: 'Visiting' },
];

const GENDERS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
  { value: 'undisclosed', label: 'Prefer not to say' },
];

const ROLE_COPY: Record<ProvisionableRole, { title: string; description: string }> = {
  student: {
    title: 'Admit a student',
    description:
      'Creates their sign-in and their place on the roll. Leave the admission number blank and one is generated.',
  },
  teacher: {
    title: 'Add a member of staff',
    description:
      'Creates their sign-in and staff record. Assign them to classes and subjects once the record exists.',
  },
  parent: {
    title: 'Add a parent or guardian',
    description:
      'Creates their sign-in and links them to their children. They see only the records of the children linked here.',
  },
  administrator: {
    title: 'Add an administrator',
    description:
      'Creates their sign-in and grants the permissions you tick below. They can see the school either way — what you choose here is what they may change.',
  },
};

const schema = z.object({
  firstName: z.string().trim().min(2, 'Enter their first name').max(80),
  lastName: z.string().trim().min(2, 'Enter their surname').max(80),
  middleName: z.string().trim().max(80),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, 'Enter an email address')
    // Same pattern as the CHECK constraint on `users.email`, so the form and
    // the database cannot disagree about what an address looks like.
    .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'That does not look like an email address'),
  phone: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || /^\+?[0-9 ()-]{7,20}$/.test(value),
      'That does not look like a phone number',
    ),
  gender: z.string(),
  dateOfBirth: z.string(),

  admissionNumber: z.string().trim().max(60),
  admissionDate: z.string(),
  classId: z.string(),

  staffNumber: z.string().trim().max(60),
  employmentType: z.string(),
  qualification: z.string().trim().max(200),
  specialization: z.string().trim().max(200),
  hireDate: z.string(),

  occupation: z.string().trim().max(200),
  employer: z.string().trim().max(200),
  address: z.string().trim().max(300),

  sendWelcomeEmail: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  firstName: '',
  lastName: '',
  middleName: '',
  email: '',
  phone: '',
  gender: '',
  dateOfBirth: '',
  admissionNumber: '',
  admissionDate: '',
  classId: '',
  staffNumber: '',
  employmentType: 'full_time',
  qualification: '',
  specialization: '',
  hireDate: '',
  occupation: '',
  employer: '',
  address: '',
  sendWelcomeEmail: true,
};

/**
 * An untouched optional input yields `''`, but these columns are nullable and
 * mean "not set". Blank has to become null or `department is null` style filters
 * quietly stop matching.
 */
function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

interface ChildLink {
  studentId: string;
  relationship: GuardianRelationship;
  isPrimaryContact: boolean;
}

export function NewUserDialog({
  open,
  onOpenChange,
  role,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: ProvisionableRole;
}) {
  const { create } = useUserProvisioning();
  const [children, setChildren] = useState<ChildLink[]>([]);
  const [issued, setIssued] = useState<CreatedAccount | null>(null);
  // Deliberately starts empty. A new administrator who can do nothing is a
  // safe mistake; one who can do everything because the form pre-ticked the
  // boxes is not.
  const [capabilities, setCapabilities] = useState<Capability[]>([]);

  const classes = useClasses();
  // Only pulled once a guardian is actually being added — the picker needs the
  // whole roll, and no other role has any use for it.
  const students = useStudentOptions(open && role === 'parent');

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  // A dialog that reopens holding the last person's details is how a phone
  // number ends up on the wrong record.
  useEffect(() => {
    if (open) {
      form.reset(EMPTY);
      setChildren([]);
      setCapabilities([]);
      create.reset();
    }
    // `form` and `create` are stable across renders; re-running on their
    // identity would reset the form mid-edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = form.handleSubmit((values) => {
    create.mutate(
      {
        role,
        email: values.email,
        firstName: values.firstName,
        lastName: values.lastName,
        middleName: orNull(values.middleName),
        phone: orNull(values.phone),
        // The select can only hold a value from GENDERS or '', and orNull()
        // turns '' into the null the column means by "not set".
        gender: orNull(values.gender) as Gender | null,
        dateOfBirth: orNull(values.dateOfBirth),
        sendWelcomeEmail: values.sendWelcomeEmail,

        ...(role === 'administrator' ? { capabilities } : {}),

        ...(role === 'student'
          ? {
              student: {
                admissionNumber: orNull(values.admissionNumber),
                admissionDate: orNull(values.admissionDate),
                classId: orNull(values.classId),
              },
            }
          : {}),

        ...(role === 'teacher'
          ? {
              teacher: {
                staffNumber: orNull(values.staffNumber),
                employmentType: values.employmentType as EmploymentType,
                qualification: orNull(values.qualification),
                specialization: orNull(values.specialization),
                hireDate: orNull(values.hireDate),
              },
            }
          : {}),

        ...(role === 'parent'
          ? {
              parent: {
                occupation: orNull(values.occupation),
                employer: orNull(values.employer),
                address: orNull(values.address),
                children,
              },
            }
          : {}),
      },
      {
        onSuccess: (account) => {
          // Swap the form for the credential hand-off rather than stacking two
          // dialogs on top of each other.
          onOpenChange(false);
          setIssued(account);
        },
      },
    );
  });

  const copy = ROLE_COPY[role];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={onSubmit} noValidate>
              <DialogBody>
                {create.error ? (
                  <Alert variant="destructive">
                    <AlertDescription>{errorMessage(create.error)}</AlertDescription>
                  </Alert>
                ) : null}

                {/* ── Identity ─────────────────────────────────────────── */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First name</FormLabel>
                        <FormControl>
                          <Input {...field} autoFocus autoComplete="off" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Surname</FormLabel>
                        <FormControl>
                          <Input {...field} autoComplete="off" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="middleName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Middle name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Optional" autoComplete="off" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email address</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" autoComplete="off" />
                      </FormControl>
                      <FormDescription>
                        This is what they sign in with. It must be unique across the school.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Optional" inputMode="tel" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Gender</FormLabel>
                        <FormControl>
                          <Select {...field} placeholder="Not set" options={GENDERS} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dateOfBirth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date of birth</FormLabel>
                        <FormControl>
                          <Input {...field} type="date" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* ── Administrator ────────────────────────────────────── */}
                {role === 'administrator' ? (
                  <div className="space-y-2 border-t border-border pt-4">
                    <p className="text-[13px] font-semibold text-ink">Permissions</p>
                    <p className="text-[12.5px] text-ink-3">
                      What this administrator may change. They can read the school either way — an
                      exams officer who cannot see a class list cannot do the job. Nothing is ticked
                      by default; you can change these at any time.
                    </p>

                    <div className="grid gap-2 pt-1 sm:grid-cols-2">
                      {CAPABILITIES.map((capability) => {
                        const on = capabilities.includes(capability);
                        const meta = CAPABILITY_LABEL[capability];

                        return (
                          <label
                            key={capability}
                            className={
                              on
                                ? 'flex cursor-pointer items-start gap-2.5 rounded-lg border border-brand-border bg-brand-soft/40 p-2.5'
                                : 'flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-surface-2 p-2.5'
                            }
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={(event) => {
                                setCapabilities((current) =>
                                  event.target.checked
                                    ? [...current, capability]
                                    : current.filter((entry) => entry !== capability),
                                );
                              }}
                              className="mt-0.5 size-4 shrink-0 rounded border-border"
                            />
                            <span className="min-w-0">
                              <span className="block text-[13px] font-semibold text-ink">
                                {meta.title}
                              </span>
                              <span className="block text-[11.5px] text-ink-3">
                                {meta.description}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                {/* ── Student ──────────────────────────────────────────── */}
                {role === 'student' ? (
                  <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="admissionNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Admission number</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Generated if blank"
                              className="font-mono"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="admissionDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Admission date</FormLabel>
                          <FormControl>
                            <Input {...field} type="date" />
                          </FormControl>
                          <FormDescription>Defaults to today.</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="classId"
                      render={({ field }) => (
                        <FormItem className="sm:col-span-2">
                          <FormLabel>Class</FormLabel>
                          <FormControl>
                            <Select
                              {...field}
                              placeholder={classes.isPending ? 'Loading classes…' : 'Enrol later'}
                              disabled={classes.isPending}
                              options={(classes.data ?? []).map((row) => ({
                                value: row.id,
                                label: `${formatClassName(row.name, row.arm)} · ${row.student_count}/${row.capacity} enrolled`,
                              }))}
                            />
                          </FormControl>
                          <FormDescription>
                            Enrols them for the term that class belongs to. You can do this later
                            from the class roster.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                ) : null}

                {/* ── Teacher ──────────────────────────────────────────── */}
                {role === 'teacher' ? (
                  <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="staffNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Staff number</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="Generated if blank"
                              className="font-mono"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="employmentType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Employment</FormLabel>
                          <FormControl>
                            <Select {...field} options={EMPLOYMENT_TYPES} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="qualification"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Qualification</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="B.Ed. Mathematics" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="specialization"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Specialisation</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Further Mathematics" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="hireDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Hire date</FormLabel>
                          <FormControl>
                            <Input {...field} type="date" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                ) : null}

                {/* ── Parent ───────────────────────────────────────────── */}
                {role === 'parent' ? (
                  <div className="space-y-4 border-t border-border pt-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="occupation"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Occupation</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Optional" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="employer"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Employer</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Optional" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="Optional" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <ChildPicker
                      options={students.data ?? []}
                      isLoading={students.isPending}
                      links={children}
                      onChange={setChildren}
                    />
                  </div>
                ) : null}

                <label className="flex cursor-pointer items-start gap-2.5 border-t border-border pt-4 text-[13px] font-medium text-ink-2">
                  <input
                    type="checkbox"
                    checked={form.watch('sendWelcomeEmail')}
                    onChange={(event) => {
                      form.setValue('sendWelcomeEmail', event.target.checked);
                    }}
                    className="mt-0.5 size-3.5 accent-brand"
                  />
                  <span>
                    Send a welcome email
                    <span className="block text-[12px] font-normal text-ink-3">
                      Tells them the account exists and where to sign in. The password is never
                      emailed — you hand that over yourself.
                    </span>
                  </span>
                </label>
              </DialogBody>

              <DialogFooter>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    onOpenChange(false);
                  }}
                  disabled={create.isPending}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={create.isPending}>
                  {copy.title}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <CredentialDialog
        open={issued !== null}
        onOpenChange={(next) => {
          if (!next) setIssued(null);
        }}
        title="Account created"
        fullName={issued?.fullName ?? ''}
        email={issued?.email ?? ''}
        password={issued?.temporaryPassword ?? ''}
      />
    </>
  );
}

// ── Guardian → child links ──────────────────────────────────────────────────

function ChildPicker({
  options,
  isLoading,
  links,
  onChange,
}: {
  options: { id: string; label: string; admissionNumber: string }[];
  isLoading: boolean;
  links: ChildLink[];
  onChange: (next: ChildLink[]) => void;
}) {
  const [pending, setPending] = useState('');

  const byId = new Map(options.map((option) => [option.id, option]));
  const chosen = new Set(links.map((link) => link.studentId));

  const add = () => {
    if (!pending || chosen.has(pending)) return;
    onChange([
      ...links,
      {
        studentId: pending,
        relationship: 'guardian',
        // The first child linked is the one the school will ring, unless the
        // administrator says otherwise. `parent_students_one_primary_per_student`
        // keeps this honest at the database level.
        isPrimaryContact: links.length === 0,
      },
    ]);
    setPending('');
  };

  return (
    <div className="space-y-2">
      <p className="text-[13px] font-semibold text-ink-2">Children</p>

      <div className="flex gap-2">
        <div className="flex-1">
          <Select
            value={pending}
            onChange={(event) => {
              setPending(event.target.value);
            }}
            disabled={isLoading}
            placeholder={isLoading ? 'Loading students…' : 'Choose a student'}
            options={options.map((option) => ({
              value: option.id,
              label: `${option.label} · ${option.admissionNumber}`,
              disabled: chosen.has(option.id),
            }))}
            aria-label="Student to link"
          />
        </div>
        <Button type="button" variant="secondary" onClick={add} disabled={!pending}>
          <Plus className="size-4" aria-hidden />
          Link
        </Button>
      </div>

      {links.length === 0 ? (
        <p className="text-[12.5px] text-ink-3">
          A guardian with no children linked can sign in but sees nothing. You can link them later.
        </p>
      ) : (
        <ul className="space-y-2">
          {links.map((link) => (
            <li
              key={link.studentId}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2"
            >
              <span className="flex-1 truncate text-[13.5px] font-semibold text-ink">
                {byId.get(link.studentId)?.label ?? 'Student'}
              </span>

              <Select
                value={link.relationship}
                onChange={(event) => {
                  onChange(
                    links.map((row) =>
                      row.studentId === link.studentId
                        ? { ...row, relationship: event.target.value as GuardianRelationship }
                        : row,
                    ),
                  );
                }}
                options={RELATIONSHIPS}
                className="h-8 w-auto text-[13px]"
                aria-label="Relationship"
              />

              <label className="flex cursor-pointer items-center gap-1.5 text-[12.5px] font-medium text-ink-2">
                <input
                  type="checkbox"
                  checked={link.isPrimaryContact}
                  onChange={(event) => {
                    onChange(
                      links.map((row) =>
                        row.studentId === link.studentId
                          ? { ...row, isPrimaryContact: event.target.checked }
                          : row,
                      ),
                    );
                  }}
                  className="size-3.5 accent-brand"
                />
                Primary
              </label>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remove child"
                onClick={() => {
                  onChange(links.filter((row) => row.studentId !== link.studentId));
                }}
              >
                <X className="size-3.5" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {links.length > 0 && !links.some((link) => link.isPrimaryContact) ? (
        <Badge variant="warning">No primary contact chosen</Badge>
      ) : null}
    </div>
  );
}
