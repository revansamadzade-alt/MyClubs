import { useEffect, useState } from 'react';

/**
 * useState that persists to localStorage as JSON. Falls back to `initial` if storage is
 * unavailable, unparseable, or fails the optional `isValid` shape check.
 */
export function useLocalStorage<T>(key: string, initial: T, isValid?: (v: unknown) => v is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return initial;
      const parsed: unknown = JSON.parse(raw);
      return !isValid || isValid(parsed) ? (parsed as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked (private mode): keep working in memory.
    }
  }, [key, value]);

  return [value, setValue] as const;
}
