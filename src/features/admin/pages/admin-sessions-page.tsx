import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { CalendarRange, CheckCircle2, Plus } from 'lucide-react';
import { z } from 'zod';

import { useCurrentUser } from '@/features/auth';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { DataTable, type Column } from '@/shared/components/data-table';
import { PageHeader } from '@/shared/components/page-header';
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
import { TERM_LABEL } from '@/shared/lib/constants';
import type { AcademicSession } from '@/shared/types';
import { formatDate } from '@/shared/utils/format';

import { useSessionMutations, useSessions } from '../hooks/use-admin-academics';

/**
 * Academic sessions — one row per term.
 *
 * Exactly one term can be current, and that is enforced by a partial unique
 * index rather than by this screen. Activation is therefore a deliberate,
 * separate action with a confirmation, not a toggle in the create form: making
 * a term current re-points every class, enrolment and timetable query in the
 * application.
 */

const sessionSchema = z
  .object({
    name: z.string().regex(/^\d{4}\/\d{4}$/, 'Format: 2025/2026'),
    term: z.enum(['first', 'second', 'third']),
    starts_on: z.string().min(1, 'Choose a start date'),
    ends_on: z.string().min(1, 'Choose an end date'),
  })
  .refine((values) => new Date(values.ends_on) > new Date(values.starts_on), {
    message: 'The end date must be after the start date',
    path: ['ends_on'],
  });

type SessionInput = z.infer<typeof sessionSchema>;

export default function AdminSessionsPage() {
  const { school } = useCurrentUser();
  const [creating, setCreating] = useState(false);
  const [activating, setActivating] = useState<AcademicSession | null>(null);

  const { data, isPending, error } = useSessions();
  const { activate } = useSessionMutations();

  const current = (data ?? []).find((session) => session.is_current) ?? null;

  const columns: Column<AcademicSession>[] = [
    {
      id: 'session',
      header: 'Session',
      cell: (row) => (
        <div>
          <p className="font-semibold text-ink">{row.name}</p>
          <p className="text-[12px] text-ink-3">{TERM_LABEL[row.term]}</p>
        </div>
      ),
    },
    {
      id: 'dates',
      header: 'Runs',
      secondary: true,
      cell: (row) => (
        <span className="whitespace-nowrap text-ink-2">
          {formatDate(row.starts_on)} – {formatDate(row.ends_on)}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: (row) =>
        row.is_current ? (
          <Badge variant="success">Active</Badge>
        ) : new Date(row.ends_on) < new Date() ? (
          <Badge variant="neutral">Ended</Badge>
        ) : (
          <Badge variant="outline">Upcoming</Badge>
        ),
    },
    {
      id: 'actions',
      header: '',
      className: 'text-right',
      cell: (row) =>
        row.is_current ? (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-success">
            <CheckCircle2 className="size-3.5" aria-hidden />
            Current
          </span>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setActivating(row);
            }}
          >
            Make current
          </Button>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Academic sessions"
        description="Terms within a session year. One term is current at a time."
        actions={
          <Button
            onClick={() => {
              setCreating(true);
            }}
          >
            <Plus className="size-4" aria-hidden />
            New term
          </Button>
        }
      />

      {current ? (
        <Alert variant="info">
          <AlertDescription>
            <strong>
              {current.name} · {TERM_LABEL[current.term]}
            </strong>{' '}
            is the active session. Classes, enrolments, assignments and timetables all resolve
            against it.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="warning">
          <AlertDescription>
            No session is active. Until one is, staff and students will see empty timetables and
            class lists.
          </AlertDescription>
        </Alert>
      )}

      <DataTable
        rows={data ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        isLoading={isPending}
        error={error}
        empty={{
          icon: CalendarRange,
          title: 'No sessions yet',
          description: 'Create the first term to start enrolling classes.',
        }}
      />

      <SessionDialog open={creating} onOpenChange={setCreating} schoolId={school?.id ?? null} />

      <ConfirmDialog
        open={activating !== null}
        onOpenChange={(open) => {
          if (!open) setActivating(null);
        }}
        title="Change the active session?"
        description={
          <>
            <strong>
              {activating?.name} · {activating ? TERM_LABEL[activating.term] : ''}
            </strong>{' '}
            becomes current, and{' '}
            {current ? (
              <strong>
                {current.name} {current ? TERM_LABEL[current.term] : ''}
              </strong>
            ) : (
              'the previous term'
            )}{' '}
            is stood down. Every timetable, class list and gradebook in the application will switch
            to the new term. Work already recorded is not changed.
          </>
        }
        confirmLabel="Make current"
        isPending={activate.isPending}
        onConfirm={() => {
          if (!activating) return;
          activate.mutate(activating.id, {
            onSuccess: () => {
              setActivating(null);
            },
          });
        }}
      />
    </div>
  );
}

function SessionDialog({
  open,
  onOpenChange,
  schoolId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string | null;
}) {
  const { create } = useSessionMutations();

  const form = useForm<SessionInput>({
    resolver: zodResolver(sessionSchema),
    defaultValues: { name: '', term: 'first', starts_on: '', ends_on: '' },
  });

  const onSubmit = form.handleSubmit((values) => {
    if (!schoolId) return;
    create.mutate(
      { ...values, school_id: schoolId },
      {
        onSuccess: () => {
          form.reset();
          onOpenChange(false);
        },
      },
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New term</DialogTitle>
          <DialogDescription>
            Created as inactive. Activate it separately when the term begins.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} noValidate>
            <DialogBody>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Session year</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="2025/2026" autoFocus />
                      </FormControl>
                      <FormDescription>Four digits, slash, four digits.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="term"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Term</FormLabel>
                      <FormControl>
                        <Select
                          {...field}
                          options={[
                            { value: 'first', label: 'First Term' },
                            { value: 'second', label: 'Second Term' },
                            { value: 'third', label: 'Third Term' },
                          ]}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="starts_on"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Starts</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="ends_on"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ends</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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
              <Button type="submit" loading={create.isPending} disabled={!schoolId}>
                Create term
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
