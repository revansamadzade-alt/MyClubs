import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, CalendarCheck2, CalendarX2, Clock, ExternalLink, Info, MapPin, TriangleAlert, UsersRound } from 'lucide-react';
import { EVENT_BY_ID } from '../../data/events';
import { CLUB_BY_ID } from '../../data/clubs';
import { useStore } from '../../context/StoreContext';
import { fmtLongDate, fmtRange } from '../../lib/dates';
import { KIND_META, conflictsForEvent } from '../../lib/schedule';
import { CategoryTag, DateTile, EmptyState, FollowButton, SampleBadge, SaveEventButton } from '../../components/ui';
import { useTitle } from '../../hooks/useTitle';

export default function EventDetail() {
  const { eventId = '' } = useParams();
  const event = EVENT_BY_ID[eventId];
  const { followed, saved } = useStore();
  useTitle(event?.title ?? 'Event not found');

  if (!event) {
    return (
      <EmptyState
        icon={CalendarX2}
        title="Event not found"
        action={
          <Link to="/clubs/events" className="btn btn-primary">
            Back to Campus Events
          </Link>
        }
      >
        This event isn't in the sample data.
      </EmptyState>
    );
  }

  const club = event.clubId ? CLUB_BY_ID[event.clubId] : undefined;
  const conflicts = conflictsForEvent(event, followed, saved);

  return (
    <article className="max-w-4xl">
      <Link to="/clubs/events" className="mb-4 inline-flex items-center gap-1.5 text-sm text-link hover:underline">
        <ArrowLeft size={16} aria-hidden /> All events
      </Link>

      <header className="flex flex-wrap items-start gap-4 border-b border-line-soft pb-5">
        <DateTile date={event.start} className="w-16" />
        <div className="min-w-0 flex-1 basis-64">
          <div className="mb-1.5 flex flex-wrap gap-2">
            <CategoryTag category={event.category} />
            {event.verified ? (
              <span className="inline-flex items-center gap-1 text-sm text-ink-soft">
                <BadgeCheck size={15} aria-hidden className="text-success" /> Verified on Campus Pulse
              </span>
            ) : (
              <SampleBadge label="Sample event" />
            )}
          </div>
          <h1 className="text-[1.75rem] font-bold leading-tight text-ink">{event.title}</h1>
        </div>
        <SaveEventButton event={event} />
      </header>

      {event.end <= new Date() && (
        <p role="note" className="mt-4 rounded border border-line bg-surface p-3 text-sm text-ink">
          This event ended on {fmtLongDate(event.end)}. Its date and time are shown exactly as published.
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <dl className="space-y-3">
            <div className="flex gap-3">
              <dt>
                <Clock size={18} className="mt-0.5 text-ink-soft" aria-label="When" />
              </dt>
              <dd>
                <span className="block font-bold">{fmtLongDate(event.start)}</span>
                {fmtRange(event.start, event.end)}
              </dd>
            </div>
            <div className="flex gap-3">
              <dt>
                <MapPin size={18} className="mt-0.5 text-ink-soft" aria-label="Where" />
              </dt>
              <dd>{event.location}</dd>
            </div>
            <div className="flex gap-3">
              <dt>
                <UsersRound size={18} className="mt-0.5 text-ink-soft" aria-label="Host" />
              </dt>
              <dd>
                {club ? (
                  <Link to={`/clubs/discover/${club.id}`} className="text-link hover:underline">
                    {club.name}
                  </Link>
                ) : (
                  event.host
                )}
              </dd>
            </div>
          </dl>
          <h2 className="section-title mt-8">About this event</h2>
          <p className="leading-relaxed text-ink">{event.description}</p>
          {event.verified ? (
            <div className="mt-4 flex gap-2 rounded border border-[#b3d7ee] bg-[#eef6fb] p-4 text-sm text-ink">
              <Info size={18} aria-hidden className="mt-0.5 shrink-0 text-link" />
              <div>
                <p>
                  From the official Campus Pulse listing, retrieved{' '}
                  {new Date(`${event.verified.retrievedOn}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.
                  Saving it here only adds it to My Campus Life; it does <strong>not</strong> RSVP or register you.
                </p>
                <a
                  href={event.verified.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-link hover:underline"
                >
                  <ExternalLink size={14} aria-hidden /> Official event page (RSVP and updates)
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded bg-surface p-3 text-sm text-ink-soft">
              Sample event for the demo. It is not a real UMass event.
            </p>
          )}
          {club && (
            <div className="mt-6 flex flex-wrap items-center gap-3 rounded border border-line p-4">
              <p className="min-w-0 flex-1 text-sm">
                Follow <strong>{club.name}</strong> to see its verified events and any listed meetings in My Campus Life.
              </p>
              <FollowButton club={club} size="sm" />
            </div>
          )}
        </div>

        <aside aria-labelledby="schedule-check">
          <div className="card p-4">
            <h2 id="schedule-check" className="mb-3 font-bold">
              Schedule check
            </h2>
            {conflicts.length ? (
              <div className="rounded border border-warn/40 bg-warn-soft p-3 text-sm">
                <p className="flex items-center gap-1.5 font-bold text-warn">
                  <TriangleAlert size={16} aria-hidden /> Overlaps with {conflicts.length} item
                  {conflicts.length > 1 ? 's' : ''}
                </p>
                <ul className="mt-2 space-y-2">
                  {conflicts.map(({ item: c, from, to }) => (
                    <li key={c.id} className="border-l-[3px] pl-2" style={{ borderColor: KIND_META[c.kind].color }}>
                      <span className="block font-bold text-ink">{c.title}</span>
                      <span className="block text-ink-soft">
                        {KIND_META[c.kind].label} · {fmtRange(c.start, c.end)}
                      </span>
                      <span className="block text-warn">
                        Overlap {fmtRange(from, to)} ({Math.round((to.getTime() - from.getTime()) / 60000)} min)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="flex items-center gap-1.5 rounded bg-[#e8f5ee] p-3 text-sm text-success">
                <CalendarCheck2 size={16} aria-hidden /> No conflicts with your schedule.
              </p>
            )}
            <p className="mt-3 text-xs text-ink-soft">
              Checked against timed course activities, meetings of clubs you follow, and your other saved events.
              Assignment due times are not counted as conflicts.
            </p>
            <Link to="/clubs/campus-life" className="mt-3 inline-block text-sm text-link hover:underline">
              Open My Campus Life
            </Link>
          </div>
        </aside>
      </div>
    </article>
  );
}
