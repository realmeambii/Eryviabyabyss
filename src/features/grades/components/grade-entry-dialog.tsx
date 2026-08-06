import { useEffect, useState } from 'react';

import { Alert, AlertDescription } from '@/shared/components/ui/alert';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Select } from '@/shared/components/ui/select';
import { Textarea } from '@/shared/components/ui/textarea';
import { errorMessage } from '@/shared/lib/errors';
import type { Grade } from '@/shared/types';

import { useGradeMutations } from '../hooks/use-gradebook';

/**
 * Record one mark by hand — an oral test, a practical, a piece of class work
 * that never went through the assignment module.
 *
 * `source_type` is `manual`, which is what separates these from the rows the
 * submission and quiz triggers write. Only manual rows can be withdrawn by
 * their author; the rest belong to the assessment behind them.
 */

const ASSESSMENT_TYPES = [
  { value: 'test', label: 'Test' },
  { value: 'classwork', label: 'Classwork' },
  { value: 'homework', label: 'Homework' },
  { value: 'project', label: 'Project' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'exam', label: 'Exam' },
];

export function GradeEntryDialog({
  open,
  onOpenChange,
  classId,
  subjectId,
  schoolId,
  sessionId,
  roster,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  subjectId: string;
  schoolId: string;
  sessionId: string;
  roster: { student_id: string; full_name: string; admission_number: string }[];
}) {
  const { record } = useGradeMutations();

  const [studentId, setStudentId] = useState('');
  const [title, setTitle] = useState('');
  const [assessmentType, setAssessmentType] = useState('test');
  const [score, setScore] = useState('');
  const [maxScore, setMaxScore] = useState('100');
  const [weightPercent, setWeightPercent] = useState('100');
  const [comment, setComment] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTouched(false);
    record.reset();
    setStudentId('');
    setTitle('');
    setAssessmentType('test');
    setScore('');
    setMaxScore('100');
    setWeightPercent('100');
    setComment('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const scoreValue = Number(score);
  const maxValue = Number(maxScore);

  const errors = {
    studentId: touched && !studentId ? 'Choose a pupil.' : null,
    title: touched && title.trim().length === 0 ? 'Name the assessment.' : null,
    // `grades_score_within_max` rejects this at the database; saying it here
    // means the teacher is told in words rather than by SQLSTATE 23514.
    score:
      touched && (!Number.isFinite(scoreValue) || scoreValue < 0)
        ? 'Enter a score.'
        : touched && Number.isFinite(maxValue) && scoreValue > maxValue
          ? `Cannot be more than ${maxScore}.`
          : null,
    maxScore: touched && (!Number.isFinite(maxValue) || maxValue <= 0) ? 'Must be above 0.' : null,
  };

  const isValid =
    Boolean(studentId) &&
    title.trim().length > 0 &&
    Number.isFinite(scoreValue) &&
    scoreValue >= 0 &&
    Number.isFinite(maxValue) &&
    maxValue > 0 &&
    scoreValue <= maxValue;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a mark</DialogTitle>
          <DialogDescription>
            Saved unpublished, so nothing reaches the pupil until you publish it.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          {record.error ? (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage(record.error)}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="ge-student">Pupil</Label>
            <Select
              id="ge-student"
              value={studentId}
              onChange={(event) => {
                setStudentId(event.target.value);
              }}
              placeholder="Choose a pupil"
              aria-invalid={errors.studentId !== null}
              options={roster.map((row) => ({
                value: row.student_id,
                label: `${row.full_name} · ${row.admission_number}`,
              }))}
            />
            {errors.studentId ? (
              <p className="text-[12.5px] text-danger">{errors.studentId}</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
            <div className="space-y-1.5">
              <Label htmlFor="ge-title">Assessment</Label>
              <Input
                id="ge-title"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                }}
                placeholder="Oral test — week 4"
                aria-invalid={errors.title !== null}
              />
              {errors.title ? <p className="text-[12.5px] text-danger">{errors.title}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ge-type">Kind</Label>
              <Select
                id="ge-type"
                value={assessmentType}
                onChange={(event) => {
                  setAssessmentType(event.target.value);
                }}
                options={ASSESSMENT_TYPES}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="ge-score">Score</Label>
              <Input
                id="ge-score"
                type="number"
                min={0}
                step="0.5"
                value={score}
                onChange={(event) => {
                  setScore(event.target.value);
                }}
                aria-invalid={errors.score !== null}
              />
              {errors.score ? <p className="text-[12.5px] text-danger">{errors.score}</p> : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ge-max">Out of</Label>
              <Input
                id="ge-max"
                type="number"
                min={1}
                step="0.5"
                value={maxScore}
                onChange={(event) => {
                  setMaxScore(event.target.value);
                }}
                aria-invalid={errors.maxScore !== null}
              />
              {errors.maxScore ? (
                <p className="text-[12.5px] text-danger">{errors.maxScore}</p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ge-weight">Weight (%)</Label>
              <Input
                id="ge-weight"
                type="number"
                min={0}
                max={100}
                value={weightPercent}
                onChange={(event) => {
                  setWeightPercent(event.target.value);
                }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ge-comment">Comment</Label>
            <Textarea
              id="ge-comment"
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
              }}
              rows={2}
              placeholder="Seen by the pupil once published. Optional."
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={record.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            loading={record.isPending}
            onClick={() => {
              setTouched(true);
              if (!isValid) return;

              record.mutate(
                {
                  school_id: schoolId,
                  student_id: studentId,
                  subject_id: subjectId,
                  class_id: classId,
                  academic_session_id: sessionId,
                  assessment_type: assessmentType as Grade['assessment_type'],
                  source_type: 'manual',
                  title: title.trim(),
                  score: scoreValue,
                  max_score: maxValue,
                  weight: Math.min(1, Math.max(0, Number(weightPercent) / 100)),
                  comment: comment.trim() || null,
                  is_published: false,
                },
                {
                  onSuccess: () => {
                    onOpenChange(false);
                  },
                },
              );
            }}
          >
            Record mark
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
