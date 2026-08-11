import { error, handlePreflight, json } from '../_shared/cors.ts';
import { escapeHtml, renderEmail, sendEmail } from '../_shared/email.ts';
import { adminClient, currentUser } from '../_shared/supabase.ts';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  admin-users  ·  account provisioning and lifecycle
 * ═══════════════════════════════════════════════════════════════════════════
 *  Why this is an Edge Function — the only reason that counts:
 *
 *  Creating an account, setting someone else's password and banning a session
 *  are GoTrue *admin* API calls. They authenticate with the service-role key,
 *  which bypasses every RLS policy in the project. Put that key in the browser
 *  bundle and the entire database is readable by anyone who opens devtools, so
 *  the operation has to happen somewhere the key never leaves — here.
 *
 *  Everything else an administrator does still goes straight to PostgREST.
 *  `students_insert_admin`, `teachers_update_self_or_admin` and friends already
 *  say what an administrator may write; routing those through a function would
 *  add a hop and a second copy of the rules.
 *
 *  Authorisation, in order:
 *    1. `verify_jwt = true` — the platform rejects an unsigned request before
 *       this file runs.
 *    2. The caller is resolved from that JWT, never from the body.
 *    3. Their administrator grant is re-checked against the database. A role
 *       claim in a token is a cached assertion; a row in `user_roles` is the
 *       truth, and a grant revoked five minutes ago must stop working now.
 *    4. `school_id` comes from the caller's own profile. It is never read from
 *       the payload — that is the difference between "provision into my school"
 *       and "provision into any school in the deployment".
 *
 *  Every action is written to `audit_logs` with the caller as actor. The
 *  generic `app.audit_row()` trigger cannot do that job here: under the service
 *  role `auth.uid()` is null, so its trail would record the change with no-one
 *  attached to it.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Payloads ────────────────────────────────────────────────────────────────

/**
 * Administrators are provisionable, but only by the founder.
 *
 * `handle_new_user()` will honour any role slug it finds in app_metadata, so
 * nothing in the database stops this function minting an administrator — which
 * is exactly why the gate belongs here. It used to be a flat refusal, on the
 * reasoning that a stolen admin session should not be able to grant itself a
 * second permanent account that survives the first being locked.
 *
 * That reasoning still holds for a sub-administrator, and still applies to
 * them: `requireSuperAdmin` below is what a stolen *sub*-admin session runs
 * into. What changed is that administrators are no longer peers. One grant per
 * school is `is_super`, and it is the only one that may create another
 * administrator — the same rule `user_roles_insert_admin` enforces in the
 * database, restated here because this path runs under the service role and
 * meets no policy at all.
 */
const PROVISIONABLE_ROLES = ['student', 'teacher', 'parent', 'administrator'] as const;
type ProvisionableRole = (typeof PROVISIONABLE_ROLES)[number];

/** Mirrors `user_roles_known_capabilities`. A value outside it is rejected. */
const CAPABILITIES = [
  'users',
  'academics',
  'timetable',
  'results',
  'announcements',
  'audit',
  'settings',
] as const;
type Capability = (typeof CAPABILITIES)[number];

const GENDERS = ['male', 'female', 'other', 'undisclosed'] as const;
const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contract', 'visiting'] as const;
const RELATIONSHIPS = ['father', 'mother', 'guardian', 'sibling', 'other'] as const;

interface CreatePayload {
  action: 'create';
  role: ProvisionableRole;
  email: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  phone?: string | null;
  gender?: (typeof GENDERS)[number] | null;
  dateOfBirth?: string | null;
  /** Best effort. Silently skipped when no mail provider is configured. */
  sendWelcomeEmail?: boolean;

  /**
   * Administrator grants only. Ignored for every other role — a capability on a
   * pupil's grant would mean nothing to any policy and would only mislead
   * whoever read the row next.
   */
  capabilities?: Capability[];

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
    employmentType?: (typeof EMPLOYMENT_TYPES)[number];
    hireDate?: string | null;
  };

  parent?: {
    occupation?: string | null;
    employer?: string | null;
    address?: string | null;
    children?: {
      studentId: string;
      relationship?: (typeof RELATIONSHIPS)[number];
      isPrimaryContact?: boolean;
    }[];
  };
}

