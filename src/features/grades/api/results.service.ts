import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type { Grade } from '@/shared/types';

import { computeReport, DEFAULT_WEIGHTING, type ReportWeighting } from './grades.service';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  School-wide results
 * ═══════════════════════════════════════════════════════════════════════════
 *  The office's view of the same table a teacher edits one class at a time.
 *  Three questions it exists to answer, none of which a per-class gradebook
 *  can:
 *
 *    · how is each year group doing, and against what
 *    · which subjects are carrying the school and which are sinking it
 *    · what is still unpublished with a fortnight to reports
 *
 *  Folded in memory rather than aggregated in SQL. A term for one school is a
 *  few thousand rows, and the alternative — a view or an RPC per question —
 *  puts the definition of "the overall mark" in two places. It is already
 *  defined once, in `computeReport()`, and the report card a parent receives
 *  has to agree with the table an administrator is looking at down to the
 *  decimal. If a school ever outgrows this, the right answer is a materialised
 *  view fed by the same function, not a second formula.
 *
 *  Publication is per grade row and is what a pupil's `grades_select` policy
 *  turns on. Withholding is therefore a real action with a real effect, not a
 *  display flag — which is why it is confirmed and audited rather than being a
 *  switch on a table row.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface ResultsFilters {
  sessionId: string;
  classId?: string;
  subjectId?: string;
}

interface ResultRow extends Grade {
  subject: { id: string; name: string; code: string } | null;
  class: { id: string; name: string; arm: string; level: number } | null;
}

export interface SubjectStanding {
  subject_id: string;
  name: string;
  code: string;
  average: number | null;
  entered: number;
  published: number;
  /** Pupils below 40 — the pass mark on the WAEC scale the schools use. */
  failing: number;
}

export interface ClassStanding {
  class_id: string;
  name: string;
  arm: string;
  level: number;
  average: number | null;
  entered: number;
  published: number;
  pupils: number;
}

export interface SchoolResults {
  totalGrades: number;
  publishedGrades: number;
  average: number | null;
  /** Marks per band of ten percent, index 0 = 0–9%. */
  distribution: number[];
  bySubject: SubjectStanding[];
  byClass: ClassStanding[];
  /** Every unpublished row's id, so "publish everything shown" is one call. */
  unpublishedIds: string[];
}

//  No pupil embed. The only thing this view needs from a pupil is how many
//  distinct ones there are, and `grades.student_id` answers that without
//  joining — a school-wide query pulling a name and an admission number per
//  mark is a few thousand rows of payload nobody reads.
//
//  It also carried a bug worth recording: the embed asked for `roll_number` on
//  `students`, where that column does not exist. A roll number belongs to an
//  *enrolment* — the same pupil has a different one in a different year — and
//  PostgREST rejected the whole query with 42703. The report-card query below
//  reads it from `enrollments`, which is right.
const SELECT = `*,
  subject:subjects!grades_subject_id_fkey (id, name, code),
  class:classes!grades_class_id_fkey (id, name, arm, level)`;

export async function getSchoolResults(filters: ResultsFilters): Promise<SchoolResults> {
  let query = supabase.from('grades').select(SELECT).eq('academic_session_id', filters.sessionId);

  if (filters.classId) query = query.eq('class_id', filters.classId);
  if (filters.subjectId) query = query.eq('subject_id', filters.subjectId);

  const { data, error } = await query;
  if (error) throw toAppError(error);

  const rows = data as unknown as ResultRow[];

  const mean = (values: number[]) =>
    values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

  const percentages = rows
    .map((row) => (row.percentage === null ? null : Number(row.percentage)))
    .filter((value): value is number => value !== null);

  const distribution = Array.from({ length: 10 }, () => 0);
  for (const value of percentages) {
    // 100% belongs in the top band, not an eleventh one.
    const band = Math.min(9, Math.max(0, Math.floor(value / 10)));
    distribution[band] = (distribution[band] ?? 0) + 1;
  }

  // ── By subject ──────────────────────────────────────────────────────────
  const subjectBuckets = new Map<string, ResultRow[]>();
  for (const row of rows) {
    if (!row.subject) continue;
    const bucket = subjectBuckets.get(row.subject.id) ?? [];
    bucket.push(row);
    subjectBuckets.set(row.subject.id, bucket);
  }

  const bySubject: SubjectStanding[] = [...subjectBuckets.entries()]
    .map(([subjectId, bucket]) => {
      const marks = bucket
        .map((row) => (row.percentage === null ? null : Number(row.percentage)))
        .filter((value): value is number => value !== null);

      return {
        subject_id: subjectId,
        name: bucket[0]?.subject?.name ?? 'Subject',
        code: bucket[0]?.subject?.code ?? '',
        average: mean(marks),
        entered: bucket.length,
        published: bucket.filter((row) => row.is_published).length,
        failing: marks.filter((value) => value < 40).length,
      };
    })
    .sort((a, b) => (a.average ?? 0) - (b.average ?? 0));

  // ── By class ────────────────────────────────────────────────────────────
  const classBuckets = new Map<string, ResultRow[]>();
  for (const row of rows) {
    if (!row.class) continue;
    const bucket = classBuckets.get(row.class.id) ?? [];
    bucket.push(row);
    classBuckets.set(row.class.id, bucket);
  }

  const byClass: ClassStanding[] = [...classBuckets.entries()]
    .map(([classId, bucket]) => {
      const marks = bucket
        .map((row) => (row.percentage === null ? null : Number(row.percentage)))
        .filter((value): value is number => value !== null);

      return {
        class_id: classId,
        name: bucket[0]?.class?.name ?? 'Class',
        arm: bucket[0]?.class?.arm ?? '',
        level: bucket[0]?.class?.level ?? 0,
        average: mean(marks),
        entered: bucket.length,
        published: bucket.filter((row) => row.is_published).length,
        pupils: new Set(bucket.map((row) => row.student_id)).size,
      };
    })
    .sort((a, b) => a.level - b.level || a.arm.localeCompare(b.arm));

  return {
    totalGrades: rows.length,
    publishedGrades: rows.filter((row) => row.is_published).length,
    average: mean(percentages),
    distribution,
    bySubject,
    byClass,
    unpublishedIds: rows.filter((row) => !row.is_published).map((row) => row.id),
  };
}

