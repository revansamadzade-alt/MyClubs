import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, Clock, Info, Mail, MapPin, SearchX, UsersRound } from 'lucide-react';
import { CLUB_BY_ID } from '../../data/clubs';
import { EVENTS } from '../../data/events';
import { DOW_PLURAL, fmtDate, fmtTime, hhmmRange } from '../../lib/dates';
import { nextMeeting } from '../../lib/schedule';
import { PatternCover } from '../../components/PatternCover';
import { EventCard } from '../../components/EventCard';
import { Reviews } from '../../components/Reviews';
import { CategoryTag, ClubAvatar, EmptyState, FollowButton, SampleBadge } from '../../components/ui';
import { useTitle } from '../../hooks/useTitle';

export default function ClubProfile() {
  const { clubId = '' } = useParams();
  const club = CLUB_BY_ID[clubId];
  const { state } = useLocation();
  const backTo = `/clubs/discover${(state as { discoverSearch?: string } | null)?.discoverSearch ?? ''}`;
  useTitle(club?.name ?? 'Club not found');

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
              <span className="inline-flex items-center gap-1">
                <UsersRound size={15} aria-hidden /> {club.members} members
              </span>
              <SampleBadge />
            </div>
          </div>
          <FollowButton club={club} />
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
              <p className="text-ink-soft">No special events posted. Regular meetings are listed on the right.</p>
            )}
          </section>

          <Reviews clubId={club.id} clubName={club.name} />
        </div>

        <aside className="space-y-4">
          <div className="card p-4">
            <h2 className="mb-3 flex items-center gap-2 font-bold">
              <CalendarClock size={18} aria-hidden className="text-umass" /> Meetings
            </h2>
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
            <p className="mt-3 flex gap-1.5 text-sm">
              <MapPin size={14} aria-hidden className="mt-0.5 shrink-0 text-ink-soft" /> {club.location}
            </p>
            {next && (
              <p className="mt-3 rounded bg-surface px-3 py-2 text-sm">
                Next meeting: <strong>{fmtDate(next)}</strong> at {fmtTime(next)}
              </p>
            )}
          </div>

          <div className="card p-4 text-sm">
            <h2 className="mb-2 font-bold">Contact</h2>
            <a href={`mailto:${club.email}`} className="flex items-center gap-1.5 text-link hover:underline">
              <Mail size={14} aria-hidden /> {club.email}
            </a>
            <p className="mt-2 text-ink-soft">Founded {club.founded} (sample)</p>
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