interface ResetPasswordPayload {
  action: 'reset-password';
  userId: string;
  /**
   * `email`     — mail them a one-time link and never see the credential.
   * `temporary` — mint a password and hand it back once, for the school office
   *               to pass on in person. The only option that works for a pupil
   *               with no mailbox, which is most of them.
   */
  mode?: 'email' | 'temporary';
}

interface SetStatusPayload {
  action: 'set-status';
  userId: string;
  status: 'active' | 'suspended';
}

type Payload = CreatePayload | ResetPasswordPayload | SetStatusPayload;

// ── Small helpers ───────────────────────────────────────────────────────────

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * No 0/O/1/l/I. These passwords get read off a screen and typed into a phone by
 * a fourteen-year-old; an ambiguous glyph is a support call.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function temporaryPassword(length = 14): string {
  // Rejection sampling rather than a bare `% ALPHABET.length`: 256 is not a
  // multiple of the alphabet, so the modulo alone hands the first few
  // characters an extra chance each. Discarding the overhang costs nothing and
  // keeps the distribution flat.
  const limit = 256 - (256 % ALPHABET.length);
  let out = '';

  while (out.length < length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      out += ALPHABET[byte % ALPHABET.length];
      if (out.length === length) break;
    }
  }

  return out;
}

/** Trim, and treat an empty or whitespace-only string as "not supplied". */
function text(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isDate(value: string | null): boolean {
  return value === null || DATE_PATTERN.test(value);
}

/** Drop null-valued keys so an omitted field never overwrites a DB default. */
function compact<T extends Record<string, unknown>>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== null && value !== undefined),
  ) as Partial<T>;
}

// ── Caller identity ─────────────────────────────────────────────────────────

interface Caller {
  userId: string;
  schoolId: string;
  fullName: string;
  /** The founding administrator. The only one who may touch another admin. */
  isSuper: boolean;
  /** The capabilities on their grant. Empty for a founder, who holds all. */
  capabilities: string[];
}

/**
 * Whether the caller holds a capability.
 *
 * This handler runs under the service role, which meets no RLS policy at all —
 * so `app.admin_can()` never gets a chance to refuse anything here and the
 * check has to be made in TypeScript. Skipping it is not a cosmetic gap: an
 * exams officer with `results` and nothing else was able to create a teacher
 * account through this endpoint while every equivalent write over PostgREST
 * was refused.
 */
function can(caller: Caller, capability: string): boolean {
  return caller.isSuper || caller.capabilities.includes(capability);
}

/**
 * Re-derive the caller's authority from the database.
 *
 * Read with the service role rather than the caller's client on purpose: the
 * subject is the verified `sub` claim, so there is nothing for RLS to protect
 * here, and a policy change on `user_roles` must never be able to turn this
 * check into a silent pass.
 */
async function resolveAdministrator(userId: string): Promise<Caller | null> {
  const admin = adminClient();

  const { data: profile } = await admin
    .from('users')
    .select('id, school_id, full_name, status')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.school_id || profile.status !== 'active') return null;

  const { data: grants } = await admin
    .from('user_roles')
    .select('expires_at, is_super, capabilities, roles!inner(slug)')
    .eq('user_id', userId)
    .eq('school_id', profile.school_id)
    .eq('roles.slug', 'administrator');

  // Expiry is checked here rather than in an `or=` filter: the PostgREST filter
  // grammar is comma-delimited, so an operand that ever grows a comma turns a
  // deny into a silent pass. A date comparison in TypeScript cannot.
  const now = Date.now();
  const live = (grants ?? []).some(
    (grant) => grant.expires_at === null || new Date(grant.expires_at as string).getTime() > now,
  );

  if (!live) return null;

  const isSuper = (grants ?? []).some(
    (grant) =>
      grant.is_super === true &&
      (grant.expires_at === null || new Date(grant.expires_at as string).getTime() > now),
  );

  const capabilities = (grants ?? []).flatMap((grant) =>
    grant.expires_at === null || new Date(grant.expires_at as string).getTime() > now
      ? ((grant.capabilities as string[] | null) ?? [])
      : [],
  );

  return {
    userId,
    schoolId: profile.school_id as string,
    fullName: (profile.full_name as string) ?? 'An administrator',
    isSuper,
    capabilities,
  };
}

