-- ═══════════════════════════════════════════════════════════════════════════
--  list_correspondents() could not offer the office
-- ═══════════════════════════════════════════════════════════════════════════
--  A teacher asking who they may write to got 219 names and not one
--  administrator, even though `app.may_message()` returns true for every one of
--  them. The predicate and the result disagreed:
--
--      teacher may_message(admin) : true
--      admin appears in list      : false
--
--  The cause is the scan, not the gate. `list_correspondents()` was SECURITY
--  INVOKER, so `from public.users` is itself filtered by
--  `users_select_visible` → `app.can_read_user()`, which does not make an
--  administrator's row visible to an ordinary teacher. The row was gone before
--  `may_message()` was ever consulted, and "I need to raise something with the
--  office" — the most ordinary request in the product — had no route.
--
--  I made it invoker on the reasoning that a definer "would answer for the
--  owner and hand everyone the whole school". That reasoning was wrong, and the
--  comment in 20260807000100 saying so is corrected here. SECURITY DEFINER
--  changes the *role* the body executes as, which is what suspends RLS. It does
--  not change `auth.uid()`: that reads `request.jwt.claims` from the session,
--  which the role switch leaves alone. Every helper in the `app` schema depends
--  on exactly this — `app.has_role()`, `app.current_school_id()` and
--  `may_message()` itself are all SECURITY DEFINER and all resolve against the
--  caller.
--
--  So the function becomes definer and `may_message()` is left as the sole
--  gate, which is what it was always meant to be. The school and status filters
--  stay as cheap pre-filters; correctness rests on the predicate.
--
--  Verified after the change, both directions: an administrator now appears,
--  and a pupil the teacher does not teach still does not.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.list_correspondents()
returns table (
  user_id     uuid,
  full_name   text,
  avatar_path text,
  role        text
)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id,
         u.full_name,
         u.avatar_path,
         coalesce(app.primary_role(u.id), 'member') as role
    from public.users u
   -- Not access control — `may_message()` is. These two only keep the scan
   -- off other tenants and off deactivated accounts.
   where u.school_id = app.current_school_id()
     and u.status = 'active'
     -- The gate. Resolves against auth.uid(), definer or not.
     and app.may_message(u.id)
   order by u.full_name;
$$;

comment on function public.list_correspondents() is
  'Everyone the caller may start a conversation with. SECURITY DEFINER so the '
  'scan is not narrowed a second time by users_select_visible — app.may_message() '
  'is the only gate, and it is the same one the participants insert policy uses.';

revoke execute on function public.list_correspondents() from public, anon;
grant execute on function public.list_correspondents() to authenticated, service_role;
