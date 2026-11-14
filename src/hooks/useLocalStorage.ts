import { useEffect, useState } from 'react';

function read<T>(key: string, initial: T, isValid?: (v: unknown) => v is T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return initial;
    const parsed: unknown = JSON.parse(raw);
    return !isValid || isValid(parsed) ? (parsed as T) : initial;
  } catch {
    return initial;
  }
}

/**
 * useState that persists to localStorage as JSON and stays in sync across tabs via the `storage` event.
 * Falls back to `initial` if storage is unavailable, unparseable, or fails the optional `isValid` shape check.
 */
export function useLocalStorage<T>(key: string, initial: T, isValid?: (v: unknown) => v is T) {
  const [value, setValue] = useState<T>(() => read(key, initial, isValid));

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or blocked (private mode): keep working in memory.
    }
  }, [key, value]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea !== window.localStorage || (e.key !== null && e.key !== key)) return;
      // Another tab changed or cleared this key. Invalid data from it is ignored, never trusted.
      if (e.key === null || e.newValue === null) return setValue(initial);
      try {
        const parsed: unknown = JSON.parse(e.newValue);
        if (!isValid || isValid(parsed)) setValue(parsed as T);
      } catch {
        // Corrupted write from another tab: keep the current value.
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // `initial` and `isValid` are stable module-level values for every caller.
  }, [key]);

  return [value, setValue] as const;
}
