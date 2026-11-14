# MyClubs — HackUMass 2026

A prototype of what Canvas could look like if students could manage academic and extracurricular life in one place.
The Canvas-style shell (Dashboard, Courses, Groups, …) is visual only; **MyClubs** is the working feature.

> Independent hackathon prototype. Not affiliated with, endorsed by, or connected to UMass Amherst or Instructure Canvas.
> All courses, clubs, events and deadlines are sample data.

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
| Club profile | `/clubs/discover/:id` | Meetings, next meeting, club events, star-rating reviews |
| My Clubs | `/clubs/following` | Followed clubs, next meetings, 14-day activity feed, unfollow |
| Campus Events | `/clubs/events` | All / Saved / From followed clubs tabs, search, category + date filters, save/unsave |
| Event detail | `/clubs/events/:id` | Full info, save, schedule-conflict check |
| My Campus Life | `/clubs/campus-life` | Week + agenda views of deadlines, club meetings and saved events, with overlaps flagged |

Follows, saved events and reviews persist in `localStorage` (`myclubs:*` keys). Use **Reset demo** in the MyClubs header to restore defaults.
Sample dates are generated relative to today, so the demo always shows upcoming items.

## Structure

```
src/
  data/        sample courses, academic items, clubs, events
  lib/         date helpers, schedule builder + overlap detection
  context/     StoreContext (follows, saves, reviews), ToastContext
  components/  AppShell, GlobalNav, cards, reviews, shared UI
  pages/       Dashboard, placeholders, clubs/* (MyClubs pages)
```
