-- ═══════════════════════════════════════════════════════════════════════════
--  Global search
-- ═══════════════════════════════════════════════════════════════════════════
--  One statement across six tables, so the search box is one round trip rather
--  than six that arrive out of order and re-sort the list under the user's
--  cursor.
--
--  SECURITY INVOKER, and that is the whole design. Every branch of the UNION is
--  an ordinary SELECT, so each table's own policy applies to its own branch: a
--  teacher matches the pupils they teach because `students_select_authorised`
--  says so, a pupil matches published lessons for their class because
--  `lessons_select_authorised` says so, and neither needs a line of code here.
--  A definer would have had to reimplement all six, and would have been the
--  place a mistake leaked the school.
--
--  `ilike '%term%'` cannot use a b-tree index, which is why the trigram indexes
--  exist — `users_full_name_trgm_idx` and `question_bank_prompt_trgm_idx` back
--  the two biggest tables. The rest are small enough that a scan is cheaper
--  than the indexes would be to maintain.
--
--  Results are capped per branch *before* the union so one prolific table
--  cannot crowd the others out: searching "mathematics" should not return
--  forty lessons and hide the subject itself.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.global_search(p_query text, p_limit integer default 5)
returns table (
  kind     text,
  id       uuid,
  title    text,
  subtitle text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select '%' || btrim(p_query) || '%' as pattern,
           greatest(1, least(coalesce(p_limit, 5), 20)) as cap
  )
  -- Students
  (select 'student'::text, s.id, u.full_name, s.admission_number
     from public.students s
     join public.users u on u.id = s.user_id, q
    where btrim(p_query) <> ''
      and (u.full_name ilike q.pattern or s.admission_number ilike q.pattern)
    limit (select cap from q))

  union all
  -- Classes
  (select 'class'::text, c.id, c.name || c.arm,
          coalesce(c.room, 'No room')
     from public.classes c, q
    where btrim(p_query) <> ''
      and (c.name || c.arm) ilike q.pattern
    limit (select cap from q))

  union all
  -- Subjects
  (select 'subject'::text, sub.id, sub.name, sub.code
     from public.subjects sub, q
    where btrim(p_query) <> ''
      and (sub.name ilike q.pattern or sub.code ilike q.pattern)
    limit (select cap from q))

  union all
  -- Assignments
  (select 'assignment'::text, a.id, a.title,
          to_char(a.due_at, 'DD Mon YYYY')
     from public.assignments a, q
    where btrim(p_query) <> ''
      and a.title ilike q.pattern
    limit (select cap from q))

  union all
  -- Lessons
  (select 'lesson'::text, l.id, l.title,
          coalesce('Week ' || l.week_number::text, l.status::text)
     from public.lessons l, q
    where btrim(p_query) <> ''
      and l.title ilike q.pattern
    limit (select cap from q))

  union all
  -- Quizzes
  (select 'quiz'::text, z.id, z.title,
          z.duration_minutes::text || ' min'
     from public.quizzes z, q
    where btrim(p_query) <> ''
      and z.title ilike q.pattern
    limit (select cap from q));
$$;

comment on function public.global_search(text, integer) is
  'Search across students, classes, subjects, assignments, lessons and quizzes. '
  'SECURITY INVOKER so each table''s own RLS policy scopes its own branch — a '
  'teacher matches their pupils, a pupil matches their published lessons.';

revoke execute on function public.global_search(text, integer) from public, anon;
grant execute on function public.global_search(text, integer) to authenticated, service_role;
