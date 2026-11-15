# MyClubs — HackUMass XIV demo readiness

Branch `fix/demo-readiness` (local, **not pushed**), on top of `master` = `origin/master` = `166a133`.
Supabase project `zanhvwuvuvfxetqkojbw`. Checked on 2026-11-15.

## Real transaction status

**No real wallet link and no real Devnet contribution has happened yet.** The only live wallet activity on record is
five unfinished link attempts for one wallet (2026-11-15 02:58–02:59 UTC). None reached the server's signature check,
and they ended in the rate limit. That limit has expired; no challenge is open now. Every contribution test so far
uses a mocked Supabase, a mocked Devnet RPC and a scripted wallet.

## Deployed 2026-11-15 (approved steps 1–3)

- 07:44 UTC: migration `20261115090000_clubfund_challenge_reuse_and_rate_limits.sql` applied (`db push`); verified new functions and table, service-role-only grants, RLS, existing objects and campaigns unchanged. Supabase had no platform backup yet (PITR off, daily list empty), so a read-only snapshot of all public rows and function definitions was taken first.
- 07:44 UTC: `wallet-challenge`, `wallet-link`, `wallet-unlink`, `campaign-contribute` redeployed from `5da6db2` (version 2, ACTIVE, `verify_jwt: true`); credential-free probes unchanged; logs show clean boots and only the expected origin warnings.
- 07:45 UTC: `demo-club-equipment` recipient set to `6Q5tJXKhJ6yL6AYeHkyrKcFvKgEjmszCQniegH5qP8gV` (exactly one row; the other five untouched). The live app shows it as the only campaign open for Devnet contributions.
- Not done (by request): Auth hook, `CLUBFUND_ALLOWED_ORIGINS`, Vercel, GitHub push. No real wallet link or Devnet contribution yet.

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

1. **Approval to apply** migration `20261115090000_clubfund_challenge_reuse_and_rate_limits.sql` and **redeploy** the
   four functions. This is the server half of the lockout fix, plus the contribution rate limit.
2. **Recipient for `demo-club-equipment`: provided and validated** (`6Q5tJXKhJ6yL6AYeHkyrKcFvKgEjmszCQniegH5qP8gV`: valid on-curve wallet key, not a program, different from the contributing wallet `7tec…Biu3`, unused by other campaigns, no Devnet account yet, which is fine). Its one-row SQL update is prepared and waiting for approval; a local simulation shows it enables only this campaign.
3. **Enable the Auth hook:** Dashboard → Authentication → Hooks → *Before User Created* → Postgres → schema `public` →
   `hook_before_user_created_umass_only`. The read-only check found no problem with the function. Whether it is
   switched on can't be read with the read-only tools.
4. **The Vercel production URL**, then approval to set `CLUBFUND_ALLOWED_ORIGINS`.
5. **Push and deploy:** push `fix/demo-readiness` and merge into `master`, then deploy Vercel with the env vars in
   [DEPLOY.md](DEPLOY.md).
6. **The real Phantom test.** Only you can approve the wallet prompts.

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

- **Code:** `fix/demo-readiness`. Commits: `abe8011` (server), `19fa80c` (browser), `cb83bcd` (recipient script), plus
  the docs/test commit after this file.
- **Supabase (needs approval, in this order):**
  1. `npx supabase@2.122.0 db push --linked` (applies `20261115090000_clubfund_challenge_reuse_and_rate_limits.sql`;
     additive).
  2. `npx supabase@2.122.0 functions deploy wallet-challenge wallet-link wallet-unlink campaign-contribute --project-ref zanhvwuvuvfxetqkojbw --use-api`
     (JWT verification stays on).
  3. After the Vercel URL is known:
     `npx supabase@2.122.0 secrets set --project-ref zanhvwuvuvfxetqkojbw CLUBFUND_ALLOWED_ORIGINS="https://<app>.vercel.app,http://localhost:5173,http://localhost:4173"`.
  4. Optional: `SOLANA_DEVNET_RPC_URL` (server) and `VITE_SOLANA_DEVNET_RPC_URL` (Vercel) for a dedicated Devnet RPC.
- **Vercel:** set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for Production, then deploy (see
  [DEPLOY.md](DEPLOY.md)).
- **Compatibility:**
  - Either order of steps 1 and 2 works. Redeployed functions fall back to the original SQL challenge function until the migration exists; the contribution limit is skipped until then, which matches today's behavior.
  - The migration only adds objects; nothing existing changes.
- **Rollback:**
  - Functions: redeploy the previous code (`git worktree add ../myclubs-rollback 166a133`, then run the deploy command
    from that folder with `--project-ref zanhvwuvuvfxetqkojbw --use-api`).
  - Database: the new objects can stay unused, or be removed with
    `drop function public.clubfund_request_challenge(uuid,text,text,text,text,integer); drop function public.clubfund_take_rate_token(uuid,text,integer,integer); drop table public.clubfund_rate_events;`
    (only after the old functions are redeployed).

## Five-minute final checklist

1. Approve, then run, the migration and function deploy (two commands above).
2. In Phantom: Settings → Developer Settings → Testnet Mode on → Solana **Devnet**. Create a second account for the
   recipient.
3. Recipient (done: validated with `npm run clubfund:recipients check 6Q5tJXKhJ6yL6AYeHkyrKcFvKgEjmszCQniegH5qP8gV -- --contributor 7tecWdCmP1QckuKK4kMpqoR2upkW5Hdi1UnesDKZBiu3`):
   run the approved SQL update in the Supabase SQL Editor.
4. Enable the Auth hook (Dashboard, above).
5. Run `npm run dev` and open `http://localhost:5173/clubs/clubfund`.
6. Verify your UMass email, then connect Phantom. Click **Sign verification message** and approve it once. If the
   popup doesn't appear, open the Phantom extension or use **Stop waiting** and sign again; no new request is created.
7. Get Devnet SOL at https://faucet.solana.com for the linked address, then refresh the balance.
8. Open "Demo Club: Equipment & Supplies" → **Support This Campaign** → `0.01` → Review → tick → **Approve in wallet**,
   and approve in Phantom.
9. Wait for "Contribution verified", then open the Explorer link (Devnet). Refresh to see the total and history persist.
10. If anything is interrupted, use "Check its status" or "Contribution didn't finish? Check a transaction". Don't send
    a second transaction.
