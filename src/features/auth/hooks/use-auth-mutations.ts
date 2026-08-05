import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { ROUTES } from '@/shared/lib/constants';

import * as authService from '../api/auth.service';
import type {
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
  SignUpInput,
} from '../schemas/auth.schemas';
import { useAuth } from './use-auth';

/**
 * Mutations for the auth screens.
 *
 * Kept out of the pages so a screen is only markup plus a call — and so the
 * "where do I go afterwards" logic sits in one place.
 */

export function useSignIn(onSuccess?: () => void) {
  return useMutation({
    mutationFn: (input: LoginInput) => authService.signInWithPassword(input),
    onSuccess: () => {
      // Navigation is left to the caller: the login page knows where the user
      // was trying to go before they were bounced here.
      onSuccess?.();
    },
  });
}

export function useSignUp() {
  return useMutation({
    mutationFn: (input: SignUpInput) => authService.signUp(input),
  });
}

export function useRequestPasswordReset() {
  return useMutation({
    mutationFn: (input: ForgotPasswordInput) => authService.requestPasswordReset(input),
  });
}

export function useUpdatePassword() {
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (input: ResetPasswordInput) => authService.updatePassword(input),
    onSuccess: () => {
      toast.success('Your password has been updated.');
      void navigate(ROUTES.root, { replace: true });
    },
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: (email: string) => authService.resendVerificationEmail(email),
    onSuccess: () => {
      toast.success('Verification email sent. Check your inbox.');
    },
  });
}

export function useSignOut() {
  const { signOut } = useAuth();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: signOut,
    onSuccess: () => {
      void navigate(ROUTES.login, { replace: true });
    },
  });
}
