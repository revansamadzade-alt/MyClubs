import { useNavigate } from 'react-router-dom';
import { Copy, Download, ExternalLink, FileCheck2, Users } from 'lucide-react';
import type { Club, TrackedApplication } from '../types';
import { useStore } from '../context/StoreContext';
import { useToast } from '../context/ToastContext';
import { STATUS_META, STEPS, applicationsClosed, fmtDay, isDemoOrg, statusLabel } from '../lib/applications';
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
    <ol className="mt-3 grid grid-cols-5 gap-1" aria-label={`Progress: step ${step + 1} of ${STEPS.length}, ${statusLabel(app)}`}>
      {STEPS.map((s, i) => (
        <li key={s} className="min-w-0 text-[0.6875rem]">
          <span aria-hidden className={cx('block h-1.5 rounded-full', i <= step ? 'bg-success' : 'bg-line-soft')} />
          <span className={cx('mt-1 block truncate', i === step ? 'font-bold text-ink' : 'text-ink-soft')}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

/** "(required)" / "(optional)" marker for form labels. */
export function FieldTag({ required }: { required?: boolean }) {
  return required ? (
    <span className="text-xs font-bold text-badge">(required)</span>
  ) : (
    <span className="text-xs font-normal text-ink-soft">(optional)</span>
  );
}

/** Copy or download prepared answers as plain text, for pasting into an official application. */
export function AnswerActions({ text, fileName }: { text: string; fileName: string }) {
  const notify = useToast();
  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      ta.remove();
    }
    notify(ok ? 'Answers copied. Paste them into the official application.' : 'Copying is blocked in this browser. Use Download instead.');
  }
  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <button type="button" onClick={copy} className="btn btn-secondary btn-sm">
        <Copy size={14} aria-hidden /> Copy answers
      </button>
      <button type="button" onClick={download} className="btn btn-secondary btn-sm">
        <Download size={14} aria-hidden /> Download (.txt)
      </button>
    </>
  );
}

/** Small "Application required" / "Open membership" tag; nothing when the process isn't listed. */
export function MembershipTag({ club }: { club: Club }) {
  const a = club.application;
  if (!a) return null;
  return a.process === 'required' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#fff4e5] px-2 py-0.5 text-xs font-bold text-warn">
      <FileCheck2 size={12} aria-hidden /> Application required{isDemoOrg(club) && ' (demo)'}
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
  if (isDemoOrg(club))
    return (
      <div className="text-sm">
        <MembershipTag club={club} />
        <p className="mt-2 text-ink">
          Fictional organization for trying the full application journey. It uses sample questions, and nothing is sent anywhere.
        </p>
      </div>
    );
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
 * "Apply" saves the organization to Applications (once, never a duplicate) and opens its application form. Once
 * tracked it becomes "View application". Nothing is ever submitted.
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
        navigate(tracked ? `/clubs/applications/${club.id}` : `/clubs/applications/${club.id}/apply`);
      }}
      className={cx('btn btn-outline', sm)}
    >
      <FileCheck2 size={16} aria-hidden />
      {tracked ? 'View application' : 'Apply'}
      <span className="sr-only">{tracked ? ` for ${club.name}` : ` to ${club.name}: save it to Applications and see how to apply`}</span>
    </button>
  );
}
