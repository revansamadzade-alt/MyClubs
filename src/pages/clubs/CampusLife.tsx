import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  LayoutGrid,
  List,
  MapPin,
  Ticket,
  TriangleAlert,
  UsersRound,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { addDays, DOW_SHORT, fmtLongDate, fmtMonthDay, fmtRange, fmtTime, isSameDay, startOfDay } from '../../lib/dates';
import {
  KIND_META,
  buildSchedule,
  conflictPairs,
  findConflicts,
  type ScheduleItem,
  type ScheduleKind,
} from '../../lib/schedule';
import { cx } from '../../lib/cx';
import { PageHeader } from '../../components/ui';
import { useTitle } from '../../hooks/useTitle';

type View = 'week' | 'agenda';

const KIND_ICON: Record<ScheduleKind, LucideIcon> = {
  academic: GraduationCap,
  meeting: UsersRound,
  event: Ticket,
};

const KINDS = Object.keys(KIND_META) as ScheduleKind[];
const MAX_WEEKS_AHEAD = 3;

function timeLabel(i: ScheduleItem) {
  return i.isDeadline ? `Due ${fmtTime(i.start)}` : fmtRange(i.start, i.end);
}

function ItemLink({ item, className, children }: { item: ScheduleItem; className?: string; children: ReactNode }) {
  return item.href ? (
    <Link to={item.href} className={cx(className, 'hover:underline')}>
      {children}
    </Link>
  ) : (
    <span className={className}>{children}</span>
  );
}

function WeekChip({ item, overlaps, past }: { item: ScheduleItem; overlaps?: ScheduleItem[]; past: boolean }) {
  const meta = KIND_META[item.kind];
  const tooltip = [item.title, item.subtitle, timeLabel(item), overlaps && `Overlaps: ${overlaps.map((o) => o.title).join(', ')}`]
    .filter(Boolean)
    .join('\n');
  return (
    <div
      title={tooltip}
      className={cx('rounded-sm border-l-[3px] px-1.5 py-1', overlaps && 'ring-1 ring-warn', past && 'opacity-60')}
      style={{ borderLeftColor: meta.color, backgroundColor: overlaps ? '#fff4e5' : meta.soft }}
    >
      <span className="block text-[0.6875rem] font-bold" style={{ color: meta.color }}>
        {item.isDeadline ? `Due ${fmtTime(item.start)}` : fmtTime(item.start)}
      </span>
      <ItemLink item={item} className="line-clamp-2 block text-xs leading-snug text-ink">
        {item.title}
      </ItemLink>
      {overlaps && (
        <span className="mt-0.5 flex items-center gap-1 text-[0.6875rem] font-bold text-warn">
          <TriangleAlert size={11} aria-hidden /> Overlap
        </span>
      )}
    </div>
  );
}

function AgendaRow({ item, overlaps, past }: { item: ScheduleItem; overlaps?: ScheduleItem[]; past: boolean }) {
  const meta = KIND_META[item.kind];
  const Icon = KIND_ICON[item.kind];
  return (
    <li className={cx('flex gap-3 py-3 sm:gap-4', past && 'opacity-60')}>
      <span className="w-24 shrink-0 pt-0.5 text-sm text-ink sm:w-36">{timeLabel(item)}</span>
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
        style={{ backgroundColor: meta.soft, color: meta.color }}
        title={meta.label}
      >
        <Icon size={16} aria-label={meta.label} />
      </span>
      <div className="min-w-0 flex-1">
        <ItemLink item={item} className={cx('font-bold', item.href ? 'text-link' : 'text-ink')}>
          {item.title}
        </ItemLink>
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
            Overlaps with {overlaps.map((o) => o.title).join(', ')}
          </p>
        )}
      </div>
    </li>
  );
}

