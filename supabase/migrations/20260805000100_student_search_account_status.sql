-- ═══════════════════════════════════════════════════════════════════════════
--  Add `user_status` to search_students()
-- ═══════════════════════════════════════════════════════════════════════════
--  The student register has to show two different facts that are easy to
--  confuse:
--
--    students.status  — where the pupil stands with the school. Active,
--                       graduated, transferred, withdrawn.
--    users.status     — whether the login works at all.
--
--  They usually agree, because `admin-users` moves both together when an
--  account is deactivated. They are not the same thing though: a graduated
--  student keeps a working account through results season, and a suspended
--  account belongs to a pupil who is still very much on the roll. Deriving one
--  from the other in the UI would be a guess, so the RPC returns both.
--
--  DROP then CREATE rather than CREATE OR REPLACE: Postgres will not replace a
--  set-returning function whose OUT columns have changed.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.search_students(
  text, uuid, public.student_status, integer, integer
);

create or replace function public.search_students(
  p_query    text default null,
  p_class_id uuid default null,
  p_status   public.student_status default null,
  p_limit    integer default 25,
  p_offset   integer default 0
)
returns table (
  id               uuid,
  admission_number text,
  admission_date   date,
  status           public.student_status,
  current_class_id uuid,
  user_id          uuid,
  full_name        text,
  email            text,
  avatar_path      text,
  phone            text,
  user_status      public.user_status,
  class_name       text,
  class_arm        text,
  -- The total before LIMIT. Window functions are evaluated before LIMIT, so
  -- this is the full match count — one round trip instead of a second
  -- head-request for `count: 'exact'`.
  total_count      bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with matched as (
    select s.id,
           s.admission_number,
           s.admission_date,
           s.status,
           s.current_class_id,
           s.user_id,
           u.full_name,
           u.email,
           u.avatar_path,
           u.phone,
           u.status as user_status,
           c.name as class_name,
           c.arm  as class_arm
      from public.students s
      join public.users u on u.id = s.user_id
      left join public.classes c on c.id = s.current_class_id
     where (p_class_id is null or s.current_class_id = p_class_id)
       and (p_status is null or s.status = p_status)
       and (
         p_query is null
         or btrim(p_query) = ''
         or u.full_name        ilike '%' || btrim(p_query) || '%'
         or s.admission_number ilike '%' || btrim(p_query) || '%'
         or u.email            ilike '%' || btrim(p_query) || '%'
       )
  )
  select m.*, count(*) over () as total_count
    from matched m
   order by m.admission_number
   -- Clamped so a crafted request cannot ask for the whole register in one go.
   limit  greatest(1, least(coalesce(p_limit, 25), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

comment on function public.search_students(text, uuid, public.student_status, integer, integer) is
  'Paged student search across students + users. SECURITY INVOKER — RLS still '
  'decides which rows the caller sees.';

-- Postgres grants EXECUTE to PUBLIC on new functions by default, which would
-- expose this to `anon` through PostgREST. Revoke first, then grant.
revoke execute on function
  public.search_students(text, uuid, public.student_status, integer, integer)
  from public, anon;

grant execute on function
  public.search_students(text, uuid, public.student_status, integer, integer)
  to authenticated, service_role;
