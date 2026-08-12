-- ═══════════════════════════════════════════════════════════════════════════
--  The first administrator founds the school
-- ═══════════════════════════════════════════════════════════════════════════
--  20260810000300 introduced `is_super` and backfilled it by picking the
--  earliest administrator grant at each school. That was written to migrate a
--  school that already existed, and for that it worked. It has no story at all
--  for a school created *after* it ran — which is every school this product
--  will ever sell to.
--
--  Found by building a virgin database from the migrations and provisioning one
--  administrator the way the Edge Function does:
--
--      is_admin       true
--      is_super       false
--      admin_can('users')      false
--      admin_can('academics')  false
--      granting any role       refused by RLS
--
--  So the first administrator of a new deployment could do nothing whatsoever,
--  and there was no way out from inside the product: capabilities are set by
--  the founder, appointing an administrator requires the founder, and
--  `user_roles_update_admin` refuses anyone who is not already the founder.
--  A brand-new school was bricked on arrival, recoverable only by someone with
--  the service-role key editing the table by hand.
--
--  The rule the product always meant is simply not written down anywhere: the
--  first administrator is the founder. This writes it down.
--
--  A BEFORE INSERT trigger rather than a default or an application-side check,
--  because the grant arrives down two different paths — `provision_user_role()`
--  from the Edge Function, and a direct insert by an existing founder — and the
--  rule has to hold on both without either remembering to apply it.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function app.claim_founding_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only an administrator grant can found a school. A teacher is just a
  -- teacher, however early they arrive.
  if not exists (
    select 1 from public.roles r
     where r.id = new.role_id and r.slug = 'administrator'
  ) then
    return new;
  end if;

  -- Already founded: leave the new grant as an ordinary sub-administrator,
  -- whose capabilities the founder sets.
  if exists (
    select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
     where ur.school_id = new.school_id
       and r.slug = 'administrator'
       and ur.is_super
  ) then
    return new;
  end if;

  new.is_super := true;
  return new;
end;
$$;

comment on function app.claim_founding_admin() is
  'The first administrator granted at a school becomes its founder. Without '
  'this a freshly migrated database has no super administrator and no way to '
  'appoint one, because appointing one requires being one.';

drop trigger if exists claim_founding_admin on public.user_roles;
create trigger claim_founding_admin
  before insert on public.user_roles
  for each row execute function app.claim_founding_admin();

-- ── One founder per school, enforced ────────────────────────────────────────
--  The trigger reads before it writes, so two administrator grants inserted
--  concurrently into a virgin school could both see "no founder yet" and both
--  claim it. A school with two people who cannot be overruled is the same
--  failure as a school with none.
--
--  A partial unique index settles it in the only place that can: the second
--  transaction fails rather than quietly creating a second founder.
create unique index if not exists user_roles_one_founder_per_school
  on public.user_roles (school_id)
  where is_super;

-- ── Repair any school this already stranded ─────────────────────────────────
--  Idempotent, and a no-op on the seeded school, which the earlier backfill
--  already gave a founder. It exists for a database that was migrated between
--  20260810000300 and this file and had an administrator created in between.
with stranded as (
  select distinct on (ur.school_id) ur.id
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.users u on u.id = ur.user_id
   where r.slug = 'administrator'
     and not exists (
       select 1
         from public.user_roles other
         join public.roles r2 on r2.id = other.role_id
        where other.school_id = ur.school_id
          and r2.slug = 'administrator'
          and other.is_super
     )
   order by ur.school_id, ur.granted_at, u.created_at, u.id
)
update public.user_roles ur
   set is_super = true
  from stranded s
 where ur.id = s.id;
