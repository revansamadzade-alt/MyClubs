import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, ExternalLink, Info, SearchX } from 'lucide-react';
import type { ApplicationForm, Club } from '../../types';
import { useStore } from '../../context/StoreContext';
import { campusPulseLinks } from '../../data/clubs';
import {
  buildForm,
  cleanValues,
  formatAnswers,
  restoreForm,
  validateField,
  validateStep,
  type ApplicationFormDef,
  type FieldDef,
} from '../../lib/applicationForms';
import { applicationsClosed, draftStatus, fmtDay, fmtStamp, isDemoOrg, orgFor, preparedStatus } from '../../lib/applications';
import { AnswerActions, FieldTag, MembershipTag, ProgressSteps, StatusPill } from '../../components/Applications';
import { ResumeUpload } from '../../components/ResumeUpload';
import { CategoryTag, ClubAvatar, EmptyState, SampleBadge } from '../../components/ui';
import { useTitle } from '../../hooks/useTitle';
import { cx } from '../../lib/cx';

const fieldId = (id: string) => `f-${id}`;

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
          {applicationsClosed(club) && <strong className="text-badge"> · Applications closed</strong>} · <strong>Official application:</strong>{' '}
          {a.applyUrl ? (
            <a href={a.applyUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
              Open official application <ExternalLink size={12} aria-hidden />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : (
            'Application link not available'
          )}
        </p>
        <p className="mt-1 text-ink-soft">Use this form to prepare your answers. MyClubs never submits anything; answers stay in this browser.</p>
      </div>
    </div>
  );
}

