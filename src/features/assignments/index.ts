export {
  createAssignment,
  deleteAssignment,
  getAssignment,
  getMySubmission,
  gradeSubmission,
  listAssignments,
  listSubmissions,
  publishAssignment,
  submitAssignment,
  updateAssignment,
  type AssignmentFilters,
  type AssignmentWithContext,
} from './api/assignments.service';

export { useSubmitAssignment, type SubmitInput } from './hooks/use-assignment-submission';

export { default as AssignmentsPage } from './pages/assignments-page';
export { default as StudentAssignmentsPage } from './pages/student-assignments-page';
export { default as StudentAssignmentDetailPage } from './pages/student-assignment-detail-page';
