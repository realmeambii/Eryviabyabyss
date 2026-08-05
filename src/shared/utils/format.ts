import { format, formatDistanceToNowStrict, isToday, isTomorrow, isYesterday } from 'date-fns';

import type { GradeBand } from '@/shared/types/domain';

/**
 * Presentation helpers.
 *
 * Locale is fixed to en-NG and the timezone to the school's, because a report
 * card that renders differently on a teacher's laptop and a parent's phone is
 * a support ticket waiting to happen.
 */

const LOCALE = 'en-NG';

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return format(new Date(value), 'd MMM yyyy');
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return format(new Date(value), 'd MMM yyyy, h:mm a');
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  // `timetable_slots.starts_at` arrives as "08:00:00", which Date cannot parse
  // on its own.
  const date =
    typeof value === 'string' && /^\d{2}:\d{2}/.test(value)
      ? new Date(`1970-01-01T${value}`)
      : new Date(value);
  return format(date, 'h:mm a');
}

/** "in 2 days" / "3 hours ago" — with today, tomorrow and yesterday spelled out. */
export function formatRelative(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);

  if (isToday(date)) return `Today, ${format(date, 'h:mm a')}`;
  if (isTomorrow(date)) return `Tomorrow, ${format(date, 'h:mm a')}`;
  if (isYesterday(date)) return `Yesterday, ${format(date, 'h:mm a')}`;

  return formatDistanceToNowStrict(date, { addSuffix: true });
}

/** How long until a deadline, phrased the way the assignment list needs it. */
export function formatDueIn(dueAt: string | Date | null | undefined): {
  label: string;
  tone: 'overdue' | 'urgent' | 'soon' | 'normal';
} {
  if (!dueAt) return { label: 'No deadline', tone: 'normal' };

  const due = new Date(dueAt);
  const hours = (due.getTime() - Date.now()) / 36e5;

  if (hours < 0) return { label: `Overdue by ${formatDistanceToNowStrict(due)}`, tone: 'overdue' };
  if (hours < 24)
    return { label: `Due in ${Math.max(1, Math.round(hours))} hours`, tone: 'urgent' };
  if (hours < 24 * 7) {
    const days = Math.round(hours / 24);
    return { label: `Due in ${days} day${days === 1 ? '' : 's'}`, tone: 'soon' };
  }
  return { label: `Due ${format(due, 'd MMM')}`, tone: 'normal' };
}

export function formatNumber(value: number | null | undefined, fractionDigits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatPercent(value: number | null | undefined, fractionDigits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${formatNumber(value, fractionDigits)}%`;
}

export function formatScore(
  score: number | null | undefined,
  max: number | null | undefined,
): string {
  if (score === null || score === undefined || !max) return '—';
  return `${formatNumber(score, score % 1 === 0 ? 0 : 1)} / ${formatNumber(max)}`;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** "Adaeze Okafor" → "AO". Falls back to two letters for a mononym. */
export function initials(fullName: string | null | undefined): string {
  if (!fullName) return '?';

  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

/** Time-of-day greeting for the portal dashboards. */
export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Band a percentage against the school's own scale.
 *
 * Grades already stored in the database carry their letter, frozen at the time
 * they were recorded. This is for previewing a mark a teacher is still typing.
 */
export function bandForPercentage(percentage: number, scale: GradeBand[]): GradeBand | undefined {
  return scale.find((band) => percentage >= band.min && percentage <= band.max);
}

/** Truncate on a word boundary rather than mid-word. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > maxLength * 0.6 ? lastSpace : maxLength).trimEnd()}…`;
}

/** "JSS 1" + "A" → "JSS 1A". */
export function className(name: string, arm: string | null | undefined): string {
  return arm ? `${name}${arm}` : name;
}
