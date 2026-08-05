import type { AppRole } from '@/shared/types/domain';

/** Where each role lands after signing in. */
export const ROLE_HOME: Record<AppRole, string> = {
  administrator: '/admin',
  teacher: '/teacher',
  student: '/student',
  parent: '/parent',
};

/** Human labels, so the UI never renders a raw slug. */
export const ROLE_LABEL: Record<AppRole, string> = {
  administrator: 'Administrator',
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent',
};

/**
 * Precedence when a user holds more than one role — a teacher who is also a
 * parent at the same school lands on the teacher portal, and switches from
 * there. Lower index wins.
 */
export const ROLE_PRECEDENCE: readonly AppRole[] = [
  'administrator',
  'teacher',
  'parent',
  'student',
];

export const ROUTES = {
  root: '/',
  login: '/auth/login',
  forgotPassword: '/auth/forgot-password',
  resetPassword: '/auth/reset-password',
  verifyEmail: '/auth/verify-email',
  callback: '/auth/callback',
  onboarding: '/auth/pending',
  forbidden: '/403',
  notFound: '/404',
} as const;

/** ISO-8601 weekdays, matching `timetable_slots.day_of_week`. */
export const WEEKDAYS = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
  { value: 7, label: 'Sunday', short: 'Sun' },
] as const;

export const TERM_LABEL = {
  first: 'First Term',
  second: 'Second Term',
  third: 'Third Term',
} as const;

/**
 * Client-side upload limits. These mirror the per-bucket limits set in
 * `20260801001100_storage.sql` — the copy here exists to fail fast with a
 * readable message, not to enforce anything. Storage is the real gate.
 */
export const UPLOAD_LIMITS = {
  'profile-photos': { maxBytes: 2 * 1024 * 1024, accept: 'image/jpeg,image/png,image/webp' },
  'school-logos': {
    maxBytes: 2 * 1024 * 1024,
    accept: 'image/jpeg,image/png,image/webp,image/svg+xml',
  },
  'assignment-uploads': {
    maxBytes: 25 * 1024 * 1024,
    accept: '.pdf,.doc,.docx,.xlsx,.pptx,.txt,.csv,.zip,image/*',
  },
  'lesson-materials': {
    maxBytes: 100 * 1024 * 1024,
    accept: '.pdf,.doc,.docx,.pptx,.md,.txt,image/*,video/mp4,video/webm,audio/*',
  },
  'student-documents': { maxBytes: 15 * 1024 * 1024, accept: '.pdf,image/jpeg,image/png' },
  'message-attachments': {
    maxBytes: 15 * 1024 * 1024,
    accept: '.pdf,.doc,.docx,.xlsx,.pptx,.txt,.csv,image/jpeg,image/png,image/webp',
  },
  // Keyed by the `storage_bucket` enum: adding a bucket without an entry here
  // is a type error rather than a runtime `undefined.maxBytes`, which is the
  // reason this map is exhaustive rather than a lookup with a default.
} as const;

/** How long a signed download URL stays valid. */
export const SIGNED_URL_TTL_SECONDS = 60 * 5;

export const PAGE_SIZE = 25;

/** Minimum password length. Must not be lower than the GoTrue setting. */
export const MIN_PASSWORD_LENGTH = 8;

export const THEME_STORAGE_KEY = 'gnaschools.theme';
