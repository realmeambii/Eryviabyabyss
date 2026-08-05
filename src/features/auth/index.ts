/**
 * Auth feature — public surface.
 *
 * Other features import from `@/features/auth`, never from a file inside it.
 * The ESLint rule `no-restricted-imports` enforces that, so the internals can
 * be reorganised without a cross-feature refactor.
 */

export { AuthProvider } from './components/auth-provider';
export {
  RedirectIfAuthenticated,
  RequireAuth,
  RequireRole,
  RoleHomeRedirect,
} from './components/route-guards';

export { useAuth, useCurrentUser } from './hooks/use-auth';
export {
  useRequestPasswordReset,
  useResendVerification,
  useSignIn,
  useSignOut,
  useSignUp,
  useUpdatePassword,
} from './hooks/use-auth-mutations';

export type { AuthContextValue } from './contexts/auth-context';

export {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signUpSchema,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type LoginInput,
  type ResetPasswordInput,
  type SignUpInput,
} from './schemas/auth.schemas';
