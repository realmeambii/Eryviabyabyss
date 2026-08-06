-- ═══════════════════════════════════════════════════════════════════════════
--  get_quiz_paper() was handing out the answer to matching questions
-- ═══════════════════════════════════════════════════════════════════════════
--  The function is careful never to return `correct_answers` — that was the
--  whole point of it existing rather than letting a student select from
--  `quiz_questions` directly. But it returns `options` verbatim, and the
--  matching shape added in `20260805000400` stores the answer *inside* an
--  option:
--
--      [{"id":"x","label":"Heart","match":"Pumps blood"}, …]
--
--  So a pupil sitting a matching question received `label` and its correct
--  `match` on the same object. The key was withheld from one column and served
--  from another.
--
--  Caught before any pupil could sit one — the student quiz UI does not exist
--  yet and no matching question has been authored. Fixing it here, before that
--  UI ships, rather than after.
--
--  The fix splits the pair:
--
--    options     [{id, label}]  — the left-hand column, `match` stripped
--    match_pool  ["Pumps blood", "Gas exchange", …] — every right-hand item,
--                shuffled independently, with no hint of which belongs to which
--
--  Shuffling the pool is not decoration. Returning it in option order would
--  restore the pairing by position, which is the same leak wearing a different
--  shape.
--
--  Stripped for staff too. A teacher previewing the paper should see what the
--  class will see; the authoring screen reads `quiz_questions` directly and
--  still has the key.
--
--  DROP then CREATE: the OUT columns change, so CREATE OR REPLACE will not do.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.get_quiz_paper(uuid);

create or replace function public.get_quiz_paper(p_quiz_id uuid)
returns table (
  id            uuid,
  sort_order    smallint,
  question_type public.question_type,
  prompt        text,
  options       jsonb,
  match_pool    jsonb,
  points        numeric,
  media_path    text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quizzes%rowtype;
  v_student uuid := app.current_student_id();
  v_shuffle boolean;
begin
  select * into q from public.quizzes where quizzes.id = p_quiz_id;
  if not found then
    raise exception 'Quiz not found' using errcode = 'no_data_found';
  end if;

  -- Staff who own the paper get it in order; everyone else must be an enrolled
  -- student sitting a published, open paper.
  if app.teaches_class_subject(q.class_id, q.subject_id) or app.is_admin() then
    v_shuffle := false;
  else
    if v_student is null or not app.is_enrolled_in(q.class_id) then
      raise exception 'Not authorised to view this quiz'
        using errcode = 'insufficient_privilege';
    end if;
    if q.status <> 'published'
       or (q.opens_at is not null and now() < q.opens_at)
       or (q.closes_at is not null and now() > q.closes_at)
    then
      raise exception 'This quiz is not open' using errcode = 'check_violation';
    end if;
    v_shuffle := q.shuffle_questions;
  end if;

  return query
    with visible as (
      select qq.id,
             qq.sort_order,
             qq.question_type,
             qq.prompt,
             qq.points,
             qq.media_path,
             -- Every option, with `match` removed whatever the type. Only
             -- matching questions carry one, and nothing else is lost by
             -- rebuilding the object from the two keys a candidate needs.
             (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'label', o ->> 'label'))
                from jsonb_array_elements(qq.options) o) as safe_options,
             case
               when qq.question_type = 'matching' then
                 (select jsonb_agg(m order by random())
                    from (
                      select distinct o ->> 'match' as m
                        from jsonb_array_elements(qq.options) o
                       where nullif(btrim(coalesce(o ->> 'match', '')), '') is not null
                    ) pool)
               else null
             end as pool
        from public.quiz_questions qq
       where qq.quiz_id = p_quiz_id
    )
    select v.id,
           v.sort_order,
           v.question_type,
           v.prompt,
           case
             when q.shuffle_options and v.safe_options is not null and v_shuffle then
               (select jsonb_agg(o order by random()) from jsonb_array_elements(v.safe_options) o)
             else v.safe_options
           end as options,
           v.pool as match_pool,
           v.points,
           v.media_path
      from visible v
     order by case when v_shuffle then random() else null end,
              v.sort_order;
end;
$$;

comment on function public.get_quiz_paper(uuid) is
  'The candidate''s view of a paper. Never returns `correct_answers`, and '
  'strips `match` from options so a matching question does not carry its own '
  'answer. `match_pool` holds the right-hand items, shuffled independently.';

revoke execute on function public.get_quiz_paper(uuid) from public, anon;
grant execute on function public.get_quiz_paper(uuid) to authenticated, service_role;
