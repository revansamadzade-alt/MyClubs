import { Link, NavLink } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import { NAV_ITEMS, type NavItem } from '../nav';
import { cx } from '../lib/cx';

interface Props {
  variant?: 'rail' | 'drawer';
  onNavigate?: () => void;
}

function ItemIcon({ item, active }: { item: NavItem; active: boolean }) {
  if (item.to === '/account') {
    return (
      <span
        className={cx(
          'grid h-9 w-9 place-items-center overflow-hidden rounded-full border-2 bg-[#d5d9dc] text-[#8b969e]',
          active ? 'border-umass' : 'border-white',
        )}
      >
        <UserRound size={28} strokeWidth={1.6} className="translate-y-1" aria-hidden />
      </span>
    );
  }
  const Icon = item.icon;
  return (
    <span className="relative">
      <Icon size={26} strokeWidth={1.5} aria-hidden />
      {item.badge ? (
        <span className="absolute -right-3 -top-2 grid h-5 min-w-5 place-items-center rounded-full border border-umass bg-white px-1 text-[0.6875rem] font-bold text-umass">
          {item.badge}
          <span className="sr-only"> unread</span>
        </span>
      ) : null}
    </span>
  );
}

/** Canvas-style global navigation. `rail` is the fixed desktop sidebar; `drawer` is the mobile menu. */
export function GlobalNav({ variant = 'rail', onNavigate }: Props) {
  const rail = variant === 'rail';
  return (
    <nav
      aria-label="Global navigation"
      className={cx('on-dark flex h-full flex-col overflow-y-auto bg-umass text-white', rail ? 'w-[84px]' : 'w-72')}
    >
      <Link
        to="/"
        onClick={onNavigate}
        className={cx(
          'flex shrink-0 font-serif leading-[0.92] text-white',
          rail ? 'h-[85px] flex-col items-center justify-center' : 'h-20 flex-col justify-center px-6',
        )}
        aria-label="UMass Amherst — Dashboard"
      >
        <span className="text-[1.25rem] tracking-[-0.02em]">UMass</span>
        <span className="text-[1.0625rem] tracking-[-0.02em]">Amherst</span>
      </Link>

      <ul className="flex flex-col pb-4">
        {NAV_ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              onClick={onNavigate}
              className={({ isActive }) =>
                cx(
                  'flex transition-colors',
                  rail
                    ? 'min-h-[62px] flex-col items-center justify-center gap-[3px] px-0.5 py-[7px] text-center text-[0.875rem] leading-[1.2]'
                    : 'items-center gap-4 px-6 py-3 text-base',
                  isActive ? 'bg-white text-umass' : 'text-white hover:bg-umass-dark',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <ItemIcon item={item} active={isActive} />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
