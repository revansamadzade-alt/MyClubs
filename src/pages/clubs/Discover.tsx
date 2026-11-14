import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarCheck2, SearchX } from 'lucide-react';
import { DataSources } from '../../components/DataSources';
import type { Category } from '../../types';
import { CATEGORIES, CLUBS } from '../../data/clubs';
import { useStore } from '../../context/StoreContext';
import { ClubCard, DemoOrgCard } from '../../components/ClubCard';
import { ChipGroup, EmptyState, PageHeader, SampleBadge, SearchInput } from '../../components/ui';
import { useTitle } from '../../hooks/useTitle';

type Show = 'all' | 'following' | 'not';

/** Lower-cased search text per organization, built once instead of on every keystroke. */
const HAYSTACK = new Map(
  CLUBS.map((c) => [c.id, [c.name, c.summary, c.about, c.category, c.location ?? '', c.scheduleNote ?? '', ...c.tags].join(' ').toLowerCase()]),
);
type Process = 'any' | 'required' | 'open' | 'unknown';
type Sort = 'name' | 'name-desc';

export default function Discover() {
  useTitle('Discover');
  const [params, setParams] = useSearchParams();
  const { followed } = useStore();

  const q = params.get('q') ?? '';
  const cat = (params.get('cat') ?? 'All') as Category | 'All';
  const show = (params.get('show') ?? 'all') as Show;
  const sort = (params.get('sort') ?? 'name') as Sort;
  const process = (params.get('process') ?? 'any') as Process;

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
      if (process !== 'any' && (c.application?.process ?? 'unknown') !== process) return false;
      const hay = HAYSTACK.get(c.id) ?? '';
      return terms.every((t) => hay.includes(t));
    }).sort((a, b) => (sort === 'name-desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)));
  }, [q, cat, show, sort, process, followed]);

  const processCount = (p: Process) => CLUBS.filter((c) => (c.application?.process ?? 'unknown') === p).length;
  const processOptions: { value: Process; label: string; count?: number }[] = [
    { value: 'any', label: 'Any membership process' },
    { value: 'required', label: 'Application required', count: processCount('required') },
    { value: 'open', label: 'Open membership', count: processCount('open') },
    { value: 'unknown', label: 'Process not listed', count: processCount('unknown') },
  ];

  const categoryOptions = [
    { value: 'All' as const, label: 'All', count: CLUBS.length },
    ...CATEGORIES.filter((c) => CLUBS.some((x) => x.category === c)).map((c) => ({
      value: c,
      label: c,
      count: CLUBS.filter((x) => x.category === c).length,
    })),
  ];

  const hasFilters = q || cat !== 'All' || show !== 'all' || process !== 'any';

  return (
    <>
      <PageHeader
        title="Discover Student Organizations"
        description="Real UMass Amherst student organizations from public Campus Pulse pages and its public events feed. Follow the ones you're curious about; listed meeting schedules and verified events show up in My Campus Life."
        actions={
          <Link to="/clubs/fit" className="btn btn-primary">
            <CalendarCheck2 size={16} aria-hidden /> Find My Fit
          </Link>
        }
      />
      <DataSources ids={['campus-pulse-orgs', 'campus-pulse-rss']} what="Organization directory" />

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
        <ChipGroup label="Filter by membership process" options={processOptions} value={process} onChange={(v) => update('process', v, 'any')} />
        <ChipGroup label="Filter by category" options={categoryOptions} value={cat} onChange={(v) => update('cat', v, 'All')} />
      </div>

      <p className="my-4 text-sm text-ink-soft" aria-live="polite">
        Showing {results.length} of {CLUBS.length} organizations · You follow {followed.length}
      </p>

      <h2 className="sr-only">Organizations</h2>
      {results.length ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {results.map((c) => (
            <ClubCard key={c.id} club={c} />
          ))}
        </div>
      ) : null}
      {!results.length && (
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

      {process === 'required' && !q && cat === 'All' && show === 'all' && (
        <section aria-labelledby="demo-org-heading" className="mt-8">
          <h2 id="demo-org-heading" className="section-title flex flex-wrap items-center gap-2">
            Try the full application journey <SampleBadge label="Demo organization" />
          </h2>
          <p className="mb-4 text-sm text-ink-soft">
            This organization is fictional. Use it to try every step of an application, including a résumé. Nothing is sent anywhere.
          </p>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            <DemoOrgCard />
          </div>
        </section>
      )}
    </>
  );
}
