import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, ExternalLink } from 'lucide-react';
import type { TrackedApplication } from '../../types';
import { CLUBS } from '../../data/clubs';
import { useStore } from '../../context/StoreContext';
import { DEMO_ORG, DEMO_ORG_ID, fmtDay, orgFor } from '../../lib/applications';
import { MembershipTag, ProgressSteps, StatusPill } from '../../components/Applications';
import { ClubAvatar, EmptyState, PageHeader, SampleBadge } from '../../components/ui';
import { useTitle } from '../../hooks/useTitle';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-ink-soft">{label}</dt>
      <dd className="min-w-0 text-ink">{children}</dd>
    </div>
  );
}

function ApplicationCard({ app }: { app: TrackedApplication }) {
  const { removeApplication } = useStore();
  const club = orgFor(app.clubId)!;
  const official = club.application?.applyUrl;
  return (
    <article className="card flex flex-col p-4" aria-labelledby={`app-${club.id}`}>
      <div className="flex items-start gap-3">
        <ClubAvatar club={club} size="sm" />
        <div className="min-w-0 flex-1">
          <h3 id={`app-${club.id}`} className="font-bold leading-snug">
            <Link to={`/clubs/applications/${club.id}`} className="text-link hover:underline">
              {club.name}
            </Link>
          </h3>
          <div className="mt-1 flex flex-wrap gap-2">
            <StatusPill app={app} />
            <MembershipTag club={club} />
          </div>
        </div>
      </div>
      <ProgressSteps app={app} />
      <dl className="mt-3 space-y-1 text-sm">
        <Row label="Deadline">{club.application?.deadline ? fmtDay(club.application.deadline) : 'Deadline not listed'}</Row>
        {app.reminder && (
          <Row label="Reminder">
            {fmtDay(app.reminder)} <span className="text-ink-soft">(you entered this)</span>
          </Row>
        )}
        <Row label="Link">
          {official ? (
            <a href={official} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
              Official application <ExternalLink size={12} aria-hidden />
            </a>
          ) : app.link ? (
            <a href={app.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
              Link you saved <ExternalLink size={12} aria-hidden />
            </a>
          ) : (
            <span className="text-ink-soft">No link saved</span>
          )}
        </Row>
        {app.decisionNote && <Row label="Decision">{app.decisionNote} (self-reported)</Row>}
        {app.notes && <Row label="Notes">{app.notes.length > 90 ? `${app.notes.slice(0, 90)}…` : app.notes}</Row>}
      </dl>
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <Link to={`/clubs/applications/${club.id}`} className="btn btn-primary btn-sm">
          Open<span className="sr-only"> {club.name} application</span>
        </Link>
        <button type="button" onClick={() => removeApplication(club.id)} className="btn btn-secondary btn-sm">
          Remove<span className="sr-only"> {club.name} from tracker</span>
        </button>
      </div>
    </article>
  );
}

export default function Applications() {
  useTitle('Applications');
  const { applications } = useStore();
  const demo = applications.find((a) => a.clubId === DEMO_ORG_ID);
  const tracked = applications.filter((a) => a.clubId !== DEMO_ORG_ID && orgFor(a.clubId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const requiredCount = CLUBS.filter((c) => c.application?.process === 'required').length;

  return (
    <>
      <PageHeader
        title="Applications"
        description="Track organizations you want to apply to. Statuses are self-reported: MyClubs never sends applications to organizations or hears back from them."
        actions={
          <Link to="/clubs/discover?process=required" className="btn btn-secondary">
            Clubs that require an application ({requiredCount})
          </Link>
        }
      />

      <section aria-labelledby="demo-app" className="mb-6 flex flex-wrap items-center gap-4 rounded border border-dashed border-[#9aa5ad] bg-surface p-4">
        <ClubAvatar club={DEMO_ORG} />
        <div className="min-w-0 flex-1 basis-60">
          <h2 id="demo-app" className="flex flex-wrap items-center gap-2 font-bold text-ink">
            Try the demo application <SampleBadge label="Demo only" />
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {DEMO_ORG.name} is fictional. Demo only — not sent to the organization.
          </p>
          {demo && (
            <div className="mt-2">
              <StatusPill app={demo} />
            </div>
          )}
        </div>
        <Link to={`/clubs/applications/${DEMO_ORG_ID}`} className="btn btn-primary">
          {demo ? 'Continue demo application' : 'Open demo application'}
        </Link>
      </section>

      {tracked.length ? (
        <section aria-labelledby="tracked-heading">
          <h2 id="tracked-heading" className="section-title">
            Your tracked applications ({tracked.length})
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {tracked.map((a) => (
              <ApplicationCard key={a.clubId} app={a} />
            ))}
          </div>
        </section>
      ) : (
        <EmptyState
          icon={ClipboardList}
          title="No applications tracked yet"
          action={
            <>
              <Link to="/clubs/discover?process=required" className="btn btn-primary">
                Browse clubs that require an application
              </Link>
              <Link to={`/clubs/applications/${DEMO_ORG_ID}`} className="btn btn-secondary">
                Try the demo application
              </Link>
            </>
          }
        >
          Open any organization's profile and choose “Track application”. Following a club never starts an application.
        </EmptyState>
      )}
    </>
  );
}
