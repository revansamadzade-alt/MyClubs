import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarCheck2,
  CalendarDays,
  ChevronLeft,
  FileCheck2,
  ChevronRight,
  GraduationCap,
  LayoutGrid,
  List,
  MapPin,
  Ticket,
  TriangleAlert,
  UsersRound,
  X,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { EVENT_BY_ID } from '../../data/events';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import {
  addDays,
  addMonths,
  DOW_SHORT,
  fmtLongDate,
  fmtMonthDay,
  fmtRange,
  fmtShortTime,
  fmtTime,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from '../../lib/dates';
import {
  KIND_META,
  buildSchedule,
  conflictPairs,
  findConflicts,
  overlapsFor,
  type Overlap,
  type ScheduleItem,
  type ScheduleKind,
} from '../../lib/schedule';
import { cx } from '../../lib/cx';
import { PageHeader, SaveEventButton } from '../../components/ui';
import { useTitle } from '../../hooks/useTitle';

type View = 'month' | 'week' | 'agenda';

const VIEWS: [View, string, LucideIcon][] = [
  ['month', 'Month', CalendarDays],
  ['week', 'Week', LayoutGrid],
  ['agenda', 'Agenda', List],
];

const KIND_ICON: Record<ScheduleKind, LucideIcon> = {
  academic: GraduationCap,
  meeting: UsersRound,
  event: Ticket,
  clubEvent: Ticket,
  application: FileCheck2,
};

const KINDS = Object.keys(KIND_META) as ScheduleKind[];
const AGENDA_DAYS = 14;

const isView = (v: unknown): v is View => v === 'month' || v === 'week' || v === 'agenda';
const timeLabel = (i: ScheduleItem) =>
  i.allDay ? 'All day' : i.isDeadline ? `Due ${fmtTime(i.start)}` : i.kind === 'application' ? fmtTime(i.start) : fmtRange(i.start, i.end);
const overlapMinutes = (o: { from: Date; to: Date }) => Math.round((o.to.getTime() - o.from.getTime()) / 60000);

function rangeFor(view: View, anchor: Date) {
  let from: Date;
  let to: Date;
  if (view === 'month') {
    from = startOfWeek(startOfMonth(anchor));
    to = addDays(startOfWeek(addDays(addMonths(anchor, 1), -1)), 7);
  } else if (view === 'week') {
    from = startOfWeek(anchor);
    to = addDays(from, 7);
  } else {
    from = startOfDay(anchor);
    to = addDays(from, AGENDA_DAYS);
  }
  const days: Date[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) days.push(d);
  return { from, to, days };
}

function kindStyle(item: ScheduleItem, conflicted: boolean): CSSProperties {
  const meta = KIND_META[item.kind];
  return {
    borderLeftColor: meta.color,
    borderLeftStyle: meta.dashed ? 'dashed' : 'solid',
    backgroundColor: conflicted ? '#fff4e5' : meta.soft,
    boxShadow: meta.dashed && !conflicted ? 'inset 0 0 0 1px #b9dcc8' : undefined,
  };
}

function chipLabel(item: ScheduleItem, conflicted: boolean) {
  return `${item.title}. ${KIND_META[item.kind].label}. ${fmtLongDate(item.start)}, ${timeLabel(item)}${conflicted ? '. Schedule conflict' : ''}`;
}

function MonthChip({ item, conflicted, past, onOpen }: { item: ScheduleItem; conflicted: boolean; past: boolean; onOpen: (i: ScheduleItem) => void }) {
  const meta = KIND_META[item.kind];
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={chipLabel(item, conflicted)}
      className={cx(
        'flex w-full min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap rounded-sm border-l-[3px] px-1 py-0.5 text-left text-[0.6875rem] leading-tight hover:brightness-95',
        conflicted && 'ring-1 ring-warn',
        past && 'opacity-60',
      )}
      style={kindStyle(item, conflicted)}
    >
      <span className="shrink-0 font-bold" style={{ color: meta.color }}>
        {item.allDay ? 'All day' : item.isDeadline ? 'Due' : fmtShortTime(item.start)}
      </span>
      <span className="min-w-0 truncate text-ink">{item.title}</span>
      {conflicted && <TriangleAlert size={11} className="shrink-0 text-warn" aria-hidden />}
    </button>
  );
}

