import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight, CalendarDays, CalendarRange, ClipboardList, Clock, Gauge, HandCoins, HeartHandshake, LogIn, Search } from 'lucide-react';
import { useTitle } from '../hooks/useTitle';
import { CATEGORIES, CLUBS } from '../data/clubs';
import { VERIFIED_EVENTS } from '../data/verifiedEvents';

interface Feature {
  to: string;
  title: string;
  text: string;
  icon: LucideIcon;
}

const FEATURES: Feature[] = [
  { to: '/clubs/discover', title: 'Explore Clubs', icon: Search, text: 'Search and filter UMass student organizations by interest, meeting time and how to join, then follow the ones you like.' },
  { to: '/clubs/fit', title: 'Find My Fit', icon: Clock, text: "See which clubs' meetings fit around your classes, with every overlap explained." },
  { to: '/clubs/events', title: 'Campus Events', icon: CalendarDays, text: 'Browse upcoming events and save the ones you plan to attend.' },
  { to: '/clubs/campus-life', title: 'My Campus Life', icon: CalendarRange, text: 'Classes, club meetings, saved events and application dates in one calendar, with conflicts flagged.' },
  { to: '/clubs/applications', title: 'Applications', icon: ClipboardList, text: 'Track club applications, drafts, résumés, interviews and decisions in one place.' },
  { to: '/clubs/clubfund', title: 'ClubFund', icon: HandCoins, text: 'Support fictional demo campaigns with Solana Devnet test tokens after verifying your UMass email. No real money.' },
  { to: '/dashboard', title: 'Dashboard', icon: Gauge, text: 'The Canvas-style course dashboard, with club deadlines added to your To Do list.' },
];

/** Headline numbers, counted from the same data the app shows (nothing hard-coded). */
function Stats() {
  const now = new Date();
  const stats = [
    { value: CLUBS.length, label: 'UMass student organizations' },
    { value: CATEGORIES.filter((c) => CLUBS.some((club) => club.category === c)).length, label: 'interest categories' },
    { value: VERIFIED_EVENTS.filter((e) => e.end > now).length, label: 'upcoming verified campus events' },
  ];
  return (
    <dl className="mt-8 grid grid-cols-3 gap-3 border-t border-line-soft pt-6 sm:gap-6">
      {stats.map((s) => (
        <div key={s.label} className="flex min-w-0 flex-col-reverse">
          <dt className="mt-0.5 text-xs leading-snug text-ink-soft sm:text-sm">{s.label}</dt>
          <dd className="text-2xl font-black leading-none tracking-tight text-umass sm:text-[2rem]">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The MyClubs homepage: what MyClubs is, and a way into each part of it. */
export default function Home() {
  useTitle('Home');
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-12 md:py-10">
      <section aria-labelledby="home-title" className="card overflow-hidden border-t-4 border-t-umass p-6 md:p-10">
        <div className="flex items-center gap-4">
          <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-umass text-white shadow-[0_4px_12px_rgb(136_28_28/0.3)] md:h-16 md:w-16">
            <HeartHandshake size={32} strokeWidth={1.7} />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-umass sm:text-sm">UMass Amherst student organizations</p>
            <h1 id="home-title" className="text-[2.25rem] font-black leading-none tracking-tight text-ink md:text-[3rem]">
              MyClubs
            </h1>
          </div>
        </div>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ink md:text-xl">
          Find clubs that match your interests and your class schedule, keep track of applications, and see club events next to your coursework.
        </p>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          MyClubs is the product; the Canvas-style layout around it is only a familiar setting. An independent HackUMass prototype, not affiliated with
          UMass Amherst or Instructure.
        </p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          <Link to="/clubs/discover" className="btn btn-primary">
            <Search size={18} aria-hidden /> Explore Clubs
          </Link>
          <Link to="/clubs/fit" className="btn btn-secondary">
            <Clock size={18} aria-hidden /> Find My Fit
          </Link>
          <Link to="/clubs/clubfund" className="btn btn-secondary">
            <LogIn size={18} aria-hidden /> Sign In / Get Started
          </Link>
        </div>
        <Stats />
      </section>

      <section aria-labelledby="home-features" className="mt-10">
        <h2 id="home-features" className="section-title">
          What you can do
        </h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.to} className="card card-hover group relative flex flex-col p-5">
              <span aria-hidden className="grid h-10 w-10 place-items-center rounded-lg bg-[#f7ecec] text-umass">
                <f.icon size={22} />
              </span>
              <h3 className="mt-3 flex items-center gap-1.5 text-[1.0625rem] font-bold text-ink">
                {/* the link's ::after covers the card, so the whole card is one click target */}
                <Link to={f.to} className="text-link after:absolute after:inset-0 after:rounded-[inherit] group-hover:underline">
                  {f.title}
                </Link>
                <ArrowRight size={16} aria-hidden className="text-link opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{f.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="home-start" className="card mt-10 bg-surface p-5 md:p-6">
        <h2 id="home-start" className="font-bold text-ink">
          Sign in / get started
        </h2>
        <p className="mt-1 text-sm text-ink">
          No account is needed to explore clubs, check your fit, save events or track applications: your choices stay in this browser. ClubFund asks
          you to verify your @umass.edu email with a one-time code before you link a Solana wallet.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/clubs/discover" className="btn btn-primary">
            Get started
          </Link>
          <Link to="/clubs/clubfund" className="btn btn-secondary">
            Sign in to ClubFund
          </Link>
        </div>
      </section>
    </div>
  );
}
