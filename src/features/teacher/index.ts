export {
  foldClasses,
  foldSubjects,
  getClassRoster,
  getClassStatistics,
  getWorkload,
  listMyAssignments,
  listPendingSubmissions,
  type ClassStatistics,
  type MyAssignment,
  type MyClass,
  type MySubject,
  type PendingSubmission,
  type RosterStudent,
  type TeacherWorkload,
} from './api/teacher.service';

export {
  useMyClass,
  useMySubject,
  useTeacherScope,
  type TeacherScope,
} from './hooks/use-teacher-scope';

export {
  useClassRoster,
  useClassStatistics,
  useMarkingQueue,
  useMyTimetable,
  useTeacherWorkload,
} from './hooks/use-teacher-data';

export {
  addStudentNote,
  deleteStudentNote,
  getStudentAttempts,
  getStudentProfile,
  getStudentSubmissions,
  listStudentNotes,
  summariseProgress,
  updateStudentNote,
  type AttemptHistoryRow,
  type NoteWithAuthor,
  type StudentProfile,
  type StudentProgress,
  type SubmissionHistoryRow,
} from './api/student-profile.service';

export {
  useStudentAttemptHistory,
  useStudentNoteMutations,
  useStudentNotes,
  useStudentProfile,
  useStudentSubmissionHistory,
} from './hooks/use-student-profile';

export { StatTile } from './components/stat-tile';

export { default as TeacherDashboard } from './pages/teacher-dashboard';
export { default as TeacherClassesPage } from './pages/teacher-classes-page';
export { default as TeacherClassPage } from './pages/teacher-class-page';
export { default as TeacherSubjectsPage } from './pages/teacher-subjects-page';
export { default as TeacherSubjectPage } from './pages/teacher-subject-page';
export { default as TeacherStudentPage } from './pages/teacher-student-page';
export { default as TeacherGradingPage } from './pages/teacher-grading-page';
