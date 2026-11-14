import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, FileText, Info, SearchX } from 'lucide-react';
import type { ApplicationDate, ApplicationDateKind, ApplicationStatus, Club, DecisionOutcome, TrackedApplication } from '../../types';
import { campusPulseLinks } from '../../data/clubs';
import { useStore } from '../../context/StoreContext';
import { DECISION_LABEL, STATUS_META, applicationsClosed, fmtDay, fmtStamp, isDemoOrg, isHttpUrl, orgFor } from '../../lib/applications';
import { DATE_KIND_LABEL, sortedDates } from '../../lib/applicationPlanner';
import { buildForm, formatAnswers, restoreForm } from '../../lib/applicationForms';
import { AnswerActions, MembershipInfo, ProgressSteps, StatusPill } from '../../components/Applications';
import { CategoryTag, ClubAvatar, EmptyState, SampleBadge } from '../../components/ui';
import { useTitle } from '../../hooks/useTitle';

const MAX_NOTES = 2000;

function Header({ club }: { club: Club }) {
  return (
    <>
      <Link to="/clubs/applications" className="mb-4 inline-flex items-center gap-1.5 text-sm text-link hover:underline">
        <ArrowLeft size={16} aria-hidden /> All applications
      </Link>
      <header className="mb-6 flex flex-wrap items-center gap-4 border-b border-line-soft pb-5">
        <ClubAvatar club={club} />
        <div className="min-w-0 flex-1 basis-60">
          <h1 className="text-[1.75rem] font-bold leading-tight text-ink">{club.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <CategoryTag category={club.category} />
            {isDemoOrg(club) ? (
              <SampleBadge label="Demo organization" />
            ) : (
              <Link to={`/clubs/discover/${club.id}`} className="text-link hover:underline">
                View club profile
              </Link>
            )}
          </div>
        </div>
      </header>
    </>
  );
}

/** The in-app questionnaire's progress, with continue / review / export actions. */
function FormCard({ club, app }: { club: Club; app?: TrackedApplication }) {
  const def = useMemo(() => buildForm(club), [club]);
  const saved = app?.form ? restoreForm(def, app.form) : undefined;
  const answered = saved ? Object.keys(saved.values).length : 0;
  const href = `/clubs/applications/${club.id}/apply`;
  return (
    <section className="card p-4" aria-labelledby="form-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="form-heading" className="font-bold text-ink">
          Application form
        </h2>
        <SampleBadge label="Sample questions" />
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        {def.templateLabel} questions in {def.steps.length + 1} steps. {isDemoOrg(club) ? 'Demo only — not sent to the organization.' : 'For preparing your answers; not the official application.'}
      </p>
      {applicationsClosed(club) && (
        <p className="mt-2 text-sm font-bold text-badge">Applications are closed (verified). Your answers stay here for a future cycle.</p>
      )}
      <p className="mt-3 text-sm text-ink">
        {!saved
          ? 'Not started.'
          : saved.preparedAt && app?.status !== 'draft'
            ? `Prepared ${fmtStamp(saved.preparedAt)} — not submitted to the organization.`
            : `Draft: ${answered} answer${answered === 1 ? '' : 's'} saved ${fmtStamp(app!.updatedAt)}.`}
      </p>
      {saved?.resume && (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-ink">
          <FileText size={14} aria-hidden className="text-umass" /> Résumé: {saved.resume.name}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {!saved ? (
          <Link to={href} className="btn btn-primary btn-sm">
            Start application
          </Link>
        ) : saved.preparedAt && app?.status !== 'draft' ? (
          <Link to={`${href}?view=review`} className="btn btn-primary btn-sm">
            Review answers
          </Link>
        ) : (
          <Link to={href} className="btn btn-primary btn-sm">
            Continue application
          </Link>
        )}
        {saved && answered > 0 && <AnswerActions text={formatAnswers(club, def, saved.values, saved.resume?.name)} fileName={`${club.id}-application-answers.txt`} />}
      </div>
    </section>
  );
}

const EMPTY_DATE = { kind: 'reminder' as ApplicationDateKind, date: '', time: '', note: '' };

/** Reminders, interviews and auditions the student enters; they appear in My Campus Life and the Dashboard To Do. */
function DatesEditor({ club, app }: { club: Club; app: TrackedApplication }) {
  const { saveApplication } = useStore();
  const [draft, setDraft] = useState(EMPTY_DATE);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const dates = sortedDates(app);

  const write = (next: ApplicationDate[], message: string) => saveApplication(club.id, { dates: next }, message);
  const submit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return setError('Choose a date.');
    if (draft.time && !/^\d{2}:\d{2}$/.test(draft.time)) return setError('Enter a time like 18:30, or leave it empty.');
    setError('');
    const entry: ApplicationDate = {
      id: editing ?? `d${Date.now().toString(36)}`,
      kind: draft.kind,
      date: draft.date,
      ...(draft.time ? { time: draft.time } : {}),
      ...(draft.note.trim() ? { note: draft.note.trim().slice(0, 120) } : {}),
    };
    const rest = (app.dates ?? []).filter((d) => d.id !== entry.id);
    if (write([...rest, entry], editing ? 'Date updated. It shows in My Campus Life.' : 'Date added. It shows in My Campus Life.')) {
      setDraft(EMPTY_DATE);
      setEditing(null);
    }
  };
  const edit = (d: ApplicationDate) => {
    setEditing(d.id);
    setDraft({ kind: d.kind, date: d.date, time: d.time ?? '', note: d.note ?? '' });
  };
  const remove = (d: ApplicationDate) => write((app.dates ?? []).filter((x) => x.id !== d.id), 'Date deleted.');

  return (
    <section className="card p-4" aria-labelledby="dates-heading">
      <h2 id="dates-heading" className="font-bold text-ink">
        Your dates
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Reminders, and interview or audition times the organization gave you. You enter these yourself; they are not official deadlines or
        bookings. They appear in My Campus Life and the Dashboard To Do.
      </p>
      {dates.length > 0 && (
        <ul className="mt-3 divide-y divide-line-soft text-sm" aria-label="Your application dates">
          {dates.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <strong>{DATE_KIND_LABEL[d.kind]}</strong> · {fmtDay(d.date)}
                {d.time ? ` · ${d.time}` : ''}
                {d.note ? ` · ${d.note}` : ''} <span className="text-ink-soft">(you entered this)</span>
              </span>
              <button type="button" onClick={() => edit(d)} className="btn btn-ghost btn-sm">
                Edit<span className="sr-only"> {DATE_KIND_LABEL[d.kind]} on {d.date}</span>
              </button>
              <button type="button" onClick={() => remove(d)} className="btn btn-ghost btn-sm">
                Delete<span className="sr-only"> {DATE_KIND_LABEL[d.kind]} on {d.date}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} noValidate className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[auto_auto_auto_minmax(0,1fr)] sm:items-end" aria-label={editing ? 'Edit date' : 'Add a date'}>
        <label className="block text-sm">
          <span className="mb-1 block font-bold">Type</span>
          <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as ApplicationDateKind })} className="input" data-testid="date-kind">
            {(Object.keys(DATE_KIND_LABEL) as ApplicationDateKind[]).map((k) => (
              <option key={k} value={k}>
                {DATE_KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-bold">Date</span>
          <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className="input" data-testid="date-date" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-bold">
            Time <span className="font-normal text-ink-soft">(optional)</span>
          </span>
          <input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} className="input" data-testid="date-time" />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-bold">
            Note <span className="font-normal text-ink-soft">(optional)</span>
          </span>
          <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} maxLength={120} className="input" data-testid="date-note" />
        </label>
        {error && (
          <p role="alert" className="text-sm font-bold text-badge sm:col-span-4">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2 sm:col-span-4">
          <button type="submit" className="btn btn-secondary btn-sm">
            {editing ? 'Save date' : 'Add date'}
          </button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setEditing(null);
                setDraft(EMPTY_DATE);
              }}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function TrackerForm({ club, app }: { club: Club; app: TrackedApplication }) {
  const { saveApplication, removeApplication } = useStore();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ApplicationStatus>(app.status);
  const [link, setLink] = useState(app.link ?? '');
  const [notes, setNotes] = useState(app.notes ?? '');
  const [decision, setDecision] = useState<DecisionOutcome>(app.decision ?? 'pending');
  const [decisionNote, setDecisionNote] = useState(app.decisionNote ?? '');
  const [error, setError] = useState('');

  function save(e: { preventDefault: () => void }) {
    e.preventDefault();
    if (link.trim() && !isHttpUrl(link.trim())) return setError('Enter a full web address starting with https://');
    setError('');
    saveApplication(
      club.id,
      {
        status,
        link: link.trim() || undefined,
        notes: notes.trim() || undefined,
        decision: status === 'decision' ? decision : undefined,
        decisionNote: status === 'decision' ? decisionNote.trim() || undefined : undefined,
      },
      'Application tracker saved.',
    );
  }

  return (
    <form onSubmit={save} className="card space-y-4 p-4" noValidate aria-labelledby="tracker-heading">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="tracker-heading" className="font-bold text-ink">
          Your tracker
        </h2>
        <StatusPill app={app} />
      </div>
      <ProgressSteps app={app} />
      <label className="block">
        <span className="mb-1 block text-sm font-bold">Status</span>
        <select value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)} className="input">
          {(Object.keys(STATUS_META) as ApplicationStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-ink-soft">
          You update this yourself. “Submitted externally” means you applied through the organization's own process. MyClubs never submits
          applications or receives decisions.
        </span>
      </label>
      {status === 'decision' && (
        <fieldset className="space-y-3 rounded border border-line-soft p-3">
          <legend className="px-1 text-sm font-bold">Decision (self-reported)</legend>
          <label className="block">
            <span className="mb-1 block text-sm">Outcome</span>
            <select value={decision} onChange={(e) => setDecision(e.target.value as DecisionOutcome)} className="input sm:w-64">
              {(Object.keys(DECISION_LABEL) as DecisionOutcome[]).map((d) => (
                <option key={d} value={d}>
                  {DECISION_LABEL[d]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm">Note (optional)</span>
            <input value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} maxLength={120} className="input" placeholder="e.g. Invited to a second audition" />
          </label>
          <span className="block text-xs text-ink-soft">Only you can see this. Neither the university nor the organization has confirmed it.</span>
        </fieldset>
      )}
      <label className="block">
        <span className="mb-1 block text-sm font-bold">Application link you found</span>
        <input type="url" value={link} onChange={(e) => setLink(e.target.value)} className="input" placeholder="https://" inputMode="url" />
        <span className="mt-1 block text-xs text-ink-soft">Record the organization's official link, e.g. from its Campus Pulse page or website.</span>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-bold">Notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, MAX_NOTES))} rows={4} className="input resize-y" placeholder="Anything to remember. Stored only in this browser." />
        <span className="mt-1 block text-right text-xs text-ink-soft">
          {notes.length}/{MAX_NOTES}
        </span>
      </label>
      {error && (
        <p role="alert" className="text-sm font-bold text-badge">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary">
          Save tracker
        </button>
        <button
          type="button"
          onClick={() => {
            removeApplication(club.id);
            navigate('/clubs/applications');
          }}
          className="btn btn-secondary"
        >
          Remove from tracker
        </button>
      </div>
    </form>
  );
}

export default function ApplicationDetail() {
  const { clubId = '' } = useParams();
  const { getApplication, saveApplication } = useStore();
  const club = orgFor(clubId);
  useTitle(club ? `${club.name} · Application` : 'Application not found');

  if (!club)
    return (
      <EmptyState
        icon={SearchX}
        title="Organization not found"
        action={
          <Link to="/clubs/applications" className="btn btn-primary">
            Back to Applications
          </Link>
        }
      />
    );

  const app = getApplication(club.id);
  const demo = isDemoOrg(club);
  const required = club.application?.process === 'required';
  const closed = applicationsClosed(club);

  return (
    <article>
      <Header club={club} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="card p-4" aria-labelledby="how-heading">
            <h2 id="how-heading" className="mb-2 font-bold text-ink">
              {required ? 'How to apply' : 'Membership & applications'}
            </h2>
            <MembershipInfo club={club} />
            {club.application?.applyUrl && !closed && (
              <a href={club.application.applyUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary mt-3">
                Open official application <ExternalLink size={16} aria-hidden />
                <span className="sr-only"> for {club.name} (opens in a new tab)</span>
              </a>
            )}
            {required && !demo && (
              <p className="mt-3 text-xs text-ink-soft">
                MyClubs never submits applications. Apply through the organization, then update your status here.
              </p>
            )}
          </section>
          {required && <FormCard club={club} app={app} />}
          {app ? (
            <>
              <TrackerForm key={`${app.status}|${app.decision ?? ''}|${app.decisionNote ?? ''}|${app.link ?? ''}|${app.notes ?? ''}`} club={club} app={app} />
              <DatesEditor club={club} app={app} />
            </>
          ) : (
            <div className="card p-5">
              <h2 className="font-bold text-ink">Track this application</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Save {club.name} to your tracker to record a link, a personal reminder and notes. Following the club is separate and never starts an
                application.
              </p>
              <button type="button" onClick={() => saveApplication(club.id, {}, `Added ${club.name} to your applications.`)} className="btn btn-primary mt-4">
                Track application
              </button>
            </div>
          )}
        </div>
        <aside className="space-y-4">
          {demo ? (
            <div className="flex gap-2 rounded border border-warn/40 bg-warn-soft p-4 text-sm text-ink">
              <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-warn" />
              <p>
                <strong>Demo only — not sent to the organization.</strong> {club.name} is fictional. Everything here stays in this browser.
              </p>
            </div>
          ) : (
            <div className="card p-4 text-sm">
              <h2 className="mb-2 font-bold text-ink">Official sources</h2>
              <a href={campusPulseLinks(club).page} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-link hover:underline">
                <ExternalLink size={14} aria-hidden /> Campus Pulse page
              </a>
              {club.application?.applyUrl && (
                <a href={club.application.applyUrl} target="_blank" rel="noopener noreferrer" className="mt-1.5 flex items-center gap-1.5 text-link hover:underline">
                  <ExternalLink size={14} aria-hidden /> Official application
                </a>
              )}
            </div>
          )}
        </aside>
      </div>
    </article>
  );
}
