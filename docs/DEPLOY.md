# Deploying MyClubs

MyClubs is a static single-page app. There is no backend, no database, no secrets and no environment variables are
required. Everything a student enters stays in their browser (localStorage and IndexedDB).

## What Vercel does (`vercel.json`)

- **Build command:** `npm run build:fresh` → `scripts/build-fresh.mjs`
  1. Refreshes `src/data/generated/campus-data.json` from the public feeds (`npm run sync:data`). Each source that fails
     keeps its previous data; if the sync fails outright or produces an unusable snapshot, the committed snapshot is
     restored and the build continues.
  2. Runs `npm run build` (typecheck + Vite production build into `dist/`).
- **Routing:** every path rewrites to `/index.html`, so deep links and refreshes (for example
  `/clubs/applications/demo-org/apply`) load the app. Hashed assets in `dist/assets/` are served as files.
- **Runtime:** the deployed site never fetches the feeds; it shows the dated snapshot and labels it "snapshot, not live".

To deploy exactly the snapshot that was tested (no refresh at build time), change `buildCommand` in `vercel.json` to
`npm run build`.

## Release checklist (local)

```bash
npm ci
npm run typecheck
npm test                                   # 38 unit + feed tests
npm run build
npx vite preview --port 4173 --strictPort  # in a second terminal
MYCLUBS_BASE_URL=http://localhost:4173 npm run test:e2e   # 366 browser checks on the production build
```

Optional, before a deploy: `npm run check:membership` re-checks the verified membership statements against the public
organization pages and prints anything that needs a person to review.

## Publishing (requires the owner's approval — not done automatically)

1. Create an empty GitHub repository (no README), then:
   ```bash
   git remote add origin https://github.com/<owner>/<repo>.git
   git push -u origin master
   git push origin feat/real-umass-clubs
   ```
   GitHub Actions (`.github/workflows/ci.yml`) then runs typecheck, unit tests, build and the browser suite on the
   production build.
2. In Vercel: **Add New → Project → Import** the repository. Framework preset: Vite. Leave the build command and
   output directory to `vercel.json` (`npm run build:fresh`, `dist`). No environment variables.
3. After the first deploy, open `/`, `/clubs/discover` and refresh a nested route such as
   `/clubs/applications/demo-org/apply` to confirm the rewrite works.
