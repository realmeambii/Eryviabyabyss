import {
  BarChart3,
  BellRing,
  MessagesSquare,
  BookOpen,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  GraduationCap,
  LayoutDashboard,
  Library,
  Megaphone,
  ShieldCheck,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';

import type { AppRole } from '@/shared/types';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Match child routes too (`/student/assignments/:id` lights up Assignments). */
  end?: boolean;
  badgeKey?: 'notifications';
  /**
   * The administrator capability this destination is *about*.
   *
   * Still a convenience and not a permission model — the policies decide, and
   * an administrator without the capability can reach the page and read it.
   * What this removes is a menu entry to a screen whose every button would be
   * refused. Items with no capability are shown to every administrator.
   */
  capability?: AdminCapability;
}

/** Mirrors `user_roles_known_capabilities`. */
export type AdminCapability =
  'users' | 'academics' | 'timetable' | 'results' | 'announcements' | 'audit' | 'settings';

export interface NavSection {
  label?: string;
  items: NavItem[];
}

/**
 * Sidebar contents per portal.
 *
 * The nav is a convenience, not a permission model — every destination is
 * behind a `<RequireRole>` guard, and every query behind it is behind RLS.
 */
export const NAVIGATION: Record<AppRole, NavSection[]> = {
  student: [
    {
      items: [
        { label: 'Dashboard', to: '/student', icon: LayoutDashboard, end: true },
        { label: 'My subjects', to: '/student/subjects', icon: BookOpen },
        { label: 'Assignments', to: '/student/assignments', icon: ClipboardList },
        { label: 'Tests & quizzes', to: '/student/quizzes', icon: ClipboardCheck },
        { label: 'Gradebook', to: '/student/grades', icon: FileSpreadsheet },
        { label: 'Timetable', to: '/student/timetable', icon: CalendarDays },
      ],
    },
    {
      label: 'Updates',
      items: [
        { label: 'Announcements', to: '/student/announcements', icon: Megaphone },
        { label: 'Messages', to: '/student/messages', icon: MessagesSquare },
        {
          label: 'Notifications',
          to: '/student/notifications',
          icon: BellRing,
          badgeKey: 'notifications',
        },
      ],
    },
  ],

  teacher: [
    {
      items: [
        { label: 'Dashboard', to: '/teacher', icon: LayoutDashboard, end: true },
        { label: 'My classes', to: '/teacher/classes', icon: Users },
        { label: 'My subjects', to: '/teacher/subjects', icon: BookOpen },
        { label: 'Lessons', to: '/teacher/lessons', icon: Library },
        { label: 'Assignments', to: '/teacher/assignments', icon: ClipboardList },
        { label: 'Tests & quizzes', to: '/teacher/quizzes', icon: ClipboardCheck },
        { label: 'Grading', to: '/teacher/grading', icon: FileSpreadsheet },
        { label: 'Timetable', to: '/teacher/timetable', icon: CalendarDays },
        { label: 'Analytics', to: '/teacher/analytics', icon: BarChart3 },
      ],
    },
    {
      label: 'Updates',
      items: [
        { label: 'Announcements', to: '/teacher/announcements', icon: Megaphone },
        { label: 'Messages', to: '/teacher/messages', icon: MessagesSquare },
        {
          label: 'Notifications',
          to: '/teacher/notifications',
          icon: BellRing,
          badgeKey: 'notifications',
        },
      ],
    },
  ],

  parent: [
    {
      items: [
        { label: 'Dashboard', to: '/parent', icon: LayoutDashboard, end: true },
        { label: 'My children', to: '/parent/children', icon: UsersRound },
        { label: 'Assignments', to: '/parent/assignments', icon: ClipboardList },
        { label: 'Tests & quizzes', to: '/parent/quizzes', icon: ClipboardCheck },
        { label: 'Results', to: '/parent/grades', icon: FileSpreadsheet },
        { label: 'Timetable', to: '/parent/timetable', icon: CalendarDays },
      ],
    },
    {
      label: 'Updates',
      items: [
        { label: 'Announcements', to: '/parent/announcements', icon: Megaphone },
        { label: 'Messages', to: '/parent/messages', icon: MessagesSquare },
        {
          label: 'Notifications',
          to: '/parent/notifications',
          icon: BellRing,
          badgeKey: 'notifications',
        },
      ],
    },
  ],

  administrator: [
    {
      items: [
        { label: 'Dashboard', to: '/admin', icon: LayoutDashboard, end: true },
        { label: 'Students', to: '/admin/students', icon: GraduationCap, capability: 'users' },
        { label: 'Teachers', to: '/admin/teachers', icon: Users, capability: 'users' },
        { label: 'Parents', to: '/admin/parents', icon: UsersRound, capability: 'users' },
        { label: 'Administrators', to: '/admin/administrators', icon: ShieldCheck },
      ],
    },
    {
      label: 'Academics',
      items: [
        { label: 'Classes', to: '/admin/classes', icon: Library, capability: 'academics' },
        { label: 'Subjects', to: '/admin/subjects', icon: BookOpen, capability: 'academics' },
        { label: 'Sessions', to: '/admin/sessions', icon: CalendarRange, capability: 'academics' },
        { label: 'Timetable', to: '/admin/timetable', icon: CalendarDays, capability: 'timetable' },
        { label: 'Results', to: '/admin/grades', icon: FileSpreadsheet, capability: 'results' },
      ],
    },
    {
      label: 'School',
      items: [
        {
          label: 'Announcements',
          to: '/admin/announcements',
          icon: Megaphone,
          capability: 'announcements',
        },
        { label: 'Messages', to: '/admin/messages', icon: MessagesSquare },
        {
          label: 'Notifications',
          to: '/admin/notifications',
          icon: BellRing,
          badgeKey: 'notifications',
        },
        { label: 'Audit log', to: '/admin/audit', icon: ShieldCheck, capability: 'audit' },
      ],
    },
  ],
};
