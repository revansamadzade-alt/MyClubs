import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { CalendarCheck2, CalendarX2, ExternalLink, Info, TriangleAlert } from 'lucide-react';
import type { Category } from '../../types';
import { CATEGORIES, CLUBS } from '../../data/clubs';
import { useStore } from '../../context/StoreContext';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useTitle } from '../../hooks/useTitle';
import { FIT_WINDOW_DAYS, findMyFit, rankFits, type ClubFit, type FitStatus } from '../../lib/fit';
import { buildSchedule } from '../../lib/schedule';
import { addDays, fmtDate, fmtRange, startOfDay } from '../../lib/dates';
import { CategoryTag, ClubAvatar, FollowButton, PageHeader, SampleBadge } from '../../components/ui';

const GROUPS: { status: Exclude<FitStatus, 'unknown'>; title: string; blurb: string; icon: LucideIcon; color: string }[] = [
  { status: 'fits', title: 'Fits your schedule', blurb: `Every listed time in the next ${FIT_WINDOW_DAYS} days is free.`, icon: CalendarCheck2, color: '#0b874b' },
  { status: 'partial', title: 'Partial fit', blurb: 'Some listed times overlap your schedule. Each overlap is shown below.', icon: TriangleAlert, color: '#a84400' },
  { status: 'conflicts', title: 'Conflicts with your schedule', blurb: 'Every listed time overlaps something already on your calendar.', icon: CalendarX2, color: '#b3121d' },
];

const isCategoryArray = (v: unknown): v is Category[] =>
  Array.isArray(v) && v.every((c) => (CATEGORIES as string[]).includes(c as string));

const minutes = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / 60000);

