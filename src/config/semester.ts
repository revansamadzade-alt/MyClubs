import { addDays } from '../lib/dates';

/**
 * Demo semester window (local dates, inclusive). Weekly classes and club meetings repeat only inside it.
 * Override with VITE_SEMESTER_NAME / VITE_SEMESTER_START / VITE_SEMESTER_END (YYYY-MM-DD).
 */
export const SEMESTER = {
  name: (import.meta.env.VITE_SEMESTER_NAME as string | undefined) ?? 'Fall 2026',
  start: (import.meta.env.VITE_SEMESTER_START as string | undefined) ?? '2026-09-02',
  end: (import.meta.env.VITE_SEMESTER_END as string | undefined) ?? '2026-12-10',
};

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const semesterStart = (): Date => parseLocalDate(SEMESTER.start);

/** Exclusive end: the day after the last day of the semester. */
export const semesterEnd = (): Date => addDays(parseLocalDate(SEMESTER.end), 1);

export const inSemester = (d: Date): boolean => d >= semesterStart() && d < semesterEnd();
