import * as React from 'react';

import {
  ThemeContext,
  type ResolvedTheme,
  type ThemePreference,
} from '@/shared/contexts/theme-context';
import { THEME_STORAGE_KEY } from '@/shared/lib/constants';

/**
 * Theme provider.
 *
 * The *first* paint is handled by the inline script in `index.html` — by the
 * time React mounts, `data-theme` is already correct. This provider takes over
 * from there: it owns the preference, keeps `<html>` in step, and follows the
 * OS when the user has not chosen for themselves.
 */

function readStoredTheme(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // Storage can be disabled (private browsing, locked-down school laptops).
  }
  return 'system';
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<ThemePreference>(readStoredTheme);
  const [systemPreference, setSystemPreference] = React.useState<ResolvedTheme>(systemTheme);

  React.useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => {
      setSystemPreference(event.matches ? 'dark' : 'light');
    };
    media.addEventListener('change', onChange);
    return () => {
      media.removeEventListener('change', onChange);
    };
  }, []);

  const resolvedTheme: ResolvedTheme = theme === 'system' ? systemPreference : theme;

  React.useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = React.useCallback((next: ThemePreference) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Preference is lost on reload; the app still works.
    }
  }, []);

  const toggleTheme = React.useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
  }, [resolvedTheme, setTheme]);

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme, toggleTheme }),
    [theme, resolvedTheme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
