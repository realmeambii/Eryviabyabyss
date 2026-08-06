import { toAppError } from '@/shared/lib/errors';
import { supabase } from '@/shared/lib/supabase';
import type { Grade, TablesInsert, TablesUpdate } from '@/shared/types';

/**
 * Gradebook data access.
 *
 * `grades` is the published record. Assignment and quiz marks arrive here
 * through triggers (`app.sync_grade_from_submission`,
 * `app.sync_grade_from_quiz_attempt`) rather than a second client write, so a
 * mark and its gradebook entry cannot disagree.
 *
 * `percentage` and `letter_grade` are computed in the database — the letter is
 * frozen against the school's scale at the moment it is recorded, so re-tuning
 * the scale next year does not silently rewrite last year's reports.
 */

export type GradeWithSubject = Grade & {
  subject: { id: string; name: string; code: string; color: string } | null;
};

export interface StudentGradeFilters {
  sessionId?: string;
  subjectId?: string;
  publishedOnly?: boolean;
}

export async function listStudentGrades(
  studentId: string,
  filters: StudentGradeFilters = {},
): Promise<GradeWithSubject[]> {
  let query = supabase
    .from('grades')
    .select(`*, subject:subjects!grades_subject_id_fkey (id, name, code, color)`)
    .eq('student_id', studentId)
    .order('recorded_at', { ascending: false });

  if (filters.sessionId) query = query.eq('academic_session_id', filters.sessionId);
  if (filters.subjectId) query = query.eq('subject_id', filters.subjectId);
  if (filters.publishedOnly !== false) query = query.eq('is_published', true);

  const { data, error } = await query;
  if (error) throw toAppError(error);
  return data as unknown as GradeWithSubject[];
}

export async function listClassGrades(
  classId: string,
  options: { subjectId?: string; sessionId?: string } = {},
): Promise<Grade[]> {
  let query = supabase.from('grades').select('*').eq('class_id', classId);

  if (options.subjectId) query = query.eq('subject_id', options.subjectId);
  if (options.sessionId) query = query.eq('academic_session_id', options.sessionId);

  const { data, error } = await query.order('recorded_at', { ascending: false });
  if (error) throw toAppError(error);
  return data;
}

/** A manual entry — an oral test, a practical — with no assignment behind it. */
export async function recordGrade(input: TablesInsert<'grades'>): Promise<Grade> {
  const { data, error } = await supabase
    .from('grades')
    .insert({ ...input, source_type: input.source_type ?? 'manual' })
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

export async function updateGrade(id: string, patch: TablesUpdate<'grades'>): Promise<Grade> {
  const { data, error } = await supabase
    .from('grades')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) throw toAppError(error);
  return data;
}

/**
 * Weighted subject average for a term.
 *
 * Computed client-side from rows RLS has already filtered — a student sees
 * their own average, a teacher the average of a student they teach. Phase 2
 * moves this into a database view once report cards need the same figure
 * server-side.
 */
export function subjectAverage(grades: Grade[]): number | null {
  if (grades.length === 0) return null;

  const totalWeight = grades.reduce((sum, grade) => sum + Number(grade.weight), 0);
  if (totalWeight === 0) return null;

  const weighted = grades.reduce(
    (sum, grade) => sum + Number(grade.percentage) * Number(grade.weight),
    0,
  );

  return Math.round((weighted / totalWeight) * 100) / 100;
}

// ═══ Teacher gradebook ══════════════════════════════════════════════════════

export async function deleteGrade(id: string): Promise<void> {
  const { error } = await supabase.from('grades').delete().eq('id', id);
  if (error) throw toAppError(error);
}

/**
 * Publish or withhold a set of marks.
 *
 * `is_published` is what a pupil's gradebook filters on, so this is the moment
 * a mark becomes visible. Done in one statement rather than a loop: publishing
 * a class's results is a single decision and should not be able to half-happen.
 */
export async function setGradesPublished(ids: string[], published: boolean): Promise<void> {
  if (ids.length === 0) return;

  const { error } = await supabase.from('grades').update({ is_published: published }).in('id', ids);

  if (error) throw toAppError(error);
}

// ── The class grid ──────────────────────────────────────────────────────────

export interface GradebookEntry {
  student_id: string;
  full_name: string;
  admission_number: string;
  avatar_path: string | null;
  roll_number: number | null;
  grades: Grade[];
  report: SubjectReport;
}

/**
 * The Nigerian split: continuous assessment against a terminal exam.
 *
 * `assessment_type` decides which side a mark falls on — everything that is not
 * an `exam` is continuous assessment. Both sides are reduced to a percentage
 * first and then combined by `caWeight`/`examWeight`, which is what makes a
 * 20-mark test and a 100-mark project comparable without either dominating on
 * size alone.
 */
