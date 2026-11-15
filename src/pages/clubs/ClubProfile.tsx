import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../../context/StoreContext';
import { ApplyButton, MembershipInfo, MembershipTag } from '../../components/Applications';
import { ArrowLeft, BadgeCheck, CalendarClock, Clock, ExternalLink, HandCoins, Info, MapPin, SearchX } from 'lucide-react';
import { CLUB_BY_ID, campusPulseLinks } from '../../data/clubs';
import { EVENTS } from '../../data/events';
import { DOW_PLURAL, fmtDate, fmtTime, hhmmRange } from '../../lib/dates';
import { nextMeeting } from '../../lib/schedule';
import { PatternCover } from '../../components/PatternCover';
import { EventCard } from '../../components/EventCard';
import { Reviews } from '../../components/Reviews';
import { CategoryTag, ClubAvatar, EmptyState, FollowButton } from '../../components/ui';
import { useTitle } from '../../hooks/useTitle';
import { useDemoCampaign } from '../../lib/clubfund/entryPoints';

export default function ClubProfile() {
  const { clubId = '' } = useParams();
  const club = CLUB_BY_ID[clubId];
  const { state } = useLocation();
  const navigate = useNavigate();
  const { getApplication, saveApplication } = useStore();
  const backTo = `/clubs/discover${(state as { discoverSearch?: string } | null)?.discoverSearch ?? ''}`;
  useTitle(club?.name ?? 'Club not found');
  const demoCampaign = useDemoCampaign('org', club?.id);

  if (!club) {
    return (
      <EmptyState
        icon={SearchX}
        title="Organization not found"
        action={
          <Link to="/clubs/discover" className="btn btn-primary">
            Back to Discover
          </Link>
        }
      >
        This club isn't in the sample data.
      </EmptyState>
    );
  }

  const now = new Date();
  const events = EVENTS.filter((e) => e.clubId === club.id && e.end > now);
  const pastEvents = EVENTS.filter((e) => e.clubId === club.id && e.end <= now).reverse();
  const isHost = club.sourceKind === 'event-host';
  const cp = campusPulseLinks(club);
  const next = nextMeeting(club);

  return (
    <article>
      <Link to={backTo} className="mb-4 inline-flex items-center gap-1.5 text-sm text-link hover:underline">
        <ArrowLeft size={16} aria-hidden /> All organizations
      </Link>

      <header className="overflow-hidden rounded border border-line">
        <div className="relative h-24 sm:h-28">
          <PatternCover color={club.color} variant={club.cover} className="absolute inset-0 h-full w-full" />
        </div>
        <div className="flex flex-wrap items-end gap-4 px-5 pb-5">
          <ClubAvatar club={club} size="lg" className="-mt-10 ring-4 ring-white" />
          <div className="min-w-0 flex-1 basis-60 pt-3">
            <h1 className="text-2xl font-bold leading-tight text-ink sm:text-[1.75rem]">{club.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
              <CategoryTag category={club.category} />
              <a
                href={club.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-link hover:underline"
              >
                <BadgeCheck size={15} aria-hidden className="text-success" />{' '}
                {isHost ? 'Listed as an event host on Campus Pulse' : 'Verified on Campus Pulse'}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <MembershipTag club={club} />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <FollowButton club={club} />
            <ApplyButton club={club} />
          </div>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-8">
          <section aria-labelledby="about-heading">
            <h2 id="about-heading" className="section-title">
              About
            </h2>
            <p className="leading-relaxed text-ink">{club.about}</p>
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Tags">
              {club.tags.map((t) => (
                <li key={t} className="rounded bg-surface px-2 py-0.5 text-xs text-ink-soft">
                  #{t}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="events-heading">
            <h2 id="events-heading" className="section-title">
              Upcoming events
            </h2>
            {events.length ? (
              <div className="space-y-3">
                {events.map((e) => (
                  <EventCard key={e.id} event={e} compact />
                ))}
              </div>
            ) : (
              <p className="text-ink-soft">
                No verified upcoming events yet. Check{' '}
                <a href={cp.events ?? cp.page} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                  this organization on Campus Pulse
                </a>
                .
              </p>
            )}
            {pastEvents.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-link">Past events ({pastEvents.length})</summary>
                <div className="mt-2 space-y-3">
                  {pastEvents.map((e) => (
                    <EventCard key={e.id} event={e} compact />
                  ))}
                </div>
              </details>
            )}
          </section>

          <Reviews clubId={club.id} clubName={club.name} />
        </div>

        <aside className="space-y-4">
          <div className="card p-4" aria-labelledby="membership-heading">
            <h2 id="membership-heading" className="mb-2 font-bold">
              Membership &amp; applications
            </h2>
            <MembershipInfo club={club} />
            <div className="mt-3 flex flex-wrap gap-2">
              {club.application?.process === 'required' ? (
                <ApplyButton club={club} size="sm" />
              ) : getApplication(club.id) ? (
                <Link to={`/clubs/applications/${club.id}`} className="btn btn-secondary btn-sm">
                  View application tracker
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    saveApplication(club.id, {}, `Added ${club.name} to your applications. Following is unchanged.`);
                    navigate(`/clubs/applications/${club.id}`);
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  Track application
                </button>
              )}
            </div>
          </div>
          {demoCampaign && (
            <div className="card p-4" data-testid="cf-org-entry">
              <h2 className="mb-1 flex items-center gap-2 font-bold">
                <HandCoins size={18} aria-hidden className="text-umass" /> ClubFund demo
              </h2>
              <p className="text-sm text-ink-soft">
                A Solana Devnet demo campaign is attached to this organization. Test tokens only; no real money is collected.
              </p>
              <Link to={`/clubs/clubfund/campaigns/${demoCampaign.slug}`} className="btn btn-secondary btn-sm mt-3">
                Support This Club
              </Link>
            </div>
          )}
          <div className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 font-bold">
              <CalendarClock size={18} aria-hidden className="text-umass" /> Meetings
            </h2>
            {club.meetings.length ? (
              <ul className="space-y-2 text-sm">
                {club.meetings.map((m, i) => (
                  <li key={i}>
                    <span className="font-bold">{DOW_PLURAL[m.dow]}</span>
                    {m.label && <span className="text-ink-soft"> · {m.label}</span>}
                    <span className="flex items-center gap-1.5 text-ink">
                      <Clock size={14} aria-hidden className="text-ink-soft" /> {hhmmRange(m.start, m.end)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm font-bold text-ink">No verified meeting schedule</p>
            )}
            {club.scheduleNote && <p className="mt-2 text-sm text-ink-soft">{club.scheduleNote}</p>}
            <p className="mt-3 flex gap-1.5 text-sm">
              <MapPin size={14} aria-hidden className="mt-0.5 shrink-0 text-ink-soft" />
              {club.location ?? <span className="italic text-ink-soft">Location not listed</span>}
            </p>
            {next && (
              <p className="mt-3 rounded bg-surface px-3 py-2 text-sm">
                Next meeting: <strong>{fmtDate(next)}</strong> at {fmtTime(next)}
              </p>
            )}
            {!club.meetings.length && (
              <p className="mt-3 text-xs text-ink-soft">Nothing from this club is added to your calendar until a full schedule is listed.</p>
            )}
          </div>

          <div className="card p-4 text-sm">
            <h2 className="mb-2 font-bold">Official links & contact</h2>
            {club.links.length ? (
              <ul className="space-y-1.5">
                {club.links.map((l) => (
                  <li key={l.url}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-link hover:underline">
                      <ExternalLink size={14} aria-hidden /> {l.label}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="italic text-ink-soft">No external links listed.</p>
            )}
            <p className="mt-3 text-ink-soft">
              {isHost ? 'Find and contact this organization through ' : 'Contact this organization through its '}
              <a href={cp.page} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                {isHost ? 'Campus Pulse' : 'Campus Pulse page'}
              </a>
              . Membership size is not listed.
            </p>
            <p className="mt-2 text-xs text-ink-soft">
              Source: Campus Pulse listing, retrieved{' '}
              {new Date(`${club.verifiedOn}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.
            </p>
          </div>

          <div className="flex gap-2 rounded border border-[#b3d7ee] bg-[#eef6fb] p-4 text-sm text-ink">
            <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-link" />
            <p>
              Following adds this club's meetings to My Campus Life. It does <strong>not</strong> make you a verified
              member — contact the officers to officially join.
            </p>
          </div>
        </aside>
      </div>
    </article>
  );
}
