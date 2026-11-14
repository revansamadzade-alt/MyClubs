import type { CampusEvent, Club, TrackedApplication } from '../types';
import { ACADEMIC_ITEMS, ACADEMIC_KIND_LABEL, CLASS_SCHEDULE, COURSE_BY_ID } from '../data/courses';
import { CLUB_BY_ID } from '../data/clubs';
import { EVENTS } from '../data/events';
import { addDays, dateKey, startOfDay, withTime } from './dates';
import { inSemester } from '../config/semester';
import { applicationScheduleItems } from './applicationPlanner';

/**
 * academic  – sample Canvas deadlines and sessions
 * meeting   – weekly meeting of a followed club
 * event     – campus event the student saved
 * clubEvent – event posted by a followed club that the student has not saved
 * application – a date for a tracked application: the student's reminder/interview/audition, or a verified deadline
 */
export type ScheduleKind = 'academic' | 'meeting' | 'event' | 'clubEvent' | 'application';

export interface ScheduleItem {
  id: string;
  kind: ScheduleKind;
  title: string;
  subtitle: string;
  typeLabel: string;
  context?: string;
  start: Date;
  end: Date;
  location?: string;
  description?: string;
  points?: number;
  href?: string;
  clubId?: string;
  eventId?: string;
  /** A due time only. Never occupies a block of time and never counts as a conflict. */
  isDeadline: boolean;
  /** A whole-day marker (no time). */
  allDay?: boolean;
  /** Application dates link back to this tracked organization. */
  appClubId?: string;
  /** Entered by the student, not taken from an official source. */
  userEntered?: boolean;
}

export interface Overlap {
  item: ScheduleItem;
  from: Date;
  to: Date;
}

export const KIND_META: Record<ScheduleKind, { label: string; plural: string; color: string; soft: string; dashed?: boolean }> = {
  academic: { label: 'Academic', plural: 'Academic items', color: '#036aa6', soft: '#e8f3fa' },
  meeting: { label: 'Club meeting', plural: 'Club meetings', color: '#881c1c', soft: '#f8ecec' },
  event: { label: 'Saved event', plural: 'Saved events', color: '#0a7a44', soft: '#e8f5ee' },
  clubEvent: { label: 'Club event (not saved)', plural: 'Club events', color: '#0a7a44', soft: '#ffffff', dashed: true },
  application: { label: 'Application date', plural: 'Application dates', color: '#5a3a8a', soft: '#f1ecf7' },
};

const byStart = (a: { start: Date }, b: { start: Date }) => a.start.getTime() - b.start.getTime();

function inRange(start: Date, end: Date, from: Date, to: Date) {
  return start < to && end >= from;
}

export function academicItems(from: Date, to: Date): ScheduleItem[] {
  return ACADEMIC_ITEMS.filter((a) => inRange(a.start, a.end ?? a.start, from, to)).map((a) => {
    const course = COURSE_BY_ID[a.courseId];
    const kindLabel = ACADEMIC_KIND_LABEL[a.kind];
    return {
      id: a.id,
      kind: 'academic',
      title: a.title,
      subtitle: `${course?.short ?? 'Course'} · ${kindLabel}`,
      typeLabel: a.end ? kindLabel : `${kindLabel} deadline`,
      context: course ? `${course.name} (${course.short})` : undefined,
      start: a.start,
      end: a.end ?? a.start,
      location: a.location,
      points: a.points,
      isDeadline: !a.end,
    };
  });
}

/** Demo weekly class sessions as academic time blocks. */
export function classItems(from: Date, to: Date): ScheduleItem[] {
  const out: ScheduleItem[] = [];
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) {
    if (!inSemester(d)) continue;
    for (const s of CLASS_SCHEDULE) {
      if (!s.days.includes(d.getDay())) continue;
      const course = COURSE_BY_ID[s.courseId];
      const start = withTime(d, s.start);
      const end = withTime(d, s.end);
      if (!inRange(start, end, from, to)) continue;
      out.push({
        id: `cls:${s.id}:${dateKey(d)}`,
        kind: 'academic',
        title: `${course?.short ?? 'Course'} ${s.label}`,
        subtitle: `${s.label} · demo class schedule`,
        typeLabel: `${s.label} (demo class schedule)`,
        context: course ? `${course.name} (${course.short})` : undefined,
        start,
        end,
        location: s.location,
        isDeadline: false,
      });
    }
  }
  return out;
}

