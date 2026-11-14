import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ChevronRight, Menu, RotateCcw } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { CLUB_BY_ID } from '../../data/clubs';
import { EVENT_BY_ID } from '../../data/events';
import { SampleBadge } from '../../components/ui';
import { cx } from '../../lib/cx';

const SECTIONS = [
  { to: '/clubs/discover', label: 'Discover' },
  { to: '/clubs/fit', label: 'Find My Fit' },
  { to: '/clubs/following', label: 'My Clubs & Associations', count: 'followed' as const },
  { to: '/clubs/events', label: 'Campus Events', count: 'saved' as const },
  { to: '/clubs/campus-life', label: 'My Campus Life' },
];

function crumbsFor(pathname: string): { label: string; to?: string }[] {
  const [, , section, id] = pathname.split('/');
  const sec = SECTIONS.find((s) => s.to === `/clubs/${section}`);
  const crumbs: { label: string; to?: string }[] = [{ label: 'MyClubs', to: '/clubs/discover' }];
  if (sec) crumbs.push({ label: sec.label, to: id ? sec.to : undefined });
  if (id) {
    const name = section === 'discover' ? CLUB_BY_ID[id]?.name : section === 'events' ? EVENT_BY_ID[id]?.title : undefined;
    crumbs.push({ label: name ?? 'Not found' });
  }
  return crumbs;
}

/** Canvas "course" layout: breadcrumb header + collapsible section navigation. */
export default function ClubsLayout() {
  const { pathname } = useLocation();
  const { followed, saved, resetDemo } = useStore();
  const [navOpen, setNavOpen] = useState(true);
  const crumbs = crumbsFor(pathname);
  const counts = { followed: followed.length, saved: saved.length };

  return (
    <div>
      <header className="flex min-h-[64px] items-center gap-3 border-b border-line px-4 md:px-6">
        <button
          type="button"
          onClick={() => setNavOpen((o) => !o)}
          aria-expanded={navOpen}
          aria-controls="clubs-nav"
          aria-label={navOpen ? 'Hide MyClubs navigation' : 'Show MyClubs navigation'}
          className="hidden h-9 w-9 shrink-0 place-items-center rounded text-link hover:bg-surface md:grid"
        >
          <Menu size={22} aria-hidden />
        </button>
        <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
          <ol className="flex min-w-0 items-center gap-1.5 text-[1.05rem]">
            {crumbs.map((c, i) => (
              <li key={i} className={cx('flex min-w-0 items-center gap-1.5', i < crumbs.length - 1 && 'shrink-0')}>
                {i > 0 && <ChevronRight size={14} aria-hidden className="shrink-0 text-ink-soft" />}
                {c.to ? (
                  <Link to={c.to} className="truncate text-link hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="truncate text-ink">
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        <span className="hidden sm:block">
          <SampleBadge label="Sample events & courses" />
        </span>
        <button
          type="button"
          onClick={() => {
            if (
              window.confirm(
                'Reset to the demo scenario? You will follow Chess Club and UMass Robotics Club, have two sample events saved, and your reviews will be cleared.',
              )
            )
              resetDemo();
          }}
          className="btn btn-secondary btn-sm shrink-0"
        >
          <RotateCcw size={14} aria-hidden /> <span className="hidden sm:inline">Reset demo</span>
          <span className="sr-only sm:hidden">Reset demo data</span>
        </button>
      </header>

      {/* Mobile section tabs */}
      <nav aria-label="MyClubs sections" className="flex gap-1 overflow-x-auto border-b border-line px-2 md:hidden">
        {SECTIONS.map((s) => (
          <NavLink
            key={s.to}
            to={s.to}
            className={({ isActive }) =>
              cx(
                'whitespace-nowrap border-b-[3px] px-3 py-3 text-sm',
                isActive ? 'border-umass font-bold text-ink' : 'border-transparent text-link',
              )
            }
          >
            {s.label}
            {s.count && counts[s.count] > 0 ? ` (${counts[s.count]})` : ''}
          </NavLink>
        ))}
      </nav>

      <div className="flex">
        {navOpen && (
          <nav id="clubs-nav" aria-label="MyClubs sections" className="hidden w-[184px] shrink-0 py-5 pl-6 pr-2 md:block">
            <ul className="space-y-1">
              {SECTIONS.map((s) => (
                <li key={s.to}>
                  <NavLink
                    to={s.to}
                    className={({ isActive }) =>
                      cx(
                        'flex items-center justify-between gap-2 border-l-2 py-1.5 pl-2.5 pr-1 text-[0.9375rem]',
                        isActive ? 'border-ink text-ink' : 'border-transparent text-link hover:underline',
                      )
                    }
                  >
                    {s.label}
                    {s.count && counts[s.count] > 0 && (
                      <span className="rounded-full bg-surface px-1.5 text-xs text-ink ring-1 ring-line-soft">
                        {counts[s.count]}
                      </span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <div className="min-w-0 flex-1 px-4 py-6 md:px-6 lg:pr-10">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
