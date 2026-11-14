import type { CampusEvent, Category, Club } from '../types';
import { CLUBS } from '../data/clubs';
import { EVENTS } from '../data/events';
import { addDays, startOfDay } from './dates';
import { buildSchedule, eventToItem, meetingItems, overlapsFor, type Overlap, type ScheduleItem } from './schedule';

export type FitStatus = 'fits' | 'partial' | 'conflicts' | 'unknown';

export interface FitSlot {
  item: ScheduleItem;
  overlaps: Overlap[];
}

export interface ClubFit {
  club: Club;
  status: FitStatus;
  slots: FitSlot[];
  free: number;
  interest: boolean;
  /** For unknown schedules: the next verified event after the window, if any. */
  laterEvent?: CampusEvent;
}

/** Why a club has no checkable times, in plain words. Never implies a time that was not published. */
export function unknownReason(fit: ClubFit): string {
  if (fit.club.scheduleNote) return `Listed schedule is incomplete: ${fit.club.scheduleNote}`;
  if (fit.laterEvent) {
    const when = fit.laterEvent.start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return `No listed times in the next ${FIT_WINDOW_DAYS} days. Next listed event: ${when}.`;
  }
  return 'Campus Pulse lists no meeting times and no upcoming public events for this club.';
}

export const FIT_WINDOW_DAYS = 14;
const STATUS_ORDER: FitStatus[] = ['fits', 'partial', 'conflicts', 'unknown'];

/**
 * Deterministic schedule fit for every club over the next FIT_WINDOW_DAYS days.
 * A club's times are only its verified weekly meetings and its verified upcoming events; nothing is guessed.
 * Each time is checked with the calendar's overlap rules against the student's committed schedule,
 * excluding the club's own meetings and events so a followed club is not compared with itself.
 */
export function findMyFit(opts: { followed: string[]; saved: string[]; interests: Category[]; now?: Date }): ClubFit[] {
  const now = opts.now ?? new Date();
  const from = startOfDay(now);
  const to = addDays(from, FIT_WINDOW_DAYS);

  return CLUBS.map((club) => {
    const ownEvents = EVENTS.filter((e) => e.clubId === club.id && e.verified && e.end > now && e.start < to);
    const items = [
      ...meetingItems([club.id], from, to).filter((m) => m.end > now),
      ...ownEvents.map((e) => eventToItem(e, true)),
    ].sort((a, b) => a.start.getTime() - b.start.getTime());
    const pool = buildSchedule({
      followed: opts.followed.filter((id) => id !== club.id),
      saved: opts.saved.filter((id) => !ownEvents.some((e) => e.id === id)),
      from,
      to,
    });
    const slots = items.map((item) => ({ item, overlaps: overlapsFor(item, pool) }));
    const free = slots.filter((s) => !s.overlaps.length).length;
    const status: FitStatus = !slots.length ? 'unknown' : free === slots.length ? 'fits' : free === 0 ? 'conflicts' : 'partial';
    const laterEvent = status === 'unknown' ? EVENTS.find((e) => e.clubId === club.id && e.verified && e.start >= to) : undefined;
    return { club, status, slots, free, interest: opts.interests.includes(club.category), laterEvent };
  });
}

/** Group order, then interest match, then share of free times, then number of free times, then name. */
export function rankFits(fits: ClubFit[]): ClubFit[] {
  const ratio = (f: ClubFit) => (f.slots.length ? f.free / f.slots.length : 0);
  return [...fits].sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      Number(b.interest) - Number(a.interest) ||
      ratio(b) - ratio(a) ||
      b.free - a.free ||
      a.club.name.localeCompare(b.club.name),
  );
}