/**
 * The target of a lifecycle action.
 *
 * Two rules, both about blast radius: the target must be inside the caller's
 * school, and it must not be another administrator. Administrator accounts are
 * peers — letting one reset another's password turns a single compromised
 * session into control of every account in the school, and the ordinary
 * forgotten-password flow already covers the legitimate case.
 */
async function resolveTarget(
  userId: string,
  caller: Caller,
): Promise<{ ok: true; email: string; fullName: string } | { ok: false; reason: string }> {
  if (userId === caller.userId) {
    return { ok: false, reason: 'You cannot run this action against your own account.' };
  }

  const admin = adminClient();

  const { data: profile } = await admin
    .from('users')
    .select('id, email, full_name, school_id')
    .eq('id', userId)
    .maybeSingle();

  // Same answer for "not in your school" as for "does not exist", so this
  // cannot be used to probe for accounts in other tenants.
  if (!profile || profile.school_id !== caller.schoolId) {
    return { ok: false, reason: 'That account could not be found.' };
  }

  // Not scoped to a school, and not `.maybeSingle()`: a user holding the grant
  // in two schools must not turn this check into a "multiple rows returned"
  // error that never fires.
  const { data: adminGrants } = await admin
    .from('user_roles')
    .select('id, is_super, roles!inner(slug)')
    .eq('user_id', userId)
    .eq('roles.slug', 'administrator');

  const grants = adminGrants ?? [];

  if (grants.length > 0) {
    // The founder outranks a sub-administrator, so they may reset one's
    // password or deactivate it — otherwise a sub-administrator's account could
    // never be closed, which makes the whole scheme one-way.
    //
    // Everything else stays refused. A sub-administrator acting on a peer would
    // turn one compromised session into control of the school, which is the
    // original reason this check exists; and nobody at all may act on the
    // founder, whose account is the school's last way back in.
    if (!caller.isSuper) {
      return {
        ok: false,
        reason: 'Only the founding administrator can manage another administrator account.',
      };
    }

    if (grants.some((grant) => grant.is_super === true)) {
      return {
        ok: false,
        reason:
          'The founding administrator cannot be managed from here. Use the password-reset link on the sign-in page.',
      };
    }
  }

  return {
    ok: true,
    email: profile.email as string,
    fullName: (profile.full_name as string) ?? 'this user',
  };
}

// ── Audit ───────────────────────────────────────────────────────────────────

async function recordAudit(args: {
  caller: Caller;
  action: 'insert' | 'update' | 'permission_change';
  entityId: string;
  after: Record<string, unknown>;
  request: Request;
}): Promise<void> {
  const { error: auditError } = await adminClient()
    .from('audit_logs')
    .insert({
      school_id: args.caller.schoolId,
      actor_id: args.caller.userId,
      action: args.action,
      entity_type: 'users',
      entity_id: args.entityId,
      after: args.after,
      user_agent: args.request.headers.get('user-agent'),
      context: { via: 'admin-users' },
    });

  // A failed audit write must not roll back a completed provisioning run —
  // but it is never allowed to pass silently either.
  if (auditError) console.error('[admin-users] audit write failed', auditError.message);
}

// ── create ──────────────────────────────────────────────────────────────────

