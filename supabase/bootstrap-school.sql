-- ═══════════════════════════════════════════════════════════════════════════
--  Bootstrap a school and its founding administrator
-- ═══════════════════════════════════════════════════════════════════════════
--  Run once against a fresh production database, after the migrations and
--  after the administrator's auth account exists.
--
--  ── Order matters ─────────────────────────────────────────────────────────
--
--  Create the *auth account first*, in the Supabase dashboard
--  (Authentication → Users → Add user, with "Auto Confirm User" ticked), and
--  only then run this. The reason is `handle_new_user()`: it fires on the auth
--  insert and, if exactly one active school already exists, quietly enrols the
--  new account as a *student* of it — admission number and all. With no school
--  yet it leaves `school_id` null and grants nothing, which is the clean slate
--  this script wants.
--
--  If the account was created after a school existed anyway, this script
--  repairs it: the guessed student grant and `students` row are removed below.
--
--  ── Why the password is not here ──────────────────────────────────────────
--
--  This script never touches credentials. The password is set by whoever owns
--  the account, in the dashboard, and is never written down in a file that
--  ends up in a repository or a terminal history.
--
--  ── What it produces ──────────────────────────────────────────────────────
--
--  One school, one administrator, and nothing else. That administrator is the
--  founder — `app.claim_founding_admin()` sets `is_super` on the first
--  administrator grant at a school — so they hold every capability and are the
--  only account that can appoint others. Every subsequent teacher, pupil and
--  guardian is created from inside the app.
-- ═══════════════════════════════════════════════════════════════════════════

\set ON_ERROR_STOP on

-- ── Fill these in ───────────────────────────────────────────────────────────
\set admin_email   'you@yourschool.edu.ng'
\set school_name   'Your School Name'
\set school_slug   'your-school-name'
-- ────────────────────────────────────────────────────────────────────────────

begin;

-- The account must already exist. Failing loudly here is far better than
-- creating a school with nobody able to administer it.
--
-- The email goes through a GUC rather than straight into the block: psql does
-- not interpolate `:'var'` inside dollar-quoted text, so a literal there would
-- be read as the string ":'admin_email'".
select set_config('bootstrap.admin_email', :'admin_email', false);

do $$
declare
  v_email text := current_setting('bootstrap.admin_email', true);
begin
  if not exists (select 1 from auth.users where lower(email) = lower(v_email)) then
    raise exception
      'No auth account for %. Create it in the dashboard first (Authentication → Users → Add user).',
      v_email;
  end if;
end
$$;

-- ── The school ──────────────────────────────────────────────────────────────
insert into public.schools (name, slug)
select :'school_name', :'school_slug'
where not exists (select 1 from public.schools where slug = :'school_slug');

-- ── Attach the administrator to it ──────────────────────────────────────────
update public.users u
   set school_id = s.id,
       status    = 'active'
  from public.schools s
 where s.slug = :'school_slug'
   and lower(u.email) = lower(:'admin_email');

-- ── Undo anything handle_new_user() guessed ─────────────────────────────────
--  Only fires if the account was created after the school existed. A no-op on
--  the intended ordering.
delete from public.students st
 using public.users u
 where st.user_id = u.id and lower(u.email) = lower(:'admin_email');

delete from public.user_roles ur
 using public.users u, public.roles r
 where ur.user_id = u.id
   and r.id = ur.role_id
   and r.slug <> 'administrator'
   and lower(u.email) = lower(:'admin_email');

-- ── The founding grant ──────────────────────────────────────────────────────
--  `app.claim_founding_admin()` sets is_super on this, because it is the first
--  administrator at this school. Capabilities stay empty: is_super satisfies
--  every `app.admin_can()` check on its own.
insert into public.user_roles (user_id, role_id, school_id)
select u.id, r.id, s.id
  from public.users u, public.roles r, public.schools s
 where lower(u.email) = lower(:'admin_email')
   and r.slug = 'administrator'
   and s.slug = :'school_slug'
on conflict (user_id, role_id, school_id) do nothing;

commit;

-- ── What you should see ─────────────────────────────────────────────────────
select s.name                          as school,
       u.email                         as administrator,
       u.status,
       ur.is_super                     as is_founder,
       (select count(*) from public.users)      as total_accounts,
       (select count(*) from public.user_roles) as total_grants
  from public.user_roles ur
  join public.users u   on u.id = ur.user_id
  join public.roles r   on r.id = ur.role_id
  join public.schools s on s.id = ur.school_id
 where r.slug = 'administrator';
