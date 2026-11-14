// Application dates (student-entered reminders, interviews, auditions) and verified official deadlines, turned into
// calendar items for My Campus Life and tasks for the Dashboard To Do panel. Nothing here is invented: student
// dates are labeled as entered by the student, and official deadlines appear only when verified in the data.
import type { ApplicationDate, ApplicationDateKind, Club, TrackedApplication } from '../types';
import type { ScheduleItem } from './schedule';
import { addDays, startOfDay, withTime } from './dates';
import { isDemoOrg, orgFor, statusLabel } from './applications';

export const DATE_KIND_LABEL: Record<ApplicationDateKind, string> = {
  reminder: 'Reminder',
  interview: 'Interview',
  audition: 'Audition',
};

const parseDay = (ymd: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Start time of a student-entered date: the given time, or the start of that day when no time was entered. */
export function dateStart(d: Pick<ApplicationDate, 'date' | 'time'>): Date | null {
  const day = parseDay(d.date);
  if (!day) return null;
  return d.time && /^\d{2}:\d{2}$/.test(d.time) ? withTime(day, d.time) : day;
}

/** Student-entered dates, soonest first. */
export function sortedDates(app: TrackedApplication): ApplicationDate[] {
  return [...(app.dates ?? [])].sort((a, b) => (dateStart(a)?.getTime() ?? 0) - (dateStart(b)?.getTime() ?? 0));
}

/** The next student-entered date that has not passed (dates without a time count for the whole day). */
export function nextDate(app: TrackedApplication, now = new Date()): ApplicationDate | undefined {
  return sortedDates(app).find((d) => {
    const s = dateStart(d);
    return !!s && (d.time ? s >= now : addDays(s, 1) > now);
  });
}

const verifiedDeadline = (club: Club) => (club.application?.process === 'required' ? club.application.deadline : undefined);

/** Calendar items for tracked applications. One item per student-entered date plus one per verified deadline. */
export function applicationScheduleItems(apps: TrackedApplication[], from: Date, to: Date): ScheduleItem[] {
  const out: ScheduleItem[] = [];
  const seen = new Set<string>();
  for (const app of apps) {
    const club = orgFor(app.clubId);
    if (!club) continue;
    const href = `/clubs/applications/${club.id}`;
    const status = statusLabel(app);
    for (const d of app.dates ?? []) {
      const start = dateStart(d);
      if (!start) continue;
      const allDay = !d.time;
      const end = allDay ? addDays(start, 1) : start;
      const id = `app:${club.id}:${d.id}`;
      if (seen.has(id) || !(start < to && end > from)) continue;
      seen.add(id);
      const label = DATE_KIND_LABEL[d.kind];
      out.push({
        id,
        kind: 'application',
        title: `${label}: ${club.name}`,
        subtitle: `${d.note ? `${d.note} · ` : ''}${status}`,
        typeLabel:
          d.kind === 'reminder'
            ? 'Your reminder (you entered this; not an official deadline)'
            : `${label} date you entered (not confirmed by MyClubs or the organization)`,
        context: club.name,
        start,
        // All-day items last until midnight, so today's reminder isn't shown as past.
        end,
        allDay,
        appClubId: club.id,
        userEntered: true,
        href,
        isDeadline: false,
      });
    }
    const deadline = verifiedDeadline(club);
    const day = deadline ? parseDay(deadline) : null;
    if (day && day < to && addDays(day, 1) > from && !seen.has(`appdl:${club.id}`)) {
      seen.add(`appdl:${club.id}`);
      out.push({
        id: `appdl:${club.id}`,
        kind: 'application',
        title: `Application deadline: ${club.name}`,
        subtitle: `Official deadline (verified) · ${status}`,
        typeLabel: `Official application deadline, verified from the organization's listing${club.application?.verifiedOn ? ` (checked ${club.application.verifiedOn})` : ''}`,
        context: club.name,
        start: day,
        end: addDays(day, 1),
        allDay: true,
        appClubId: club.id,
        href,
        isDeadline: false,
      });
    }
  }
  return out;
}

export interface ApplicationTask {
  id: string;
  title: string;
  detail: string;
  href: string;
  /** When the task is due or happens; undefined for open-ended tasks such as finishing a draft. */
  when?: Date;
  allDay?: boolean;
}

/** Upcoming application tasks for the Dashboard To Do panel: dated items first (soonest first), then open tasks. */
export function applicationTasks(apps: TrackedApplication[], now = new Date(), limit = 4, horizonDays = 30): ApplicationTask[] {
  const horizon = addDays(startOfDay(now), horizonDays);
  const dated: ApplicationTask[] = [];
  const open: ApplicationTask[] = [];
  for (const app of apps) {
    const club = orgFor(app.clubId);
    if (!club) continue;
    const base = `/clubs/applications/${club.id}`;
    for (const d of app.dates ?? []) {
      const s = dateStart(d);
      if (!s || s >= horizon || (d.time ? s < now : addDays(s, 1) <= now)) continue;
      dated.push({
        id: `task:${club.id}:${d.id}`,
        title: `${DATE_KIND_LABEL[d.kind]}: ${club.name}`,
        detail: d.note ? `${d.note} (you entered this)` : 'You entered this date',
        href: base,
        when: s,
        allDay: !d.time,
      });
    }
    const deadline = verifiedDeadline(club);
    const day = deadline ? parseDay(deadline) : null;
    if (day && addDays(day, 1) > now && day < horizon)
      dated.push({ id: `task:${club.id}:deadline`, title: `Application deadline: ${club.name}`, detail: 'Official deadline (verified)', href: base, when: day, allDay: true });
    if (app.status === 'draft' && app.form)
      open.push({ id: `task:${club.id}:draft`, title: `Finish application draft: ${club.name}`, detail: 'Draft saved in MyClubs', href: `${base}/apply` });
    else if (app.status === 'prepared')
      open.push({
        id: `task:${club.id}:prepared`,
        title: isDemoOrg(club) ? `Review demo application: ${club.name}` : `Apply through the official process: ${club.name}`,
        detail: isDemoOrg(club) ? 'Demo only — not sent anywhere' : 'Answers prepared in MyClubs — not submitted',
        href: base,
      });
  }
  dated.sort((a, b) => a.when!.getTime() - b.when!.getTime());
  return [...dated, ...open].slice(0, limit);
}
