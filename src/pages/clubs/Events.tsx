import { useSearchParams } from 'react-router-dom';
import { CalendarX2 } from 'lucide-react';
import type { Category } from '../../types';
import { CATEGORIES } from '../../data/clubs';
import { EVENTS } from '../../data/events';
import { useStore } from '../../context/StoreContext';
import { addDays, startOfDay } from '../../lib/dates';
import { cx } from '../../lib/cx';
import { EventCard } from '../../components/EventCard';
import { ChipGroup, EmptyState, PageHeader, SearchInput } from '../../components/ui';
import { useTitle } from '../../hooks/useTitle';

type View = 'all' | 'saved' | 'clubs';
type When = 'any' | 'week' | 'two-weeks';

export default function Events() {
  useTitle('Campus Events');
  const [params, setParams] = useSearchParams();
  const { saved, followed } = useStore();

  const view = (params.get('view') ?? 'all') as View;
  const q = params.get('q') ?? '';
  const cat = (params.get('cat') ?? 'All') as Category | 'All';
  const when = (params.get('when') ?? 'any') as When;

  const update = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (value === fallback || value === '') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const now = new Date();
  const upcoming = EVENTS.filter((e) => e.end > now);
  const inView = (v: View) =>
    upcoming.filter((e) =>
      v === 'saved' ? saved.includes(e.id) : v === 'clubs' ? !!e.clubId && followed.includes(e.clubId) : true,
    );

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  const limit = when === 'week' ? addDays(startOfDay(now), 7) : when === 'two-weeks' ? addDays(startOfDay(now), 14) : null;
  const results = inView(view).filter((e) => {
    if (cat !== 'All' && e.category !== cat) return false;
    if (limit && e.start >= limit) return false;
    const hay = [e.title, e.description, e.host, e.location, e.category].join(' ').toLowerCase();
    return terms.every((t) => hay.includes(t));
  });

  const tabs: { value: View; label: string }[] = [
    { value: 'all', label: `All events (${inView('all').length})` },
    { value: 'saved', label: `Saved (${inView('saved').length})` },
    { value: 'clubs', label: `From clubs I follow (${inView('clubs').length})` },
  ];

  const usedCategories = CATEGORIES.filter((c) => upcoming.some((e) => e.category === c));

  return (
    <>
      <PageHeader
        title="Campus Events"
        description="Find things to do on campus. Saved events are added to My Campus Life."
      />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line" role="group" aria-label="Event lists">
        {tabs.map((t) => (
          <button
            key={t.value}
            type="button"
            aria-pressed={view === t.value}
            onClick={() => update('view', t.value, 'all')}
            className={cx(
              '-mb-px whitespace-nowrap border-b-[3px] px-4 py-2.5 text-[0.9375rem]',
              view === t.value ? 'border-link font-bold text-ink' : 'border-transparent text-link hover:border-line',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-3 rounded border border-line bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <SearchInput
            value={q}
            onChange={(v) => update('q', v, '')}
            label="Search events"
            placeholder="Search events, hosts or locations"
          />
          <label className="sm:w-48">
            <span className="sr-only">When</span>
            <select value={when} onChange={(e) => update('when', e.target.value, 'any')} className="input">
              <option value="any">Any upcoming date</option>
              <option value="week">Next 7 days</option>
              <option value="two-weeks">Next 14 days</option>
            </select>
          </label>
        </div>
        <ChipGroup
          label="Filter by category"
          options={[{ value: 'All' as const, label: 'All' }, ...usedCategories.map((c) => ({ value: c, label: c }))]}
          value={cat}
          onChange={(v) => update('cat', v, 'All')}
        />
      </div>

      <p className="my-4 text-sm text-ink-soft" aria-live="polite">
        {results.length} event{results.length === 1 ? '' : 's'}
      </p>

      {results.length ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {results.map((e) => (
            <EventCard key={e.id} event={e} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CalendarX2}
          title={view === 'saved' && !q && cat === 'All' ? 'No saved events yet' : 'No events match'}
          action={
            <button type="button" className="btn btn-secondary" onClick={() => setParams({}, { replace: true })}>
              Show all events
            </button>
          }
        >
          {view === 'clubs' && !followed.length
            ? 'Follow some clubs to see their events here.'
            : 'Try another keyword, category or date range.'}
        </EmptyState>
      )}
    </>
  );
}
