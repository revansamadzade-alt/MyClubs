import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { CalendarDays, CalendarRange, ClipboardList, Clock, Gauge, HandCoins, LogIn, Search } from 'lucide-react';
import { useTitle } from '../hooks/useTitle';

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

/** The MyClubs homepage: what MyClubs is, and a way into each part of it. */
export default function Home() {
  useTitle('Home');
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-12 md:py-10">
      <section aria-labelledby="home-title" className="rounded-lg border border-line bg-white p-6 md:p-10">
        <p className="text-sm font-bold uppercase tracking-wide text-umass">UMass Amherst student organizations</p>
        <h1 id="home-title" className="mt-2 text-[2.25rem] font-bold leading-tight text-ink md:text-[2.75rem]">
          MyClubs
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-ink">
          Find clubs that match your interests and your class schedule, keep track of applications, and see club events next to your coursework.
        </p>
        <p className="mt-2 max-w-2xl text-sm text-ink-soft">
          MyClubs is the product; the Canvas-style layout around it is only a familiar setting. An independent HackUMass prototype, not affiliated with
          UMass Amherst or Instructure.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
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
      </section>

      <section aria-labelledby="home-features" className="mt-8">
        <h2 id="home-features" className="section-title">
          What you can do
        </h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.to} className="card flex flex-col p-4">
              <f.icon size={24} aria-hidden className="text-umass" />
              <h3 className="mt-2 font-bold text-ink">
                <Link to={f.to} className="text-link hover:underline">
                  {f.title}
                </Link>
              </h3>
              <p className="mt-1 text-sm text-ink-soft">{f.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="home-start" className="card mt-8 p-5">
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
