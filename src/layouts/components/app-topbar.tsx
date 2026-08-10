import { useEffect, useState } from 'react';
import { Bell, Menu, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { useCurrentUser, useSignOut } from '@/features/auth';
import { SearchDialog } from '@/features/search';
import { ThemeToggle } from '@/shared/components/theme-toggle';
import { UserAvatar } from '@/shared/components/user-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Button } from '@/shared/components/ui/button';
import { ROLE_LABEL } from '@/shared/lib/constants';
import type { AppRole } from '@/shared/types';

interface AppTopbarProps {
  role: AppRole;
  unreadCount: number;
  onOpenSidebar: () => void;
}

export function AppTopbar({ role, unreadCount, onOpenSidebar }: AppTopbarProps) {
  const { user, currentSession } = useCurrentUser();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);

  const roleBase = `/${role === 'administrator' ? 'admin' : role}`;

  // ⌘K / Ctrl-K from anywhere in the shell. Registered once here rather than in
  // the dialog, which is unmounted until it opens.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-card px-4 sm:px-6">
      <Button
        variant="secondary"
        size="icon"
        className="md:hidden"
        onClick={onOpenSidebar}
        aria-label="Open navigation"
      >
        <Menu className="size-[17px]" aria-hidden />
      </Button>

      {/* A button dressed as a field. The typing happens in the dialog, so the
          first keystroke is not lost to a remount when it opens. */}
      <button
        type="button"
        onClick={() => {
          setSearchOpen(true);
        }}
        aria-label="Search"
        aria-keyshortcuts="Control+K Meta+K"
        className="relative hidden h-9.5 max-w-[420px] flex-1 items-center rounded-lg border border-border bg-surface-2 pr-2.5 pl-10 text-left transition-colors hover:bg-surface-3 sm:flex"
      >
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3"
          aria-hidden
        />
        <span className="flex-1 truncate text-[13.5px] text-ink-3">
          Search lessons, assignments, people…
        </span>
        <kbd className="hidden rounded border border-border bg-card px-1.5 py-0.5 text-[10.5px] font-semibold text-ink-3 lg:inline-block">
          Ctrl K
        </kbd>
      </button>

      {/* Narrow screens get the icon; the field would crowd out the session
          badge and the avatar. */}
      <Button
        variant="secondary"
        size="icon"
        className="sm:hidden"
        onClick={() => {
          setSearchOpen(true);
        }}
        aria-label="Search"
      >
        <Search className="size-[17px]" aria-hidden />
      </Button>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} role={role} />

      <div className="ml-auto flex items-center gap-2">
        {currentSession ? (
          <span className="hidden rounded-md border border-border px-2.5 py-1 text-[11.5px] font-semibold text-ink-3 lg:inline-block">
            {currentSession.name} · {currentSession.term} term
          </span>
        ) : null}

        <ThemeToggle />

        <Button asChild variant="secondary" size="icon" className="relative">
          <Link to={`${roleBase}/notifications`} aria-label="Notifications">
            <Bell className="size-[17px]" aria-hidden />
            {unreadCount > 0 ? (
              <span
                className="absolute top-1.5 right-1.5 size-2 rounded-full border-[1.5px] border-card bg-danger"
                aria-label={`${unreadCount} unread`}
              />
            ) : null}
          </Link>
        </Button>

        <div className="mx-1 hidden h-6 w-px bg-border sm:block" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2.5 rounded-full border border-border bg-card py-1 pr-3 pl-1 transition-colors hover:bg-surface-2"
            >
              <UserAvatar
                fullName={user.full_name}
                avatarPath={user.avatar_path}
                className="size-7"
              />
              <span className="hidden flex-col items-start leading-tight sm:flex">
                <span className="text-[12.5px] font-bold text-ink">{user.full_name}</span>
                <span className="text-[10.5px] text-ink-3">{ROLE_LABEL[role]}</span>
              </span>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span>{user.full_name}</span>
              <span className="text-[12px] font-normal text-ink-3">{user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                void navigate(`${roleBase}/profile`);
              }}
            >
              My profile
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                void navigate(`${roleBase}/notifications`);
              }}
            >
              Notifications
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                signOut.mutate();
              }}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
