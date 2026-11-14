# MyClubs — HackUMass 2026

**Find the clubs that actually fit your week — right where you already check your classes.**

MyClubs is a prototype that adds an extracurricular layer to a Canvas-style dashboard. Students discover real UMass
Amherst organizations, see which ones fit around their class schedule, and plan academics and campus life in one
calendar that flags real time conflicts.

> Independent hackathon prototype. Not affiliated with, endorsed by, or connected to UMass Amherst or Instructure Canvas.
> Clubs and verified events come from public Campus Pulse listings; courses, the class schedule, deadlines and sample
> events are demo data.

![Find My Fit](docs/screenshots/03-find-my-fit.png)

## Features

- **Find My Fit** — checks every club's verified meeting times and upcoming Campus Pulse events against your demo
  class schedule, exams, followed clubs and saved events for the next 14 days. Clubs are grouped into *Fits*, *Partial
  fit* (with the exact overlap, e.g. "Overlaps COMPSCI 235 Lab (6:30 – 8:00 PM) for 90 min"), *Conflicts* and
  *Schedule unknown*. Optional interests re-rank results. No times are ever guessed.
- **My Campus Life** — month, week and agenda views combining classes, course deadlines, club meetings and events.
  Click any item for details; real overlaps are flagged with the exact window (assignment due times never count).
- **Discover** — 28 real UMass organizations with search, category filters, sorting and source-linked profiles.
- **Campus Events** — 19 verified upcoming events (official links, host club) plus clearly labeled sample events.
- **My Clubs** — follow/unfollow (tracking only, not membership), upcoming activity, persistence in `localStorage`
  that stays in sync across open tabs.
- **Canvas-style shell** — dashboard, global navigation and To Do panel matched to the real Canvas layout.

## How MyClubs differs from Campus Pulse

| Campus Pulse | MyClubs |
| --- | --- |
| Directory and official registration/RSVP | Planning layer that links back to Campus Pulse for both |
| Separate site students visit occasionally | Lives in the Canvas-style dashboard students open daily |
| Lists clubs and events | Checks clubs against *your* schedule (Find My Fit) |
| Events only | One calendar for classes, deadlines, meetings and events with conflict detection |

## Screenshots

| | |
| --- | --- |
| ![Dashboard](docs/screenshots/01-dashboard.png) | ![Discover](docs/screenshots/02-discover.png) |
| ![Club profile](docs/screenshots/04-club-profile.png) | ![My Campus Life](docs/screenshots/05-my-campus-life.png) |
| ![Conflict details](docs/screenshots/06-conflict-details.png) | ![Find My Fit](docs/screenshots/03-find-my-fit.png) |

## Run it

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # typecheck + production build
npm run preview   # serve the production build (offline backup)
```

Use **Reset demo** in the MyClubs header to restore the demo state. Judge walkthrough: [docs/DEMO.md](docs/DEMO.md).

The demo semester (Sep 2 – Dec 10, 2026) bounds weekly classes and club meetings; override it with
`VITE_SEMESTER_START`, `VITE_SEMESTER_END` and `VITE_SEMESTER_NAME` (see `src/config/semester.ts`).

## Tests

```bash
npm test           # logic tests: overlaps, deadlines, duplicates, semester bounds, verified dates, Find My Fit
npm run test:e2e   # browser suite (191 checks); needs `npm run dev` running and Google Chrome installed
```

Both suites use a fixed clock (default `2026-11-13T12:00:00`, America/New_York) so results never depend on today's
date. Override with `MYCLUBS_TEST_NOW`, `MYCLUBS_TEST_TZ`, `MYCLUBS_BASE_URL` and `CHROME_PATH`.

## Built with

React 19, TypeScript, Vite, Tailwind CSS v4, React Router, Lucide icons. No backend: state lives in `localStorage`.
Club and event data were pulled from Campus Pulse's public listings and committed as static TypeScript.

## Data and honesty

- 28 active organizations and 19 public events from Campus Pulse (retrieved 2026-11-13); every profile and event links
  to its source. Meeting times appear only when a listing states day, start and end time (Chess Club, Accounting
  Association); other clubs are shown as *schedule unknown*.
- No invented emails, member counts, reviews or events. Reviews are demo reviews written in your browser.
- Following a club is not membership; saving an event is not an RSVP.
- Courses, the weekly class schedule, deadlines and sample events are fictional demo data, generated relative to today.

## Project structure

```
src/
  data/        clubs.ts + verifiedEvents.ts (Campus Pulse), courses.ts + events.ts (demo)
  lib/         dates, schedule builder + overlap detection, fit.ts (Find My Fit)
  context/     StoreContext (follows, saves, reviews), ToastContext
  components/  AppShell, GlobalNav, cards, reviews, shared UI
  pages/       Dashboard, placeholders, clubs/* (MyClubs pages)
```
