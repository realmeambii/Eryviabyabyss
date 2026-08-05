-- ═══════════════════════════════════════════════════════════════════════════
--  0300 · Core tenancy: schools, roles, users, user_roles, academic_sessions
-- ═══════════════════════════════════════════════════════════════════════════
--  `school_id` is the tenancy boundary. Nearly every table carries it, even
--  where it could be derived through a join — RLS predicates then need one
--  index lookup instead of a chain of them, and a mis-joined row can never
--  silently leak across schools.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── schools ────────────────────────────────────────────────────────────────
create table public.schools (
  id              uuid primary key default gen_random_uuid(),
  name            text        not null check (length(btrim(name)) between 2 and 200),
  slug            text        not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  motto           text,
  email           text        check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone           text,
  website         text,
  address_line1   text,
  address_line2   text,
  city            text,
  state           text,
  country         text        not null default 'Nigeria',
  postal_code     text,
  -- Storage path inside the `school-logos` bucket.
  logo_path       text,
  timezone        text        not null default 'Africa/Lagos',
  locale          text        not null default 'en-NG',
  -- WAEC-style banding. Overridable per school without a migration.
  grading_scale   jsonb       not null default '[
    {"grade":"A1","min":75,"max":100,"remark":"Excellent"},
    {"grade":"B2","min":70,"max":74,"remark":"Very Good"},
    {"grade":"B3","min":65,"max":69,"remark":"Good"},
    {"grade":"C4","min":60,"max":64,"remark":"Credit"},
    {"grade":"C5","min":55,"max":59,"remark":"Credit"},
    {"grade":"C6","min":50,"max":54,"remark":"Credit"},
    {"grade":"D7","min":45,"max":49,"remark":"Pass"},
    {"grade":"E8","min":40,"max":44,"remark":"Pass"},
    {"grade":"F9","min":0,"max":39,"remark":"Fail"}
  ]'::jsonb,
  settings        jsonb       not null default '{}'::jsonb,
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint schools_slug_key unique (slug)
);

comment on table public.schools is 'Tenant root. Every other row in the database belongs to exactly one school.';

-- ── roles ──────────────────────────────────────────────────────────────────
--  A table rather than an enum so a school can add "Bursar" or "Form Master"
--  in Phase 2 without a migration. `is_system` protects the four roles the
--  application logic depends on.
create table public.roles (
  id          uuid primary key default gen_random_uuid(),
  slug        text        not null check (slug ~ '^[a-z][a-z0-9_]*$'),
  name        text        not null,
  description text,
  -- Coarse capability map, e.g. {"students":["read","write"]}. Read by the UI
  -- to hide affordances; the database still enforces access through RLS.
  permissions jsonb       not null default '{}'::jsonb,
  -- Lower rank == more authority. Used to order role pickers and to stop a
  -- user granting a role above their own.
  rank        smallint    not null default 100 check (rank between 0 and 1000),
  is_system   boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  constraint roles_slug_key unique (slug)
);

comment on table public.roles is 'Assignable roles. Expandable per deployment; the four system roles are fixed.';

insert into public.roles (slug, name, description, rank, is_system, permissions) values
  ('administrator', 'Administrator', 'Full access to every record in the school.',  0, true,
    '{"school":["read","write"],"users":["read","write"],"academics":["read","write"],"reports":["read"]}'),
  ('teacher',       'Teacher',       'Manages the classes and subjects assigned to them.', 20, true,
    '{"classes":["read","write"],"assignments":["read","write"],"grades":["read","write"],"attendance":["read","write"]}'),
  ('student',       'Student',       'Access to their own enrolment, work and results.',   60, true,
    '{"self":["read"],"submissions":["read","write"],"quizzes":["read","write"]}'),
  ('parent',        'Parent',        'Read-only access to their children''s records.',     60, true,
    '{"children":["read"]}');

