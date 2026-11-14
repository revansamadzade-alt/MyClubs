import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';

function read<T>(key: string, fallback: T, isValid?: (v: unknown) => v is T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return !isValid || isValid(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * useState that persists to localStorage as JSON and stays in sync across tabs via the `storage` event.
 * Falls back to `initial` if storage is unavailable, unparseable, or fails the optional `isValid` shape check.
 *
 * The setter writes synchronously (so a save made while the page is being hidden or unloaded really lands), applies
 * functional updates to the freshest stored value (so a tab with stale state doesn't drop another tab's changes),
 * and returns false when the browser refused the write (storage full or blocked).
 */
export function useLocalStorage<T>(key: string, initial: T, isValid?: (v: unknown) => v is T) {
  const [value, setValue] = useState<T>(() => read(key, initial, isValid));
  const latest = useRef(value);

  // First visit: store the default so other tabs and later visits see the same starting point.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, JSON.stringify(latest.current));
    } catch {
      // Storage blocked (private mode): keep working in memory.
    }
  }, [key]);

  const set = useCallback(
    (next: SetStateAction<T>): boolean => {
      const base = read(key, latest.current, isValid);
      const v = typeof next === 'function' ? (next as (prev: T) => T)(base) : next;
      latest.current = v;
      let ok = true;
      try {
        window.localStorage.setItem(key, JSON.stringify(v));
      } catch {
        ok = false;
      }
      setValue(v);
      return ok;
    },
    // `isValid` is a stable module-level function for every caller.
    [key],
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== window.localStorage || (e.key !== null && e.key !== key)) return;
      // Another tab changed or cleared this key. Invalid data from it is ignored, never trusted.
      if (e.key === null || e.newValue === null) {
        latest.current = initial;
        return setValue(initial);
      }
      try {
        const parsed: unknown = JSON.parse(e.newValue);
        if (!isValid || isValid(parsed)) {
          latest.current = parsed as T;
          setValue(parsed as T);
        }
      } catch {
        // Corrupted write from another tab: keep the current value.
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // `initial` and `isValid` are stable module-level values for every caller.
  }, [key]);

  return [value, set] as const;
}
