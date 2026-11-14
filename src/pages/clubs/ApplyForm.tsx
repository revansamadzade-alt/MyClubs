import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, ExternalLink, Info, SearchX, TriangleAlert } from 'lucide-react';
import type { ApplicationForm, Club, ResumeMeta } from '../../types';
import { readStoredApplication, useStore } from '../../context/StoreContext';
import { campusPulseLinks } from '../../data/clubs';
import {
  buildForm,
  cleanValues,
  formatAnswers,
  prefillFromProfile,
  restoreForm,
  templateFor,
  validateField,
  validateStep,
  type ApplicationFormDef,
  type FieldDef,
} from '../../lib/applicationForms';
import { applicationsClosed, draftStatus, fmtDay, fmtStamp, isDemoOrg, orgFor, preparedStatus } from '../../lib/applications';
import { AnswerActions, MembershipTag, ProgressSteps, StatusPill } from '../../components/Applications';
import { Field, fieldId } from '../../components/FormField';
import { ResumeUpload } from '../../components/ResumeUpload';
import { CategoryTag, ClubAvatar, EmptyState, SampleBadge } from '../../components/ui';
import { useTitle } from '../../hooks/useTitle';
import { cx } from '../../lib/cx';

/** Typing is saved this long after the last keystroke; blur, step changes and leaving the page save at once. */
const AUTOSAVE_MS = 400;

type SaveState = 'idle' | 'pending' | 'saved' | 'error' | 'conflict';

export default function ApplyForm() {
  const { clubId = '' } = useParams();
  const club = orgFor(clubId);
  useTitle(club ? `Apply to ${club.name}` : 'Application not found');

  if (!club)
    return (
      <EmptyState icon={SearchX} title="Organization not found" action={<Link to="/clubs/applications" className="btn btn-primary">Back to Applications</Link>} />
    );
  if (club.application?.process !== 'required')
    return (
      <EmptyState
        icon={Info}
        title="No application form for this organization"
        action={
          <Link to={`/clubs/discover/${club.id}`} className="btn btn-primary">
            Back to {club.name}
          </Link>
        }
      >
        Its official listing doesn't say an application is required, so MyClubs doesn't assume one. You can still track it and keep notes.
      </EmptyState>
    );
  return <Wizard key={club.id} club={club} />;
}

