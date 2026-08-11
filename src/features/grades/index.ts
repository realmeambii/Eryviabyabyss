export {
  DEFAULT_WEIGHTING,
  computeReport,
  deleteGrade,
  getClassGradebook,
  gradebookToCsv,
  importGrades,
  listClassGrades,
  listStudentGrades,
  parseGradeCsv,
  recordGrade,
  setGradesPublished,
  subjectAverage,
  updateGrade,
  type GradeWithSubject,
  type GradebookEntry,
  type ImportOutcome,
  type ImportRow,
  type ReportWeighting,
  type StudentGradeFilters,
  type SubjectReport,
} from './api/grades.service';

export {
  getReportCards,
  getSchoolResults,
  type ClassStanding,
  type ReportCard,
  type ReportCardSubject,
  type ResultsFilters,
  type SchoolResults,
  type SubjectStanding,
} from './api/results.service';

export {
  useClassGradebook,
  useGradeMutations,
  useReportCards,
  useResultPublication,
  useSchoolResults,
  useStudentGrades,
} from './hooks/use-gradebook';

export { GradeEntryDialog } from './components/grade-entry-dialog';
export { ReportCards } from './components/report-cards';
export { GradeImportDialog } from './components/grade-import-dialog';

export { default as GradesPage } from './pages/grades-page';
export { default as TeacherGradebookPage } from './pages/teacher-gradebook-page';
export { default as AdminResultsPage } from './pages/admin-results-page';
export { default as ParentResultsPage } from './pages/parent-results-page';