export interface SubjectReport {
  caPercentage: number | null;
  examPercentage: number | null;
  overallPercentage: number | null;
  caCount: number;
  examCount: number;
}

export interface ReportWeighting {
  /** Share of the final mark carried by continuous assessment, 0–1. */
  caWeight: number;
  examWeight: number;
}

/** The split most Nigerian secondary schools use. Overridable per gradebook. */
export const DEFAULT_WEIGHTING: ReportWeighting = { caWeight: 0.4, examWeight: 0.6 };

function meanPercentage(grades: Grade[]): number | null {
  if (grades.length === 0) return null;
  const total = grades.reduce((sum, grade) => sum + Number(grade.percentage ?? 0), 0);
  return total / grades.length;
}

export function computeReport(
  grades: Grade[],
  weighting: ReportWeighting = DEFAULT_WEIGHTING,
): SubjectReport {
  const exams = grades.filter((grade) => grade.assessment_type === 'exam');
  const continuous = grades.filter((grade) => grade.assessment_type !== 'exam');

  const caPercentage = meanPercentage(continuous);
  const examPercentage = meanPercentage(exams);

  // Whichever side is missing, the other carries the whole mark. A term with no
  // exam yet should read as the CA average, not as 40% of it — a pupil averaging
  // 80 on their coursework must not appear to be failing in October.
  let overallPercentage: number | null = null;
  if (caPercentage !== null && examPercentage !== null) {
    overallPercentage = caPercentage * weighting.caWeight + examPercentage * weighting.examWeight;
  } else if (caPercentage !== null) {
    overallPercentage = caPercentage;
  } else if (examPercentage !== null) {
    overallPercentage = examPercentage;
  }

  return {
    caPercentage,
    examPercentage,
    overallPercentage,
    caCount: continuous.length,
    examCount: exams.length,
  };
}

/**
 * Every pupil on the roll with their marks for one subject.
 *
 * Built from the register outward, like the marking boards: a gradebook that
 * only lists pupils who have a mark hides exactly the ones a teacher is looking
 * for.
 */
export async function getClassGradebook(args: {
  classId: string;
  subjectId: string;
  sessionId: string;
  weighting?: ReportWeighting;
}): Promise<GradebookEntry[]> {
  const [roster, grades] = await Promise.all([
    supabase
      .from('enrollments')
      .select(
        `roll_number,
         student:students!enrollments_student_id_fkey (
           id, admission_number,
           user:users!students_user_id_fkey (full_name, avatar_path)
         )`,
      )
      .eq('class_id', args.classId)
      .eq('academic_session_id', args.sessionId)
      .eq('status', 'active'),

    supabase
      .from('grades')
      .select('*')
      .eq('class_id', args.classId)
      .eq('subject_id', args.subjectId)
      .eq('academic_session_id', args.sessionId)
      .order('recorded_at', { ascending: true }),
  ]);

  if (roster.error) throw toAppError(roster.error);
  if (grades.error) throw toAppError(grades.error);

  const byStudent = new Map<string, Grade[]>();
  for (const grade of grades.data) {
    const bucket = byStudent.get(grade.student_id) ?? [];
    bucket.push(grade);
    byStudent.set(grade.student_id, bucket);
  }

  const rows = roster.data as unknown as {
    roll_number: number | null;
    student: {
      id: string;
      admission_number: string;
      user: { full_name: string; avatar_path: string | null } | null;
    } | null;
  }[];

  return rows
    .filter((row) => row.student !== null)
    .map((row) => {
      const own = byStudent.get(row.student!.id) ?? [];
      return {
        student_id: row.student!.id,
        full_name: row.student!.user?.full_name ?? 'Unnamed student',
        admission_number: row.student!.admission_number,
        avatar_path: row.student!.user?.avatar_path ?? null,
        roll_number: row.roll_number,
        grades: own,
        report: computeReport(own, args.weighting),
      };
    })
    .sort(
      (a, b) =>
        (a.roll_number ?? Number.MAX_SAFE_INTEGER) - (b.roll_number ?? Number.MAX_SAFE_INTEGER) ||
        a.full_name.localeCompare(b.full_name),
    );
}

// ── Import and export ───────────────────────────────────────────────────────

/**
 * A field is quoted only when it has to be, and an embedded quote is doubled.
 * Written out rather than pulled from a CSV library: this is the whole of RFC
 * 4180 that a gradebook needs, and a dependency for eight lines is a
 * dependency to keep updated forever.
 */
