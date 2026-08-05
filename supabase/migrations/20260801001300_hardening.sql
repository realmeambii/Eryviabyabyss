-- ═══════════════════════════════════════════════════════════════════════════
--  1300 · Hardening
-- ═══════════════════════════════════════════════════════════════════════════
--  RLS decides *which rows* a caller may write. It has nothing to say about
--  *which columns*. Three things close that gap:
--    • column-guard triggers, which silently restore protected columns;
--    • explicit REVOKEs, so append-only really is append-only;
--    • an assertion that fails this migration if any table in `public` ships
--      without RLS.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══ Column guards ═════════════════════════════════════════════════════════
--  Each guard short-circuits when auth.uid() is null: that is the service
--  role, the seed script, or one of the auth triggers in 0800, none of which
--  should be second-guessed here.

create or replace function app.protect_user_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or app.is_admin() then
    return new;
  end if;

  -- A user may edit their name, phone, avatar, locale and preferences.
  -- Everything below decides what they can *reach*, so it stays put.
  new.school_id := old.school_id;
  new.status    := old.status;
  new.email     := old.email;      -- email changes go through Supabase Auth
  new.metadata  := old.metadata;
  new.created_at := old.created_at;

  return new;
end;
$$;

create trigger protect_user_columns
  before update on public.users
  for each row execute function app.protect_user_columns();

create or replace function app.protect_student_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or app.is_admin() then
    return new;
  end if;

  -- A student may correct their address and emergency contact. They may not
  -- move themselves into another class or un-suspend their own record.
  new.school_id        := old.school_id;
  new.admission_number := old.admission_number;
  new.admission_date   := old.admission_date;
  new.current_class_id := old.current_class_id;
  new.status           := old.status;
  new.user_id          := old.user_id;

  return new;
end;
$$;

create trigger protect_student_columns
  before update on public.students
  for each row execute function app.protect_student_columns();

create or replace function app.protect_notification_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  -- The recipient may mark a notification read or unread. Nothing else.
  new.school_id   := old.school_id;
  new.user_id     := old.user_id;
  new.type        := old.type;
  new.title       := old.title;
  new.body        := old.body;
  new.action_url  := old.action_url;
  new.entity_type := old.entity_type;
  new.entity_id   := old.entity_id;
  new.actor_id    := old.actor_id;
  new.delivered   := old.delivered;
  new.created_at  := old.created_at;

  return new;
end;
$$;

create trigger protect_notification_columns
  before update on public.notifications
  for each row execute function app.protect_notification_columns();

-- Grades carry a paper trail; the source pointer must not be rewritten to
-- re-attribute a mark to a different assessment.
create or replace function app.protect_grade_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or app.is_admin() then
    return new;
  end if;

  new.school_id   := old.school_id;
  new.student_id  := old.student_id;
  new.source_type := old.source_type;
  new.source_id   := old.source_id;
  new.created_at  := old.created_at;

  return new;
end;
$$;

create trigger protect_grade_columns
  before update on public.grades
  for each row execute function app.protect_grade_columns();

-- ═══ Table privileges ══════════════════════════════════════════════════════
--  Access needs BOTH a grant and a policy. RLS decides which *rows* a role may
--  touch; the GRANT decides whether it may touch the table at all. Miss the
--  grant and every query fails with "permission denied for table" before a
--  policy is ever consulted.
--
--  These are granted explicitly rather than inherited from the platform's
--  `ALTER DEFAULT PRIVILEGES`. Those defaults have changed between Supabase
--  releases — under the publishable/secret-key model `authenticated` no longer
--  receives blanket DML — and a project that depends on them breaks silently
--  on upgrade or on a differently-configured host. Stating them here makes the
--  schema self-contained.
--
--  `service_role` needs them too: BYPASSRLS skips the *policies*, not the
--  privilege check, so Edge Functions would fail without this.

do $$
declare
  v_table text;
begin
  for v_table in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated, service_role',
      v_table
    );

    -- `anon` is the pre-login role. It needs nothing in `public` — sign-in
    -- happens entirely through the auth schema, and the landing shell is
    -- static. Revoking here rather than never granting keeps it true even if
    -- a default privilege hands `anon` something later.
    execute format('revoke all on public.%I from anon', v_table);
  end loop;
end
$$;

-- ═══ Append-only audit trail ═══════════════════════════════════════════════
--  Runs *after* the loop above, which would otherwise hand back the very
--  privileges this removes. 1000 gives audit_logs a SELECT policy and nothing
--  else; revoking the privileges as well means the table stays append-only
--  even if somebody adds a policy by mistake later.

revoke insert, update, delete, truncate on public.audit_logs from authenticated, anon;
grant select on public.audit_logs to authenticated;

-- Same reasoning for the quiz answer key: students have no policy on this
-- table, and no privilege backs one up either.
revoke all on public.quiz_questions from anon;

-- ═══ Resource limits ═══════════════════════════════════════════════════════
--  Cheap, effective back-pressure: a runaway report cannot pin a connection,
--  and a leaked anon key cannot be used to mine the database with slow scans.
--  Per-IP request throttling belongs in front of PostgREST — see docs/SECURITY.md.

alter role anon          set statement_timeout = '5s';
alter role authenticated set statement_timeout = '20s';
alter role anon          set idle_in_transaction_session_timeout = '10s';
alter role authenticated set idle_in_transaction_session_timeout = '30s';

-- ═══ Assertions ════════════════════════════════════════════════════════════
--  A migration that would ship a table without RLS fails here instead of in
--  production.

do $$
declare
  v_missing text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into v_missing
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not c.relrowsecurity;

  if v_missing is not null then
    raise exception
      'Row Level Security is not enabled on: %. Every table in public must have RLS.',
      v_missing;
  end if;
end
$$;

--  A table with RLS on but no policy at all denies everything — usually a
--  mistake rather than a decision. audit_logs is the deliberate exception
--  (SELECT only), so it is allowed to have exactly one.
do $$
declare
  v_empty text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into v_empty
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and c.relrowsecurity
     and not exists (select 1 from pg_policies p
                      where p.schemaname = 'public' and p.tablename = c.relname);

  if v_empty is not null then
    raise exception 'RLS is enabled but no policy exists on: %.', v_empty;
  end if;
end
$$;

--  The inverse mistake, and a nastier one to diagnose: a table with correct
--  policies but no SELECT grant. RLS is never consulted — PostgREST returns
--  "permission denied for table" and it looks like a policy bug for an hour.
--  This project hit exactly that when it relied on the platform's default
--  privileges instead of granting explicitly.
do $$
declare
  v_ungranted text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into v_ungranted
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'r'
     and not has_table_privilege('authenticated', c.oid, 'SELECT');

  if v_ungranted is not null then
    raise exception
      'Role `authenticated` has no SELECT privilege on: %. A policy without a '
      'grant denies everything before RLS is evaluated.',
      v_ungranted;
  end if;
end
$$;
