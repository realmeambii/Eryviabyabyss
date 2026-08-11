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

export {
  assignTeacher,
  listAssignableTeachers,
  listClassTeaching,
  unassignTeacher,
  type ClassTeaching,
  type TeacherOption,
} from './api/classes.service';

export {
  CAPABILITIES,
  CAPABILITY_LABEL,
  getMyCapabilities,
  listAdministrators,
  revokeAdministrator,
  setCapabilities,
  type AdministratorRow,
  type Capability,
  type MyCapabilities,
} from './api/administrators.service';

export {
  useAdministratorMutations,
  useAdministrators,
  useCan,
  useMyCapabilities,
} from './hooks/use-administrators';

export {
  useAssignableTeachers,
  useClassMutations,
  useClassTeaching,
  useClasses,
  useSessionMutations,
  useSessions,
  useSubjectMutations,
  useSubjects,
  useTeachingMutations,
} from './hooks/use-admin-academics';

export { default as AdminAdministratorsPage } from './pages/admin-administrators-page';
export { default as AdminClassesPage } from './pages/admin-classes-page';
export { default as AdminDashboard } from './pages/admin-dashboard';
export { default as AdminParentsPage } from './pages/admin-parents-page';
export { default as AdminStudentsPage } from './pages/admin-students-page';
export { default as AdminTeachersPage } from './pages/admin-teachers-page';
