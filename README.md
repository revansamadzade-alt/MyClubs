# MyClubs — HackUMass 2026

A prototype of what Canvas could look like if students could manage academic and extracurricular life in one place.
The Canvas-style shell (Dashboard, Courses, Groups, …) is visual only; **MyClubs** is the working feature.

> Independent hackathon prototype. Not affiliated with, endorsed by, or connected to UMass Amherst or Instructure Canvas.
> Clubs are real UMass Amherst student organizations from public Campus Pulse listings; courses, deadlines and events are sample data.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build
```

## MyClubs features

| Page | Route | What works |
| --- | --- | --- |
| Discover | `/clubs/discover` | Search, category chips, follow filter, sort, follow/unfollow, club profiles |
| Club profile | `/clubs/discover/:id` | Official description, Campus Pulse source + links, verified schedule and next meeting (when listed), star-rating reviews |
| My Clubs | `/clubs/following` | Followed clubs, next meetings, 14-day activity feed, unfollow |
| Campus Events | `/clubs/events` | All / Saved / From followed clubs tabs, search, category + date filters, save/unsave |
| Event detail | `/clubs/events/:id` | Full info, save, schedule-conflict check |
| My Campus Life | `/clubs/campus-life` | Month / week / agenda calendar of sample course work, followed clubs' verified weekly meetings, and saved events; click any item for details; real time overlaps flagged with the overlap window (due times never count as conflicts) |

Follows, saved events and reviews persist in `localStorage` (`myclubs:*` keys). Use **Reset demo** in the MyClubs header to restore defaults.
Sample dates are generated relative to today, so the demo always shows upcoming items.

## Club data

`src/data/clubs.ts` holds 28 active UMass Amherst student organizations. Names, summaries, descriptions,
council tags and official links come from each organization's public Campus Pulse listing
(`https://umassamherst.campuslabs.com/engage/organization/<id>`, retrieved 2026-11-13); every profile links to its source.

`src/data/verifiedEvents.ts` holds 19 real upcoming public events from Campus Pulse
(`https://umassamherst.campuslabs.com/engage/event/<id>`), each linked to its host organization, with published
start/end times (stored with their UTC offset, shown in local time). Saving one does not RSVP or register.
Demo events stay in `src/data/events.ts`, are labeled "Sample event" everywhere and are never linked to a club.

- Meeting schedules are included only when the listing states the day, start time and end time (Chess Club,
  Accounting Association). Incomplete schedules are shown as text on the profile and never added to the calendar.
- No emails, member counts or events are invented. Contact goes through the Campus Pulse page and listed links.
- Category, initials, colors and cover art are MyClubs display choices (no official logos are used).
- Reviews are demo reviews written in this browser; none are pre-filled or attributed to real students.

## Structure

```
src/
  data/        real clubs (Campus Pulse) + sample courses, academic items, events
  lib/         date helpers, schedule builder + overlap detection
  context/     StoreContext (follows, saves, reviews), ToastContext
  components/  AppShell, GlobalNav, cards, reviews, shared UI
  pages/       Dashboard, placeholders, clubs/* (MyClubs pages)
```
