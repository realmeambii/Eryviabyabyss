import { useEffect, useState } from 'react';

/**
 * Debounce a value.
 *
 * Used by the search boxes so typing "mathematics" issues one query rather
 * than eleven — each of which would count against the rate limit.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  return debounced;
}
