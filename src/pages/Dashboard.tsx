import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  CalendarClock,
  ClipboardCheck,
  ClipboardList,
  EllipsisVertical,
  FileCheck2,
  FilePen,
  HeartHandshake,
  Megaphone,
  MessagesSquare,
  NotebookPen,
  X,
} from 'lucide-react';
import type { AcademicKind, Course } from '../types';
import { ACADEMIC_ITEMS, COURSES, COURSE_BY_ID } from '../data/courses';
import { PatternCover } from '../components/PatternCover';
import { useStore } from '../context/StoreContext';
import { upcomingForClubs } from '../lib/schedule';
import { applicationTasks } from '../lib/applicationPlanner';
import { fmtDue, fmtRange, fmtTime, relativeDay } from '../lib/dates';
import { useTitle } from '../hooks/useTitle';

/*
 * Geometry follows the reference Canvas dashboard (measured in CSS px):
 * 48px content gutters, fixed 262px cards with 36px gaps, 146px card banners,
 * and a 288px right sidebar (240px content + 24px padding).
 */

const BADGE_ICONS: Record<keyof Course['badges'], { icon: LucideIcon; label: string }> = {
  announcements: { icon: Megaphone, label: 'Announcements' },
  assignments: { icon: NotebookPen, label: 'Assignments' },
  discussions: { icon: MessagesSquare, label: 'Discussions' },
};

const TODO_ICONS: Record<AcademicKind, LucideIcon> = {
  assignment: FilePen,
  quiz: ClipboardCheck,
  exam: ClipboardList,
  session: CalendarClock,
  discussion: MessagesSquare,
};

function CourseCard({ course }: { course: Course }) {
  return (
    <article
      className="group w-full overflow-hidden rounded-[4px] bg-white shadow-[0_2px_5px_rgba(0,0,0,0.3)] transition-shadow hover:shadow-[0_4px_12px_rgba(0,0,0,0.35)] sm:w-[262px]"
      style={{ '--course': course.color } as CSSProperties}
    >
      <div className="relative h-[146px]">
        <Link to="/courses" tabIndex={-1} aria-hidden className="absolute inset-0">
          <PatternCover color={course.color} variant={course.cover} className="h-full w-full" />
        </Link>
        <button
          type="button"
          className="absolute right-[13px] top-[13px] grid h-9 w-9 place-items-center rounded text-white hover:bg-black/15"
          aria-label={`Options for ${course.name} (prototype)`}
          title="Prototype — not functional"
        >
          <EllipsisVertical size={22} aria-hidden />
        </button>
      </div>
      <div className="px-5 pt-3">
        <Link
          to="/courses"
          className="block truncate text-base font-bold leading-[1.3] group-hover:underline"
          style={{ color: course.color }}
        >
          {course.name} {course.short}
        </Link>
        <p className="truncate text-base leading-[1.375] text-[#474747] group-hover:text-[var(--course)] group-hover:underline">{course.code}</p>
        <p className="text-xs leading-4 text-[#474747] group-hover:text-[var(--course)] group-hover:underline">{course.term}</p>
      </div>
      <div className="mb-2 mt-1 flex h-10 items-center">
        {(Object.keys(course.badges) as (keyof Course['badges'])[]).map((key) => {
          const { icon: Icon, label } = BADGE_ICONS[key];
          const count = course.badges[key] ?? 0;
          return (
            <span key={key} className="flex basis-1/4 justify-center">
              <Link
                to="/courses"
                className="relative grid h-9 w-9 place-items-center rounded text-[#474747] hover:bg-surface hover:text-link"
                aria-label={`${label}${count ? `, ${count} unread` : ''} (prototype)`}
              >
                <Icon size={21} strokeWidth={1.5} aria-hidden />
                {count > 0 && (
                  <span className="absolute left-[23px] top-[-8px] grid h-[18px] min-w-[18px] place-items-center rounded-full bg-badge px-1 text-[0.6875rem] font-bold leading-none text-white">
                    {count}
                  </span>
                )}
              </Link>
            </span>
          );
        })}
      </div>
    </article>
  );
}

function SidebarHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 border-b border-line-soft pb-2 text-[1.125rem] font-normal leading-[1.25] text-black">
      {children}
    </h2>
  );
}

