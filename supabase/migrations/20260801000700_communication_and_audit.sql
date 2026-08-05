-- ═══════════════════════════════════════════════════════════════════════════
--  0700 · announcements · notifications · files · audit_logs
-- ═══════════════════════════════════════════════════════════════════════════

-- ── announcements ──────────────────────────────────────────────────────────
--  One row, one audience. `audience` selects which of the target columns must
--  be populated — enforced by a CHECK so a "class" announcement can never be
--  saved without a class.
create table public.announcements (
  id                  uuid primary key default gen_random_uuid(),
  school_id           uuid not null references public.schools (id) on delete cascade,
  author_id           uuid references public.users (id) on delete set null,
  academic_session_id uuid references public.academic_sessions (id) on delete set null,
  audience            public.announcement_audience not null default 'school',
  class_id            uuid references public.classes (id) on delete cascade,
  role_id             uuid references public.roles (id)   on delete cascade,
  recipient_id        uuid references public.users (id)   on delete cascade,
  title               text not null check (length(btrim(title)) between 3 and 250),
  body                text not null check (length(btrim(body)) > 0),
  priority            public.announcement_priority not null default 'normal',
  status              public.publication_status not null default 'draft',
  is_pinned           boolean not null default false,
  publish_at          timestamptz not null default now(),
  expires_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint announcements_target_matches_audience check (
    (audience = 'school'     and class_id is null and role_id is null and recipient_id is null)
    or (audience = 'class'      and class_id is not null)
    or (audience = 'role'       and role_id is not null)
    or (audience = 'individual' and recipient_id is not null)
  ),
  constraint announcements_expiry_after_publish
    check (expires_at is null or expires_at > publish_at)
);

create index announcements_school_idx
  on public.announcements (school_id, publish_at desc)
  where status = 'published';
create index announcements_class_idx on public.announcements (class_id, publish_at desc);
create index announcements_author_idx on public.announcements (author_id);
create index announcements_pinned_idx
  on public.announcements (school_id, publish_at desc)
  where is_pinned and status = 'published';

-- ── notifications ──────────────────────────────────────────────────────────
--  Per-recipient, in-app. Written by triggers and by the reminder Edge
--  Function; streamed to the client over Realtime.
create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  user_id     uuid not null references public.users (id)   on delete cascade,
  type        public.notification_type not null default 'system',
  title       text not null check (length(btrim(title)) > 0),
  body        text,
  -- In-app route, e.g. /student/assignments/<uuid>.
  action_url  text,
  -- Loose polymorphic pointer; no FK, because a notification should outlive
  -- the thing it mentions.
  entity_type text,
  entity_id   uuid,
  actor_id    uuid references public.users (id) on delete set null,
  is_read     boolean not null default false,
  read_at     timestamptz,
  -- Which channels this has been dispatched on, e.g. {"email":"2026-08-01T…"}.
  delivered   jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),

  constraint notifications_read_has_timestamp check (is_read = false or read_at is not null)
);

-- The inbox query: newest first, unread first.
create index notifications_inbox_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx
  on public.notifications (user_id, created_at desc)
  where not is_read;
create index notifications_entity_idx on public.notifications (entity_type, entity_id);

-- ── files ──────────────────────────────────────────────────────────────────
--  Metadata index over Supabase Storage. Storage owns the bytes and enforces
--  its own RLS on `storage.objects`; this table makes the objects queryable
--  ("every attachment on assignment X") and records who owns each one.
create table public.files (
  id            uuid primary key default gen_random_uuid(),
  school_id     uuid not null references public.schools (id) on delete cascade,
  bucket        public.storage_bucket not null,
  -- Object key within the bucket. Unique across the deployment.
  path          text not null check (length(btrim(path)) > 0),
  original_name text not null,
  mime_type     text not null default 'application/octet-stream',
  size_bytes    bigint not null check (size_bytes >= 0),
  checksum      text,
  owner_id      uuid references public.users (id) on delete set null,
  -- What this file is attached to: 'assignment' | 'assignment_submission' |
  -- 'lesson' | 'user' | 'school' | 'student'.
  entity_type   text not null,
  entity_id     uuid,
  visibility    public.file_visibility not null default 'private',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint files_path_unique unique (bucket, path)
);

create index files_entity_idx on public.files (entity_type, entity_id);
create index files_owner_idx  on public.files (owner_id);
create index files_school_idx on public.files (school_id, created_at desc);

-- ── audit_logs ─────────────────────────────────────────────────────────────
--  Append-only. There is no UPDATE or DELETE policy anywhere in 1000, and the
--  table owner revokes those privileges outright in 1300.
create table public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid references public.schools (id) on delete set null,
  actor_id    uuid references public.users (id)   on delete set null,
  action      public.audit_action not null,
  entity_type text not null,
  entity_id   uuid,
  -- Row image before/after. Sensitive columns are stripped by app.audit_row().
  before      jsonb,
  after       jsonb,
  changed_columns text[],
  ip_address  inet,
  user_agent  text,
  context     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_actor_idx  on public.audit_logs (actor_id, created_at desc);
create index audit_logs_school_idx on public.audit_logs (school_id, created_at desc);

comment on table public.audit_logs is
  'Append-only trail. Administrators can read it; nobody can rewrite it.';

-- ── updated_at triggers ────────────────────────────────────────────────────
select app.attach_updated_at('public.announcements');
select app.attach_updated_at('public.files');
