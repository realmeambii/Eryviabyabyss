import { z } from 'zod';

import { MIN_PASSWORD_LENGTH } from '@/shared/lib/constants';

/**
 * Form schemas.
 *
 * These validate *shape and intent* before a request is made — they are a
 * courtesy to the user, not a security control. GoTrue enforces its own
 * password policy and every write is checked again by RLS.
 */

// Trim and lower-case *before* the shape check, and use the same pattern as
// the CHECK constraint on `users.email` so the two cannot disagree.
const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter your email address')
  .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'That does not look like an email address');

/**
 * Length first, then a character-class floor. Deliberately not a wall of
 * rules: length is what actually resists guessing, and long lists of symbol
 * requirements push people towards `Password1!` on a sticky note.
 */
const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(72, 'Passwords are limited to 72 characters')
  .refine((value) => /[a-z]/i.test(value), 'Include at least one letter')
  .refine((value) => /\d/.test(value), 'Include at least one number');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password'),
  rememberMe: z.boolean(),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Those passwords do not match',
    path: ['confirmPassword'],
  });

export const signUpSchema = z
  .object({
    firstName: z.string().trim().min(2, 'Enter your first name').max(80),
    lastName: z.string().trim().min(2, 'Enter your surname').max(80),
    email,
    password,
    confirmPassword: z.string().min(1, 'Confirm your password'),
    // Only these two are honoured by handle_new_user(); anything else is
    // downgraded to `student` server-side.
    role: z.enum(['student', 'parent']),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Those passwords do not match',
    path: ['confirmPassword'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    password,
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Those passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((values) => values.password !== values.currentPassword, {
    message: 'Choose a password you have not used before',
    path: ['password'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
