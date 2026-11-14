import { Link } from 'react-router-dom';
import { ExternalLink, FileCheck2, Users } from 'lucide-react';
import type { Club, TrackedApplication } from '../types';
import { STATUS_META, STEPS, fmtDay, statusLabel } from '../lib/applications';
import { cx } from '../lib/cx';

export function StatusPill({ app }: { app: TrackedApplication }) {
  const meta = STATUS_META[app.status];
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold" style={{ backgroundColor: meta.soft, color: meta.color }}>
      {statusLabel(app)}
    </span>
  );
}

export function ProgressSteps({ app }: { app: TrackedApplication }) {
  const step = STATUS_META[app.status].step;
  return (
    <ol className="mt-3 grid grid-cols-4 gap-1" aria-label={`Progress: step ${step + 1} of ${STEPS.length}, ${statusLabel(app)}`}>
      {STEPS.map((s, i) => (
        <li key={s} className="min-w-0 text-[0.6875rem]">
          <span aria-hidden className={cx('block h-1.5 rounded-full', i <= step ? 'bg-success' : 'bg-line-soft')} />
          <span className={cx('mt-1 block truncate', i === step ? 'font-bold text-ink' : 'text-ink-soft')}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

/** Small "Application required" / "Open membership" tag; nothing when the process isn't listed. */
export function MembershipTag({ club }: { club: Club }) {
  const a = club.application;
  if (!a) return null;
  return a.process === 'required' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#fff4e5] px-2 py-0.5 text-xs font-bold text-warn">
      <FileCheck2 size={12} aria-hidden /> Application required
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f5ee] px-2 py-0.5 text-xs font-bold text-success">
      <Users size={12} aria-hidden /> Open membership
    </span>
  );
}

/** Verified membership/application information with its quoted source, or an honest "not listed". */
export function MembershipInfo({ club }: { club: Club }) {
  const a = club.application;
  if (!a)
    return (
      <div className="text-sm">
        <p className="font-bold text-ink">Application process not listed</p>
        <p className="mt-1 text-ink-soft">The official listing doesn't say how to join, so MyClubs doesn't assume an application is needed.</p>
      </div>
    );
  return (
    <div className="text-sm">
      <MembershipTag club={club} />
      <blockquote className="mt-2 border-l-2 border-line pl-2 italic text-ink">“{a.evidence}”</blockquote>
      <p className="mt-1 text-xs text-ink-soft">
        From the{' '}
        <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
          official Campus Pulse listing
        </a>
        , checked {fmtDay(a.verifiedOn)}.
      </p>
      {a.process === 'required' && (
        <p className="mt-2 text-ink">
          <strong>Deadline:</strong> {a.deadline ? fmtDay(a.deadline) : 'Deadline not listed'}
        </p>
      )}
    </div>
  );
}

/** "Apply" goes to the organization's official application when published, otherwise to the MyClubs details page. */
export function ApplyButton({ club, size }: { club: Club; size?: 'sm' }) {
  if (club.application?.process !== 'required') return null;
  const cls = cx('btn btn-primary', size === 'sm' && 'btn-sm');
  return club.application.applyUrl ? (
    <a href={club.application.applyUrl} target="_blank" rel="noopener noreferrer" className={cls}>
      Apply <ExternalLink size={14} aria-hidden />
      <span className="sr-only"> to {club.name} (official site, opens in a new tab)</span>
    </a>
  ) : (
    <Link to={`/clubs/applications/${club.id}`} className={cls}>
      Apply<span className="sr-only"> to {club.name}: application details</span>
    </Link>
  );
}