function WeekChip({ item, conflicted, past, onOpen }: { item: ScheduleItem; conflicted: boolean; past: boolean; onOpen: (i: ScheduleItem) => void }) {
  const meta = KIND_META[item.kind];
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      aria-label={chipLabel(item, conflicted)}
      className={cx(
        'block w-full rounded-sm border-l-[3px] px-1.5 py-1 text-left hover:brightness-95',
        conflicted && 'ring-1 ring-warn',
        past && 'opacity-60',
      )}
      style={kindStyle(item, conflicted)}
    >
      <span className="block text-[0.6875rem] font-bold" style={{ color: meta.color }}>
        {item.allDay ? 'All day' : item.isDeadline ? `Due ${fmtTime(item.start)}` : fmtTime(item.start)}
      </span>
      <span className="line-clamp-2 block text-xs leading-snug text-ink">{item.title}</span>
      {conflicted && (
        <span className="mt-0.5 flex items-center gap-1 text-[0.6875rem] font-bold text-warn">
          <TriangleAlert size={11} aria-hidden /> Conflict
        </span>
      )}
    </button>
  );
}

function AgendaRow({ item, overlaps, past, onOpen }: { item: ScheduleItem; overlaps?: Overlap[]; past: boolean; onOpen: (i: ScheduleItem) => void }) {
  const meta = KIND_META[item.kind];
  const Icon = KIND_ICON[item.kind];
  return (
    <li className={cx('flex gap-3 py-3 sm:gap-4', past && 'opacity-60')}>
      <span className="w-24 shrink-0 pt-0.5 text-sm text-ink sm:w-36">{timeLabel(item)}</span>
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
        style={{ backgroundColor: meta.soft, color: meta.color, border: meta.dashed ? `1px dashed ${meta.color}` : undefined }}
      >
        <Icon size={16} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => onOpen(item)} className="text-left font-bold text-link hover:underline" aria-label={chipLabel(item, !!overlaps)}>
          {item.title}
        </button>
        <p className="text-sm text-ink-soft">
          <span style={{ color: meta.color }}>{meta.label}</span> · {item.subtitle}
        </p>
        {item.location && (
          <p className="flex items-center gap-1 text-xs text-ink-soft">
            <MapPin size={12} aria-hidden /> {item.location}
          </p>
        )}
        {overlaps && (
          <p className="mt-1 inline-flex items-start gap-1 rounded bg-warn-soft px-2 py-1 text-xs font-bold text-warn">
            <TriangleAlert size={13} aria-hidden className="mt-px shrink-0" />
            Overlaps {overlaps.map((o) => `${o.item.title} (${fmtRange(o.from, o.to)})`).join(', ')}
          </p>
        )}
      </div>
    </li>
  );
}

function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-20 shrink-0 text-ink-soft">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}

