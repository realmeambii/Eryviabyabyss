-- ═══════════════════════════════════════════════════════════════════════════
--  1060 · Search
-- ═══════════════════════════════════════════════════════════════════════════
--  The student register searches across two tables — `admission_number` lives
--  on `students`, the name and email on `users`. PostgREST cannot express that:
--  a root-level `or=` may only reference columns of the root table, so
--  `users.full_name.ilike.*` in a root filter is a parse error, not a join.
--
--  Note what this function is NOT. Unlike the quiz RPCs in 1050, it has nothing
--  to hide and therefore no reason to be SECURITY DEFINER. It is SECURITY
--  INVOKER, so `students_select_authorised` and `users_select_visible` still
--  apply: the identical call returns every student to an administrator, only
--  their own students to a teacher, and only their children to a parent.
--
--  Building the search server-side also removes the injection surface. The
--  client used to interpolate the raw search term into PostgREST filter
--  grammar, where a `,` or `)` would corrupt the expression; here it is a bound
--  parameter.
-- ═══════════════════════════════════════════════════════════════════════════

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
