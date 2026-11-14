import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarCheck2, SearchX } from 'lucide-react';
import type { Category } from '../../types';
import { CATEGORIES, CLUBS } from '../../data/clubs';
import { useStore } from '../../context/StoreContext';
import { ClubCard } from '../../components/ClubCard';
import { ChipGroup, EmptyState, PageHeader, SearchInput } from '../../components/ui';
import { useTitle } from '../../hooks/useTitle';

type Show = 'all' | 'following' | 'not';
type Sort = 'name' | 'name-desc';

export default function Discover() {
  useTitle('Discover');
  const [params, setParams] = useSearchParams();
  const { followed } = useStore();

  const q = params.get('q') ?? '';
  const cat = (params.get('cat') ?? 'All') as Category | 'All';
  const show = (params.get('show') ?? 'all') as Show;
  const sort = (params.get('sort') ?? 'name') as Sort;

  // Filters live in the URL so they survive opening a profile and coming back.
  const update = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (value === fallback || value === '') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return CLUBS.filter((c) => {
      if (cat !== 'All' && c.category !== cat) return false;
      const f = followed.includes(c.id);
      if (show === 'following' && !f) return false;
      if (show === 'not' && f) return false;
      const hay = [c.name, c.summary, c.about, c.category, c.location ?? '', c.scheduleNote ?? '', ...c.tags].join(' ').toLowerCase();
      return terms.every((t) => hay.includes(t));
    }).sort((a, b) => (sort === 'name-desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)));
  }, [q, cat, show, sort, followed]);

  const categoryOptions = [
    { value: 'All' as const, label: 'All', count: CLUBS.length },
    ...CATEGORIES.filter((c) => CLUBS.some((x) => x.category === c)).map((c) => ({
      value: c,
      label: c,
      count: CLUBS.filter((x) => x.category === c).length,
    })),
  ];

  const hasFilters = q || cat !== 'All' || show !== 'all';

  return (
    <>
      <PageHeader
        title="Discover Student Organizations"
        description="Real UMass Amherst student organizations from their public Campus Pulse listings. Follow the ones you're curious about; listed meeting schedules show up in My Campus Life."
        actions={
          <Link to="/clubs/fit" className="btn btn-primary">
            <CalendarCheck2 size={16} aria-hidden /> Find My Fit
          </Link>
        }
      />

      <div className="space-y-3 rounded border border-line bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <SearchInput
            value={q}
            onChange={(v) => update('q', v, '')}
            label="Search clubs"
            placeholder="Search by name or keyword (e.g. robotics, a cappella, consulting)"
          />
          <div className="flex gap-3">
            <label className="flex-1 sm:w-44 sm:flex-none">
              <span className="sr-only">Show</span>
              <select value={show} onChange={(e) => update('show', e.target.value, 'all')} className="input">
                <option value="all">All clubs</option>
                <option value="following">Following</option>
                <option value="not">Not following</option>
              </select>
            </label>
            <label className="flex-1 sm:w-44 sm:flex-none">
              <span className="sr-only">Sort by</span>
              <select value={sort} onChange={(e) => update('sort', e.target.value, 'name')} className="input">
                <option value="name">Name (A–Z)</option>
                <option value="name-desc">Name (Z–A)</option>
              </select>
            </label>
          </div>
        </div>
        <ChipGroup label="Filter by category" options={categoryOptions} value={cat} onChange={(v) => update('cat', v, 'All')} />
      </div>

      <p className="my-4 text-sm text-ink-soft" aria-live="polite">
        Showing {results.length} of {CLUBS.length} organizations · You follow {followed.length}
      </p>

      {results.length ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((c) => (
            <ClubCard key={c.id} club={c} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={SearchX}
          title="No organizations match"
          action={
            hasFilters && (
              <button type="button" className="btn btn-secondary" onClick={() => setParams({}, { replace: true })}>
                Clear filters
              </button>
            )
          }
        >
          Try a different keyword or category.
        </EmptyState>
      )}
    </>
  );
}
