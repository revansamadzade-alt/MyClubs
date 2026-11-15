# MyClubs final UI polish — review notes

Branch: `polish/final-ui` (local only; not pushed, merged or deployed).
Base: `master` at `9a2bd9f`, which is what https://my-clubs-five.vercel.app serves.

The changes are visual only: CSS, Tailwind class names and one small presentational component (the homepage
numbers). No routes, data, Find My Fit logic, application storage, Supabase, Edge Functions, wallet, signing or
Solana code changed.

## How to compare

| Folder | What it holds |
| --- | --- |
| `before/` | The live production site (master), 17 pages at 1440 px and 375 px |
| `after/` | The same pages on this branch |
| `compare/` | Before and after side by side, one image per page and width |
| `before/report.json`, `after/report.json` | Horizontal overflow and console errors at 375, 768, 1024, 1440 and 1920 px |
| `e2e-final-dev.txt`, `e2e-final-prodbundle.txt` | Full browser test output on the final code |

Start with `compare/home--desktop-1440.png`, `compare/clubfund-campaign--desktop-1440.png`,
`compare/clubfund--mobile-375.png` and `compare/applications--mobile-375.png`.

Rebuild the screenshots with `node ui-review/shoot.mjs before https://my-clubs-five.vercel.app` and
`node ui-review/shoot.mjs after` (with `npm run dev` running).

## What changed

### Bugs fixed

- **Disabled buttons looked enabled.** There was no disabled style, so for example "Support This Campaign"
  (disabled until you verify an email and link a wallet) and "Verify" (disabled until the full code is typed) looked
  clickable and did nothing. Disabled buttons are now dimmed, lose their shadow and hover effect, and show a
  not-allowed cursor.
- **Applications page scrolled sideways on phones.** At 375 px the page was 433 px wide because a long button label
  could not wrap. Button labels now wrap on screens under 480 px. All 17 pages now fit at 375, 768, 1024, 1440 and
  1920 px.
- **ClubFund setup steps were cut off on phones** ("Verify UMass e…", "Sign to prove o…"). The labels now wrap, and
  completed steps turn green.

### Homepage

- Logo mark next to the MyClubs title, a maroon top edge on the hero and larger, more readable intro text.
- A row of three numbers under the buttons: student organizations, interest categories and upcoming verified campus
  events. They are counted from the same data the app uses, so they stay correct when the data is refreshed.
- Feature cards: icon in a soft maroon tile, the whole card is clickable (one link, so keyboard and screen-reader
  behaviour is unchanged), a gentle lift on hover or keyboard focus, and an arrow that appears on hover.

### Across the app

- Shared design values in `src/index.css`: one corner radius for cards, panels, notices, inputs and buttons, and two
  shadow levels (resting and raised).
- Buttons: press feedback, clearer primary weight, hover states that do not fire on disabled buttons.
- Inputs: hover border, a soft focus halo in addition to the existing outline, a red halo on invalid fields, and a
  disabled style.
- Filter chips: hover background; the selected chip darkens on hover.
- Club, event, Find My Fit and ClubFund campaign cards lift slightly on hover or when something inside has keyboard
  focus.
- Empty states and the "page not found" card use the same soft panel style.
- The page-loading message now shows a spinner (still announced to screen readers; it stops spinning when reduced
  motion is on).

### Find My Fit

- Each match card separates the club header from its schedule with a divider.
- Schedule overlaps ("Overlaps Exam 2 Review Session… for 60 min") are shown as an amber tag, so conflicts stand
  out from free times without relying on colour alone (the warning icon and wording are unchanged).

### ClubFund

- "Open for Devnet contributions" is a green status pill on campaign cards and the campaign page.
- Campaign page support panel: green top edge, sections separated by dividers, and the recipient Devnet wallet shown
  in a grey monospace box so the address is easy to read and copy.
- Contribution dialog: the recipient address uses the same box, the review step's From / To / Amount / Fee summary
  sits in a panel, and a verified contribution is shown in a green confirmation panel. The wording, Devnet labels and
  every step of the flow are unchanged.

### Applications

- On phones the demo application card aligns the logo with the heading instead of floating it beside the paragraph.

## Accessibility

Checked, not certified. What was verified on this branch:

- Keyboard: Tab order on the homepage runs skip link, global navigation, hero buttons, feature cards, then the
  sign-in section, and every stop has a visible 2 px focus outline (`after/keyboard-focus--desktop-1440.png`).
  The browser suite's keyboard, dialog and form-error checks pass.
- Disabled controls are now visually distinct (WCAG 1.4.11 does not require contrast for disabled controls, but users
  need to see they are disabled).
- Reduced motion: the existing global rule disables transitions and animations; the new spinner also has
  `motion-reduce:animate-none`.
- Colour: conflicts keep their icon and text; the new amber tag adds emphasis but is not the only signal.
- Touch targets: buttons are at least 32 px tall, above the WCAG 2.2 minimum of 24 px.
- No headings were added or reordered; the homepage still has one `h1`.

Not done: a full manual screen-reader pass and an automated contrast audit of every state.

## Not changed on purpose

- The Canvas-style navigation rail, mobile header and section navigation.
- The Dashboard (it deliberately mirrors Canvas).
- Anything behind sign-in that needs a real email code or wallet. Those screens were reviewed in code and are covered
  by the browser suite's mocked-backend ClubFund tests.
