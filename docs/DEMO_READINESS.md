# MyClubs — HackUMass XIV demo readiness

Branch `fix/demo-readiness` (local, **not pushed**), on top of `master` = `origin/master` = `166a133`.
Supabase project `zanhvwuvuvfxetqkojbw`. Checked on 2026-11-15.

## Real transaction status

- **Real wallet link: done.** 2026-11-15 08:06:58–08:07:02 UTC. `wallet-challenge` returned 200, then `wallet-link`
  returned 200. The server checked the challenge, compared the exact signed bytes and verified the Ed25519 signature
  before storing the link. Linked wallet: the account active in Phantom at the time, `71sn…KuWz` (Devnet, on the
  owner's @umass.edu account). The app links whichever account is selected and verified in Phantom; no wallet address
  is hard-coded.
- **Real Devnet contribution: not yet.** The linked wallet has 0 Devnet SOL (checked 2026-11-15); it needs the faucet
  first.
- Earlier unfinished attempts (02:58–02:59 and 07:07 UTC) stopped inside Phantom: "the chain ID does not match the
  provided chain ID for verification". The challenge carried the optional SIWS `Chain ID` line, which Phantom
  compares with its own network. That line was removed in `c8034d2` (deployed 08:08 UTC).

## Deployed 2026-11-15 (all approved)

- 07:44 UTC: migration `20261115090000_clubfund_challenge_reuse_and_rate_limits.sql` applied (`db push`).
  - New functions and table verified; grants are service-role only, with RLS.
  - Existing objects and campaigns unchanged.
  - Supabase had no platform backup yet (PITR off, daily list empty), so a read-only snapshot of all public rows and
    function definitions was taken first.
- 07:45 UTC: `demo-club-equipment` recipient set to `6Q5tJXKhJ6yL6AYeHkyrKcFvKgEjmszCQniegH5qP8gV` (exactly one row;
  the other five untouched).
- 08:08 UTC: `wallet-challenge`, `wallet-link`, `wallet-unlink`, `campaign-contribute` redeployed from `c8034d2`
  (version 3, ACTIVE, `verify_jwt: true`).
  - Challenges have no `Chain ID` line; recipient wallets can't be linked.
  - Credential-free probes unchanged, and the logs show no errors.
  - Rollback: `git worktree add ../myclubs-rollback 5da6db2`, then from there
    `npx supabase@2.122.0 functions deploy wallet-challenge wallet-link wallet-unlink campaign-contribute --project-ref zanhvwuvuvfxetqkojbw --use-api`.
- Not done (by request): Auth hook, `CLUBFUND_ALLOWED_ORIGINS`, Vercel, GitHub push.

## Completed fixes

| # | Problem | Root cause | Fix | Files |
| --- | --- | --- | --- | --- |
| 1 | "Too many verification requests" lockout | Each signing attempt (and reload) minted a new challenge, so cancelled, failed or stuck Phantom signatures used up the 5-per-10-minutes limit | Browser keeps and reuses the open challenge (tab-scoped; bound to account, wallet, purpose and site). Server returns the open challenge instead of a new one. The limit on new challenges is unchanged | `src/lib/clubfund/challenge.ts`, `src/pages/clubs/clubfund/useWalletProof.tsx`, migration `20261115090000`, `supabase/functions/_shared/{handlers,runtime}.ts` |
| 2 | A double click could send two requests | Button disabled only after a re-render | Synchronous in-flight guard | `useWalletProof.tsx` |
| 3 | A wallet popup that never answers left the page stuck | Only way out was a reload, which minted another challenge | "Stop waiting": a late result is ignored and the challenge is reused | `useWalletProof.tsx` |
| 4 | Wallet failures were opaque | The wallet's error text was dropped | Shown as "Wallet message: …" | `src/lib/clubfund/wallets.ts` |
| 5 | The rate limit gave no timing | No retry information | Server sends `retryAfterSeconds` and `Retry-After`. The button shows a countdown that survives reloads | `handlers.ts`, `api.ts`, `useWalletProof.tsx` |
| 6 | Account switch mid-signature | The signature would be for the old account | Attempt cancelled, with guidance | `useWalletProof.tsx` |
| 7 | Expired challenge kept and retried | Not discarded | Discarded; the next attempt fetches a fresh one | `challenge.ts`, `useWalletProof.tsx` |
| 8 | No per-student limit on contribution checks | Each check reads Devnet 2–3 times | 20 checks per 10 minutes per student, stored in `clubfund_rate_events`. Re-checks of counted signatures are free; over the limit returns `verify_rate_limited` with the wait | migration, `contribute.ts`, `runtime.ts` |
| 9 | A rate-limited or failed verification could drop a saved contribution | Unknown error codes cleared the pending record | Record kept, with "Check again" and the wait time | `src/lib/clubfund/flow.ts` |
| 10 | A lost contribution result (other browser, cleared storage) couldn't be recovered | Only the tab's saved record could resume it | "Check a transaction" by signature. The server verifies sender, recipient, memo and amount, and counts it once. Nothing is sent | `CampaignPage.tsx`, `flow.ts`, `solana.ts` |
| 11 | Public Devnet RPC rate limits | Single attempt, no backoff | Reads (browser and server) retry with jittered backoff and honour `Retry-After`. Identical reads are shared; polling backs off. `sendTransaction` is never repeated | `src/lib/clubfund/devnet.ts`, `solana.ts` (`rpcRead`), `runtime.ts` |
| 12 | The production site would get `origin_not_allowed`, shown as a misleading "can't reach" | Localhost-only default; the browser hides CORS failures | Strict exact-origin parsing (wildcards rejected and logged). Refused origins are logged. The browser now says "reachable but blocked this site" | `handlers.ts`, `runtime.ts`, `api.ts` |
| 13 | No safe way to configure a recipient | Manual SQL only | `npm run clubfund:recipients` (read-only status). `scripts/clubfund-recipient.mjs check` validates, looks up Devnet, and prints the one-campaign SQL without running it | `scripts/` |
| 14 | Flaky browser checks | `15 Find My Fit` read the page before it re-rendered after reload; `13 Real data` read a profile before a slow load finished | Wait for the element; the assertion is unchanged | `tests/e2e/qa.mjs` |
| 15 | `docs/DEPLOY.md` said "no backend, no env vars" | Outdated | Rewritten: env vars, allowed origins, preview URLs, release checklist | `docs/DEPLOY.md` |

## Test results

| Suite | Kind | Result |
| --- | --- | --- |
| `npm run typecheck` (app + every Edge Function file) | static | pass |
| `npm test` | mocked unit + backend handlers + PGlite database/RLS + RPC + recipient | **105/105** |
| `npm run build` | production build | pass |
| `npm run test:e2e` on the dev server | mocked browser | 449/450 first run; the failure was a reload race in `15 Find My Fit`, fixed; that section reruns 19/19 |
| `MYCLUBS_BASE_URL=http://localhost:4173 MYCLUBS_CLUBFUND_PREVIEW=1 npm run test:e2e` | mocked browser on production builds | 455/456 first run; the failure was a slow-navigation race in `13 Real data`, fixed; sections 13 + 15 rerun 23/23. Full clean rerun: see the last line of this table |
| ClubFund section on the production build | mocked browser | **92/92** (link, unlink, challenge reuse, double click, stuck popup, wallet error, rate-limit countdown, expired challenge, contributions, wallet rejection, node refusal, delayed verification, resume after refresh, failed/expired transactions, server refusal, signature recheck, wrong wallet, wrong network, Devnet down, entry points, a11y, 375 px) |
| Direct routes on `vite preview` | HTTP | `/`, `/clubs/clubfund`, a campaign page, settings, an apply form and an event page all return 200 |
| Live backend, credential-free probes | read-only live | 33/33 (2026-11-15 02:58 UTC run) |
| Auth hook function | read-only live | `{}` for @umass.edu; 403 for gmail, look-alike, subdomain and phone-only signups. Grants correct |
| Pending migration dry-run | read-only live | only `20261115090000_clubfund_challenge_reuse_and_rate_limits.sql` pending; no name clashes; Postgres 17.11 |
| Real wallet / real Devnet transaction | live | **not run** (needs your approvals in Phantom) |
| Full clean rerun on production builds (all sections, after both fixes) | mocked browser | **458/458**, 0 console issues |
| Full run on production builds after the Phantom chain ID fix (`c8034d2`) | mocked browser | **464/464**, 0 console issues |

`/verify` (gstack-checks): typecheck PASS and build PASS. Tests show UNMAPPED, because the tool reads its source-to-test
map (`.gstack/pregate.json`, added on this branch) only from `origin/master`.

## Verified working features

- **Live, read-only:**
  - Both 2026-11-14 migrations are applied. The four functions are ACTIVE with JWT verification.
  - Credential-free probes: no login or a forged token gets 401, and foreign origins get no CORS grant.
  - Anonymous visitors can't read wallets, challenges or contribution owners, can't write campaigns, totals or contributions, and can't call service-role SQL.
  - The real app loads 6 campaigns with no setup warning.
  - The Auth hook function behaves correctly.
- **Mocked, in the browser:**
  - The whole MyClubs app: Discover, search and filters, profiles, Follow, My Clubs, Find My Fit, conflicts, Campus Events, My Campus Life, Applications, drafts, résumé uploads, persistence, navigation, accessibility and responsive layouts.
  - Every ClubFund flow listed above, on the dev server and on production builds.

## Still blocked (needs you)

1. **The real Devnet contribution.** Fund the linked wallet at the faucet, then contribute 0.01 SOL (checklist below).
2. **Enable the Auth hook:** Dashboard → Authentication → Hooks → *Before User Created* → Postgres → schema `public`
   → `hook_before_user_created_umass_only`. The read-only check found no problem with the function.
3. **Vercel:**
   - Push `fix/demo-readiness` and merge into `master`.
   - Import or redeploy the project in Vercel with the env vars below.
   - Then send the production URL so `CLUBFUND_ALLOWED_ORIGINS` can be set (approval needed).

## Security status

- **Wallet ownership:**
  - An Ed25519 signature over the exact server-issued challenge.
  - Single use, bound to account, wallet, purpose and site, with a 5-minute expiry.
  - 5 new challenges per 10 minutes. Retries reuse the open challenge, never bypass the limit.
- **Contributions:**
  - The server reads the transaction from Devnet itself (genesis-hash checked).
  - The sender must be the verified wallet, and the recipient the confirmed campaign recipient.
  - The amount must be exact integer lamports, matched by the recipient's balance change.
  - The transaction must carry exactly one campaign memo and be confirmed.
  - Signatures are unique and recording is idempotent; each student gets 20 checks per 10 minutes.
- **Database access:**
  - Browsers can read campaigns, the public history, and only their own link and ownership rows.
  - Browsers can't write anywhere; the privileged SQL is service-role only.
  - The advisor shows two expected notices: a table with no policy (by design) and leaked-password protection (irrelevant to email codes).
- **Secrets:** none in the repo, and `.env.local` is git-ignored. Only the URL and publishable key are public (`VITE_`). The pending diff was scanned.
- **Known risks:**
  - The public Devnet RPC may rate-limit during the demo; set a dedicated Devnet RPC to reduce that.
  - The allowed-origin list must include the production URL.
  - Until the migration is applied, the server still mints a new challenge per request. The browser fix already stops retries from doing so.
  - The Auth hook is off until enabled.

## Deployment readiness

- **Code:** branch `fix/demo-readiness`, local and not pushed. Commits:
  - `abe8011`: server hardening
  - `19fa80c`: browser fixes
  - `cb83bcd`: recipient script
  - `5da6db2`: docs and test waits
  - `b08824e`: deployment record
  - `c8034d2`: Phantom chain ID fix
  - plus this update
- **Supabase:**
  - Done: migrations, functions v3, recipient.
  - Pending: `CLUBFUND_ALLOWED_ORIGINS` once the Vercel URL is known (see below).
  - Optional: `SOLANA_DEVNET_RPC_URL` (server) and `VITE_SOLANA_DEVNET_RPC_URL` (Vercel) for a dedicated Devnet RPC.
- **Production bundle checked against the live backend** (`vite preview` on 4173, an allowed local origin):
  - Direct routes return 200.
  - 6 campaigns load, 1 open, recipient shown with a Devnet Explorer link, no setup warnings, no console errors.
  - All four functions answer the preflight from that origin.
  - The bundle contains only the project URL and publishable key; no secrets.
- **Rollback:**
  - Functions: `git worktree add ../myclubs-rollback 5da6db2` (version 2) or `166a133` (version 1), then deploy from
    that folder with `--project-ref zanhvwuvuvfxetqkojbw --use-api`.
  - Recipient: `update public.campaigns set recipient_address = null, recipient_confirmed_at = null where slug = 'demo-club-equipment';`
  - Migration objects (only after rolling functions back to version 1):
    `drop function public.clubfund_request_challenge(uuid,text,text,text,text,integer); drop function public.clubfund_take_rate_token(uuid,text,integer,integer); drop table public.clubfund_rate_events;`

## Vercel deployment (prepared, not done)

1. Push and merge (approval): `git push origin fix/demo-readiness`, then merge into `master` on GitHub. CI runs
   typecheck, unit tests, build and the browser suite on the production build.
2. Vercel → Project → Settings → Environment Variables, for **Production** (and Preview if wanted):
   - `VITE_SUPABASE_URL` = `https://zanhvwuvuvfxetqkojbw.supabase.co`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = the publishable key (`sb_publishable_…`, the same value as in `.env.local`)
   - optional: `VITE_SOLANA_DEVNET_RPC_URL` = a dedicated Devnet RPC

   Never add the secret or service-role key.
3. Deploy. `vercel.json` sets framework Vite, build `npm run build:fresh`, output `dist`, and the SPA rewrite. To
   ship exactly the tested data snapshot instead of refreshing it at build time, use `npm run build`.
4. Allow the production origin (approval; live setting):
   `npx supabase@2.122.0 secrets set --project-ref zanhvwuvuvfxetqkojbw CLUBFUND_ALLOWED_ORIGINS="https://<app>.vercel.app,http://localhost:5173,http://localhost:4173"`
5. Production checks:
   - Open `/` (homepage), `/dashboard`, `/clubs/clubfund` and `/clubs/clubfund/campaigns/demo-club-equipment`, and refresh each.
   - Verify your email and confirm the linked wallet shows.
   - Confirm the function logs have no `origin_not_allowed` for the production URL.

## Five-minute final checklist (real Phantom test)

1. In Phantom: unlock it, select the account you will contribute from (the linked `71sn…KuWz`; never the recipient
   `6Q5t…P8gV`), Settings → Developer Settings → Testnet Mode on → **Solana Devnet**.
2. Open `http://localhost:5173/clubs/clubfund` (or the production URL once allowed). Verify your UMass email if asked.
   The page shows "Wallet linked" with `71sn…KuWz`.
   - To use a different account instead: Wallet settings → connect the linked account → **Sign and unlink**. Then
     select the new account in Phantom, reconnect, and **Sign verification message**. The page always shows the full
     address it will link.
3. Get Devnet SOL at https://faucet.solana.com for the linked address, then click the refresh icon next to the balance.
4. Open "Demo Club: Equipment & Supplies" → **Support This Campaign** → `0.01` → Review → tick →
   **Approve in wallet**. In Phantom, check the recipient `6Q5t…P8gV` and 0.01 SOL, then approve once.
5. Wait for "Contribution verified", open the Explorer link (Devnet), then refresh to see 0.01 Devnet SOL and 1 verified
   transaction.
6. If anything is interrupted: "Check its status" or "Contribution didn't finish? Check a transaction". Never send a
   second transaction.
