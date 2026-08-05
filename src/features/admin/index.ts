export {
  getSchoolCounts,
  listStudents,
  type SchoolCounts,
  type StudentPage,
  type StudentQuery,
  type StudentRow,
} from './api/admin.service';

export {
  createUserAccount,
  linkChild,
  listParents,
  listStudentOptions,
  listTeachers,
  resetUserPassword,
  setUserStatus,
  unlinkChild,
  updateParentRecord,
  updateTeacherRecord,
  type CreatedAccount,
  type CreateUserInput,
  type DirectoryUser,
  type ParentChildRow,
  type ParentRow,
  type PasswordResetResult,
  type ProvisionableRole,
  type TeacherRow,
} from './api/users.service';

export {
  useParentMutations,
  useParents,
  useStudentOptions,
  useTeacherMutations,
  useTeachers,
  useUserProvisioning,
} from './hooks/use-admin-users';

export { AccountActions } from './components/account-actions';
export { AccountStatusBadge } from './components/account-status-badge';
export { CredentialDialog } from './components/credential-dialog';
export { NewUserDialog } from './components/new-user-dialog';

export { default as AdminDashboard } from './pages/admin-dashboard';
export { default as AdminParentsPage } from './pages/admin-parents-page';
export { default as AdminStudentsPage } from './pages/admin-students-page';
export { default as AdminTeachersPage } from './pages/admin-teachers-page';
