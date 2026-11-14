# MyClubs — Judge Demo Kit

## Before you present (2 minutes of prep)

1. `npm run dev` (or `npm run build && npm run preview` for the offline backup) and open the app in a **fresh
   browser window**.
2. Open MyClubs and click **Reset demo** → confirm. This restores: following Chess Club and UMass Robotics Club; saved
   Fall Career & Internship Fair and Fall A Cappella Showcase (sample events).
3. Window at least 1280 px wide. Close other tabs. Zoom 100%.
4. Check that **Find My Fit** shows Accounting Association under *Fits your schedule* and Chess Club under
   *Partial fit*. Both come from weekly schedules and do not depend on dates.

## 2-minute script

| Time | Do | Say |
| --- | --- | --- |
| 0:00 | Show the Canvas-style dashboard | "Every UMass student opens Canvas daily. Clubs live somewhere else — Campus Pulse — and nothing tells you if a club even fits your week." |
| 0:15 | Click **MyClubs** in the sidebar | "MyClubs adds campus life right into that dashboard, using real UMass organizations from Campus Pulse." |
| 0:25 | Type `robot` in search, then click the **Business** chip, then clear | "28 real organizations — search, filter, sort. Every profile links to its official source." |
| 0:40 | Click **Find My Fit** | "Here's the core idea. We compare each club's verified meeting times and real upcoming events with your class schedule." |
| 0:55 | Point at Accounting Association (Fits) and Chess Club (Partial fit) | "Accounting meets Wednesdays at six — you're free. Chess Club meets Thursdays too, which overlaps your Thursday lab by exactly 90 minutes. Clubs that don't publish times are kept separate — we never guess." |
| 1:10 | Click **Follow** on Accounting Association | "One click to follow. The rest of the app updates instantly." |
| 1:20 | Open **Campus Events**, choose a verified event (e.g. *General Body Meeting: Coping with Family Stress*), click **Save** | "Real events from Campus Pulse. Saving puts it on my calendar — it doesn't RSVP; the official link does that." |
| 1:35 | Open **My Campus Life** (Week view, next week) | "Classes, deadlines, club meetings and events in one calendar. The conflict panel shows exactly where my week collides." |
| 1:50 | Click the Thursday **COMPSCI 235 Lab** item | "Click anything for details — here's the 90-minute overlap with Chess Club. Assignment due times never count as conflicts." |
| 2:00 | Close | "MyClubs: find clubs that fit your life, not just your interests." |

## Backup plan

- **No Wi-Fi:** run `npm run build && npm run preview` before judging; the app has no runtime network dependency
  except Google Fonts (falls back to system fonts).
- **Something looks off:** click **Reset demo** in the MyClubs header, or clear site data and reload.
- **Verified events have passed:** the demo still works with sample events (Campus Events → source filter
  *Sample events only*) and the weekly class/club schedules; Find My Fit's key examples are weekly.
- **Laptop failure:** walk through `docs/screenshots/` (dashboard → discover → find my fit → profile → calendar →
  conflict details) in that order using the same script.
- **Questions about data:** clubs/events come from public Campus Pulse listings (links on every page); courses,
  class schedule and sample events are labeled demo data; no Canvas or UMass integration is claimed.

## Project description (Devpost)

**Inspiration.** UMass has hundreds of student organizations, but students find them on a separate site and only
discover schedule clashes after they show up. We wanted club discovery to happen where students already plan their
week.

**What it does.** MyClubs adds an extracurricular section to a Canvas-style dashboard. Students browse 28 real UMass
organizations, follow clubs, save real upcoming events, and see everything in one calendar with academic deadlines and
classes. *Find My Fit* checks every club's verified meeting times and events against the student's schedule and
explains each overlap down to the minute.

**How we built it.** React, TypeScript, Vite and Tailwind CSS, with deterministic scheduling logic (weekly recurrence,
interval overlap detection) shared by the calendar and Find My Fit. Organization and event data were pulled from
Campus Pulse's public listings and committed as static data with source links. State persists in `localStorage`.

**Challenges.** Matching Canvas's layout precisely, and handling real data honestly: most clubs don't publish meeting
times, so the app shows "schedule unknown" instead of inventing times.

**Accomplishments.** A complete, tested journey (165 automated browser checks) from dashboard to a conflict-aware
calendar, with verified data and clear demo labels.

**What's next.** Live Campus Pulse sync, real class schedules (with student consent), and sharing schedules with
friends to find clubs you can join together.

## Suggested prize categories

Confirm against the official HackUMass 2026 prize list and eligibility rules before submitting.

- **Best UMass Hack** — built for UMass students with real UMass organizations and campus events.
- **Best UI/UX** — Canvas-faithful interface, one-click flows, accessible dialogs and keyboard navigation.
- **Best Pitch** — clear problem, live 2-minute demo with a memorable moment (Find My Fit explaining a 90-minute clash).