function validateCreate(payload: CreatePayload): string | null {
  if (!PROVISIONABLE_ROLES.includes(payload.role)) {
    return `role must be one of: ${PROVISIONABLE_ROLES.join(', ')}`;
  }

  const email = text(payload.email);
  if (!email || !EMAIL_PATTERN.test(email)) return 'A valid email address is required';
  if (!text(payload.firstName)) return 'firstName is required';
  if (!text(payload.lastName)) return 'lastName is required';

  if (payload.gender && !GENDERS.includes(payload.gender)) return 'gender is not a known value';
  if (!isDate(text(payload.dateOfBirth))) return 'dateOfBirth must be YYYY-MM-DD';

  if (payload.role === 'student') {
    if (!isDate(text(payload.student?.admissionDate))) return 'admissionDate must be YYYY-MM-DD';
    const classId = text(payload.student?.classId);
    if (classId && !UUID_PATTERN.test(classId)) return 'classId is not a valid id';
  }

  if (payload.role === 'teacher') {
    if (!isDate(text(payload.teacher?.hireDate))) return 'hireDate must be YYYY-MM-DD';
    const employment = payload.teacher?.employmentType;
    if (employment && !EMPLOYMENT_TYPES.includes(employment)) {
      return 'employmentType is not a known value';
    }
  }

  if (payload.role === 'parent') {
    for (const child of payload.parent?.children ?? []) {
      if (!UUID_PATTERN.test(child.studentId)) return 'A linked child id is not valid';
      if (child.relationship && !RELATIONSHIPS.includes(child.relationship)) {
        return 'A linked child relationship is not a known value';
      }
    }
  }

  for (const capability of payload.capabilities ?? []) {
    if (!CAPABILITIES.includes(capability)) return `${capability} is not a known capability`;
  }

  return null;
}

async function handleCreate(
  request: Request,
  payload: CreatePayload,
  caller: Caller,
): Promise<Response> {
  const invalid = validateCreate(payload);
  if (invalid) return error(request, invalid, 422);

  if (!can(caller, 'users')) {
    return error(request, 'You do not have permission to create accounts.', 403);
  }

  // Restated here rather than left to RLS: this whole handler runs under the
  // service role, which meets no policy at all.
  if (payload.role === 'administrator' && !caller.isSuper) {
    return error(request, 'Only the founding administrator can create another administrator.', 403);
  }

  const admin = adminClient();
  const email = text(payload.email)!.toLowerCase();
  const password = temporaryPassword();

  // ── 1. The auth account ─────────────────────────────────────────────────
  //  `app_metadata` is the trusted channel — only the service role can write
  //  it — and it stays here as the durable record of what this account was
  //  provisioned as. It is *not* what decides the role, because the admin API
  //  writes it after the INSERT: handle_new_user() fires against a row that
  //  does not carry it yet. Step 2 states the role instead. See
  //  20260805000200_admin_provisioning.sql.
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    // The roll is the school's record of who exists. Sending a pupil through
    // an inbox round trip before they can be enrolled would gate the register
    // on a mailbox many of them do not have.
    email_confirm: true,
    app_metadata: { role: payload.role, school_id: caller.schoolId },
    user_metadata: {
      first_name: text(payload.firstName),
      last_name: text(payload.lastName),
      phone: text(payload.phone),
      // Tells the trigger not to guess a role it cannot yet see. Without it
      // every teacher and parent created here would silently come out a
      // student, which is the trigger's fallback.
      provisioned_by_admin: true,
    },
  });

  if (createError || !created.user) {
    const message = createError?.message ?? 'The account could not be created';
    const conflict = /already|exists|registered/i.test(message);
    return error(
      request,
      conflict ? 'An account already exists for that email address.' : message,
      conflict ? 409 : 400,
    );
  }

  const userId = created.user.id;

  // ── 2. Everything the trigger could not know ────────────────────────────
  //  Past this point the auth account exists. Any failure leaves a login with
  //  no usable profile behind it, so the whole tail runs under one catch and
  //  unwinds by deleting the account — which cascades through public.users to
  //  the role grant and the extension row.
  try {
    // The school, the grant and the extension row, stated rather than
    // inferred. Everything below assumes the extension row exists.
    const { error: provisionError } = await admin.rpc('provision_user_role', {
      p_user_id: userId,
      p_role: payload.role,
      p_school_id: caller.schoolId,
    });

    if (provisionError) throw new Error(provisionError.message);

    // Capabilities are a second statement rather than an argument to
    // `provision_user_role()`, which is shared with the sign-up path and has no
    // business knowing about them. `is_super` is never set here: a school has
    // exactly one founder, decided at migration time, and nothing on this path
    // may mint a second.
    if (payload.role === 'administrator') {
      const { error: capabilityError } = await admin
        .from('user_roles')
        .update({ capabilities: payload.capabilities ?? [] })
        .eq('user_id', userId)
        .eq('school_id', caller.schoolId);

      if (capabilityError) throw new Error(capabilityError.message);
    }

    await applyProfileExtras(payload, userId);
    await applyRoleExtension(payload, userId, caller.schoolId);
  } catch (cause) {
    await admin.auth.admin.deleteUser(userId);
    const message = cause instanceof Error ? cause.message : 'Provisioning failed';
    console.error('[admin-users] rolled back', userId, message);
    return error(request, message, 400);
  }

  const fullName = [text(payload.firstName), text(payload.middleName), text(payload.lastName)]
    .filter(Boolean)
    .join(' ');

  await recordAudit({
    caller,
    action: 'insert',
    entityId: userId,
    after: { email, full_name: fullName, role: payload.role },
    request,
  });

  // ── 3. Welcome email, best effort ───────────────────────────────────────
  const welcomeEmailSent =
    payload.sendWelcomeEmail === false ? false : await sendWelcomeEmail(email, fullName, caller);

  return json(
    request,
    {
      userId,
      email,
      fullName,
      role: payload.role,
      // Returned exactly once. It is never stored anywhere in readable form —
      // GoTrue keeps only the hash — so there is no way to retrieve it later.
      temporaryPassword: password,
      welcomeEmailSent,
    },
    201,
  );
}

