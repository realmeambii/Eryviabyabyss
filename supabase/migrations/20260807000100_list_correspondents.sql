-- ═══════════════════════════════════════════════════════════════════════════
--  Who may I open a thread with?
-- ═══════════════════════════════════════════════════════════════════════════
--  `app.may_message()` already answers this for one person at a time, and the
--  participants insert policy calls it. The composer needs the same answer as a
--  *list*, and there are only two ways to get one:
--
--    reimplement the predicate as a query in TypeScript, or
--    ask the database the question it already knows how to answer.
--
--  The first is a second copy of an access rule, and the copy is the one that
--  goes stale. Worse, it fails in the direction that wastes people's time and
--  looks like a bug: the picker offers a name, the insert refuses it, and the
--  user is told they lack permission to message someone the app just suggested.
--
--  So this walks the school and asks `app.may_message()` per candidate. A
--  school has hundreds of users, not millions, and this runs when a composer
--  opens — not on a hot path. Correctness is worth more than the microseconds.
--
--  SECURITY INVOKER, deliberately: `app.may_message()` resolves against
--  `auth.uid()`, so the function must run as the caller. A definer here would
--  answer for the owner and hand everyone the whole school.
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
security invoker
set search_path = ''
as $$
  select u.id,
         u.full_name,
         u.avatar_path,
         -- The most senior role they hold, for the grouping in the picker.
         -- `roles.rank` is ascending by authority, so `min` is the top one.
         coalesce(
           (select r.slug
              from public.user_roles ur
              join public.roles r on r.id = ur.role_id
             where ur.user_id = u.id
               and (ur.expires_at is null or ur.expires_at > now())
             order by r.rank
             limit 1),
           'member'
         ) as role
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
