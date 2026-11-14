import { Link } from 'react-router-dom';
import { CalendarClock, Info, Ticket, UsersRound } from 'lucide-react';
import { CLUB_BY_ID } from '../../data/clubs';
import { EVENT_BY_ID } from '../../data/events';
import type { Club } from '../../types';
import { useStore } from '../../context/StoreContext';
import { fmtDate, fmtRange, fmtTime, relativeDay } from '../../lib/dates';
import { nextMeeting, upcomingForClubs } from '../../lib/schedule';
import { CategoryTag, ClubAvatar, EmptyState, PageHeader, SaveEventButton } from '../../components/ui';
import { useTitle } from '../../hooks/useTitle';

export default function Following() {
  useTitle('My Clubs');
  const { followed, toggleFollow } = useStore();
  const clubs = followed.map((id) => CLUB_BY_ID[id]).filter((c): c is Club => !!c);
  const upcoming = upcomingForClubs(followed, 14).slice(0, 12);

  if (!clubs.length) {
    return (
      <>
        <PageHeader title="My Clubs" />
        <EmptyState
          icon={UsersRound}
          title="You're not following any clubs yet"
          action={
            <Link to="/clubs/discover" className="btn btn-primary">
              Discover clubs
            </Link>
          }
        >
          Follow organizations to collect their meetings and events here and in My Campus Life.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="My Clubs"
        description={
          <>
            You follow <strong className="text-ink">{clubs.length}</strong> club{clubs.length === 1 ? '' : 's'}.
          </>
        }
        actions={
          <Link to="/clubs/discover" className="btn btn-secondary">
            Find more clubs
          </Link>
        }
      />

      <div className="mb-6 flex gap-2 rounded border border-[#b3d7ee] bg-[#eef6fb] p-3 text-sm text-ink">
        <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-link" />
        <p>Following a club is not the same as being a verified member. It only adds the club's activity to your feed.</p>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="followed-heading">
          <h2 id="followed-heading" className="section-title">
            Followed clubs
          </h2>
          <ul className="divide-y divide-line-soft rounded border border-line">
            {clubs.map((club) => {
              const next = nextMeeting(club);
              return (
                <li key={club.id} className="flex flex-wrap items-center gap-4 p-4">
                  <ClubAvatar club={club} />
                  <div className="min-w-0 flex-1 basis-48">
                    <Link to={`/clubs/discover/${club.id}`} className="font-bold text-link hover:underline">
                      {club.name}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                      <CategoryTag category={club.category} />
                      {next ? (
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock size={14} aria-hidden /> Next: {fmtDate(next)}, {fmtTime(next)}
                        </span>
                      ) : (
                        <span className="italic">Meeting times not listed</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link to={`/clubs/discover/${club.id}`} className="btn btn-secondary btn-sm">
                      Open profile
                    </Link>
                    <button type="button" onClick={() => toggleFollow(club.id)} className="btn btn-secondary btn-sm">
                      Unfollow<span className="sr-only"> {club.name}</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="upcoming-heading">
          <h2 id="upcoming-heading" className="section-title">
            Upcoming activities <span className="text-sm font-normal text-ink-soft">· next 14 days</span>
          </h2>
          {upcoming.length ? (
            <ul className="space-y-2">
              {upcoming.map((item) => {
                const event = item.eventId ? EVENT_BY_ID[item.eventId] : undefined;
                return (
                  <li key={item.id} className="flex gap-3 rounded border border-line p-3">
                    <span
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                      style={{ background: event ? '#e8f5ee' : '#f8ecec', color: event ? '#0b874b' : '#881c1c' }}
                    >
                      {event ? <Ticket size={16} aria-label="Event" /> : <UsersRound size={16} aria-label="Meeting" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link to={item.href ?? '/clubs'} className="font-bold text-link hover:underline">
                        {item.title}
                      </Link>
                      <p className="text-sm text-ink">
                        {relativeDay(item.start)} · {fmtRange(item.start, item.end)}
                      </p>
                      <p className="truncate text-xs text-ink-soft">
                        {event ? `Event · ${item.subtitle}` : [item.subtitle, item.location].filter(Boolean).join(' · ')}
                      </p>
                      {event && (
                        <div className="mt-2">
                          <SaveEventButton event={event} size="sm" />
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-ink-soft">
              No verified meetings or events listed for the clubs you follow in the next 14 days. Only schedules stated on
              Campus Pulse are shown.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