function Notice({ club }: { club: Club }) {
  if (isDemoOrg(club))
    return (
      <div role="note" className="mb-5 flex gap-2 rounded border border-warn/40 bg-warn-soft p-4 text-sm text-ink">
        <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-warn" />
        <div>
          <p className="font-bold text-warn">Demo only — not sent to the organization.</p>
          <p className="mt-1">{club.name} is fictional. Answers are stored only in this browser. Don't enter sensitive personal information.</p>
        </div>
      </div>
    );
  const a = club.application!;
  const closed = applicationsClosed(club);
  return (
    <div role="note" className="mb-5 flex gap-2 rounded border border-[#b3d7ee] bg-[#eef6fb] p-4 text-sm text-ink">
      <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-link" />
      <div className="min-w-0">
        <p className="font-bold">Sample application questions — not {club.name}'s official application.</p>
        <p className="mt-1">
          Official process, from the{' '}
          <a href={a.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
            Campus Pulse listing
          </a>
          : <q className="italic">{a.evidence}</q>
        </p>
        <p className="mt-1">
          <strong>Deadline:</strong> {a.deadline ? fmtDay(a.deadline) : 'Deadline not listed'}
          {closed && <strong className="text-badge"> · Applications closed (verified)</strong>}
          {templateFor(club) === 'audition' && (
            <>
              {' '}
              · <strong>Auditions:</strong> {a.auditionInfo ?? 'Audition schedule not listed'}
            </>
          )}{' '}
          · <strong>Official application:</strong>{' '}
          {closed ? (
            'closed'
          ) : a.applyUrl ? (
            <a href={a.applyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
              Open official application <ExternalLink size={12} aria-hidden />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            'Application link not available'
          )}
        </p>
        <p className="mt-1 text-ink-soft">
          Use this form to prepare your answers. MyClubs never submits anything; answers stay in this browser. Following a club is not membership,
          and finishing this form doesn't apply for you.
        </p>
      </div>
    </div>
  );
}

function Stepper({ labels, current }: { labels: string[]; current: number }) {
  return (
    <ol aria-label="Application steps" className="mb-6 flex gap-2">
      {labels.map((l, i) => (
        <li key={l} aria-current={i === current ? 'step' : undefined} className="min-w-0 flex-1">
          <span aria-hidden className={cx('block h-1.5 rounded-full', i < current ? 'bg-success' : i === current ? 'bg-link' : 'bg-line-soft')} />
          <span className={cx('mt-1.5 block truncate text-xs', i === current ? 'font-bold text-ink' : 'text-ink-soft')}>
            {i < current && <span className="sr-only">Completed: </span>}
            {i + 1}
            <span className="hidden sm:inline">. {l}</span>
            <span className="sr-only sm:hidden">. {l}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

const resumeText = (r?: ResumeMeta) =>
  r ? `${r.name}${r.stored === false ? ' (this visit only; not stored)' : r.source === 'default' ? ' (your saved résumé)' : ''}` : undefined;

function ReviewList({ def, values, resume, onEdit }: { def: ApplicationFormDef; values: Record<string, string>; resume?: ResumeMeta; onEdit?: (i: number) => void }) {
  return (
    <div className="divide-y divide-line-soft">
      {def.steps.map((s, i) => (
        <section key={s.id} aria-labelledby={`review-${s.id}`} className="py-4 first:pt-0">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 id={`review-${s.id}`} className="font-bold text-ink">
              {s.title}
            </h3>
            {onEdit && (
              <button type="button" onClick={() => onEdit(i)} className="btn btn-ghost btn-sm">
                Edit<span className="sr-only"> {s.title}</span>
              </button>
            )}
          </div>
          <dl className="space-y-2 text-sm">
            {s.fields.map((f) => {
              const v = f.kind === 'file' ? resumeText(resume) : values[f.id]?.trim();
              return (
                <div key={f.id}>
                  <dt className="text-ink-soft">{f.label}</dt>
                  <dd className={cx('whitespace-pre-line break-words', v ? 'text-ink' : 'italic text-ink-soft')}>
                    {v || (f.kind === 'file' ? 'No résumé attached' : 'Not provided')}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ))}
    </div>
  );
}

/** Announces this form to other tabs showing the same application, and counts the other tabs that have it open. */
function useOtherTabs(clubId: string): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const tab = Math.random().toString(36).slice(2);
    const channel = new BroadcastChannel('myclubs-apply');
    const others = new Set<string>();
    channel.onmessage = (e: MessageEvent) => {
      const m = e.data as { type?: string; clubId?: string; tab?: string } | null;
      if (!m || m.clubId !== clubId || !m.tab || m.tab === tab) return;
      if (m.type === 'hello') {
        others.add(m.tab);
        channel.postMessage({ type: 'here', clubId, tab });
      } else if (m.type === 'here') others.add(m.tab);
      else if (m.type === 'bye') others.delete(m.tab);
      setCount(others.size);
    };
    channel.postMessage({ type: 'hello', clubId, tab });
    const bye = () => channel.postMessage({ type: 'bye', clubId, tab });
    window.addEventListener('pagehide', bye);
    return () => {
      bye();
      window.removeEventListener('pagehide', bye);
      channel.close();
    };
  }, [clubId]);
  return count;
}

function Wizard({ club }: { club: Club }) {
  const { getApplication, saveApplication, profile } = useStore();
  const [params] = useSearchParams();
  const def = useMemo(() => buildForm(club), [club]);
  const app = getApplication(club.id);
  const REVIEW = def.steps.length;
  const DONE = REVIEW + 1;
  const demo = isDemoOrg(club);
  const closed = applicationsClosed(club);

  const [initial] = useState(() => {
    const restored = restoreForm(def, app?.form);
    // A new application starts from the applicant profile; saved answers are never replaced by it.
    const prefill = app?.form ? {} : prefillFromProfile(def, profile);
    return { ...restored, values: { ...prefill, ...restored.values }, prefilled: Object.keys(prefill).length > 0, rev: app?.form?.rev ?? 0 };
  });
  const [values, setValues] = useState(initial.values);
  const [resume, setResume] = useState<ResumeMeta | undefined>(initial.resume);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [step, setStep] = useState(() =>
    params.get('view') === 'review' ? REVIEW : initial.preparedAt && app?.status !== 'draft' ? DONE : Math.min(initial.step, REVIEW),
  );
  const [save, setSave] = useState<SaveState>(app?.form ? 'saved' : 'idle');
  const [savedAt, setSavedAt] = useState<string | undefined>(app?.form ? app.updatedAt : undefined);
  const [notice, setNotice] = useState('');
  const otherTabs = useOtherTabs(club.id);

  // Mirrors of the latest state for event handlers that run outside React (pagehide, timers).
  const valuesRef = useRef(values);
  const resumeRef = useRef(resume);
  const stepRef = useRef(step);
  const dirty = useRef(false);
  const conflict = useRef(false);
  const baseRev = useRef(initial.rev);
  const timer = useRef<number | undefined>(undefined);
  const focusTarget = useRef<string | null>(null);

  useEffect(() => {
    if (!focusTarget.current) return;
    document.getElementById(focusTarget.current)?.focus();
    focusTarget.current = null;
  });

  /**
   * Writes the answers now (synchronously, to localStorage). Refuses to overwrite answers another tab saved since
   * this tab last loaded or saved them: that becomes a visible conflict instead of a silent overwrite.
   */
  const flush = useCallback(
    (over?: Partial<ApplicationForm>, message?: string): boolean => {
      window.clearTimeout(timer.current);
      if (conflict.current) return false;
      if (!dirty.current && !over && !message) return true;
      const stored = readStoredApplication(club.id);
      const storedRev = stored?.form?.rev ?? 0;
      if (storedRev > baseRev.current) {
        conflict.current = true;
        setSave('conflict');
        return false;
      }
      const r = resumeRef.current;
      const form: ApplicationForm = {
        template: def.template,
        values: cleanValues(def, valuesRef.current),
        step: Math.min(stepRef.current, REVIEW),
        // A résumé the browser couldn't store is not recorded, so a refresh never claims a file that's gone.
        resume: r && r.stored !== false ? { name: r.name, size: r.size, ...(r.source ? { source: r.source } : {}) } : undefined,
        preparedAt: undefined,
        ...over,
        rev: storedRev + 1,
      };
      const status = form.preparedAt ? preparedStatus(stored?.status) : draftStatus(stored?.status);
      const ok = saveApplication(club.id, { status, form }, message);
      if (ok) {
        baseRev.current = storedRev + 1;
        dirty.current = false;
        setSave('saved');
        setSavedAt(new Date().toISOString());
      } else setSave('error');
      return ok;
    },
    [club.id, def, REVIEW, saveApplication],
  );

  const schedule = () => {
    dirty.current = true;
    if (conflict.current) return;
    setSave('pending');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flush(), AUTOSAVE_MS);
  };

  // Save before the page is hidden, refreshed, closed or left. localStorage writes are synchronous, so this lands.
  useEffect(() => {
    const now = () => void flush();
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', now);
    window.addEventListener('beforeunload', now);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', now);
      window.removeEventListener('beforeunload', now);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, [flush]);

  const loadStored = useCallback(() => {
    const stored = readStoredApplication(club.id);
    const r = restoreForm(def, stored?.form);
    valuesRef.current = r.values;
    resumeRef.current = r.resume;
    setValues(r.values);
    setResume(r.resume);
    setErrors({});
    baseRev.current = stored?.form?.rev ?? 0;
    conflict.current = false;
    dirty.current = false;
    window.clearTimeout(timer.current);
    setSave(stored?.form ? 'saved' : 'idle');
    setSavedAt(stored?.updatedAt);
  }, [club.id, def]);

  // Another tab saved newer answers: take them if nothing here is unsaved, otherwise ask.
  const storedRev = app?.form?.rev ?? 0;
  useEffect(() => {
    if (storedRev <= baseRev.current) return;
    if (!dirty.current) {
      loadStored();
      setNotice('Loaded the latest answers saved in another tab.');
    } else {
      conflict.current = true;
      setSave('conflict');
    }
  }, [storedRev, loadStored]);

  const keepMine = () => {
    baseRev.current = readStoredApplication(club.id)?.form?.rev ?? 0;
    conflict.current = false;
    dirty.current = true;
    flush(undefined, 'Kept the answers from this tab.');
  };
  const takeTheirs = () => {
    loadStored();
    setNotice('Loaded the answers saved in the other tab. Your unsaved edits here were discarded.');
  };

  const setValue = (id: string, v: string) => {
    const next = { ...valuesRef.current, [id]: v };
    valuesRef.current = next;
    setValues(next);
    if (errors[id]) setErrors(({ [id]: _, ...rest }) => rest);
    schedule();
  };
  const blur = (f: FieldDef) => {
    if (dirty.current) flush();
    if (!values[f.id]?.trim()) return;
    const e = validateField(f, values[f.id]);
    setErrors((p) => {
      const { [f.id]: _, ...rest } = p;
      return e ? { ...rest, [f.id]: e } : rest;
    });
  };

  const fillFromProfile = () => {
    const fill = prefillFromProfile(def, profile);
    const next = { ...valuesRef.current };
    let n = 0;
    for (const [k, v] of Object.entries(fill))
      if (!next[k]?.trim()) {
        next[k] = v;
        n++;
      }
    valuesRef.current = next;
    setValues(next);
    setNotice(n ? `Filled ${n} empty field${n === 1 ? '' : 's'} from your applicant profile. Nothing you typed was changed.` : 'No empty fields to fill from your profile.');
    if (n) schedule();
  };

  const goTo = (next: number) => {
    stepRef.current = next;
    if (dirty.current) flush({ step: Math.min(next, REVIEW) });
    setErrors({});
    setStep(next);
    focusTarget.current = 'step-heading';
    window.scrollTo({ top: 0 });
  };

  const showErrors = (i: number, errs: Record<string, string>) => {
    setErrors(errs);
    setStep(i);
    stepRef.current = i;
    focusTarget.current = fieldId(def.steps[i].fields.find((f) => errs[f.id])!.id);
  };

  const next = () => {
    const errs = validateStep(def.steps[step], values);
    if (Object.keys(errs).length) return showErrors(step, errs);
    goTo(step + 1);
  };

  const finish = () => {
    for (let i = 0; i < def.steps.length; i++) {
      const errs = validateStep(def.steps[i], values);
      if (Object.keys(errs).length) return showErrors(i, errs);
    }
    const ok = flush(
      { step: REVIEW, preparedAt: new Date().toISOString() },
      demo ? 'Demo application prepared — not submitted to the organization.' : 'Answers prepared — not submitted to the organization.',
    );
    if (!ok) return;
    stepRef.current = DONE;
    setStep(DONE);
    focusTarget.current = 'step-heading';
    window.scrollTo({ top: 0 });
  };

  const onResume = (meta: ResumeMeta | undefined) => {
    resumeRef.current = meta;
    setResume(meta);
    dirty.current = true;
    flush();
  };

  const labels = [...def.steps.map((s) => s.title), 'Review & finish'];
  const text = formatAnswers(club, def, cleanValues(def, values), resume?.name);
  const fileName = `${club.id}-application-answers.txt`;
  const errorCount = Object.keys(errors).length;
  const cp = demo ? undefined : campusPulseLinks(club);
  const finishLabel = demo ? 'Finish Demo Application' : 'Finish — mark answers prepared';
  const doneHeading = demo ? 'Demo application prepared — not submitted to the organization.' : 'Answers prepared — not submitted to the organization.';

  const saveText: Record<SaveState, string> = {
    idle: 'Not saved yet',
    pending: 'Saving…',
    saved: savedAt ? `Saved in this browser at ${new Date(savedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Saved in this browser',
    error: "Not saved — this browser's storage is full or blocked",
    conflict: 'Not saved — this application changed in another tab',
  };
  const saveBar = (
    <p className={cx('text-xs', save === 'error' || save === 'conflict' ? 'font-bold text-badge' : 'text-ink-soft')} aria-live="polite" data-testid="save-state">
      {saveText[save]}
    </p>
  );

  return (
    <article className="max-w-3xl">
      <Link to={`/clubs/applications/${club.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-link hover:underline">
        <ArrowLeft size={16} aria-hidden /> Application overview
      </Link>
      <header className="mb-5 flex flex-wrap items-center gap-4">
        <ClubAvatar club={club} />
        <div className="min-w-0 flex-1 basis-60">
          <h1 className="text-[1.75rem] font-bold leading-tight text-ink">Apply to {club.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <CategoryTag category={club.category} />
            <MembershipTag club={club} />
            <SampleBadge label="Sample application questions" />
          </div>
        </div>
      </header>
      <Notice club={club} />

      {save === 'conflict' && (
        <div role="alert" className="mb-5 rounded border border-badge/40 bg-[#fdeeee] p-4 text-sm text-ink" data-testid="conflict">
          <p className="flex items-center gap-2 font-bold text-badge">
            <TriangleAlert size={18} aria-hidden /> This application was changed in another tab.
          </p>
          <p className="mt-1">Your latest edits here are not saved yet, so nothing was overwritten. Choose which version to keep.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={takeTheirs} className="btn btn-secondary btn-sm">
              Load the other tab's version
            </button>
            <button type="button" onClick={keepMine} className="btn btn-primary btn-sm">
              Keep this tab's version
            </button>
          </div>
        </div>
      )}
      {otherTabs > 0 && save !== 'conflict' && (
        <p role="status" className="mb-4 rounded bg-surface p-3 text-sm text-ink" data-testid="other-tab">
          This application is also open in another tab. Saved answers sync between tabs; if both tabs change it at once, you'll choose which
          version to keep.
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 rounded bg-[#eef6fb] p-3 text-sm text-ink" data-testid="form-notice">
          {notice}
        </p>
      )}
      {closed && (
        <p className="mb-4 rounded bg-surface p-3 text-sm text-ink">
          Applications are closed (verified). You can keep your answers here for a future application cycle.
        </p>
      )}

      <Stepper labels={labels} current={step} />

      {step < REVIEW && (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            next();
          }}
          className="card p-5"
          aria-labelledby="step-heading"
        >
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
            Step {step + 1} of {labels.length}
          </p>
          <h2 id="step-heading" tabIndex={-1} className="mb-1 text-xl font-bold text-ink outline-none">
            {def.steps[step].title}
          </h2>
          {def.steps[step].id === 'questions' && <p className="mb-1 text-sm text-ink-soft">Sample questions for {def.templateLabel.toLowerCase()} organizations.</p>}
          {def.steps[step].id === 'personal' && (
            <p className="mb-1 text-sm text-ink-soft">Only what an organization would reasonably ask. Nothing sensitive, and nothing leaves this browser.</p>
          )}
          {def.steps[step].id === 'personal' && initial.prefilled && (
            <p className="mt-2 text-sm text-ink" data-testid="prefilled">
              Filled in from{' '}
              <Link to="/clubs/applications/profile" className="text-link hover:underline">
                your applicant profile
              </Link>
              . Changes here apply only to this application.
            </p>
          )}
          {profile && !initial.prefilled && (
            <button type="button" onClick={fillFromProfile} className="btn btn-ghost btn-sm mt-2">
              Fill empty fields from my profile
            </button>
          )}
          {errorCount > 0 && (
            <p role="alert" className="mt-3 rounded border border-badge/40 bg-[#fdeeee] p-3 text-sm font-bold text-badge">
              {errorCount === 1 ? '1 answer needs attention.' : `${errorCount} answers need attention.`}
            </p>
          )}
          <div className="mt-4 space-y-5">
            {def.steps[step].fields.map((f) =>
              f.kind === 'file' ? (
                <ResumeUpload
                  key={f.id}
                  storageKey={club.id}
                  label={f.label}
                  help={f.help}
                  value={resume}
                  onChange={onResume}
                  sample={demo}
                  defaultResume={profile?.resume}
                />
              ) : (
                <Field key={f.id} f={f} value={values[f.id] ?? ''} error={errors[f.id]} onChange={(v) => setValue(f.id, v)} onBlur={() => blur(f)} />
              ),
            )}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
            {step > 0 && (
              <button type="button" onClick={() => goTo(step - 1)} className="btn btn-secondary">
                Previous
              </button>
            )}
            <button type="button" onClick={() => flush(undefined, 'Draft saved in this browser. Nothing was sent.')} className="btn btn-secondary">
              Save draft
            </button>
            <button type="submit" className="btn btn-primary ml-auto">
              Next
            </button>
            <div className="w-full">{saveBar}</div>
          </div>
        </form>
      )}

      {step === REVIEW && (
        <section className="card p-5" aria-labelledby="step-heading">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-soft">
            Step {labels.length} of {labels.length}
          </p>
          <h2 id="step-heading" tabIndex={-1} className="mb-4 text-xl font-bold text-ink outline-none">
            Review your answers
          </h2>
          <ReviewList def={def} values={cleanValues(def, values)} resume={resume} onEdit={goTo} />
          <p className="mt-2 rounded bg-surface p-3 text-sm text-ink">
            {demo ? (
              <>
                Finishing marks this demo application <strong>Prepared (demo) — not submitted</strong>. Nothing is sent anywhere.
              </>
            ) : (
              <>
                Finishing marks your answers <strong>prepared</strong> in My Applications. Nothing is sent to {club.name}: apply through the
                organization's official process, then mark it “Submitted externally” yourself.
              </>
            )}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
            <button type="button" onClick={() => goTo(REVIEW - 1)} className="btn btn-secondary">
              Previous
            </button>
            <button type="button" onClick={() => flush(undefined, 'Draft saved in this browser. Nothing was sent.')} className="btn btn-secondary">
              Save draft
            </button>
            <button type="button" onClick={finish} className="btn btn-primary ml-auto">
              {finishLabel}
            </button>
            <div className="flex w-full flex-wrap gap-2">
              <AnswerActions text={text} fileName={fileName} />
            </div>
            <div className="w-full">{saveBar}</div>
          </div>
        </section>
      )}

      {step === DONE && app && (
        <section className="card p-5" aria-labelledby="step-heading">
          <h2 id="step-heading" tabIndex={-1} className="flex items-start gap-2 text-lg font-bold text-success outline-none">
            <BadgeCheck size={24} aria-hidden className="shrink-0" /> {doneHeading}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
            <StatusPill app={app} />
            {app.form?.preparedAt && <span>Prepared {fmtStamp(app.form.preparedAt)}</span>}
          </div>
          <ProgressSteps app={app} />
          <div className="mt-4 rounded bg-surface p-3 text-sm text-ink">
            {demo ? (
              <p>
                {club.name} is fictional, so nothing was sent anywhere. For a real organization, you would now apply through its official process and
                update your status in My Applications.
              </p>
            ) : (
              <p>
                <strong>Next step:</strong> apply through {club.name}'s official process (<q className="italic">{club.application?.evidence}</q>).{' '}
                {closed ? (
                  'Applications are closed right now (verified).'
                ) : club.application?.applyUrl ? (
                  <a href={club.application.applyUrl} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                    Open the official application
                  </a>
                ) : (
                  <>
                    Application link not available —{' '}
                    <a href={cp?.page} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                      contact them on Campus Pulse
                    </a>
                  </>
                )}
                . “Submitted externally” is a status you set yourself in My Applications once you have applied.
              </p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/clubs/applications" className="btn btn-primary">
              View in My Applications
            </Link>
            <button type="button" onClick={() => goTo(REVIEW)} className="btn btn-secondary">
              Review answers
            </button>
            <button type="button" onClick={() => goTo(0)} className="btn btn-secondary">
              Edit answers
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <AnswerActions text={text} fileName={fileName} />
          </div>
        </section>
      )}
    </article>
  );
}
