-- ═══════════════════════════════════════════════════════════════════════════
--  Global search — tell identical results apart
-- ═══════════════════════════════════════════════════════════════════════════
--  A teacher searching "mat" got this:
--
--      assignment | Mathematics · Continuous Assessment 1 | 21 Jul 2026
--      assignment | Mathematics · Continuous Assessment 1 | 21 Jul 2026
--      assignment | Mathematics · Continuous Assessment 1 | 21 Jul 2026
--
--  Three different rows, one per class they teach, rendered identically. The
--  list was correct and unusable: the only way to find the right one was to
--  open all three. The same happened for lessons and quizzes, and it gets worse
--  the more classes a teacher takes — which is the case this screen exists for.
--
--  The distinguishing fact is the class, so the class goes in the subtitle. It
--  is also the first thing a teacher wants to know about a result, ahead of the
--  due date it was showing instead.
--
--  LEFT JOIN, not JOIN. Every role in a school can currently read every class
--  row (`classes_select_school`), so an inner join would behave identically
--  today — but if that policy is ever narrowed, an inner join would silently
--  delete search results rather than showing them without a class label.
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
          concat_ws(' · ', c.name || c.arm, to_char(a.due_at, 'DD Mon'))
     from public.assignments a
     left join public.classes c on c.id = a.class_id, q
    where btrim(p_query) <> ''
      and a.title ilike q.pattern
    limit (select cap from q))

  union all
  -- Lessons
  (select 'lesson'::text, l.id, l.title,
          concat_ws(' · ', c.name || c.arm, 'Week ' || l.week_number::text)
     from public.lessons l
     left join public.classes c on c.id = l.class_id, q
    where btrim(p_query) <> ''
      and l.title ilike q.pattern
    limit (select cap from q))

  union all
  -- Quizzes
  (select 'quiz'::text, z.id, z.title,
          concat_ws(' · ', c.name || c.arm, z.duration_minutes::text || ' min')
     from public.quizzes z
     left join public.classes c on c.id = z.class_id, q
    where btrim(p_query) <> ''
      and z.title ilike q.pattern
    limit (select cap from q));
$$;

comment on function public.global_search(text, integer) is
  'Search across students, classes, subjects, assignments, lessons and quizzes. '
  'SECURITY INVOKER so each table''s own RLS policy scopes its own branch — a '
  'teacher matches their pupils, a pupil matches their published lessons. '
  'Subtitles carry the class, because the same assignment title exists once per '
  'class and the results are otherwise indistinguishable.';

revoke execute on function public.global_search(text, integer) from public, anon;
grant execute on function public.global_search(text, integer) to authenticated, service_role;
