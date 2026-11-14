import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, ExternalLink, Info, SearchX } from 'lucide-react';
import type { ApplicationStatus, Club, TrackedApplication } from '../../types';
import { CLUB_BY_ID, campusPulseLinks } from '../../data/clubs';
import { useStore } from '../../context/StoreContext';
import { DEMO_ORG, DEMO_ORG_ID, STATUS_META, isHttpUrl, statusLabel } from '../../lib/applications';
import { ApplyButton, MembershipInfo, ProgressSteps, StatusPill } from '../../components/Applications';
import { CategoryTag, ClubAvatar, EmptyState, SampleBadge } from '../../components/ui';
import { useTitle } from '../../hooks/useTitle';

const MAX_NOTES = 2000;
const MAX_ANSWER = 1000;

function Header({ club, back }: { club: Club; back: string }) {
  return (
    <>
      <Link to={back} className="mb-4 inline-flex items-center gap-1.5 text-sm text-link hover:underline">
        <ArrowLeft size={16} aria-hidden /> All applications
      </Link>
      <header className="mb-6 flex flex-wrap items-center gap-4 border-b border-line-soft pb-5">
        <ClubAvatar club={club} />
        <div className="min-w-0 flex-1 basis-60">
          <h1 className="text-[1.75rem] font-bold leading-tight text-ink">{club.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <CategoryTag category={club.category} />
            {club.id !== DEMO_ORG_ID && (
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

function TrackerForm({ club, app }: { club: Club; app: TrackedApplication }) {
  const { saveApplication, removeApplication } = useStore();
  const navigate = useNavigate();
  const [status, setStatus] = useState<ApplicationStatus>(app.status);
  const [link, setLink] = useState(app.link ?? '');
  const [reminder, setReminder] = useState(app.reminder ?? '');
  const [notes, setNotes] = useState(app.notes ?? '');
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
        reminder: reminder || undefined,
        notes: notes.trim() || undefined,
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
        <span className="mt-1 block text-xs text-ink-soft">You update this yourself. MyClubs never submits applications or receives decisions.</span>
      </label>
      {status === 'decision' && (
        <label className="block">
          <span className="mb-1 block text-sm font-bold">Decision (self-reported)</span>
          <input value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} maxLength={120} className="input" placeholder="e.g. Invited to audition" />
        </label>
      )}
      <label className="block">
        <span className="mb-1 block text-sm font-bold">Application link you found</span>
        <input type="url" value={link} onChange={(e) => setLink(e.target.value)} className="input" placeholder="https://" inputMode="url" />
        <span className="mt-1 block text-xs text-ink-soft">Record the organization's official link, e.g. from its Campus Pulse page or website.</span>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-bold">Personal reminder date</span>
        <input type="date" value={reminder} onChange={(e) => setReminder(e.target.value)} className="input sm:w-56" />
        <span className="mt-1 block text-xs text-ink-soft">Your own reminder — not an official deadline.</span>
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-bold">Draft answers &amp; notes</span>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, MAX_NOTES))} rows={5} className="input resize-y" placeholder="Draft your answers or keep notes. Stored only in this browser." />
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

function DemoApplication() {
  const { getApplication, saveApplication } = useStore();
  const app = getApplication(DEMO_ORG_ID);
  const [editing, setEditing] = useState(!app?.demo?.submittedAt);
  const [why, setWhy] = useState(app?.demo?.why ?? '');
  const [experience, setExperience] = useState(app?.demo?.experience ?? '');
  const [activities, setActivities] = useState(app?.demo?.activities ?? '');
  const [error, setError] = useState('');

  const answers = { why: why.trim(), experience: experience.trim(), activities: activities.trim() };
  const saveDraft = () => {
    setError('');
    saveApplication(DEMO_ORG_ID, { status: 'draft', demo: answers }, 'Demo draft saved in this browser.');
  };
  const submit = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!answers.why || !answers.experience || !answers.activities) return setError('Answer all three questions to submit the demo application.');
    setError('');
    saveApplication(DEMO_ORG_ID, { status: 'submitted', demo: { ...answers, submittedAt: new Date().toISOString() } }, 'Demo application submitted — demo only, not sent to the organization.');
    setEditing(false);
  };
  const edit = () => {
    if (app?.demo) saveApplication(DEMO_ORG_ID, { status: 'draft', demo: { ...app.demo, submittedAt: undefined } });
    setEditing(true);
  };

  const fields: [string, string, string, (v: string) => void][] = [
    ['why', 'Why are you interested in joining?', why, setWhy],
    ['experience', 'What relevant experience do you have?', experience, setExperience],
    ['activities', 'What activities would you like to participate in?', activities, setActivities],
  ];

  return (
    <article className="max-w-3xl">
      <Header club={DEMO_ORG} back="/clubs/applications" />
      <div role="note" className="mb-5 flex gap-2 rounded border border-warn/40 bg-warn-soft p-4 text-sm text-ink">
        <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-warn" />
        <div>
          <p className="font-bold text-warn">Demo only — not sent to the organization.</p>
          <p className="mt-1">
            {DEMO_ORG.name} is fictional. Answers are stored only in this browser. Don't enter sensitive personal information.
          </p>
        </div>
      </div>

      {!editing && app?.demo?.submittedAt ? (
        <section aria-labelledby="demo-confirm" className="card p-5">
          <p className="flex items-center gap-2 text-lg font-bold text-success" id="demo-confirm">
            <BadgeCheck size={22} aria-hidden /> Demo application submitted
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {new Date(app.demo.submittedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · Status:{' '}
            <strong className="text-ink">{statusLabel(app)}</strong> · Not sent to the organization.
          </p>
          <ProgressSteps app={app} />
          <dl className="mt-4 space-y-3 text-sm">
            {fields.map(([key, label]) => (
              <div key={key}>
                <dt className="font-bold text-ink">{label}</dt>
                <dd className="mt-0.5 whitespace-pre-line text-ink">{app.demo?.[key as 'why' | 'experience' | 'activities']}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={edit} className="btn btn-secondary">
              Edit draft
            </button>
            <Link to="/clubs/applications" className="btn btn-primary">
              Back to Applications
            </Link>
          </div>
        </section>
      ) : (
        <form onSubmit={submit} className="card space-y-4 p-5" noValidate aria-labelledby="demo-form">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="demo-form" className="font-bold text-ink">
              Demo application <SampleBadge label="Demo only" className="ml-1" />
            </h2>
            {app && <StatusPill app={app} />}
          </div>
          {fields.map(([key, label, value, set]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-sm font-bold">{label}</span>
              <textarea value={value} onChange={(e) => set(e.target.value.slice(0, MAX_ANSWER))} rows={4} className="input resize-y" />
              <span className="mt-1 block text-right text-xs text-ink-soft">
                {value.length}/{MAX_ANSWER}
              </span>
            </label>
          ))}
          {error && (
            <p role="alert" className="text-sm font-bold text-badge">
              {error}
            </p>
          )}
          {app?.status === 'draft' && <p className="text-xs text-ink-soft">Draft saved {new Date(app.updatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={saveDraft} className="btn btn-secondary">
              Save draft
            </button>
            <button type="submit" className="btn btn-primary">
              Submit demo application
            </button>
          </div>
        </form>
      )}
    </article>
  );
}

export default function ApplicationDetail() {
  const { clubId = '' } = useParams();
  const { getApplication, saveApplication } = useStore();
  const club = clubId === DEMO_ORG_ID ? DEMO_ORG : CLUB_BY_ID[clubId];
  useTitle(club ? `${club.name} · Application` : 'Application not found');

  if (clubId === DEMO_ORG_ID) return <DemoApplication />;
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
  const cp = campusPulseLinks(club);

  return (
    <article>
      <Header club={club} back="/clubs/applications" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          {app ? (
            <TrackerForm key={app.updatedAt} club={club} app={app} />
          ) : (
            <div className="card p-5">
              <h2 className="font-bold text-ink">Track this application</h2>
              <p className="mt-1 text-sm text-ink-soft">
                Save {club.name} to your tracker to record a link, a personal reminder and draft notes. Following the club is separate and
                never starts an application.
              </p>
              <button type="button" onClick={() => saveApplication(club.id, {}, `Added ${club.name} to your applications.`)} className="btn btn-primary mt-4">
                Track application
              </button>
            </div>
          )}
        </div>
        <aside className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-2 font-bold text-ink">Membership &amp; applications</h2>
            <MembershipInfo club={club} />
            <div className="mt-3 flex flex-wrap gap-2">
              <ApplyButton club={club} size="sm" />
            </div>
          </div>
          <div className="card p-4 text-sm">
            <h2 className="mb-2 font-bold text-ink">Official sources</h2>
            <a href={cp.page} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-link hover:underline">
              <ExternalLink size={14} aria-hidden /> Campus Pulse page
            </a>
            {club.application?.applyUrl && (
              <a href={club.application.applyUrl} target="_blank" rel="noopener noreferrer" className="mt-1.5 flex items-center gap-1.5 text-link hover:underline">
                <ExternalLink size={14} aria-hidden /> Official application
              </a>
            )}
          </div>
        </aside>
      </div>
    </article>
  );
}
