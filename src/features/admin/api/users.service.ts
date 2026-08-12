import { invokeFunction } from '@/shared/lib/api-client';
import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type {
  EmploymentType,
  Gender,
  GuardianRelationship,
  Parent,
  Teacher,
  UserStatus,
} from '@/shared/types';

/**
 * People management.
 *
 * Split down the middle, and the line matters:
 *
 *   reads    → PostgREST. `teachers_select_school` and `parents_select_authorised`
 *              already scope a directory to the caller's school, so a plain
 *              select is both simpler and safer than a function that would have
 *              to re-derive the same rule.
 *
 *   writes   → the `admin-users` Edge Function. Creating a login, setting
 *              someone else's password and ending their sessions are GoTrue
 *              admin calls; they need the service-role key, and that key must
 *              never be in a browser bundle.
 *
 * Editing a profile that already exists is a read-side operation in this sense —
 * it is an ordinary UPDATE behind RLS, and lives in the services beside it.
 */

// ── Provisioning (Edge Function) ────────────────────────────────────────────

/**
 * `administrator` is provisionable, but only by the founding administrator —
 * the Edge Function refuses it for anybody else, and so does
 * `user_roles_insert_admin`. Listing it here does not grant it.
 */
export type ProvisionableRole = 'student' | 'teacher' | 'parent' | 'administrator';

export interface CreateUserInput {
  role: ProvisionableRole;
  email: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  phone?: string | null;
  gender?: Gender | null;
  dateOfBirth?: string | null;
  /** Best effort; silently skipped when the deployment has no mail provider. */
  sendWelcomeEmail?: boolean;

  /** Administrator grants only. Ignored for every other role. */
  capabilities?: string[];

  student?: {
    admissionNumber?: string | null;
    admissionDate?: string | null;
    classId?: string | null;
    address?: string | null;
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
  };

  teacher?: {
    staffNumber?: string | null;
    qualification?: string | null;
    specialization?: string | null;
    employmentType?: EmploymentType;
    hireDate?: string | null;
  };

  parent?: {
    occupation?: string | null;
    employer?: string | null;
    address?: string | null;
    children?: {
      studentId: string;
      relationship?: GuardianRelationship;
      isPrimaryContact?: boolean;
    }[];
  };
}

export interface CreatedAccount {
  userId: string;
  email: string;
  fullName: string;
  role: ProvisionableRole;
  /**
   * Shown to the administrator once and then gone. GoTrue stores only the hash,
   * so there is no endpoint anywhere that can retrieve it afterwards — the UI
   * has to treat this value as the single opportunity to write it down.
   */
  temporaryPassword: string;
  welcomeEmailSent: boolean;
}

export async function createUserAccount(input: CreateUserInput): Promise<CreatedAccount> {
  // `school_id` is deliberately absent. The function reads it from the caller's
  // own profile, so a tampered payload cannot provision into another school.
  return invokeFunction<CreatedAccount>('admin-users', { action: 'create', ...input });
}

export interface PasswordResetResult {
  userId: string;
  mode: 'email' | 'temporary';
  emailSent: boolean;
  temporaryPassword?: string;
}

/**
 * `email` mails a single-use link and the administrator never sees a
 * credential. `temporary` mints one and hands it back once — the only option
 * that works for a pupil with no mailbox, which is most of them.
 */
export async function resetUserPassword(args: {
  userId: string;
  mode: 'email' | 'temporary';
}): Promise<PasswordResetResult> {
  return invokeFunction<PasswordResetResult>('admin-users', {
    action: 'reset-password',
    ...args,
  });
}

export async function setUserStatus(args: {
  userId: string;
  status: Extract<UserStatus, 'active' | 'suspended'>;
}): Promise<{ userId: string; status: UserStatus }> {
  return invokeFunction('admin-users', { action: 'set-status', ...args });
}

// ── Directories (PostgREST) ─────────────────────────────────────────────────

/** The user columns every directory row needs. Never the whole profile. */
export interface DirectoryUser {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_path: string | null;
  status: UserStatus;
}

export type TeacherRow = Pick<
  Teacher,
  | 'id'
  | 'staff_number'
  | 'qualification'
  | 'specialization'
  | 'employment_type'
  | 'hire_date'
  | 'is_active'
> & {
  user: DirectoryUser | null;
  /** Class–subject pairings they lead or assist on this term and every other. */
  assignment_count: number;
};

/**
 * Phone numbers for a set of people, when the caller is entitled to them.
 *
 * `phone` and `date_of_birth` are revoked from `authenticated` on
 * `public.users`: a staff row is readable school-wide so pupils can see who
 * teaches them, and the contact details must not ride along on it. The
 * `contact_details` RPC is definer and re-asks `app.may_read_contact()` per
 * row, so this returns what the caller may have and silently omits the rest.
 *
 * One round trip for the whole list. A directory of 150 guardians is not 150
 * requests.
 */
export async function contactDetails(
  userIds: string[],
): Promise<Map<string, { phone: string | null; dateOfBirth: string | null }>> {
  const merged = new Map<string, { phone: string | null; dateOfBirth: string | null }>();
  if (userIds.length === 0) return merged;

  const { data, error } = await supabase.rpc('contact_details', { p_user_ids: userIds });
  if (error) throw toAppError(error);

  for (const row of data ?? []) {
    merged.set(row.user_id, { phone: row.phone, dateOfBirth: row.date_of_birth });
  }

  return merged;
}

