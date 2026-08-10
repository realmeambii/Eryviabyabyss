-- ═══════════════════════════════════════════════════════════════════════════
--  list_correspondents() was labelling everyone "member"
-- ═══════════════════════════════════════════════════════════════════════════
--  The function reads a person's most senior role so the composer can group the
--  picker by Teacher / Student / Parent. It is SECURITY INVOKER — it has to be,
--  because `app.may_message()` resolves against `auth.uid()` and a definer
--  would answer for the owner and hand everyone the whole school.
--
--  But that also applies RLS to the role lookup, and
--  `user_roles_select_self_or_admin` lets you read your *own* grants and
--  nobody else's. So the subquery returned null for every other person and the
--  `coalesce` fallback fired for all of them: 219 correspondents, all filed
--  under "member", and a grouped picker that grouped nothing.
--
--  Splitting the two questions fixes it. The gate stays invoker-side; only the
--  label is looked up as definer.
--
--  What that discloses is one word — which role a person holds — about someone
--  the caller has *already* been cleared to message. The staff directory shows
--  who the teachers are, a class register shows who the pupils are, and the
--  guardian is reachable precisely because they are a guardian. There is no
--  new information here, and the function returns nothing else: no email, no
--  class, no id it was not given.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function app.primary_role(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  -- `roles.rank` ascends by authority, so the lowest rank is the most senior
  -- role a person holds.
  select r.slug
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
   where ur.user_id = p_user_id
     and (ur.expires_at is null or ur.expires_at > now())
   order by r.rank
   limit 1;
$$;

comment on function app.primary_role(uuid) is
  'The most senior role a user holds. SECURITY DEFINER so a caller can label '
  'someone they may already message, without being able to read user_roles.';

grant execute on function app.primary_role(uuid) to authenticated, service_role;
revoke execute on function app.primary_role(uuid) from anon;

create or replace function public.list_correspondents()
returns table (
  user_id     uuid,
  full_name   text,
  avatar_path text,
  role        text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select u.id,
         u.full_name,
         u.avatar_path,
         coalesce(app.primary_role(u.id), 'member') as role
    from public.users u
   where u.school_id = app.current_school_id()
     and u.status = 'active'
     and app.may_message(u.id)
   order by u.full_name;
$$;

comment on function public.list_correspondents() is
  'Everyone the caller may start a conversation with — the same set '
  'app.may_message() gates the participants insert on, so the composer cannot '
  'offer a name the write would refuse.';

revoke execute on function public.list_correspondents() from public, anon;
grant execute on function public.list_correspondents() to authenticated, service_role;
