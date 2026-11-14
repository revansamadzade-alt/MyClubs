import { Link } from 'react-router-dom';
import { Clock, MapPin } from 'lucide-react';
import type { CampusEvent } from '../types';
import { CLUB_BY_ID } from '../data/clubs';
import { fmtRange, relativeDay } from '../lib/dates';
import { useStore } from '../context/StoreContext';
import { CategoryTag, DateTile, SampleBadge, SaveEventButton } from './ui';

export function EventCard({ event, compact }: { event: CampusEvent; compact?: boolean }) {
  const { isFollowing } = useStore();
  const club = event.clubId ? CLUB_BY_ID[event.clubId] : undefined;
  const href = `/clubs/events/${event.id}`;

  return (
    <article className="flex gap-4 rounded border border-line bg-white p-4 transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.12)]">
      <DateTile date={event.start} />
      <div className="min-w-0 flex-1">
        {!compact && (
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <CategoryTag category={event.category} />
            <SampleBadge label="Sample event" />
            {club && isFollowing(club.id) && (
              <span className="rounded-full bg-[#f8ecec] px-2 py-0.5 text-xs font-bold text-umass">Club you follow</span>
            )}
          </div>
        )}
        <h3 className="font-bold leading-snug">
          <Link to={href} className="text-link hover:underline">
            {event.title}
          </Link>
        </h3>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-ink">
          <Clock size={14} aria-hidden className="shrink-0 text-ink-soft" />
          {relativeDay(event.start)} · {fmtRange(event.start, event.end)}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-ink-soft">
          <MapPin size={14} aria-hidden className="shrink-0" />
          <span className="truncate">{event.location}</span>
        </p>
        {!compact && <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{event.description}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <SaveEventButton event={event} size="sm" />
          <Link to={href} className="btn btn-secondary btn-sm">
            Details
          </Link>
          {!compact && (
            <span className="text-xs text-ink-soft">
              Hosted by{' '}
              {club ? (
                <Link to={`/clubs/discover/${club.id}`} className="text-link hover:underline">
                  {club.name}
                </Link>
              ) : (
                event.host
              )}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
