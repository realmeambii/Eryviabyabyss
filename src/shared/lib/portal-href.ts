import type { AppRole } from '@/shared/types';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  Resolving a stored link to the reader's own portal
 * ═══════════════════════════════════════════════════════════════════════════
 *  Notification `action_url`s are written by database triggers, which know the
 *  thing being linked to but cannot know which portal each recipient reads it
 *  in. One published announcement notifies pupils, guardians and staff at once
 *  from a single `app.notify_users()` call, so *no* stored prefix can be right
 *  for all of them — `/student/announcements/x` is a 403 for the guardian
 *  standing next to them.
 *
 *  So the triggers store a portal-agnostic path and the prefix is decided here,
 *  against the role of whoever is actually looking. This also repairs every row
 *  already in the table: `/announcements/<id>` had no prefix at all and 404'd
 *  for everyone, and there are a few thousand of them. Fixing it at render time
 *  costs one function instead of a data migration that would still be wrong for
 *  mixed-audience notifications.
 *
 *  Anything already carrying a portal prefix is re-based rather than trusted.
 *  A trigger that hardcodes `/parent/grades` is right only while every
 *  recipient is a guardian, and that is the kind of assumption that survives
 *  exactly until somebody adds a second audience.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** The URL segment each role's portal lives under. */
export const PORTAL_BASE: Record<AppRole, string> = {
  administrator: '/admin',
  teacher: '/teacher',
  student: '/student',
  parent: '/parent',
};

const PORTAL_SEGMENTS = new Set(['admin', 'teacher', 'student', 'parent']);

/**
 * Point a stored path at the reader's own portal.
 *
 * Returns null for anything that is not a plain in-app path — an absolute URL
 * or a protocol-relative one is not ours to re-base, and rendering it as a
 * router link would be an open redirect wearing a `<Link>`.
 */
export function portalHref(actionUrl: string | null | undefined, role: AppRole): string | null {
  if (!actionUrl) return null;

  const trimmed = actionUrl.trim();
  // Must be a single-slash-rooted path. `//evil.example` is protocol-relative
  // and would leave the app.
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;

  const base = PORTAL_BASE[role];
  const segments = trimmed.split('/').filter(Boolean);
  if (segments.length === 0) return base;

  // Already portal-prefixed — swap whichever portal it names for this reader's.
  const rest = PORTAL_SEGMENTS.has(segments[0]) ? segments.slice(1) : segments;

  return rest.length === 0 ? base : `${base}/${rest.join('/')}`;
}