/** Columns on `public.users` that handle_new_user() does not carry across. */
async function applyProfileExtras(payload: CreatePayload, userId: string): Promise<void> {
  const patch = compact({
    middle_name: text(payload.middleName),
    gender: payload.gender ?? null,
    date_of_birth: text(payload.dateOfBirth),
  });

  if (Object.keys(patch).length === 0) return;

  const { error: updateError } = await adminClient().from('users').update(patch).eq('id', userId);
  if (updateError) throw new Error(updateError.message);
}

/**
 * Fill in the role-extension row the trigger created with a derived identifier
 * and nothing else, then wire up the relationships that make the account
 * useful — an enrolment for a student, guardian links for a parent.
 */
async function applyRoleExtension(
  payload: CreatePayload,
  userId: string,
  schoolId: string,
): Promise<void> {
  const admin = adminClient();

  // An administrator has no extension row and needs none — the profile and the
  // grant are the whole record. Falling through here landed on the guardian
  // branch and failed with "the parent record could not be created", which is
  // both wrong and unhelpful.
  if (payload.role === 'administrator') return;

  if (payload.role === 'student') {
    const input = payload.student ?? {};

    const patch = compact({
      admission_number: text(input.admissionNumber),
      admission_date: text(input.admissionDate),
      address: text(input.address),
      emergency_contact_name: text(input.emergencyContactName),
      emergency_contact_phone: text(input.emergencyContactPhone),
    });

    const studentId = await applyToExtension('students', userId, patch);

    const classId = text(input.classId);
    if (classId) await enrolStudent(studentId, classId, schoolId);
    return;
  }

  if (payload.role === 'teacher') {
    const input = payload.teacher ?? {};

    const patch = compact({
      staff_number: text(input.staffNumber),
      qualification: text(input.qualification),
      specialization: text(input.specialization),
      employment_type: input.employmentType ?? null,
      hire_date: text(input.hireDate),
    });

    await applyToExtension('teachers', userId, patch);
    return;
  }

  // Parent.
  const input = payload.parent ?? {};

  const patch = compact({
    occupation: text(input.occupation),
    employer: text(input.employer),
    address: text(input.address),
  });

  const parentId = await applyToExtension('parents', userId, patch);

  const children = input.children ?? [];
  if (children.length === 0) return;

  // Confirm every child is a student of this school before linking. Without
  // this the caller could name any student id in the deployment and hand the
  // new guardian a view of another school's child.
  const { data: verified } = await admin
    .from('students')
    .select('id')
    .eq('school_id', schoolId)
    .in(
      'id',
      children.map((child) => child.studentId),
    );

  const known = new Set((verified ?? []).map((row) => row.id as string));
  const unknown = children.filter((child) => !known.has(child.studentId));
  if (unknown.length > 0) {
    throw new Error('One of the selected children is not a student at this school.');
  }

  const { error: linkError } = await admin.from('parent_students').insert(
    children.map((child) => ({
      parent_id: parentId,
      student_id: child.studentId,
      school_id: schoolId,
      relationship: child.relationship ?? 'guardian',
      is_primary_contact: child.isPrimaryContact ?? false,
    })),
  );

  if (linkError) throw new Error(friendlyDatabaseMessage(linkError.message, 'guardian link'));
}