/** Weekly recurrence: one occurrence per matching weekday inside [from, to). */
export function meetingItems(clubIds: string[], from: Date, to: Date): ScheduleItem[] {
  const out: ScheduleItem[] = [];
  const ids = [...new Set(clubIds)];
  for (let d = startOfDay(from); d < to; d = addDays(d, 1)) {
    if (!inSemester(d)) continue;
    for (const id of ids) {
      const club = CLUB_BY_ID[id];
      if (!club) continue;
      for (const m of club.meetings) {
        if (m.dow !== d.getDay()) continue;
        const start = withTime(d, m.start);
        const end = withTime(d, m.end);
        if (!inRange(start, end, from, to)) continue;
        out.push({
          id: `meet:${club.id}:${dateKey(d)}:${m.start}`,
          kind: 'meeting',
          title: club.name,
          subtitle: m.label ?? 'Weekly meeting',
          typeLabel: `Weekly meeting${m.label ? ` · ${m.label}` : ''}`,
          context: club.name,
          start,
          end,
          location: club.location,
          href: `/clubs/discover/${club.id}`,
          clubId: club.id,
          isDeadline: false,
        });
      }
    }
  }
  return out;
}

export function eventToItem(e: CampusEvent, saved: boolean): ScheduleItem {
  return {
    id: e.id,
    kind: saved ? 'event' : 'clubEvent',
    title: e.title,
    subtitle: e.host,
    typeLabel: `${e.category} event`,
    context: e.host,
    start: e.start,
    end: e.end,
    location: e.location,
    description: e.description,
    href: `/clubs/events/${e.id}`,
    clubId: e.clubId,
    eventId: e.id,
    isDeadline: false,
  };
}

/**
 * Academic items + meetings of followed clubs + events that are saved or posted by a followed club.
 * Events are read once from EVENTS, so an event that is both saved and from a followed club appears once (as saved).
 */
export function buildSchedule(opts: { followed: string[]; saved: string[]; from: Date; to: Date; applications?: TrackedApplication[] }): ScheduleItem[] {
  const { followed, saved, from, to, applications = [] } = opts;
  const savedSet = new Set(saved);
  const followedSet = new Set(followed);
  const events = EVENTS.filter(
    (e) => inRange(e.start, e.end, from, to) && (savedSet.has(e.id) || (!!e.clubId && followedSet.has(e.clubId))),
  ).map((e) => eventToItem(e, savedSet.has(e.id)));
  return [
    ...academicItems(from, to),
    ...classItems(from, to),
    ...meetingItems(followed, from, to),
    ...events,
    ...applicationScheduleItems(applications, from, to),
  ].sort(byStart);
}

/** Items the student is committed to that occupy time. Deadlines, unsaved club events and application dates are excluded. */
const blocksTime = (i: ScheduleItem) => !i.isDeadline && i.kind !== 'clubEvent' && i.kind !== 'application';

/** Committed items in `pool` whose time block genuinely overlaps `target`, with the shared window. */
export function overlapsFor(target: ScheduleItem, pool: ScheduleItem[]): Overlap[] {
  if (target.isDeadline || target.kind === 'application') return [];
  return pool
    .filter((o) => o.id !== target.id && blocksTime(o) && o.start < target.end && target.start < o.end)
    .map((o) => ({
      item: o,
      from: new Date(Math.max(o.start.getTime(), target.start.getTime())),
      to: new Date(Math.min(o.end.getTime(), target.end.getTime())),
    }));
}

/** Map of item id → overlaps, among committed time blocks only. */
export function findConflicts(items: ScheduleItem[]): Map<string, Overlap[]> {
  const committed = items.filter(blocksTime);
  const map = new Map<string, Overlap[]>();
  for (const item of committed) {
    const o = overlapsFor(item, committed);
    if (o.length) map.set(item.id, o);
  }
  return map;
}

export function conflictPairs(items: ScheduleItem[]): { a: ScheduleItem; b: ScheduleItem; from: Date; to: Date }[] {
  const map = findConflicts(items);
  const seen = new Set<string>();
  const pairs: { a: ScheduleItem; b: ScheduleItem; from: Date; to: Date }[] = [];
  for (const a of items) {
    for (const o of map.get(a.id) ?? []) {
      const key = [a.id, o.item.id].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ a, b: o.item, from: o.from, to: o.to });
    }
  }
  return pairs;
}

/** Meetings plus all posted events for the given clubs over the next `days` days. */
export function upcomingForClubs(clubIds: string[], days = 14): ScheduleItem[] {
  const now = new Date();
  const to = addDays(startOfDay(now), days);
  const meetings = meetingItems(clubIds, now, to).filter((m) => m.end > now);
  const events = EVENTS.filter((e) => e.clubId && clubIds.includes(e.clubId) && e.end > now && e.start < to).map((e) =>
    eventToItem(e, false),
  );
  return [...meetings, ...events].sort(byStart);
}

export function nextMeeting(club: Club): Date | null {
  const now = new Date();
  const next = meetingItems([club.id], now, addDays(startOfDay(now), 8)).find((m) => m.start > now);
  return next?.start ?? null;
}

/** Committed items on the event's day that overlap it, as if the student attends. */
export function conflictsForEvent(event: CampusEvent, followed: string[], saved: string[]): Overlap[] {
  const from = startOfDay(event.start);
  const pool = buildSchedule({ followed, saved: saved.filter((id) => id !== event.id), from, to: addDays(from, 1) });
  return overlapsFor(eventToItem(event, true), pool);
}
