import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';

import {
  RedirectIfAuthenticated,
  RequireAuth,
  RequireRole,
  RoleHomeRedirect,
} from '@/features/auth';
import { LoadingScreen } from '@/shared/components/loading-screen';
import { ROUTES } from '@/shared/lib/constants';
import type { AppRole } from '@/shared/types';

import AppLayout from '@/layouts/app-layout';
import AuthLayout from '@/layouts/auth-layout';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Route table
 * ═══════════════════════════════════════════════════════════════════════════
 *  Three zones:
 *
 *    public-only   login, forgot password — a signed-in user is bounced out
 *    open          reset password, callback, pending — reachable in either
 *                  state, because they are *transitions* between the two
 *    protected     everything under a portal, behind RequireAuth + RequireRole
 *
 *  Every page is lazily imported, so signing in downloads the student portal
 *  and nothing else. The four portals share the same module set, which keeps
 *  the URL space predictable: /student/grades and /parent/grades are the same
 *  feature seen from different sides.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ── Auth ────────────────────────────────────────────────────────────────────
const LoginPage = lazy(() => import('@/features/auth/pages/login-page'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/pages/forgot-password-page'));
const ResetPasswordPage = lazy(() => import('@/features/auth/pages/reset-password-page'));
const AuthCallbackPage = lazy(() => import('@/features/auth/pages/auth-callback-page'));
const VerifyEmailPage = lazy(() =>
  import('@/features/auth/pages/auth-callback-page').then((module) => ({
    default: module.VerifyEmailPage,
  })),
);
const PendingAccessPage = lazy(() => import('@/features/auth/pages/pending-access-page'));
const ProfilePage = lazy(() => import('@/features/auth/pages/profile-page'));

// ── Portals ─────────────────────────────────────────────────────────────────
const StudentDashboard = lazy(() => import('@/features/student/pages/student-dashboard'));
const StudentSubjectsPage = lazy(() => import('@/features/student/pages/student-subjects-page'));
const TeacherDashboard = lazy(() => import('@/features/teacher/pages/teacher-dashboard'));
const TeacherClassesPage = lazy(() => import('@/features/teacher/pages/teacher-classes-page'));
const TeacherGradingPage = lazy(() => import('@/features/teacher/pages/teacher-grading-page'));
const ParentDashboard = lazy(() => import('@/features/parent/pages/parent-dashboard'));
const ParentChildrenPage = lazy(() => import('@/features/parent/pages/parent-children-page'));
const AdminDashboard = lazy(() => import('@/features/admin/pages/admin-dashboard'));
const AdminStudentsPage = lazy(() => import('@/features/admin/pages/admin-students-page'));

// ── Shared modules ──────────────────────────────────────────────────────────
const AssignmentsPage = lazy(() => import('@/features/assignments/pages/assignments-page'));
const AttendancePage = lazy(() => import('@/features/attendance/pages/attendance-page'));
const GradesPage = lazy(() => import('@/features/grades/pages/grades-page'));
const TimetablePage = lazy(() => import('@/features/timetable/pages/timetable-page'));
const QuizzesPage = lazy(() => import('@/features/quizzes/pages/quizzes-page'));
const NotificationsPage = lazy(() => import('@/features/notifications/pages/notifications-page'));
const AnnouncementsPage = lazy(() => import('@/routes/pages/announcements-page'));
const AuditPage = lazy(() => import('@/routes/pages/audit-page'));

// ── System ──────────────────────────────────────────────────────────────────
const ForbiddenPage = lazy(() => import('@/routes/pages/forbidden-page'));
const NotFoundPage = lazy(() => import('@/routes/pages/not-found-page'));

/**
 * Routes every portal has. Declared once so /student/grades and /parent/grades
 * cannot drift apart, and so adding a module to all four is a one-line change.
 */
function sharedPortalRoutes(): ReactNode {
  return (
    <>
      <Route path="assignments" element={<AssignmentsPage />} />
      <Route path="attendance" element={<AttendancePage />} />
      <Route path="grades" element={<GradesPage />} />
      <Route path="timetable" element={<TimetablePage />} />
      <Route path="announcements" element={<AnnouncementsPage />} />
      <Route path="notifications" element={<NotificationsPage />} />
      <Route path="profile" element={<ProfilePage />} />
    </>
  );
}

function portal(path: string, roles: AppRole[], children: ReactNode): ReactNode {
  return (
    <Route path={path} element={<RequireRole roles={roles} />}>
      {children}
      {sharedPortalRoutes()}
      <Route path="*" element={<NotFoundPage />} />
    </Route>
  );
}

export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        {/* ── Public only ─────────────────────────────────────────────── */}
        <Route element={<RedirectIfAuthenticated />}>
          <Route element={<AuthLayout />}>
            <Route path={ROUTES.login} element={<LoginPage />} />
            <Route path={ROUTES.forgotPassword} element={<ForgotPasswordPage />} />
            <Route path={ROUTES.verifyEmail} element={<VerifyEmailPage />} />
          </Route>
        </Route>

        {/* ── Transitions — valid signed in or out ────────────────────── */}
        <Route element={<AuthLayout />}>
          {/* Reachable while holding a recovery session, so it must not sit
              behind RedirectIfAuthenticated. */}
          <Route path={ROUTES.resetPassword} element={<ResetPasswordPage />} />
          <Route path={ROUTES.callback} element={<AuthCallbackPage />} />
          <Route path={ROUTES.onboarding} element={<PendingAccessPage />} />
        </Route>

        {/* ── Protected ───────────────────────────────────────────────── */}
        <Route element={<RequireAuth />}>
          <Route path={ROUTES.root} element={<RoleHomeRedirect />} />

          <Route element={<AppLayout />}>
            {portal(
              'student',
              ['student'],
              <>
                <Route index element={<StudentDashboard />} />
                <Route path="subjects" element={<StudentSubjectsPage />} />
                <Route path="quizzes" element={<QuizzesPage />} />
              </>,
            )}

            {portal(
              'teacher',
              ['teacher'],
              <>
                <Route index element={<TeacherDashboard />} />
                <Route path="classes" element={<TeacherClassesPage />} />
                <Route path="lessons" element={<StudentSubjectsPage />} />
                <Route path="grading" element={<TeacherGradingPage />} />
                <Route path="quizzes" element={<QuizzesPage />} />
              </>,
            )}

            {portal(
              'parent',
              ['parent'],
              <>
                <Route index element={<ParentDashboard />} />
                <Route path="children" element={<ParentChildrenPage />} />
              </>,
            )}

            {portal(
              'admin',
              ['administrator'],
              <>
                <Route index element={<AdminDashboard />} />
                <Route path="students" element={<AdminStudentsPage />} />
                <Route path="teachers" element={<TeacherClassesPage />} />
                <Route path="parents" element={<ParentChildrenPage />} />
                <Route path="classes" element={<TeacherClassesPage />} />
                <Route path="subjects" element={<StudentSubjectsPage />} />
                <Route path="audit" element={<AuditPage />} />
              </>,
            )}

            <Route path={ROUTES.forbidden} element={<ForbiddenPage />} />
          </Route>
        </Route>

        {/* ── Fallback ────────────────────────────────────────────────── */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