/**
 * Apply the administrator's overrides to the extension row `handle_new_user()`
 * already created, and hand back its id.
 *
 * The row is looked up whether or not there is anything to write. An UPDATE
 * that exists only to return an id would have to touch a column to match a row
 * count, and inventing a write to satisfy a read is how a no-op ends up in the
 * audit trail as a change somebody made.
 */
async function applyToExtension(
  table: 'students' | 'teachers' | 'parents',
  userId: string,
  patch: Record<string, unknown>,
): Promise<string> {
  const admin = adminClient();
  const subject = table.slice(0, -1);

  if (Object.keys(patch).length > 0) {
    const { error: updateError } = await admin.from(table).update(patch).eq('user_id', userId);
    if (updateError) throw new Error(friendlyDatabaseMessage(updateError.message, subject));
  }

  const { data, error: readError } = await admin
    .from(table)
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  // The trigger creates this row in the same transaction as the auth account,
  // so its absence means the account landed with no school attached — which
  // only happens when the caller's own profile is broken.
  if (readError || !data) {
    throw new Error(`The ${subject} record could not be created. Check the school configuration.`);
  }

  return data.id as string;
}

/**
 * Enrol into the term the class itself belongs to.
 *
 * A class row is scoped to one academic session, so its own
 * `academic_session_id` is the correct term — reading "the current term"
 * separately would let an administrator enrol a pupil into next term's JSS 1A
 * against this term's session and trip `enrollments_one_per_term` weeks later.
 */
async function enrolStudent(studentId: string, classId: string, schoolId: string): Promise<void> {
  const admin = adminClient();

  const { data: schoolClass } = await admin
    .from('classes')
    .select('id, school_id, academic_session_id')
    .eq('id', classId)
    .maybeSingle();

  if (!schoolClass || schoolClass.school_id !== schoolId) {
    throw new Error('That class could not be found.');
  }

  const { error: enrolError } = await admin.from('enrollments').insert({
    school_id: schoolId,
    student_id: studentId,
    class_id: classId,
    academic_session_id: schoolClass.academic_session_id as string,
  });

  if (enrolError) throw new Error(friendlyDatabaseMessage(enrolError.message, 'enrolment'));
}

/**
 * The service role talks to PostgREST, which returns Postgres prose. "duplicate
 * key value violates unique constraint students_admission_number_unique" is a
 * useful log line and a terrible thing to put in front of a school secretary.
 */
function friendlyDatabaseMessage(message: string, subject: string): string {
  if (/admission_number_unique/.test(message)) {
    return 'That admission number is already in use.';
  }
  if (/staff_number_unique/.test(message)) {
    return 'That staff number is already in use.';
  }
  if (/enrollments_one_per_term/.test(message)) {
    return 'That student is already enrolled in a class for this term.';
  }
  if (/parent_students_one_primary_per_student/.test(message)) {
    return 'One of those children already has a primary contact. Clear it first.';
  }
  if (/duplicate key|already exists/i.test(message)) {
    return `That ${subject} already exists.`;
  }
  return message;
}

