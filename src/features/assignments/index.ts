export {
  analyseSubmissions,
  assignmentFileUrl,
  attachToAssignment,
  bulkGradeSubmissions,
  createAssignment,
  deleteAssignment,
  getAssignment,
  getMySubmission,
  gradeSubmission,
  listAssignments,
  listAssignmentAttachments,
  listSubmissionAttachments,
  listSubmissions,
  publishAssignment,
  removeAssignmentAttachment,
  returnSubmission,
  submitAssignment,
  updateAssignment,
  getSubmissionBoard,
  type AssignmentAnalytics,
  type AssignmentAttachment,
  type AssignmentFilters,
  type AssignmentWithContext,
  type BulkGradeEntry,
  type SubmissionRow,
} from './api/assignments.service';

export {
  useAssignment,
  useAssignmentAttachmentMutations,
  useAssignmentAttachments,
  useAssignmentMutations,
  useAssignments,
  useGrading,
  useSubmissionAttachments,
  useSubmissionBoard,
} from './hooks/use-assignments';

export { AssignmentEditorDialog } from './components/assignment-editor-dialog';
export { RubricBuilder } from './components/rubric-builder';

export { useSubmitAssignment, type SubmitInput } from './hooks/use-assignment-submission';

export { default as AssignmentsPage } from './pages/assignments-page';
export { default as TeacherAssignmentsPage } from './pages/teacher-assignments-page';
export { default as TeacherAssignmentPage } from './pages/teacher-assignment-page';
export { default as StudentAssignmentsPage } from './pages/student-assignments-page';
export { default as StudentAssignmentDetailPage } from './pages/student-assignment-detail-page';
