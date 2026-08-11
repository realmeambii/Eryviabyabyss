-- ═══════════════════════════════════════════════════════════════════════════
--  provision_user_role() may now mint an administrator
-- ═══════════════════════════════════════════════════════════════════════════
--  The old comment read: "`administrator` is deliberately absent: granting one
--  is not a provisioning operation." That was true when every administrator was
--  every other administrator's equal — there was no safe caller to trust with
--  it, so the answer was nobody.
--
--  There is one now. `app.is_super_admin()` names exactly one grant per school,
--  the Edge Function checks it before this is ever called, and
--  `user_roles_insert_admin` enforces the same rule for anything arriving over
--  PostgREST. So the refusal has moved from "never" to "not from here" — this
--  function is `service_role` only, and the two callers above it are the gate.
--
--  What it still will not do is create a *founder*. `is_super` is decided once,
--  at the migration that introduced it, and no code path mints a second: a
--  school with two founders has no one who cannot be overruled, which is the
--  same failure as having none. The grant is written with no capabilities and
--  the caller sets them in a separate statement, which keeps this function
--  ignorant of a vocabulary that has nothing to do with sign-up — the other
--  path through here is self-registration.
--
--  The extension-row branch gains nothing: an administrator has no `students`
--  or `teachers` row, and needs none. Their profile in `public.users` and the
--  grant are the whole record. A member of staff who both teaches and
--  administers holds two grants and has a `teachers` row from the other one.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function app.provision_user_role(
  p_user_id   uuid,
  p_role_slug text,
  p_school_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role_id uuid;
begin
  if p_role_slug not in ('student', 'teacher', 'parent', 'administrator') then
    raise exception 'provision_user_role() will not provision the % role', p_role_slug
      using errcode = 'check_violation';
  end if;

  if p_school_id is null then
    raise exception 'provision_user_role() requires a school'
      using errcode = 'not_null_violation';
  end if;

  select id into v_role_id from public.roles where slug = p_role_slug;
  if v_role_id is null then
    raise exception 'Role % does not exist', p_role_slug using errcode = 'check_violation';
  end if;

  -- Authoritative. The trigger's single-active-school fallback is a
  -- convenience for self-signup and must not decide where a provisioned
  -- account lands.
  update public.users set school_id = p_school_id where id = p_user_id;

  -- Never `is_super`, and never with capabilities. Both are the founder's to
  -- give, in a statement this function does not make.
  insert into public.user_roles (user_id, role_id, school_id)
  values (p_user_id, v_role_id, p_school_id)
  on conflict (user_id, role_id, school_id) do nothing;

  if p_role_slug = 'student' then
    insert into public.students (user_id, school_id, admission_number)
    values (p_user_id, p_school_id, app.derive_identifier('ADM', p_user_id))
    on conflict (user_id) do nothing;

  elsif p_role_slug = 'teacher' then
    insert into public.teachers (user_id, school_id, staff_number)
    values (p_user_id, p_school_id, app.derive_identifier('STF', p_user_id))
    on conflict (user_id) do nothing;

  elsif p_role_slug = 'parent' then
    insert into public.parents (user_id, school_id)
    values (p_user_id, p_school_id)
    on conflict (user_id) do nothing;
  end if;
  -- administrator: no extension row, by design.
end;
$$;

comment on function app.provision_user_role(uuid, text, uuid) is
  'Grant a role and create its extension row. Administrators are permitted but '
  'never as founder and never with capabilities — the caller sets those. '
  'service_role only; app.is_super_admin() is the gate above it.';
