import { useSyncExternalStore } from 'react';

/**
 * Subscribe to a media query.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: it reads the
 * current match during render, so the first paint is already correct instead
 * of flashing the desktop layout on a phone.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);
      return () => {
        media.removeEventListener('change', onChange);
      };
    },
    () => window.matchMedia(query).matches,
    () => false, // Server / prerender default.
  );
}

export const useIsMobile = () => useMediaQuery('(max-width: 767px)');
export const useIsTablet = () => useMediaQuery('(max-width: 1023px)');