async function sendWelcomeEmail(email: string, fullName: string, caller: Caller): Promise<boolean> {
  if (!Deno.env.get('RESEND_API_KEY')) return false;

  const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173';

  try {
    await sendEmail({
      to: email,
      subject: 'Your GNASchools LMS account is ready',
      html: renderEmail({
        heading: 'Welcome to GNASchools LMS',
        // The temporary password is deliberately not in here. Email is not a
        // confidential channel, and it is handed over in person anyway.
        //
        // Both names are escaped: `renderEmail` treats `body` as markup, and
        // these two values are typed by an administrator into a name field.
        body: `<p>Hello ${escapeHtml(fullName)},</p>
               <p>${escapeHtml(caller.fullName)} has created an account for you on the school's
                  learning management system. Sign in with the temporary password
                  the school office gave you, then change it from your profile.</p>`,
        actionLabel: 'Sign in',
        actionUrl: `${appUrl}/auth/login`,
      }),
    });
    return true;
  } catch (cause) {
    // The account exists and works. A bounced welcome note is not a reason to
    // fail the request.
    console.error('[admin-users] welcome email failed', cause);
    return false;
  }
}

// ── reset-password ──────────────────────────────────────────────────────────

async function handleResetPassword(
  request: Request,
  payload: ResetPasswordPayload,
  caller: Caller,
): Promise<Response> {
  if (!UUID_PATTERN.test(payload.userId ?? '')) return error(request, 'userId is required', 422);

  if (!can(caller, 'users')) {
    return error(request, 'You do not have permission to manage accounts.', 403);
  }

  const mode = payload.mode ?? 'email';
  // Checked rather than defaulted. An unrecognised mode falling through to the
  // `else` would quietly pick the branch that mints a credential — the more
  // powerful of the two, and the wrong one to reach by accident.
  if (mode !== 'email' && mode !== 'temporary') {
    return error(request, "mode must be 'email' or 'temporary'", 422);
  }

  const target = await resolveTarget(payload.userId, caller);
  if (!target.ok) return error(request, target.reason, 403);

  const admin = adminClient();
  const appUrl = Deno.env.get('APP_URL') ?? 'http://localhost:5173';

  if (mode === 'email') {
    if (!Deno.env.get('RESEND_API_KEY')) {
      return error(
        request,
        'Outbound email is not configured. Issue a temporary password instead.',
        422,
      );
    }

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: target.email,
      options: { redirectTo: `${appUrl}/auth/reset-password` },
    });

    if (linkError || !link.properties?.action_link) {
      return error(request, linkError?.message ?? 'Could not generate a reset link', 502);
    }

    try {
      await sendEmail({
        to: target.email,
        subject: 'Reset your GNASchools LMS password',
        html: renderEmail({
          heading: 'Set a new password',
          body: `<p>Hello ${escapeHtml(target.fullName)},</p>
                 <p>${escapeHtml(caller.fullName)} asked us to help you back into your account.
                    The link below is single-use and expires shortly.</p>`,
          actionLabel: 'Choose a new password',
          actionUrl: link.properties.action_link,
        }),
      });
    } catch (cause) {
      console.error('[admin-users] reset email failed', cause);
      return error(request, 'The reset email could not be sent.', 502);
    }

    await recordAudit({
      caller,
      action: 'permission_change',
      entityId: payload.userId,
      after: { password_reset: 'email' },
      request,
    });

    return json(request, { userId: payload.userId, mode, emailSent: true });
  }

  // Temporary-password mode.
  const password = temporaryPassword();

  const { error: updateError } = await admin.auth.admin.updateUserById(payload.userId, {
    password,
  });

  if (updateError) return error(request, updateError.message, 400);

  await recordAudit({
    caller,
    action: 'permission_change',
    entityId: payload.userId,
    after: { password_reset: 'temporary' },
    request,
  });

  return json(request, {
    userId: payload.userId,
    mode,
    emailSent: false,
    temporaryPassword: password,
  });
}

