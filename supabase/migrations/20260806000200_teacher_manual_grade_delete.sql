-- ═══════════════════════════════════════════════════════════════════════════
--  Let a teacher withdraw a manual grade they recorded
-- ═══════════════════════════════════════════════════════════════════════════
--  `grades_delete_admin` is the only DELETE policy on the gradebook, so a
--  teacher who typed an oral-test mark against the wrong pupil had no way to
--  take it back — they had to ask the office. That is the right rule for most
--  of the table and the wrong one for the rows they authored themselves.
--
--  The new policy is deliberately narrow, and each clause is load-bearing:
--
--    source_type = 'manual'   A row with a `source_id` was written by
--                             `app.sync_grade_from_submission()` or its quiz
--                             twin. Deleting one leaves the submission marked
--                             and the gradebook empty, with nothing to
--                             regenerate it — the mark simply vanishes while
--                             the pupil's work still shows a score. Withdrawing
--                             *that* means changing the submission, which is
--                             already possible.
--
--    recorded_by = me         Not "any teacher of this class". A colleague's
--                             professional judgement is not mine to erase, and
--                             an administrator can still remove anything.
--
--    teaches_class            The usual scope gate, so a teacher cannot reach
--                             a class they have no business in even if they
--                             somehow authored a row there.
--
--  Editing an existing grade is unchanged: `grades_update_teacher` already
--  allows it, which is the gentler correction and stays the first resort.
-- ═══════════════════════════════════════════════════════════════════════════

create policy grades_delete_own_manual on public.grades
  for delete to authenticated
  using (
    source_type = 'manual'
    and recorded_by = (select app.current_teacher_id())
    and (select app.teaches_class(class_id))
  );

comment on policy grades_delete_own_manual on public.grades is
  'A teacher may withdraw a manual entry they recorded themselves. Rows written '
  'by the submission and quiz triggers are not deletable here — there would be '
  'nothing left to regenerate them from.';
