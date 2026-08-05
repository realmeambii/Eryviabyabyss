-- ═══════════════════════════════════════════════════════════════════════════
--  Deterministic provisioning for admin-created accounts
-- ═══════════════════════════════════════════════════════════════════════════
--  `handle_new_user()` reads the role and the school from `raw_app_meta_data`,
--  which is the trusted channel: only the service role can write it. For a
--  *sign-up* that works exactly as intended — GoTrue writes the metadata as
--  part of the INSERT, so the AFTER INSERT trigger sees it.
--
--  The GoTrue **admin** API does not behave that way. `createUser` inserts the
--  row first and applies `app_metadata` in a subsequent UPDATE, so the trigger
--  fires against a row whose metadata holds nothing but `provider`. Every
--  branch then falls through to its default:
--
--      asked for a teacher  →  got a student grant and a `students` row
--      asked for a school   →  got whichever school happened to be the only
--                              active one, or none at all
--
--  Silently. The account looked created and was the wrong thing.
--
--  Rather than have the Edge Function delete and recreate whatever the trigger
--  guessed — racy, and it would need to reimplement `app.derive_identifier` in
--  TypeScript — the guess is suppressed at the source. An admin-provisioned
--  INSERT is marked as such, the trigger leaves the role alone, and the caller
--  states the role explicitly through `provision_user_role()`.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── The explicit path ──────────────────────────────────────────────────────
--  Idempotent by construction: every write is an upsert, so a retry after a
--  partial failure converges instead of erroring. It only ever *adds* — no
--  grant is revoked and no row deleted, because with the marker below there is
--  never a wrong one to clean up. A provisioning helper that deletes role
--  grants is one bug away from being a privilege-removal primitive.

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
  -- The same three roles the Edge Function will provision, restated here so
  -- the database is not relying on the caller to have checked. `administrator`
  -- is deliberately absent: granting one is not a provisioning operation.
  if p_role_slug not in ('student', 'teacher', 'parent') then
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

  else
    insert into public.parents (user_id, school_id)
    values (p_user_id, p_school_id)
    on conflict (user_id) do nothing;
  end if;
end;
$$;

comment on function app.provision_user_role(uuid, text, uuid) is
  'States a provisioned account''s school, role grant and role-extension row '
  'explicitly, instead of inferring them from auth metadata the admin API '
  'writes after the fact.';

-- ── The API surface ────────────────────────────────────────────────────────
--  `app` is not exposed over PostgREST (see `schemas` in config.toml), so the
--  Edge Function cannot reach the function above directly. This wrapper is the
--  door — and it is bolted shut to everyone but the service role.
--
--  This grants a role to an arbitrary user. Reaching it from a browser would
--  be a straight privilege escalation, so `authenticated` must never hold
--  EXECUTE on it. Postgres grants EXECUTE to PUBLIC on new functions by
--  default, which is exactly the mistake being revoked below.

