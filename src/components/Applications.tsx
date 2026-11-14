import { useNavigate } from 'react-router-dom';
import { ExternalLink, FileCheck2, Users } from 'lucide-react';
import type { Club, TrackedApplication } from '../types';
import { useStore } from '../context/StoreContext';
import { STATUS_META, STEPS, applicationsClosed, fmtDay, statusLabel } from '../lib/applications';
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
        <dl className="mt-2 space-y-1 text-ink">
          <div>
            <dt className="inline font-bold">Deadline: </dt>
            <dd className="inline">
              {a.deadline && applicationsClosed(club) ? (
                <>
                  <strong className="text-badge">Applications closed</strong> (deadline was {fmtDay(a.deadline)})
                </>
              ) : a.deadline ? (
                fmtDay(a.deadline)
              ) : (
                'Deadline not listed'
              )}
            </dd>
          </div>
          <div>
            <dt className="inline font-bold">Official application: </dt>
            <dd className="inline">
              {a.applyUrl ? (
                <a href={a.applyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
                  Open official application <ExternalLink size={13} aria-hidden />
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              ) : (
                'Application link not available'
              )}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

/**
 * "Apply" saves the organization to Applications (once, never a duplicate) and opens its application page, which
 * offers the official application link when one is published. Nothing is ever submitted.
 */
export function ApplyButton({ club, size }: { club: Club; size?: 'sm' }) {
  const { getApplication, saveApplication } = useStore();
  const navigate = useNavigate();
  if (club.application?.process !== 'required') return null;
  const sm = size === 'sm' && 'btn-sm';
  const tracked = !!getApplication(club.id);
  if (!tracked && applicationsClosed(club))
    return (
      <button type="button" disabled className={cx('btn btn-secondary cursor-not-allowed opacity-60', sm)}>
        Applications closed<span className="sr-only"> for {club.name}</span>
      </button>
    );
  return (
    <button
      type="button"
      onClick={() => {
        if (!tracked) saveApplication(club.id, {}, `Added ${club.name} to Applications. Nothing was submitted.`);
        navigate(`/clubs/applications/${club.id}`);
      }}
      className={cx('btn btn-outline', sm)}
    >
      <FileCheck2 size={16} aria-hidden />
      {tracked ? 'View application' : 'Apply'}
      <span className="sr-only">{tracked ? ` for ${club.name}` : ` to ${club.name}: save it to Applications and see how to apply`}</span>
    </button>
  );
}
