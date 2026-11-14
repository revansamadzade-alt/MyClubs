import type { Meeting } from '../types';

export const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW_PLURAL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function withTime(d: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const x = new Date(d);
  x.setHours(h, m, 0, 0);
  return x;
}

/** A time `offset` days from today. Sample data is generated relative to "now" so the demo always looks current. */
export function fromToday(offset: number, hhmm: string): Date {
  return withTime(addDays(startOfDay(new Date()), offset), hhmm);
}

/** Next occurrence (today included) of weekday `dow` at `hhmm`. */
export function nextDow(dow: number, hhmm: string): Date {
  const today = startOfDay(new Date());
  return withTime(addDays(today, (dow - today.getDay() + 7) % 7), hhmm);
}

export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  return addDays(x, -x.getDay());
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Compact calendar time, e.g. "7p", "6:30p". */
export function fmtShortTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 || 12}${m ? `:${pad(m)}` : ''}${h >= 12 ? 'p' : 'a'}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

const pad = (n: number) => String(n).padStart(2, '0');

function clock(h: number, m: number) {
  return { text: `${h % 12 || 12}:${pad(m)}`, ap: h >= 12 ? 'PM' : 'AM' };
}

export function fmtTime(d: Date): string {
  const c = clock(d.getHours(), d.getMinutes());
  return `${c.text} ${c.ap}`;
}

export function fmtRange(start: Date, end: Date): string {
  const s = clock(start.getHours(), start.getMinutes());
  const e = clock(end.getHours(), end.getMinutes());
  return s.ap === e.ap ? `${s.text} – ${e.text} ${e.ap}` : `${s.text} ${s.ap} – ${e.text} ${e.ap}`;
}

export function hhmmRange(start: string, end: string): string {
  const base = startOfDay(new Date());
  return fmtRange(withTime(base, start), withTime(base, end));
}

export function meetingLabel(m: Meeting): string {
  return `${DOW_PLURAL[m.dow]} · ${hhmmRange(m.start, m.end)}`;
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function fmtLongDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export function fmtMonthDay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Canvas-style due label, e.g. "Nov 14 at 11:59pm". */
export function fmtDue(d: Date): string {
  const c = clock(d.getHours(), d.getMinutes());
  return `${fmtMonthDay(d)} at ${c.text}${c.ap.toLowerCase()}`;
}

export function relativeDay(d: Date): string {
  const today = startOfDay(new Date());
  if (isSameDay(d, today)) return 'Today';
  if (isSameDay(d, addDays(today, 1))) return 'Tomorrow';
  return fmtDate(d);
}