export default function CampusLife() {
  useTitle('My Campus Life');
  const { followed, saved } = useStore();
  const [offset, setOffset] = useState(0);
  const [view, setView] = useState<View>(() => (window.matchMedia('(min-width: 1024px)').matches ? 'week' : 'agenda'));
  const [shown, setShown] = useState<Record<ScheduleKind, boolean>>({ academic: true, meeting: true, event: true });

  const now = new Date();
  const from = addDays(startOfDay(now), offset * 7);
  const to = addDays(from, 7);
  const all = buildSchedule({ followed, saved, from, to });
  const items = all.filter((i) => shown[i.kind]);
  const overlaps = findConflicts(items);
  const pairs = conflictPairs(items);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const forDay = (d: Date) => items.filter((i) => isSameDay(i.start, d));

  return (
    <>
      <PageHeader
        title="My Campus Life"
        description="Sample course deadlines, meetings of clubs you follow and your saved events — in one schedule, with overlaps flagged."
      />

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setOffset((o) => Math.max(0, o - 1))}
            disabled={offset === 0}
            className="btn btn-secondary btn-sm disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Previous 7 days"
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <button type="button" onClick={() => setOffset(0)} className="btn btn-secondary btn-sm">
            Today
          </button>
          <button
            type="button"
            onClick={() => setOffset((o) => Math.min(MAX_WEEKS_AHEAD, o + 1))}
            disabled={offset === MAX_WEEKS_AHEAD}
            className="btn btn-secondary btn-sm disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Next 7 days"
          >
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
        <h2 className="text-lg font-bold" aria-live="polite">
          {fmtMonthDay(from)} – {fmtMonthDay(addDays(to, -1))}
        </h2>
        <div className="ml-auto inline-flex overflow-hidden rounded border border-line" role="group" aria-label="View">
          {(
            [
              ['week', 'Week', LayoutGrid],
              ['agenda', 'Agenda', List],
            ] as const
          ).map(([v, label, Icon]) => (
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

      {/* Legend doubles as type filters */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {KINDS.map((k) => {
          const meta = KIND_META[k];
          const Icon = KIND_ICON[k];
          const n = all.filter((i) => i.kind === k).length;
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
              style={shown[k] ? { borderColor: meta.color, boxShadow: `inset 4px 0 0 ${meta.color}` } : undefined}
              title={shown[k] ? `Hide ${meta.plural.toLowerCase()}` : `Show ${meta.plural.toLowerCase()}`}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ backgroundColor: meta.soft, color: meta.color }}>
                <Icon size={18} aria-hidden />
              </span>
              <span>
                <span className="block text-xl font-bold leading-none text-ink">{n}</span>
                <span className="text-xs text-ink-soft">{meta.plural}</span>
              </span>
            </button>
          );
        })}
        <div
          className={cx(
            'flex items-center gap-3 rounded border p-3',
            pairs.length ? 'border-warn bg-warn-soft' : 'border-line bg-white',
          )}
        >
          <span
            className={cx(
              'grid h-9 w-9 shrink-0 place-items-center rounded-full',
              pairs.length ? 'bg-white text-warn' : 'bg-[#e8f5ee] text-success',
            )}
          >
            {pairs.length ? <TriangleAlert size={18} aria-hidden /> : <CalendarCheck2 size={18} aria-hidden />}
          </span>
          <span>
            <span className="block text-xl font-bold leading-none text-ink">{pairs.length}</span>
            <span className="text-xs text-ink-soft">Overlap{pairs.length === 1 ? '' : 's'}</span>
          </span>
        </div>
      </div>

      {pairs.length > 0 && (
        <section aria-labelledby="overlaps-heading" className="mb-6 rounded border border-warn/40 bg-warn-soft p-4">
          <h2 id="overlaps-heading" className="flex items-center gap-2 font-bold text-warn">
            <TriangleAlert size={18} aria-hidden /> Schedule overlaps
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm text-ink">
            {pairs.map(([a, b]) => (
              <li key={`${a.id}|${b.id}`}>
                <strong>{fmtLongDate(a.start)}:</strong> {a.title} ({timeLabel(a)}) overlaps {b.title} ({timeLabel(b)})
              </li>
            ))}
          </ul>
        </section>
      )}

      {view === 'week' ? (
        <div className="overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-7 gap-px overflow-hidden rounded border border-line bg-line">
            {days.map((d) => {
              const dayItems = forDay(d);
              const isToday = isSameDay(d, now);
              return (
                <section key={d.toISOString()} aria-label={fmtLongDate(d)} className="min-h-[260px] bg-white p-1.5">
                  <header className="mb-2 flex items-center justify-between px-1 pt-1">
                    <span className="text-xs font-bold uppercase tracking-wide text-ink-soft">{DOW_SHORT[d.getDay()]}</span>
                    <span
                      className={cx(
                        'grid h-7 w-7 place-items-center rounded-full text-sm',
                        isToday ? 'bg-umass font-bold text-white' : 'text-ink',
                      )}
                    >
                      {d.getDate()}
                    </span>
                  </header>
                  <ul className="space-y-1.5">
                    {dayItems.map((i) => (
                      <li key={i.id}>
                        <WeekChip item={i} overlaps={overlaps.get(i.id)} past={i.end < now} />
                      </li>
                    ))}
                  </ul>
                  {dayItems.length === 0 && <p className="mt-6 text-center text-xs text-ink-soft">Free</p>}
                </section>
              );
            })}
          </div>
        </div>
      ) : (
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
                      <AgendaRow key={i.id} item={i} overlaps={overlaps.get(i.id)} past={i.end < now} />
                    ))}
                  </ul>
                ) : (
                  <p className="py-3 text-sm text-ink-soft">Nothing scheduled.</p>
                )}
              </section>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-sm text-ink-soft">
        Add more to your schedule by{' '}
        <Link to="/clubs/discover" className="text-link hover:underline">
          following clubs
        </Link>{' '}
        or{' '}
        <Link to="/clubs/events" className="text-link hover:underline">
          saving events
        </Link>
        .
      </p>
    </>
  );
}