-- ── users ──────────────────────────────────────────────────────────────────
--  The application-facing profile. Keyed by auth.users.id so `auth.uid()`
--  joins straight onto it, and cascades when an auth account is deleted.
create table public.users (
  id             uuid primary key references auth.users (id) on delete cascade,
  school_id      uuid references public.schools (id) on delete restrict,
  email          text        not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  first_name     text        not null check (length(btrim(first_name)) > 0),
  last_name      text        not null check (length(btrim(last_name)) > 0),
  middle_name    text,
  -- Maintained by app.sync_user_full_name(); denormalised so the global search
  -- box can hit one trigram index instead of concatenating on every query.
  full_name      text        not null default '',
  phone          text        check (phone is null or phone ~ '^\+?[0-9 ()-]{7,20}$'),
  -- Storage path inside the `profile-photos` bucket.
  avatar_path    text,
  date_of_birth  date        check (date_of_birth is null or date_of_birth < current_date),
  gender         public.gender,
  status         public.user_status not null default 'active',
  locale         text        not null default 'en-NG',
  timezone       text        not null default 'Africa/Lagos',
  notification_preferences jsonb not null default
    '{"email":true,"in_app":true,"sms":false,"digest":"daily"}'::jsonb,
  metadata       jsonb       not null default '{}'::jsonb,
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on table public.users is
  'Profile row mirroring auth.users. Never holds credentials — Supabase Auth owns those.';

create unique index users_email_lower_key on public.users (lower(email));
create index users_school_id_idx           on public.users (school_id);
create index users_status_idx              on public.users (school_id, status);
create index users_full_name_trgm_idx      on public.users using gin (full_name extensions.gin_trgm_ops);

-- ── user_roles ─────────────────────────────────────────────────────────────
--  A user may hold several roles (a teacher who is also a parent at the same
--  school is common), so this is a real many-to-many.
create table public.user_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id)   on delete cascade,
  role_id    uuid not null references public.roles (id)   on delete restrict,
  school_id  uuid not null references public.schools (id) on delete cascade,
  granted_by uuid references public.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint user_roles_unique unique (user_id, role_id, school_id),
  constraint user_roles_expiry_after_grant check (expires_at is null or expires_at > granted_at)
);

comment on table public.user_roles is 'Role grants, scoped to a school. Read by every RLS predicate.';

create index user_roles_user_id_idx   on public.user_roles (user_id);
create index user_roles_role_id_idx   on public.user_roles (role_id);
create index user_roles_school_id_idx on public.user_roles (school_id);
-- The exact shape app.has_role() probes.
create index user_roles_lookup_idx    on public.user_roles (user_id, role_id) include (school_id, expires_at);

-- ── academic_sessions ──────────────────────────────────────────────────────
--  One row per *term* within a session year, e.g. ("2025/2026", 'first').
--  Almost everything academic is scoped to a session so historical terms stay
--  queryable and immutable.
create table public.academic_sessions (
  id         uuid primary key default gen_random_uuid(),
  school_id  uuid not null references public.schools (id) on delete cascade,
  name       text not null check (name ~ '^\d{4}/\d{4}$'),
  term       public.academic_term not null,
  starts_on  date not null,
  ends_on    date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint academic_sessions_unique       unique (school_id, name, term),
  constraint academic_sessions_date_order   check (ends_on > starts_on)
);

comment on table public.academic_sessions is
  'A term inside a session year. `is_current` is unique per school (partial index below).';

-- At most one current term per school — enforced, not merely conventional.
create unique index academic_sessions_one_current_per_school
  on public.academic_sessions (school_id)
  where is_current;

create index academic_sessions_school_idx on public.academic_sessions (school_id, starts_on desc);

-- ── updated_at triggers ────────────────────────────────────────────────────
select app.attach_updated_at('public.schools');
select app.attach_updated_at('public.roles');
select app.attach_updated_at('public.users');
select app.attach_updated_at('public.user_roles');
select app.attach_updated_at('public.academic_sessions');