// ── Report cards ────────────────────────────────────────────────────────────

export interface ReportCardSubject {
  subject_id: string;
  name: string;
  code: string;
  caPercentage: number | null;
  examPercentage: number | null;
  overallPercentage: number | null;
}

export interface ReportCard {
  student_id: string;
  full_name: string;
  admission_number: string;
  roll_number: number | null;
  className: string;
  subjects: ReportCardSubject[];
  /** Mean of the per-subject overalls, which is what a report card prints. */
  average: number | null;
  /** Rank within the class by that average. Null when nobody has marks. */
  position: number | null;
  classSize: number;
}

/**
 * A term's report cards for one class.
 *
 * Position is computed across the whole class in one pass rather than per
 * pupil, because a rank is meaningless without the cohort — and computing it
 * per card would mean fetching the class once per pupil.
 *
 * Ties share a position and the next is skipped, the way a school reads it:
 * two pupils second means nobody is third.
 *
 * Unpublished marks are included. This is the office's own document, produced
 * *before* publication precisely so somebody can check it; a report card that
 * silently omitted a withheld mark would show a pupil as having sat fewer
 * subjects than they did.
 */
export async function getReportCards(args: {
  classId: string;
  sessionId: string;
  weighting?: ReportWeighting;
}): Promise<ReportCard[]> {
  const weighting = args.weighting ?? DEFAULT_WEIGHTING;

  const [rosterResult, gradesResult] = await Promise.all([
    supabase
      .from('enrollments')
      .select(
        `roll_number,
         class:classes!enrollments_class_id_fkey (name, arm),
         student:students!enrollments_student_id_fkey (
           id, admission_number, user:users!students_user_id_fkey (full_name)
         )`,
      )
      .eq('class_id', args.classId)
      .eq('academic_session_id', args.sessionId)
      .eq('status', 'active'),

    supabase
      .from('grades')
      .select('*, subject:subjects!grades_subject_id_fkey (id, name, code)')
      .eq('class_id', args.classId)
      .eq('academic_session_id', args.sessionId),
  ]);

  if (rosterResult.error) throw toAppError(rosterResult.error);
  if (gradesResult.error) throw toAppError(gradesResult.error);

  const roster = rosterResult.data as unknown as {
    roll_number: number | null;
    class: { name: string; arm: string } | null;
    student: { id: string; admission_number: string; user: { full_name: string } | null } | null;
  }[];

  const grades = gradesResult.data as unknown as (Grade & {
    subject: { id: string; name: string; code: string } | null;
  })[];

  const byStudent = new Map<string, typeof grades>();
  for (const grade of grades) {
    const bucket = byStudent.get(grade.student_id) ?? [];
    bucket.push(grade);
    byStudent.set(grade.student_id, bucket);
  }

  const cards = roster
    .filter((row) => row.student !== null)
    .map((row) => {
      const student = row.student!;
      const mine = byStudent.get(student.id) ?? [];

      const subjectBuckets = new Map<string, typeof grades>();
      for (const grade of mine) {
        if (!grade.subject) continue;
        const bucket = subjectBuckets.get(grade.subject.id) ?? [];
        bucket.push(grade);
        subjectBuckets.set(grade.subject.id, bucket);
      }

      const subjects: ReportCardSubject[] = [...subjectBuckets.entries()]
        .map(([subjectId, bucket]) => {
          const report = computeReport(bucket, weighting);
          return {
            subject_id: subjectId,
            name: bucket[0]?.subject?.name ?? 'Subject',
            code: bucket[0]?.subject?.code ?? '',
            caPercentage: report.caPercentage,
            examPercentage: report.examPercentage,
            overallPercentage: report.overallPercentage,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      const overalls = subjects
        .map((subject) => subject.overallPercentage)
        .filter((value): value is number => value !== null);

      return {
        student_id: student.id,
        full_name: student.user?.full_name ?? 'Unnamed pupil',
        admission_number: student.admission_number,
        roll_number: row.roll_number,
        className: row.class ? `${row.class.name}${row.class.arm}` : 'Class',
        subjects,
        average:
          overalls.length > 0
            ? overalls.reduce((sum, value) => sum + value, 0) / overalls.length
            : null,
        position: null as number | null,
        classSize: 0,
      } satisfies ReportCard;
    });

  // Rank, ties sharing a position.
  const ranked = [...cards]
    .filter((card) => card.average !== null)
    .sort((a, b) => (b.average ?? 0) - (a.average ?? 0));

  let position = 0;
  let previous: number | null = null;
  const positions = new Map<string, number>();

  ranked.forEach((card, index) => {
    if (previous === null || card.average !== previous) {
      position = index + 1;
      previous = card.average;
    }
    positions.set(card.student_id, position);
  });

  for (const card of cards) {
    card.position = positions.get(card.student_id) ?? null;
    card.classSize = ranked.length;
  }

  return cards.sort(
    (a, b) =>
      (a.roll_number ?? Number.MAX_SAFE_INTEGER) - (b.roll_number ?? Number.MAX_SAFE_INTEGER) ||
      a.full_name.localeCompare(b.full_name),
  );
}
