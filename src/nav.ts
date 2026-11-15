import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Briefcase,
  CalendarDays,
  Clock3,
  Gauge,
  HeartHandshake,
  Inbox,
  LifeBuoy,
  MonitorPlay,
  UserRound,
  Users,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Visual-only section in this prototype. */
  prototype?: boolean;
  badge?: number;
  blurb?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/account', label: 'Account', icon: UserRound, prototype: true },
  { to: '/dashboard', label: 'Dashboard', icon: Gauge },
  { to: '/courses', label: 'Courses', icon: BookOpen, prototype: true },
  { to: '/groups', label: 'Groups', icon: Users, prototype: true },
  { to: '/clubs', label: 'MyClubs', icon: HeartHandshake },
  {
    to: '/calendar',
    label: 'Calendar',
    icon: CalendarDays,
    prototype: true,
    blurb: 'In this prototype, your combined academic and extracurricular schedule lives in MyClubs → My Campus Life.',
  },
  { to: '/inbox', label: 'Inbox', icon: Inbox, prototype: true },
  { to: '/history', label: 'History', icon: Clock3, prototype: true },
  { to: '/studio', label: 'Studio', icon: MonitorPlay, prototype: true },
  { to: '/portfolio', label: 'Portfolio', icon: Briefcase, prototype: true },
  { to: '/help', label: 'Help', icon: LifeBuoy, prototype: true, badge: 1 },
];