function TodoPanel() {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const { followed, applications } = useStore();
  const now = new Date();
  const appTasks = applicationTasks(applications, now, 4);
  const todos = ACADEMIC_ITEMS.filter((a) => a.start > now && !dismissed.includes(a.id)).slice(0, 6);
  const clubItems = upcomingForClubs(followed, 7).slice(0, 3);

  return (
    <aside className="w-full px-4 pb-6 sm:px-8 lg:w-[288px] lg:shrink-0 lg:px-6 lg:pt-6" aria-label="To Do and upcoming">
      <div className="mx-auto mb-[17px] mt-2.5 hidden w-fit font-serif leading-[0.92] text-ink lg:block">
        <p className="text-[1.1875rem] tracking-[-0.01em]">
          University <span className="text-[0.8125rem] italic">of</span>
        </p>
        <p className="text-[1.1875rem] tracking-[-0.01em]">Massachusetts</p>
        <p className="text-[1.0625rem] text-umass">Amherst</p>
        <p className="mt-1.5 text-center font-sans text-[0.625rem] uppercase tracking-wider text-ink-soft">Student prototype</p>
      </div>

      <SidebarHeading>To Do</SidebarHeading>
      <ul className="pt-1 text-sm leading-[1.25]">
        {todos.map((t) => {
          const Icon = TODO_ICONS[t.kind];
          const course = COURSE_BY_ID[t.courseId];
          return (
            <li key={t.id} className="flex gap-2 py-1 pl-[22px]">
              <Icon size={20} strokeWidth={1.5} className="mt-[-1px] shrink-0 text-[#606060]" aria-hidden />
              <div className="min-w-0 flex-1">
                <Link to="/courses" className="block truncate text-link underline underline-offset-2 hover:text-link-dark">
                  {t.title}
                </Link>
                <p className="text-[#586874]">
                  {course?.name} {course?.code}
                </p>
                <p className="text-black">
                  {t.points ? `${t.points} points | ` : ''}
                  {t.end ? `${relativeDay(t.start)} · ${fmtRange(t.start, t.end)}` : fmtDue(t.start)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDismissed((d) => [...d, t.id])}
                className="grid h-7 w-7 shrink-0 place-items-center rounded text-[#273540] hover:bg-surface"
                aria-label={`Dismiss ${t.title}`}
              >
                <X size={18} strokeWidth={2.5} aria-hidden />
              </button>
            </li>
          );
        })}
        {todos.length === 0 && <li className="py-2 text-ink-soft">Nothing for now.</li>}
      </ul>
      <Link to="/clubs/campus-life" className="mt-1 inline-block pl-[22px] text-sm text-link hover:underline">
        Show all in My Campus Life
      </Link>

      <div className="mt-6" data-testid="todo-applications">
        <h3 className="flex items-center gap-1.5 pl-[22px] text-sm font-bold text-ink">
          <FileCheck2 size={16} className="text-[#5a3a8a]" aria-hidden /> MyClubs applications
        </h3>
        {appTasks.length ? (
          <ul className="pt-1 text-sm leading-[1.25]">
            {appTasks.map((t) => (
              <li key={t.id} className="py-1 pl-[22px]">
                <Link to={t.href} className="block truncate text-link underline underline-offset-2 hover:text-link-dark">
                  {t.title}
                </Link>
                <p className="text-[#586874]">{t.detail}</p>
                {t.when && <p className="text-black">{t.allDay ? relativeDay(t.when) : `${relativeDay(t.when)} · ${fmtTime(t.when)}`}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-1 pl-[22px] text-sm text-ink-soft">
            No application tasks.{' '}
            <Link to="/clubs/applications" className="text-link hover:underline">
              Applications
            </Link>
          </p>
        )}
        <p className="pl-[22px] text-xs text-ink-soft">From MyClubs — not Canvas assignments.</p>
      </div>

      <div className="mt-8">
        <SidebarHeading>
          <HeartHandshake size={18} className="text-umass" aria-hidden /> MyClubs: Coming Up
        </SidebarHeading>
      </div>
      {clubItems.length ? (
        <ul className="pt-1 text-sm leading-[1.25]">
          {clubItems.map((i) => (
            <li key={i.id} className="py-1 pl-[22px]">
              <Link to={i.href ?? '/clubs'} className="block truncate text-link underline underline-offset-2 hover:text-link-dark">
                {i.kind === 'meeting' ? `${i.title} — ${i.subtitle}` : i.title}
              </Link>
              <p className="text-ink">
                {relativeDay(i.start)} · {fmtRange(i.start, i.end)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-2 pl-[22px] text-sm text-ink-soft">
          Follow clubs to see their meetings here.{' '}
          <Link to="/clubs/discover" className="text-link hover:underline">
            Discover clubs
          </Link>
        </p>
      )}
    </aside>
  );
}

export default function Dashboard() {
  useTitle('Dashboard');
  return (
    <div className="flex flex-col lg:flex-row">
      <section className="min-w-0 flex-1 px-4 pb-6 pt-[29px] sm:px-8 lg:px-12">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line-soft pb-[17px]">
          <h1 className="text-[2.3125rem] font-bold leading-none text-black">Dashboard</h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn btn-secondary min-h-9 px-4 py-0 text-base"
              title="Prototype — not functional"
            >
              Switch to new dashboard view
            </button>
            <button
              type="button"
              className="grid h-9 w-8 place-items-center rounded text-ink hover:bg-surface"
              aria-label="Dashboard options (prototype)"
              title="Prototype — not functional"
            >
              <EllipsisVertical size={24} aria-hidden />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-9 pt-6">
          {COURSES.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      </section>
      <TodoPanel />
    </div>
  );
}
