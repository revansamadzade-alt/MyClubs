import { Database, TriangleAlert } from 'lucide-react';
import { DATA_SOURCES } from '../data/sources';

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'never';

/** Honest provenance note: which public sources, how many records, and when each last updated. Never claims "live". */
export function DataSources({ ids, what }: { ids: string[]; what: string }) {
  const sources = DATA_SOURCES.filter((s) => ids.includes(s.id));
  if (!sources.length) return null;
  return (
    <aside aria-label="Data sources" className="mb-4 rounded-md border border-line-soft bg-surface px-3 py-2 text-xs text-ink-soft">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
        <Database size={13} aria-hidden className="shrink-0" />
        <span>
          <strong className="text-ink">{what}: snapshot, not live.</strong> From{' '}
          {sources.map((s, i) => (
            <span key={s.id}>
              {i > 0 && (i === sources.length - 1 ? ' and ' : ', ')}
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                {s.name}
              </a>{' '}
              ({s.count}, updated {when(s.updatedAt)})
            </span>
          ))}
          . Refreshed with <code>npm run sync:data</code>.
        </span>
      </p>
      {sources
        .filter((s) => !s.ok)
        .map((s) => (
          <p key={s.id} className="mt-1 flex items-center gap-1.5 text-warn">
            <TriangleAlert size={13} aria-hidden /> Last update of {s.name} failed ({s.error}); showing data from {when(s.updatedAt)}.
          </p>
        ))}
    </aside>
  );
}