function csvField(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function gradebookToCsv(entries: GradebookEntry[]): string {
  const header = [
    'admission_number',
    'student',
    'assessment',
    'type',
    'score',
    'max_score',
    'percentage',
    'grade',
    'published',
    'recorded_at',
  ];

  const lines = [header.join(',')];

  for (const entry of entries) {
    if (entry.grades.length === 0) {
      // A pupil with no marks still gets a line. Their absence from an export
      // is indistinguishable from their absence from the class.
      lines.push(
        [entry.admission_number, entry.full_name, '', '', '', '', '', '', '', '']
          .map(csvField)
          .join(','),
      );
      continue;
    }

    for (const grade of entry.grades) {
      lines.push(
        [
          entry.admission_number,
          entry.full_name,
          grade.title,
          grade.assessment_type,
          grade.score,
          grade.max_score,
          grade.percentage,
          grade.letter_grade,
          grade.is_published ? 'yes' : 'no',
          grade.recorded_at,
        ]
          .map(csvField)
          .join(','),
      );
    }
  }

  return lines.join('\n');
}

export interface ImportRow {
  admissionNumber: string;
  score: number;
}

export interface ImportOutcome {
  imported: number;
  skipped: { admissionNumber: string; reason: string }[];
}

/**
 * Read a two-column CSV of admission number and score.
 *
 * Deliberately not a general importer. A gradebook import that guesses at
 * column meanings will eventually write a mark against the wrong pupil, and the
 * mistake surfaces at the end of term. Two named columns, matched on admission
 * number, and everything unrecognised is reported rather than assumed.
 */
export function parseGradeCsv(
  text: string,
  maxScore: number,
): { rows: ImportRow[]; problems: string[] } {
  const problems: string[] = [];
  const rows: ImportRow[] = [];

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return { rows, problems: ['The file is empty.'] };

  // Skip a header if the first line does not start with something numeric-ish.
  const start = /^[a-z_ ]*admission/i.test(lines[0] ?? '') ? 1 : 0;

  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index];
    const [rawAdmission, rawScore] = line.split(',');
    const admissionNumber = (rawAdmission ?? '').trim().replace(/^"|"$/g, '');
    const score = Number((rawScore ?? '').trim().replace(/^"|"$/g, ''));

    if (!admissionNumber) {
      problems.push(`Line ${index + 1}: no admission number.`);
      continue;
    }
    if (!Number.isFinite(score)) {
      problems.push(`Line ${index + 1} (${admissionNumber}): “${rawScore ?? ''}” is not a number.`);
      continue;
    }
    if (score < 0 || score > maxScore) {
      problems.push(`Line ${index + 1} (${admissionNumber}): ${score} is outside 0–${maxScore}.`);
      continue;
    }

    rows.push({ admissionNumber, score });
  }

  return { rows, problems };
}

/**
 * Write imported marks as manual gradebook entries.
 *
 * One insert per row rather than a batch, for the reason bulk grading uses:
 * a single bad row must not discard thirty good ones, and the pupil it belongs
 * to has to be named in the report.
 */
export async function importGrades(args: {
  rows: ImportRow[];
  roster: { student_id: string; admission_number: string }[];
  schoolId: string;
  classId: string;
  subjectId: string;
  sessionId: string;
  title: string;
  assessmentType: Grade['assessment_type'];
  maxScore: number;
  weight: number;
  recordedByTeacherId: string;
}): Promise<ImportOutcome> {
  const byAdmission = new Map(args.roster.map((row) => [row.admission_number, row.student_id]));

  const skipped: ImportOutcome['skipped'] = [];
  const payloads: TablesInsert<'grades'>[] = [];

  for (const row of args.rows) {
    const studentId = byAdmission.get(row.admissionNumber);
    if (!studentId) {
      skipped.push({
        admissionNumber: row.admissionNumber,
        reason: 'Not on this class register.',
      });
      continue;
    }

    payloads.push({
      school_id: args.schoolId,
      student_id: studentId,
      subject_id: args.subjectId,
      class_id: args.classId,
      academic_session_id: args.sessionId,
      assessment_type: args.assessmentType,
      source_type: 'manual',
      title: args.title,
      score: row.score,
      max_score: args.maxScore,
      weight: args.weight,
      recorded_by: args.recordedByTeacherId,
      is_published: false,
    });
  }

  // Which source row each payload came from, so a failure can be reported
  // against the pupil rather than an index into a filtered array.
  const admissionFor = args.rows
    .filter((row) => byAdmission.has(row.admissionNumber))
    .map((row) => row.admissionNumber);

  const results = await Promise.allSettled(
    payloads.map((payload) => supabase.from('grades').insert(payload).select('id').single()),
  );

  let imported = 0;

  results.forEach((result, index) => {
    const error =
      result.status === 'rejected' ? 'Could not be saved.' : (result.value.error?.message ?? null);

    if (error === null) {
      imported += 1;
      return;
    }

    skipped.push({ admissionNumber: admissionFor[index] ?? '—', reason: error });
  });

  return { imported, skipped };
}