const TEACHER_SELECT = `id, staff_number, qualification, specialization, employment_type,
  hire_date, is_active,
  user:users!teachers_user_id_fkey (id, full_name, email, avatar_path, status),
  teacher_assignments(count)`;

export async function listTeachers(): Promise<TeacherRow[]> {
  const { data, error } = await supabase.from('teachers').select(TEACHER_SELECT);
  if (error) throw toAppError(error);

  const rows = data as unknown as (Omit<TeacherRow, 'assignment_count'> & {
    teacher_assignments: { count: number }[];
  })[];

  const contacts = await contactDetails(
    rows.map((row) => row.user?.id).filter((id): id is string => Boolean(id)),
  );

  return rows
    .map((row) => ({
      ...row,
      user: row.user ? { ...row.user, phone: contacts.get(row.user.id)?.phone ?? null } : row.user,
      assignment_count: row.teacher_assignments?.[0]?.count ?? 0,
    }))
    .sort((a, b) => (a.user?.full_name ?? '').localeCompare(b.user?.full_name ?? ''));
}

export interface ParentChildRow {
  link_id: string;
  student_id: string;
  full_name: string;
  admission_number: string;
  relationship: GuardianRelationship;
  is_primary_contact: boolean;
}

export type ParentRow = Pick<Parent, 'id' | 'occupation' | 'employer' | 'address' | 'is_active'> & {
  user: DirectoryUser | null;
  children: ParentChildRow[];
};

const PARENT_SELECT = `id, occupation, employer, address, is_active,
  user:users!parents_user_id_fkey (id, full_name, email, avatar_path, status),
  parent_students (
    id, relationship, is_primary_contact,
    student:students!parent_students_student_id_fkey (
      id, admission_number,
      user:users!students_user_id_fkey (full_name)
    )
  )`;

export async function listParents(): Promise<ParentRow[]> {
  const { data, error } = await supabase.from('parents').select(PARENT_SELECT);
  if (error) throw toAppError(error);

  const rows = data as unknown as (Omit<ParentRow, 'children'> & {
    parent_students: {
      id: string;
      relationship: GuardianRelationship;
      is_primary_contact: boolean;
      student: {
        id: string;
        admission_number: string;
        user: { full_name: string } | null;
      } | null;
    }[];
  })[];

  const contacts = await contactDetails(
    rows.map((row) => row.user?.id).filter((id): id is string => Boolean(id)),
  );

  return rows
    .map((row) => ({
      ...row,
      user: row.user ? { ...row.user, phone: contacts.get(row.user.id)?.phone ?? null } : row.user,
      children: (row.parent_students ?? [])
        // A guardian link whose student row is invisible to this caller comes
        // back with a null embed rather than being filtered out; drop it here
        // instead of rendering a nameless child.
        .filter((link) => link.student !== null)
        .map((link) => ({
          link_id: link.id,
          student_id: link.student!.id,
          full_name: link.student!.user?.full_name ?? 'Unnamed student',
          admission_number: link.student!.admission_number,
          relationship: link.relationship,
          is_primary_contact: link.is_primary_contact,
        })),
    }))
    .sort((a, b) => (a.user?.full_name ?? '').localeCompare(b.user?.full_name ?? ''));
}

/**
 * Every student in the school as `{ id, label }`, for the guardian picker.
 *
 * Reaches for the table rather than `search_students()` because the picker
 * needs the whole roll in one go, not a page of it, and the RPC is built around
 * paging.
 */
export async function listStudentOptions(): Promise<
  { id: string; label: string; admissionNumber: string }[]
> {
  const { data, error } = await supabase
    .from('students')
    .select('id, admission_number, user:users!students_user_id_fkey (full_name)')
    .eq('status', 'active');

  if (error) throw toAppError(error);

  const rows = data as unknown as {
    id: string;
    admission_number: string;
    user: { full_name: string } | null;
  }[];

  return rows
    .map((row) => ({
      id: row.id,
      label: row.user?.full_name ?? row.admission_number,
      admissionNumber: row.admission_number,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ── Profile edits (PostgREST, behind RLS) ───────────────────────────────────

export async function updateTeacherRecord(
  id: string,
  patch: Partial<
    Pick<Teacher, 'qualification' | 'specialization' | 'employment_type' | 'hire_date' | 'bio'>
  >,
): Promise<void> {
  const { error } = await supabase.from('teachers').update(patch).eq('id', id);
  if (error) throw toAppError(error);
}

export async function updateParentRecord(
  id: string,
  patch: Partial<Pick<Parent, 'occupation' | 'employer' | 'address'>>,
): Promise<void> {
  const { error } = await supabase.from('parents').update(patch).eq('id', id);
  if (error) throw toAppError(error);
}

/** Link an existing student to an existing guardian. */
export async function linkChild(args: {
  parentId: string;
  studentId: string;
  schoolId: string;
  relationship: GuardianRelationship;
  isPrimaryContact: boolean;
}): Promise<void> {
  const { error } = await supabase.from('parent_students').insert({
    parent_id: args.parentId,
    student_id: args.studentId,
    school_id: args.schoolId,
    relationship: args.relationship,
    is_primary_contact: args.isPrimaryContact,
  });
  if (error) throw toAppError(error);
}

export async function unlinkChild(linkId: string): Promise<void> {
  const { error } = await supabase.from('parent_students').delete().eq('id', linkId);
  if (error) throw toAppError(error);
}