function Field({ f, value, error, onChange, onBlur }: { f: FieldDef; value: string; error?: string; onChange: (v: string) => void; onBlur: () => void }) {
  const id = fieldId(f.id);
  const describedBy = [f.help && `${id}-help`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  const common = {
    id,
    value,
    onBlur,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy,
    'aria-required': f.required || undefined,
  };
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-bold text-ink">
        {f.official && <span className="mr-1.5 rounded bg-[#eef6fb] px-1.5 py-0.5 text-xs text-link">From the official application</span>}
        {f.label} <FieldTag required={f.required} />
      </label>
      {f.kind === 'textarea' ? (
        <textarea {...common} rows={(f.max ?? 0) >= 1000 ? 6 : 4} maxLength={f.max} onChange={(e) => onChange(e.target.value)} className="input resize-y" />
      ) : f.kind === 'select' ? (
        <select {...common} onChange={(e) => onChange(e.target.value)} className="input">
          <option value="">Choose…</option>
          {f.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          type={f.kind === 'email' ? 'email' : f.kind === 'url' ? 'url' : 'text'}
          inputMode={f.kind === 'url' ? 'url' : f.kind === 'email' ? 'email' : undefined}
          autoComplete={f.autoComplete ?? 'off'}
          placeholder={f.placeholder}
          maxLength={f.max}
          onChange={(e) => onChange(e.target.value)}
          className="input"
        />
      )}
      <div className="mt-1 flex gap-3 text-xs text-ink-soft">
        {f.help && <span id={`${id}-help`}>{f.help}</span>}
        {f.kind === 'textarea' && f.max && (
          <span className="ml-auto shrink-0 tabular-nums" aria-hidden>
            {value.length}/{f.max}
          </span>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm font-bold text-badge">
          {error}
        </p>
      )}
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

function ReviewList({ def, values, resumeName, onEdit }: { def: ApplicationFormDef; values: Record<string, string>; resumeName?: string; onEdit?: (i: number) => void }) {
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
              const v = f.kind === 'file' ? resumeName : values[f.id]?.trim();
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

function Wizard({ club }: { club: Club }) {
  const { getApplication, saveApplication } = useStore();
  const [params] = useSearchParams();
  const def = useMemo(() => buildForm(club), [club]);
  const app = getApplication(club.id);
  const [initial] = useState(() => restoreForm(def, app?.form));
  const REVIEW = def.steps.length;
  const DONE = REVIEW + 1;
  const demo = isDemoOrg(club);

  const [values, setValues] = useState(initial.values);
  const [resume, setResume] = useState(initial.resume);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [step, setStep] = useState(() =>
    params.get('view') === 'review' ? REVIEW : initial.preparedAt && app?.status !== 'draft' ? DONE : Math.min(initial.step, REVIEW),
  );
  const focusTarget = useRef<string | null>(null);

  useEffect(() => {
    if (!focusTarget.current) return;
    document.getElementById(focusTarget.current)?.focus();
    focusTarget.current = null;
  });

  const snapshot = (over: Partial<ApplicationForm> = {}): ApplicationForm => ({
    template: def.template,
    values: cleanValues(def, values),
    step: Math.min(step, REVIEW),
    resume,
    preparedAt: undefined,
    ...over,
  });

  const persist = (over: Partial<ApplicationForm> = {}, message?: string) => {
    saveApplication(club.id, { status: draftStatus(getApplication(club.id)?.status), form: snapshot(over) }, message);
    setDirty(false);
  };

  // Autosave typing after a short pause, and on leaving the page, so a refresh never loses much.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => persist(), 1200);
    return () => clearTimeout(t);
  });
  const leave = useRef<() => void>(() => {});
  leave.current = () => dirty && persist();
  useEffect(() => () => leave.current(), []);

  const setValue = (id: string, v: string) => {
    setValues((p) => ({ ...p, [id]: v }));
    setDirty(true);
    if (errors[id]) setErrors(({ [id]: _, ...rest }) => rest);
  };
  const blur = (f: FieldDef) => {
    if (!values[f.id]?.trim()) return;
    const e = validateField(f, values[f.id]);
    setErrors((p) => {
      const { [f.id]: _, ...rest } = p;
      return e ? { ...rest, [f.id]: e } : rest;
    });
  };

  const goTo = (next: number) => {
    if (dirty) persist({ step: Math.min(next, REVIEW) });
    setErrors({});
    setStep(next);
    focusTarget.current = 'step-heading';
    window.scrollTo({ top: 0 });
  };

  const showErrors = (i: number, errs: Record<string, string>) => {
    setErrors(errs);
    setStep(i);
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
    saveApplication(
      club.id,
      { status: preparedStatus(getApplication(club.id)?.status), form: snapshot({ step: REVIEW, preparedAt: new Date().toISOString() }) },
      'Demo application prepared — not submitted to the organization.',
    );
    setDirty(false);
    setStep(DONE);
    focusTarget.current = 'step-heading';
    window.scrollTo({ top: 0 });
  };

  const onResume = (meta: { name: string; size: number } | undefined) => {
    setResume(meta);
    persist({ resume: meta });
  };

  const labels = [...def.steps.map((s) => s.title), 'Review & finish'];
  const text = formatAnswers(club, def, cleanValues(def, values), resume?.name);
  const fileName = `${club.id}-application-answers.txt`;
  const errorCount = Object.keys(errors).length;
  const cp = demo ? undefined : campusPulseLinks(club);

  const saveBar = (
    <p className="text-xs text-ink-soft" aria-live="polite">
      {dirty ? 'Unsaved changes' : app?.form ? `Draft saved ${fmtStamp(app.updatedAt)} in this browser` : 'Not saved yet'}
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
          {errorCount > 0 && (
            <p role="alert" className="mt-3 rounded border border-badge/40 bg-[#fdeeee] p-3 text-sm font-bold text-badge">
              {errorCount === 1 ? '1 answer needs attention.' : `${errorCount} answers need attention.`}
            </p>
          )}
          <div className="mt-4 space-y-5">
            {def.steps[step].fields.map((f) =>
              f.kind === 'file' ? (
                <ResumeUpload key={f.id} clubId={club.id} label={f.label} help={f.help} value={resume} onChange={onResume} sample={demo} />
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
            <button type="button" onClick={() => persist({}, 'Draft saved in this browser. Nothing was sent.')} className="btn btn-secondary">
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
          <ReviewList def={def} values={cleanValues(def, values)} resumeName={resume?.name} onEdit={goTo} />
          <p className="mt-2 rounded bg-surface p-3 text-sm text-ink">
            Finishing marks this application <strong>Prepared (demo)</strong> in My Applications. Nothing is sent to {club.name}.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-4">
            <button type="button" onClick={() => goTo(REVIEW - 1)} className="btn btn-secondary">
              Previous
            </button>
            <button type="button" onClick={() => persist({}, 'Draft saved in this browser. Nothing was sent.')} className="btn btn-secondary">
              Save draft
            </button>
            <button type="button" onClick={finish} className="btn btn-primary ml-auto">
              Finish Demo Application
            </button>
            <div className="flex w-full flex-wrap gap-2">
              <AnswerActions text={text} fileName={fileName} />
            </div>
          </div>
        </section>
      )}

      {step === DONE && app && (
        <section className="card p-5" aria-labelledby="step-heading">
          <h2 id="step-heading" tabIndex={-1} className="flex items-start gap-2 text-lg font-bold text-success outline-none">
            <BadgeCheck size={24} aria-hidden className="shrink-0" /> Demo application prepared — not submitted to the organization.
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
                <strong>Next step:</strong> apply through {club.name}'s official process (
                <q className="italic">{club.application?.evidence}</q>).{' '}
                {club.application?.applyUrl ? (
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
                . Then mark it “Submitted externally” in My Applications.
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