// ── set-status ──────────────────────────────────────────────────────────────

async function handleSetStatus(
  request: Request,
  payload: SetStatusPayload,
  caller: Caller,
): Promise<Response> {
  if (!UUID_PATTERN.test(payload.userId ?? '')) return error(request, 'userId is required', 422);
  if (payload.status !== 'active' && payload.status !== 'suspended') {
    return error(request, "status must be 'active' or 'suspended'", 422);
  }

  if (!can(caller, 'users')) {
    return error(request, 'You do not have permission to manage accounts.', 403);
  }

  const target = await resolveTarget(payload.userId, caller);
  if (!target.ok) return error(request, target.reason, 403);

  const admin = adminClient();
  const suspending = payload.status === 'suspended';

  // ── 1. The auth account ─────────────────────────────────────────────────
  //  Flipping `users.status` alone changes nothing an attacker cares about:
  //  the JWT in their browser stays valid and keeps refreshing forever. Banning
  //  the GoTrue account is what actually ends access — refreshes are refused
  //  from this moment, and the outstanding access token dies at its next expiry
  //  (an hour at most, per `jwt_expiry`).
  const { error: banError } = await admin.auth.admin.updateUserById(payload.userId, {
    ban_duration: suspending ? '876000h' : 'none',
  });

  if (banError) return error(request, banError.message, 400);

  // ── 2. The profile, then the role extensions ────────────────────────────
  const { error: profileError } = await admin
    .from('users')
    .update({ status: payload.status })
    .eq('id', payload.userId);

  if (profileError) {
    // Put the account back where it was rather than leave a banned login with
    // an active-looking profile.
    await admin.auth.admin.updateUserById(payload.userId, {
      ban_duration: suspending ? 'none' : '876000h',
    });
    return error(request, profileError.message, 400);
  }

  // A user may hold more than one role; update whichever extension rows exist.
  //
  // The student update is narrowed to the status it is actually toggling
  // between. `students.status` carries five values and only two of them are
  // ours: a graduated pupil deactivated at the end of term must not come back
  // as `active` when the account is reopened for results season, and blanket
  // writes would erase exactly that. Teachers and parents carry a plain
  // `is_active` flag with nothing to lose.
  await Promise.all([
    admin
      .from('students')
      .update({ status: suspending ? 'suspended' : 'active' })
      .eq('user_id', payload.userId)
      .eq('status', suspending ? 'active' : 'suspended'),
    admin.from('teachers').update({ is_active: !suspending }).eq('user_id', payload.userId),
    admin.from('parents').update({ is_active: !suspending }).eq('user_id', payload.userId),
  ]);

  await recordAudit({
    caller,
    action: 'update',
    entityId: payload.userId,
    after: { status: payload.status },
    request,
  });

  return json(request, { userId: payload.userId, status: payload.status });
}

// ── Entry point ─────────────────────────────────────────────────────────────

Deno.serve(async (request: Request) => {
  const preflight = handlePreflight(request);
  if (preflight) return preflight;

  if (request.method !== 'POST') {
    return error(request, 'Method not allowed', 405);
  }

  const user = await currentUser(request);
  if (!user) {
    return error(request, 'Not authenticated', 401);
  }

  const caller = await resolveAdministrator(user.id);
  if (!caller) {
    return error(request, 'Only an administrator can manage accounts.', 403);
  }

  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return error(request, 'Body must be JSON', 400);
  }

  switch (payload.action) {
    case 'create':
      return await handleCreate(request, payload, caller);
    case 'reset-password':
      return await handleResetPassword(request, payload, caller);
    case 'set-status':
      return await handleSetStatus(request, payload, caller);
    default:
      return error(request, 'Unknown action', 400);
  }
});