function FitCard({ fit, color }: { fit: ClubFit; color: string }) {
  const { isFollowing } = useStore();
  const { club, slots, free } = fit;
  const shown = slots.slice(0, 4);
  const hasMeetings = slots.some((s) => s.item.kind === 'meeting');
  const hasEvents = slots.some((s) => s.item.kind !== 'meeting');
  const basis = hasMeetings && hasEvents ? 'Verified meetings and events' : hasMeetings ? 'Verified weekly schedule' : 'Verified upcoming events';

  return (
    <article className="card flex flex-col p-4" aria-labelledby={`fit-${club.id}`}>
      <div className="flex items-start gap-3">
        <ClubAvatar club={club} size="sm" />
        <div className="min-w-0 flex-1">
          <h3 id={`fit-${club.id}`} className="font-bold leading-snug">
            <Link to={`/clubs/discover/${club.id}`} className="text-ink hover:text-link hover:underline">
              {club.name}
            </Link>
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <CategoryTag category={club.category} />
            {fit.interest && <span className="rounded-full bg-[#e8f3fa] px-2 py-0.5 font-bold text-link">Matches your interests</span>}
            {isFollowing(club.id) && <span className="rounded-full bg-[#f8ecec] px-2 py-0.5 font-bold text-umass">Following</span>}
          </div>
        </div>
      </div>
      <p className="mt-3 text-sm font-bold" style={{ color }}>
        {free} of {slots.length} upcoming time{slots.length === 1 ? '' : 's'} free
      </p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {shown.map(({ item, overlaps }) => (
          <li key={item.id} className="flex gap-2">
            {overlaps.length ? (
              <TriangleAlert size={15} className="mt-0.5 shrink-0 text-warn" aria-label="Overlaps" />
            ) : (
              <CalendarCheck2 size={15} className="mt-0.5 shrink-0 text-success" aria-label="Free" />
            )}
            <div className="min-w-0">
              <span className="text-ink">
                {fmtDate(item.start)} · {fmtRange(item.start, item.end)}
              </span>
              <span className="text-ink-soft"> · {item.kind === 'meeting' ? item.subtitle : item.title}</span>
              {overlaps.map((o) => (
                <span key={o.item.id} className="block text-xs font-bold text-warn">
                  Overlaps {o.item.title} ({fmtRange(o.item.start, o.item.end)}) for {minutes(o.from, o.to)} min
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {slots.length > shown.length && (
        <p className="mt-1 text-xs text-ink-soft">
          +{slots.length - shown.length} more in the next {FIT_WINDOW_DAYS} days
        </p>
      )}
      <p className="mt-3 text-xs text-ink-soft">{basis} from Campus Pulse</p>
      <div className="mt-auto flex flex-wrap gap-2 pt-3">
        <FollowButton club={club} size="sm" />
        <Link to={`/clubs/discover/${club.id}`} className="btn btn-secondary btn-sm">
          View profile
        </Link>
      </div>
    </article>
  );
}

export default function FindMyFit() {
  useTitle('Find My Fit');
  const { followed, saved } = useStore();
  const [interests, setInterests] = useLocalStorage<Category[]>('myclubs:interests', [], isCategoryArray);

  const fits = rankFits(findMyFit({ followed, saved, interests }));
  const unknown = fits.filter((f) => f.status === 'unknown');

  const now = new Date();
  const from = startOfDay(now);
  const mine = buildSchedule({ followed, saved, from, to: addDays(from, FIT_WINDOW_DAYS) }).filter(
    (i) => !i.isDeadline && i.kind !== 'clubEvent' && i.end > now,
  );
  const classes = mine.filter((i) => i.id.startsWith('cls:')).length;
  const sessions = mine.filter((i) => i.kind === 'academic' && !i.id.startsWith('cls:')).length;
  const meetings = mine.filter((i) => i.kind === 'meeting').length;
  const events = mine.filter((i) => i.kind === 'event').length;

  const usedCategories = CATEGORIES.filter((c) => CLUBS.some((x) => x.category === c));
  const toggle = (c: Category) => setInterests((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]));

  return (
    <>
      <PageHeader
        title="Find My Fit"
        description="See which clubs fit around your classes and plans before you commit. Follow a club and the results update instantly."
        actions={
          <Link to="/clubs/campus-life" className="btn btn-secondary">
            Open My Campus Life
          </Link>
        }
      />

      <section aria-labelledby="your-schedule" className="mb-5 rounded border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="your-schedule" className="font-bold">
            Your schedule · next {FIT_WINDOW_DAYS} days
          </h2>
          <SampleBadge label="Demo class schedule" />
        </div>
        <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink" aria-label="What Find My Fit checks against">
          <li>
            <strong>{classes}</strong> class sessions
          </li>
          <li>
            <strong>{sessions}</strong> exams &amp; review sessions
          </li>
          <li>
            <strong>{meetings}</strong> meeting{meetings === 1 ? '' : 's'} of clubs you follow
          </li>
          <li>
            <strong>{events}</strong> saved event{events === 1 ? '' : 's'}
          </li>
        </ul>
        <p className="mt-2 flex gap-1.5 text-xs text-ink-soft">
          <Info size={14} aria-hidden className="mt-px shrink-0" />
          Each club's verified weekly meetings and verified Campus Pulse events are checked against these time blocks with
          the same rules as My Campus Life. Assignment due times never count. Clubs without listed times are kept separate;
          no times are guessed.
        </p>
      </section>

      <div className="mb-6">
        <p id="interests-label" className="mb-2 text-sm font-bold">
          Interests <span className="font-normal text-ink-soft">(optional) — matching clubs rank first</span>
        </p>
        <div role="group" aria-labelledby="interests-label" className="flex flex-wrap items-center gap-2">
          {usedCategories.map((c) => (
            <button key={c} type="button" aria-pressed={interests.includes(c)} onClick={() => toggle(c)} className="chip">
              {c}
            </button>
          ))}
          {interests.length > 0 && (
            <button type="button" onClick={() => setInterests([])} className="btn btn-ghost btn-sm">
              Clear
            </button>
          )}
        </div>
      </div>

      {GROUPS.map(({ status, title, blurb, icon: Icon, color }) => {
        const list = fits.filter((f) => f.status === status);
        return (
          <section key={status} aria-labelledby={`group-${status}`} className="mb-8">
            <h2 id={`group-${status}`} className="section-title flex items-center gap-2">
              <Icon size={20} aria-hidden style={{ color }} /> {title}
              <span className="text-sm font-normal text-ink-soft">({list.length})</span>
            </h2>
            <p className="-mt-1 mb-3 text-sm text-ink-soft">{blurb}</p>
            {list.length ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {list.map((f) => (
                  <FitCard key={f.club.id} fit={f} color={color} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-soft">None right now.</p>
            )}
          </section>
        );
      })}

      <details className="rounded border border-line" id="group-unknown">
        <summary className="cursor-pointer px-4 py-3 font-bold">
          Schedule unknown ({unknown.length}){' '}
          <span className="font-normal text-ink-soft">— no verified meeting times or upcoming events listed</span>
        </summary>
        <ul className="divide-y divide-line-soft border-t border-line">
          {unknown.map(({ club, interest }) => (
            <li key={club.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <ClubAvatar club={club} size="sm" />
              <div className="min-w-0 flex-1 basis-48">
                <Link to={`/clubs/discover/${club.id}`} className="font-bold text-link hover:underline">
                  {club.name}
                </Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                  <CategoryTag category={club.category} />
                  {interest && <span className="font-bold text-link">Matches your interests</span>}
                  {club.scheduleNote && <span>{club.scheduleNote}</span>}
                </div>
              </div>
              <a href={club.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-link hover:underline">
                <ExternalLink size={14} aria-hidden /> Campus Pulse
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
              <FollowButton club={club} size="sm" />
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
