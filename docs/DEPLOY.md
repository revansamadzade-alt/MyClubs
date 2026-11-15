# Deploying MyClubs

MyClubs is a static single-page app on Vercel. Everything except ClubFund stays in the student's browser
(localStorage and IndexedDB) and needs no backend. **ClubFund** uses the Supabase project `zanhvwuvuvfxetqkojbw`
(Auth, Postgres, four Edge Functions) and Solana **Devnet**. See [CLUBFUND.md](CLUBFUND.md).

## What Vercel does (`vercel.json`)

- **Build command:** `npm run build` (typecheck + Vite production build into `dist/`), so the deploy ships exactly the
  committed, tested data snapshot. `npm run build:fresh` (`scripts/build-fresh.mjs`) instead refreshes
  `src/data/generated/campus-data.json` from the public feeds first (each failing source keeps its previous data; an
  unusable sync falls back to the committed snapshot); switch `buildCommand` back to it to refresh data on each deploy.
- **Routing:** every path rewrites to `/index.html`, so deep links and refreshes (for example
  `/clubs/clubfund/campaigns/demo-club-equipment` or `/clubs/applications/demo-org/apply`) load the app. Hashed assets
  in `dist/assets/` are served as files (Vercel serves existing files before applying rewrites).

`.vercelignore` keeps `.env*` files and local build/test output out of CLI uploads.

## Environment variables

Vite inlines `VITE_` variables into the public bundle at **build time**, so only public values may use that prefix.

| Where | Name | Value | Required |
| --- | --- | --- | --- |
| Vercel (Production; Preview if wanted) | `VITE_SUPABASE_URL` | `https://zanhvwuvuvfxetqkojbw.supabase.co` | for ClubFund |
| Vercel (Production; Preview if wanted) | `VITE_SUPABASE_PUBLISHABLE_KEY` | the project's **publishable** key (`sb_publishable_…`) | for ClubFund |
| Vercel | `VITE_SOLANA_DEVNET_RPC_URL` | a dedicated **Devnet** RPC URL (optional; default `https://api.devnet.solana.com`) | no |
| Supabase → Edge Functions → Secrets | `CLUBFUND_ALLOWED_ORIGINS` | exact origins, comma-separated, e.g. `https://<app>.vercel.app,http://localhost:5173,http://localhost:4173` | for the deployed site |
| Supabase → Edge Functions → Secrets | `SOLANA_DEVNET_RPC_URL` | a dedicated **Devnet** RPC URL (optional) | no |

Never put the secret / service-role key, an SMTP password or any private key in a `VITE_` variable or in the repo.
`SUPABASE_URL` and the secret keys are provided to Edge Functions by Supabase automatically.

Without the two `VITE_SUPABASE_*` variables the site still works; ClubFund shows "ClubFund isn't set up on this copy".
Both RPC URLs are checked against the Devnet genesis hash; a non-Devnet endpoint turns contributions off.

### Allowed origins (CORS)

`CLUBFUND_ALLOWED_ORIGINS` takes **exact** origins only (`scheme://host[:port]`, no path). Wildcards such as
`https://*.vercel.app` or `*` are rejected and logged, never treated as "allow all". When it is unset (or has no valid
entry) only `http://localhost:5173` and `http://localhost:4173` are allowed, so **include those two in the value** to
keep local development working. Refused origins are logged in the function logs as
`origin_not_allowed: <origin> is not in CLUBFUND_ALLOWED_ORIGINS`, and the site shows "ClubFund's server is reachable
but blocked this request from <origin>".

Set it once the production URL is known (approval required; it changes live configuration):

```bash
npx supabase@2.122.0 secrets set --project-ref zanhvwuvuvfxetqkojbw \
  CLUBFUND_ALLOWED_ORIGINS="https://<app>.vercel.app,http://localhost:5173,http://localhost:4173"
```

Secrets apply to new function invocations without a redeploy. **Preview deployments** get a new URL each time; to use
ClubFund on one, add that exact URL (or the stable branch alias `https://<app>-git-<branch>-<team>.vercel.app`)
temporarily. Everything else on a preview works without it.

## Release checklist (local)

```bash
npm ci
npm run typecheck                          # app + every Edge Function file
npm test                                   # unit, backend, PGlite database, RPC and recipient tests
npm run build
npm run dev                                # http://localhost:5173 in a second terminal
npm run test:e2e                           # full browser suite (ClubFund uses a mocked Supabase + mocked Devnet)
npx vite preview --port 4173 --strictPort  # production build, in another terminal
MYCLUBS_BASE_URL=http://localhost:4173 MYCLUBS_CLUBFUND_PREVIEW=1 npm run test:e2e   # browser suite on production builds
npm run clubfund:recipients                # read-only: which campaigns can take contributions
```

Optional, before a deploy: `npm run check:membership` re-checks the verified membership statements against the public
organization pages and prints anything that needs a person to review.

## Publishing (requires the owner's approval — not done automatically)

The repository is `https://github.com/revansamadzade-alt/MyClubs` (`master`).

1. Push the reviewed branch and merge it into `master` (GitHub Actions runs typecheck, unit tests, build and the
   browser suite on the production build).
2. In Vercel: import the repository (framework preset Vite; build command and output come from `vercel.json`), then
   add the environment variables above for **Production** and redeploy.
3. Set `CLUBFUND_ALLOWED_ORIGINS` (above) to include the production URL.
4. After the deploy, open `/` (the MyClubs homepage), `/dashboard`, `/clubs/discover`, `/clubs/clubfund` and refresh a nested route such as
   `/clubs/clubfund/campaigns/demo-club-equipment` to confirm the rewrite works.
