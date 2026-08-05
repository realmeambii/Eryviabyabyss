import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { useSignOut } from '@/features/auth';
import { AppLogo } from '@/shared/components/app-logo';
import { getPublicUrl } from '@/shared/services/storage.service';
import { ROLE_LABEL } from '@/shared/lib/constants';
import type { AppRole } from '@/shared/types';
import { cn } from '@/shared/utils/cn';

import { NAVIGATION } from '@/routes/nav-config';

interface AppSidebarProps {
  role: AppRole;
  schoolName: string | null | undefined;
  schoolLogoPath: string | null | undefined;
  unreadCount: number;
  open: boolean;
  onToggle: () => void;
  /** Mobile: the sidebar is a drawer and closes when a link is followed. */
  onNavigate?: () => void;
}

export function AppSidebar({
  role,
  schoolName,
  schoolLogoPath,
  unreadCount,
  open,
  onToggle,
  onNavigate,
}: AppSidebarProps) {
  const sections = NAVIGATION[role];

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-border bg-card transition-[width] duration-200',
        open ? 'w-[248px]' : 'w-[68px]',
      )}
    >
      {/* ── Brand ──────────────────────────────────────────────────────── */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-border px-4">
        <AppLogo size={32} src={getPublicUrl('school-logos', schoolLogoPath)} />
        {open ? (
          <div className="flex min-w-0 flex-col gap-px">
            <span className="truncate text-sm font-extrabold tracking-tight text-ink">
              {schoolName ?? 'GNASchools'}
            </span>
            <span className="truncate text-[10.5px] font-semibold tracking-wider text-ink-3 uppercase">
              {ROLE_LABEL[role]} portal
            </span>
          </div>
        ) : null}
      </div>

      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto p-2.5" aria-label="Main">
        {sections.map((section, sectionIndex) => (
          <div
            key={section.label ?? sectionIndex}
            className={sectionIndex > 0 ? 'mt-5' : undefined}
          >
            {section.label && open ? (
              <p className="px-2.5 pb-1.5 text-[10.5px] font-bold tracking-wider text-ink-3 uppercase">
                {section.label}
              </p>
            ) : null}

            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const badge = item.badgeKey === 'notifications' ? unreadCount : 0;

                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onNavigate}
                      title={open ? undefined : item.label}
                      className={({ isActive }) =>
                        cn(
                          'relative flex h-9.5 items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-semibold transition-colors',
                          open ? 'justify-start' : 'justify-center',
                          isActive
                            ? 'bg-brand-soft text-brand'
                            : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                        )
                      }
                    >
                      <Icon className="size-[19px] shrink-0" aria-hidden />
                      {open ? <span className="truncate">{item.label}</span> : null}
                      {open && badge > 0 ? (
                        <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">
                          {badge > 99 ? '99+' : badge}
                        </span>
                      ) : null}
                      {/* Collapsed rail: the label is hidden, so the count
                          becomes a dot pinned to the icon. Needs the `relative`
                          on the NavLink above — without it this resolves
                          against the <aside> and lands nowhere useful. */}
                      {!open && badge > 0 ? (
                        <span
                          className="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand"
                          aria-label={`${badge} unread`}
                        />
                      ) : null}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <div className="space-y-0.5 border-t border-border p-2.5">
        <button
          type="button"
          onClick={onToggle}
          className="hidden h-9.5 w-full items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink md:flex"
          aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {open ? (
            <>
              <PanelLeftClose className="size-[19px] shrink-0" aria-hidden />
              <span>Collapse</span>
            </>
          ) : (
            <PanelLeftOpen className="mx-auto size-[19px] shrink-0" aria-hidden />
          )}
        </button>

        <SignOutButton collapsed={!open} />
      </div>
    </aside>
  );
}

function SignOutButton({ collapsed }: { collapsed: boolean }) {
  const signOut = useSignOut();

  return (
    <button
      type="button"
      onClick={() => {
        signOut.mutate();
      }}
      disabled={signOut.isPending}
      title={collapsed ? 'Sign out' : undefined}
      className={cn(
        'flex h-9.5 w-full items-center gap-3 rounded-lg px-2.5 text-[13.5px] font-semibold text-ink-2 hover:bg-danger-soft hover:text-danger disabled:opacity-50',
        collapsed && 'justify-center',
      )}
    >
      <LogOut className="size-[19px] shrink-0" aria-hidden />
      {collapsed ? null : <span>Sign out</span>}
    </button>
  );
}