create or replace function public.provision_user_role(
  p_user_id   uuid,
  p_role      text,
  p_school_id uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  select app.provision_user_role(p_user_id, p_role, p_school_id);
$$;

revoke execute on function public.provision_user_role(uuid, text, uuid)
  from public, anon, authenticated;

grant execute on function public.provision_user_role(uuid, text, uuid)
  to service_role;

comment on function public.provision_user_role(uuid, text, uuid) is
  'service_role only. Called by the admin-users Edge Function after it has '
  'verified the caller is an administrator of the school being written to.';

-- ── Stop the trigger guessing ──────────────────────────────────────────────
--  Identical to the original except for the marker check around the role
--  block. The profile is still created either way — it is the role, the grant
--  and the extension row that now wait to be stated.
--
--  SECURITY NOTE on the marker itself: it is read from `raw_user_meta_data`,
--  which is attacker-controlled — a self-signing user can absolutely set
--  `provisioned_by_admin` on themselves. It has to live there, because
--  `raw_app_meta_data` is empty at INSERT time and that is the whole problem
--  this migration exists to solve. It is safe because of which way it fails:
--  setting it grants *nothing*. It skips the block that hands out a role, so
--  the forger ends up with a profile, no grant, no extension row, and an app
--  that shows them the pending-access screen. The only thing they can do with
--  it is deny themselves the student role they would otherwise have got.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_app_meta   jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
  v_school_id  uuid;
  v_role_slug  text;
  v_role_id    uuid;
  v_first_name text;
  v_last_name  text;
  v_active_schools int;
  -- Set by the admin-users Edge Function. See the note above on why an
  -- untrusted channel is acceptable for this particular flag.
  v_provisioned boolean := coalesce(
    (v_user_meta ->> 'provisioned_by_admin')::boolean, false
  );
begin
  -- ── School ──────────────────────────────────────────────────────────────
  begin
    v_school_id := nullif(coalesce(v_app_meta ->> 'school_id', v_user_meta ->> 'school_id'), '')::uuid;
  exception when others then
    v_school_id := null;
  end;

  if v_school_id is null and not v_provisioned then
    select count(*) into v_active_schools from public.schools where is_active;
    if v_active_schools = 1 then
      select id into v_school_id from public.schools where is_active limit 1;
    end if;
    -- More than one school and no hint: leave school_id null. RLS then denies
    -- everything until an administrator places the account.
  end if;

  -- ── Role ────────────────────────────────────────────────────────────────
  v_role_slug := nullif(v_app_meta ->> 'role', '');       -- trusted (server-set)
  if v_role_slug is null then
    v_role_slug := nullif(v_user_meta ->> 'role', '');    -- untrusted (client-set)
    if v_role_slug is null or v_role_slug not in ('student', 'parent') then
      v_role_slug := 'student';
    end if;
  end if;

  select id into v_role_id from public.roles where slug = v_role_slug;
  if v_role_id is null then
    select id into v_role_id from public.roles where slug = 'student';
    v_role_slug := 'student';
  end if;

  -- ── Names ───────────────────────────────────────────────────────────────
  v_first_name := nullif(btrim(coalesce(v_user_meta ->> 'first_name', '')), '');
  v_last_name  := nullif(btrim(coalesce(v_user_meta ->> 'last_name', '')), '');
  if v_first_name is null then
    v_first_name := split_part(new.email, '@', 1);
  end if;
  if v_last_name is null then
    v_last_name := 'Unnamed';
  end if;

  insert into public.users (id, school_id, email, first_name, last_name, phone, status)
  values (
    new.id,
    v_school_id,
    lower(new.email),
    v_first_name,
    v_last_name,
    nullif(btrim(coalesce(v_user_meta ->> 'phone', '')), ''),
    case when new.email_confirmed_at is null then 'invited' else 'active' end::public.user_status
  )
  on conflict (id) do nothing;

  -- ── Role grant + role extension row ─────────────────────────────────────
  --  Skipped entirely for an admin-provisioned account: the metadata carrying
  --  the real answer has not been written yet, so anything decided here would
  --  be a guess that the caller then has to undo. provision_user_role() states
  --  it a moment later instead.
  if v_school_id is not null and not v_provisioned then
    insert into public.user_roles (user_id, role_id, school_id)
    values (new.id, v_role_id, v_school_id)
    on conflict (user_id, role_id, school_id) do nothing;

    if v_role_slug = 'student' then
      insert into public.students (user_id, school_id, admission_number)
      values (new.id, v_school_id, app.derive_identifier('ADM', new.id))
      on conflict (user_id) do nothing;

    elsif v_role_slug = 'parent' then
      insert into public.parents (user_id, school_id)
      values (new.id, v_school_id)
      on conflict (user_id) do nothing;

    elsif v_role_slug = 'teacher' then
      insert into public.teachers (user_id, school_id, staff_number)
      values (new.id, v_school_id, app.derive_identifier('STF', new.id))
      on conflict (user_id) do nothing;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'AFTER INSERT on auth.users. Creates the profile, grants a role and creates '
  'the matching role-extension row. Self-signup can only reach student/parent. '
  'Accounts marked `provisioned_by_admin` get the profile only — the Edge '
  'Function states their role through provision_user_role().';