function ItemDialog({ item, pool, onClose }: { item: ScheduleItem | null; pool: ScheduleItem[]; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (item && !d.open) d.showModal();
    if (!item && d.open) d.close();
  }, [item]);

  const { isSaved, isFollowing } = useStore();
  const event = item?.eventId ? EVENT_BY_ID[item.eventId] : undefined;
  const kind: ScheduleKind | null = item ? (event ? (isSaved(event.id) ? 'event' : 'clubEvent') : item.kind) : null;
  const meta = kind ? KIND_META[kind] : null;
  const badge = event && kind === 'clubEvent' && !(event.clubId && isFollowing(event.clubId)) ? 'Event (not saved)' : meta?.label;
  const Icon = kind ? KIND_ICON[kind] : null;
  const overlaps = item ? overlapsFor(item, pool) : [];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      aria-labelledby="item-dialog-title"
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded border border-line bg-white p-0 text-ink shadow-xl backdrop:bg-black/40"
    >
      {item && meta && Icon && (
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-bold"
              style={{ backgroundColor: meta.soft, color: meta.color, border: `1px ${meta.dashed ? 'dashed' : 'solid'} ${meta.color}` }}
            >
              <Icon size={13} aria-hidden /> {badge}
            </span>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="grid h-8 w-8 place-items-center rounded hover:bg-surface"
              aria-label="Close details"
            >
              <X size={18} aria-hidden />
            </button>
          </div>
          <h2 id="item-dialog-title" className="mt-2 text-xl font-bold leading-snug">
            {item.title}
          </h2>
          <dl className="mt-3 space-y-1.5 text-sm">
            <DetailRow label="When">
              {fmtLongDate(item.start)} · {timeLabel(item)}
            </DetailRow>
            {item.context && (
              <DetailRow label={item.kind === 'academic' ? 'Course' : item.kind === 'meeting' ? 'Club' : item.kind === 'application' ? 'Organization' : 'Host'}>
                {item.context}
              </DetailRow>
            )}
            <DetailRow label="Type">
              {item.typeLabel}
              {item.points ? ` · ${item.points} points` : ''}
            </DetailRow>
            {item.location && <DetailRow label="Location">{item.location}</DetailRow>}
          </dl>
          {item.description && <p className="mt-3 text-sm leading-relaxed text-ink-soft">{item.description}</p>}
          {event && item.end <= new Date() && (
            <p className="mt-3 rounded bg-surface p-2 text-xs text-ink">This event has ended (shown with its published date).</p>
          )}

          {item.kind === 'application' ? (
            <p className="mt-4 rounded bg-surface p-3 text-xs text-ink-soft">
              {item.userEntered
                ? 'You entered this date yourself. It is a reminder only: MyClubs does not book interviews or auditions, and it is never counted as a schedule conflict.'
                : "Official deadline from the organization's listing. Deadlines are never counted as schedule conflicts."}
            </p>
          ) : item.isDeadline ? (
            <p className="mt-4 rounded bg-surface p-3 text-xs text-ink-soft">
              This is a due time, not a block of time, so it is never counted as a schedule conflict.
            </p>
          ) : overlaps.length ? (
            <div className="mt-4 rounded border border-warn/40 bg-warn-soft p-3 text-sm" role="note">
              <p className="flex items-center gap-1.5 font-bold text-warn">
                <TriangleAlert size={16} aria-hidden />
                {kind === 'clubEvent' ? 'Would overlap if you attend' : 'Schedule conflict'}
              </p>
              <ul className="mt-2 space-y-2">
                {overlaps.map((o) => (
                  <li key={o.item.id} className="border-l-[3px] pl-2" style={{ borderColor: KIND_META[o.item.kind].color }}>
                    <span className="block font-bold">{o.item.title}</span>
                    <span className="block text-ink-soft">
                      {KIND_META[o.item.kind].label} · {timeLabel(o.item)}
                    </span>
                    <span className="block text-warn">
                      Overlap {fmtRange(o.from, o.to)} ({overlapMinutes(o)} min)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-4 flex items-center gap-1.5 rounded bg-[#e8f5ee] p-3 text-sm text-success">
              <CalendarCheck2 size={16} aria-hidden /> No overlapping activities.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {event && <SaveEventButton event={event} size="sm" />}
            {event && item.href && (
              <Link to={item.href} className="btn btn-secondary btn-sm">
                Event page
              </Link>
            )}
            {item.clubId && (
              <Link to={`/clubs/discover/${item.clubId}`} className="btn btn-secondary btn-sm">
                View club
              </Link>
            )}
            {item.kind === 'application' && item.href && (
              <Link to={item.href} className="btn btn-secondary btn-sm">
                Open application
              </Link>
            )}
            {item.kind === 'academic' && (
              <Link to="/courses" className="btn btn-secondary btn-sm">
                Open course (prototype)
              </Link>
            )}
          </div>
          {item.kind === 'academic' && <p className="mt-3 text-xs text-ink-soft">Sample Canvas data — not synced with a real course.</p>}
        </div>
      )}
    </dialog>
  );
}

export default function CampusLife() {
  useTitle('My Campus Life');
  const { followed, saved, applications } = useStore();
  const [view, setView] = useLocalStorage<View>(
    'myclubs:calendarView',
    window.matchMedia('(min-width: 1024px)').matches ? 'month' : 'agenda',
    isView,
  );
  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [shown, setShown] = useState<Record<ScheduleKind, boolean>>({ academic: true, meeting: true, event: true, clubEvent: true, application: true });
  const [selected, setSelected] = useState<ScheduleItem | null>(null);
  const wide = useMinWidth(640);

  const now = new Date();
  const { from, to, days } = rangeFor(view, anchor);
  const all = buildSchedule({ followed, saved, from, to, applications });
  const items = all.filter((i) => shown[i.kind]);
  const conflicts = findConflicts(all);
  const pairs = conflictPairs(all).filter((p) => p.to > now);
  const forDay = (d: Date) => items.filter((i) => isSameDay(i.start, d));
  const live = selected ? (all.find((i) => i.id === selected.id) ?? selected) : null;

  const step = (dir: 1 | -1) =>
    setAnchor((a) => (view === 'month' ? addMonths(a, dir) : addDays(a, dir * (view === 'week' ? 7 : AGENDA_DAYS))));
  const showDay = (d: Date) => {
    setAnchor(d);
    setView(window.matchMedia('(min-width: 640px)').matches ? 'week' : 'agenda');
  };

  const last = addDays(to, -1);
  const title =
    view === 'month'
      ? anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : `${fmtMonthDay(from)} – ${fmtMonthDay(last)}, ${last.getFullYear()}`;
  const stepLabel = view === 'month' ? 'month' : view === 'week' ? 'week' : `${AGENDA_DAYS} days`;

  return (
    <>
      <PageHeader
        title="My Campus Life"
        description="Your demo class schedule and course work, meetings of clubs you follow, campus events and your application dates — in one calendar, with real time overlaps flagged."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => step(-1)} className="btn btn-secondary btn-sm" aria-label={`Previous ${stepLabel}`}>
            <ChevronLeft size={16} aria-hidden />
          </button>
          <button type="button" onClick={() => setAnchor(startOfDay(new Date()))} className="btn btn-secondary btn-sm">
            Today
          </button>
          <button type="button" onClick={() => step(1)} className="btn btn-secondary btn-sm" aria-label={`Next ${stepLabel}`}>
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
        <h2 className="text-lg font-bold" aria-live="polite">
          {title}
        </h2>
        <div className="ml-auto inline-flex overflow-hidden rounded border border-line" role="group" aria-label="Calendar view">
          {VIEWS.map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cx(
                'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm',
                view === v ? 'bg-ink text-white' : 'bg-white text-ink hover:bg-surface',
              )}
            >
              <Icon size={15} aria-hidden /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {KINDS.map((k) => {
          const meta = KIND_META[k];
          const Icon = KIND_ICON[k];
          return (
            <button
              key={k}
              type="button"
              aria-pressed={shown[k]}
              onClick={() => setShown((s) => ({ ...s, [k]: !s[k] }))}
              className={cx(
                'flex items-center gap-3 rounded border p-3 text-left transition-colors',
                shown[k] ? 'bg-white' : 'border-dashed border-line bg-surface opacity-60',
              )}
              style={shown[k] ? { borderColor: meta.color, borderStyle: meta.dashed ? 'dashed' : 'solid', boxShadow: `inset 4px 0 0 ${meta.color}` } : undefined}
              title={shown[k] ? `Hide ${meta.plural.toLowerCase()}` : `Show ${meta.plural.toLowerCase()}`}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ backgroundColor: meta.soft === '#ffffff' ? '#e8f5ee' : meta.soft, color: meta.color }}>
                <Icon size={18} aria-hidden />
              </span>
              <span>
                <span className="block text-xl font-bold leading-none text-ink">{all.filter((i) => i.kind === k).length}</span>
                <span className="text-xs text-ink-soft">{meta.plural}</span>
              </span>
            </button>
          );
        })}
        <div className={cx('flex items-center gap-3 rounded border p-3', pairs.length ? 'border-warn bg-warn-soft' : 'border-line bg-white')}>
          <span
            className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-full', pairs.length ? 'bg-white text-warn' : 'bg-[#e8f5ee] text-success')}
          >
            {pairs.length ? <TriangleAlert size={18} aria-hidden /> : <CalendarCheck2 size={18} aria-hidden />}
          </span>
          <span>
            <span className="block text-xl font-bold leading-none text-ink">{pairs.length}</span>
            <span className="text-xs text-ink-soft">Upcoming conflict{pairs.length === 1 ? '' : 's'}</span>
          </span>
        </div>
      </div>
      <p className="mb-4 text-xs text-ink-soft">
        Solid green = events you saved. Dashed green = events from clubs you follow that you haven't saved; they are not counted as
        conflicts. Assignment due times are never counted as conflicts. Purple = application dates: reminders you entered, or verified
        official deadlines.
      </p>

      {pairs.length > 0 && (
        <section aria-labelledby="overlaps-heading" className="mb-6 rounded border border-warn/40 bg-warn-soft p-4">
          <h2 id="overlaps-heading" className="flex items-center gap-2 font-bold text-warn">
            <TriangleAlert size={18} aria-hidden /> Schedule overlaps
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm text-ink">
            {pairs.map(({ a, b, from: f, to: t }) => (
              <li key={`${a.id}|${b.id}`}>
                <strong>
                  {fmtLongDate(f)}, {fmtRange(f, t)} ({overlapMinutes({ from: f, to: t })} min):
                </strong>{' '}
                <button type="button" onClick={() => setSelected(a)} className="text-link hover:underline">
                  {a.title}
                </button>{' '}
                ({timeLabel(a)}) overlaps{' '}
                <button type="button" onClick={() => setSelected(b)} className="text-link hover:underline">
                  {b.title}
                </button>{' '}
                ({timeLabel(b)})
              </li>
            ))}
          </ul>
        </section>
      )}

      {view === 'month' && (
        <div className="overflow-hidden rounded border border-line">
          <div className="grid grid-cols-7 border-b border-line bg-surface">
            {DOW_SHORT.map((d) => (
              <div key={d} className="px-1 py-1.5 text-center text-xs font-bold uppercase tracking-wide text-ink-soft">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-line">
            {days.map((d) => {
              const dayItems = forDay(d);
              const inMonth = d.getMonth() === anchor.getMonth();
              const isToday = isSameDay(d, now);
              return (
                <div key={d.toISOString()} className={cx('min-h-[64px] min-w-0 p-1 sm:min-h-[112px]', inMonth ? 'bg-white' : 'bg-[#f7f7f7]')}>
                  <button
                    type="button"
                    onClick={() => showDay(d)}
                    className={cx(
                      'mb-1 grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs',
                      isToday ? 'bg-umass font-bold text-white' : inMonth ? 'text-ink hover:bg-surface' : 'text-ink-soft hover:bg-surface',
                    )}
                    aria-label={`${fmtLongDate(d)}, ${dayItems.length} item${dayItems.length === 1 ? '' : 's'}. Open day`}
                  >
                    {d.getDate()}
                  </button>
                  <ul className="hidden space-y-1 sm:block">
                    {dayItems.slice(0, 3).map((i) => (
                      <li key={i.id}>
                        <MonthChip item={i} conflicted={conflicts.has(i.id)} past={i.end < now} onOpen={setSelected} />
                      </li>
                    ))}
                  </ul>
                  {dayItems.length > 3 && (
                    <button type="button" onClick={() => showDay(d)} className="mt-1 hidden text-[0.6875rem] text-link hover:underline sm:block">
                      +{dayItems.length - 3} more
                    </button>
                  )}
                  {dayItems.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 sm:hidden" aria-hidden>
                      {dayItems.slice(0, 4).map((i) => (
                        <span
                          key={i.id}
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: conflicts.has(i.id) ? '#a84400' : KIND_META[i.kind].color }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === 'week' && !wide && (
        <div className="space-y-5" aria-label="Week, one day per row">
          {days.map((d) => {
            const dayItems = forDay(d);
            return (
              <section key={d.toISOString()} aria-labelledby={`wk-${d.getTime()}`}>
                <h3 id={`wk-${d.getTime()}`} className="flex items-center gap-2 border-b border-line pb-1.5 text-sm font-bold text-ink">
                  {fmtLongDate(d)}
                  {isSameDay(d, now) && (
                    <span className="rounded-full bg-umass px-2 py-0.5 text-[0.6875rem] font-bold uppercase text-white">Today</span>
                  )}
                </h3>
                {dayItems.length ? (
                  <ul className="divide-y divide-line-soft">
                    {dayItems.map((i) => (
                      <AgendaRow key={i.id} item={i} overlaps={conflicts.get(i.id)} past={i.end < now} onOpen={setSelected} />
                    ))}
                  </ul>
                ) : (
                  <p className="py-2 text-sm text-ink-soft">Free</p>
                )}
              </section>
            );
          })}
        </div>
      )}

      {view === 'week' && wide && (
        <div className="overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-7 gap-px overflow-hidden rounded border border-line bg-line">
            {days.map((d) => {
              const dayItems = forDay(d);
              const isToday = isSameDay(d, now);
              return (
                <section key={d.toISOString()} aria-label={fmtLongDate(d)} className="min-h-[260px] bg-white p-1.5">
                  <header className="mb-2 flex items-center justify-between px-1 pt-1">
                    <span className="text-xs font-bold uppercase tracking-wide text-ink-soft">{DOW_SHORT[d.getDay()]}</span>
                    <span className={cx('grid h-7 w-7 place-items-center rounded-full text-sm', isToday ? 'bg-umass font-bold text-white' : 'text-ink')}>
                      {d.getDate()}
                    </span>
                  </header>
                  <ul className="space-y-1.5">
                    {dayItems.map((i) => (
                      <li key={i.id}>
                        <WeekChip item={i} conflicted={conflicts.has(i.id)} past={i.end < now} onOpen={setSelected} />
                      </li>
                    ))}
                  </ul>
                  {dayItems.length === 0 && <p className="mt-6 text-center text-xs text-ink-soft">Free</p>}
                </section>
              );
            })}
          </div>
        </div>
      )}

      {view === 'agenda' && (
        <div className="space-y-6">
          {days.map((d) => {
            const dayItems = forDay(d);
            return (
              <section key={d.toISOString()} aria-labelledby={`day-${d.getTime()}`}>
                <h3 id={`day-${d.getTime()}`} className="flex items-center gap-2 border-b border-line pb-1.5 font-bold text-ink">
                  {fmtLongDate(d)}
                  {isSameDay(d, now) && (
                    <span className="rounded-full bg-umass px-2 py-0.5 text-[0.6875rem] font-bold uppercase text-white">Today</span>
                  )}
                </h3>
                {dayItems.length ? (
                  <ul className="divide-y divide-line-soft">
                    {dayItems.map((i) => (
                      <AgendaRow key={i.id} item={i} overlaps={conflicts.get(i.id)} past={i.end < now} onOpen={setSelected} />
                    ))}
                  </ul>
                ) : (
                  <p className="py-2 text-sm text-ink-soft">Nothing scheduled.</p>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-sm text-ink-soft">
        Add more to your calendar by{' '}
        <Link to="/clubs/discover" className="text-link hover:underline">
          following clubs
        </Link>{' '}
        or{' '}
        <Link to="/clubs/events" className="text-link hover:underline">
          saving events
        </Link>
        .
      </p>

      <ItemDialog item={live} pool={all} onClose={() => setSelected(null)} />
    </>
  );
}
