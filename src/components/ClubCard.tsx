import { Link, useLocation } from 'react-router-dom';
import { BadgeCheck, Clock, MapPin } from 'lucide-react';
import type { Club } from '../types';
import { meetingLabel } from '../lib/dates';
import { useStore } from '../context/StoreContext';
import { PatternCover } from './PatternCover';
import { CategoryTag, ClubAvatar, FollowButton } from './ui';
import { ApplyButton, MembershipTag } from './Applications';

export function ClubCard({ club }: { club: Club }) {
  const { isFollowing } = useStore();
  const following = isFollowing(club.id);
  const href = `/clubs/discover/${club.id}`;
  // Remember the Discover filters so the profile's back link can restore them.
  const linkState = { discoverSearch: useLocation().search };
  const schedule = club.meetings.length ? club.meetings.map(meetingLabel).join('; ') : (club.scheduleNote ?? 'Meeting times not listed');

  return (
    <article className="flex flex-col overflow-hidden rounded border border-line bg-white transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.15)]">
      <div className="relative h-16">
        <PatternCover color={club.color} variant={club.cover} className="absolute inset-0 h-full w-full" />
        {following && (
          <span className="absolute right-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[0.6875rem] font-bold text-umass">
            Following
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col px-4 pb-4">
        <ClubAvatar club={club} className="-mt-6 ring-4 ring-white" />
        <h3 className="mt-2 font-bold leading-snug">
          <Link to={href} state={linkState} className="text-ink hover:text-link hover:underline">
            {club.name}
          </Link>
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
          <CategoryTag category={club.category} />
          <span className="inline-flex items-center gap-1" title={`From the official Campus Pulse listing, retrieved ${club.verifiedOn}`}>
            <BadgeCheck size={13} aria-hidden className="text-success" />{' '}
            {club.sourceKind === 'event-host' ? 'Event host · Campus Pulse' : 'Campus Pulse'}
          </span>
          <MembershipTag club={club} />
        </div>
        <p className="mt-2 line-clamp-2 text-sm text-ink-soft">{club.summary}</p>
        <dl className="mt-3 space-y-1 text-[0.8125rem]">
          <div className="flex gap-1.5">
            <dt>
              <Clock size={14} className="mt-0.5 text-ink-soft" aria-label="Meets" />
            </dt>
            <dd className={club.meetings.length ? 'text-ink' : 'italic text-ink-soft'}>{schedule}</dd>
          </div>
          {club.location && (
            <div className="flex gap-1.5">
              <dt>
                <MapPin size={14} className="mt-0.5 text-ink-soft" aria-label="Location" />
              </dt>
              <dd className="text-ink">{club.location}</dd>
            </div>
          )}
        </dl>
        <div className="mt-auto flex flex-wrap gap-2 pt-4">
          <FollowButton club={club} size="sm" />
          <ApplyButton club={club} size="sm" />
          <Link to={href} state={linkState} className="btn btn-secondary btn-sm">
            View profile
          </Link>
        </div>
      </div>
    </article>
  );
}
