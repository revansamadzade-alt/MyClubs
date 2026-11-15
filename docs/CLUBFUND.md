# ClubFund: UMass email, verified Solana wallet, Devnet demo fundraising

ClubFund ties a MyClubs account to (1) a verified **@umass.edu** inbox and (2) one **Solana wallet the student proved
they control**. Students can then support fictional demo campaigns with **Solana Devnet** test SOL. The server verifies
every contribution on the blockchain before it is counted.

> **Demo fundraising only — uses Solana Devnet test tokens with no monetary value. No real donations are collected.**
> Every campaign is fictional. No UMass organization or charity runs, endorses or receives them, and nothing is
> tax-deductible. There is no Mainnet code path and no payment-card handling.

> Verifying an email proves access to that @umass.edu inbox. It is **not** UMass single sign-on and does not confirm
> current enrollment. The app says "UMass email verified", never "university identity verified".

Everything else in MyClubs works without ClubFund, without signing in, and without Supabase being reachable.

## How it works

### Email and wallet

1. The student enters an exact `@umass.edu` address. Supabase Auth emails a one-time code (`signInWithOtp`).
2. The student enters the code; Supabase verifies it (`verifyOtp`) and creates the session. MyClubs never generates or
   stores codes.
3. The student connects a Solana wallet (any Wallet Standard wallet: Phantom, Solflare, Backpack…).
4. `wallet-challenge` (Edge Function) checks the session with the Auth server, checks the email again, and issues a
   challenge: a random 256-bit nonce, the user id, the wallet address, the app origin, the operation, and a 5-minute
   validity window, in the Sign-In With Solana message layout. Requests are rate limited (5 per user per 10 minutes).
5. The wallet signs the exact message bytes (free; no transaction).
6. `wallet-link` checks the session and email again, confirms the challenge belongs to this user, this wallet and this
   operation, is unexpired and unused, and that the signed bytes are byte-for-byte the stored challenge. It then verifies
   the Ed25519 signature (`@noble/curves`), and only then calls one SQL function that consumes the challenge and stores
   the link in a single transaction.
7. The page shows **Wallet linked** only after the server returns the stored link.

### A Devnet contribution

1. The student opens a campaign whose recipient the developer has confirmed and clicks **Support This Campaign**.
2. The dialog shows the campaign, the full recipient address, the student's real Devnet balance (read from Devnet, never
   simulated), the network fee priced by Devnet for this exact message, and the Devnet label. Amounts are parsed into
   integer lamports (0.001–2 SOL) and checked against the balance, the fee and the rent-exempt minimum.
3. The student reviews the amount, sender, recipient and fee, ticks the "test tokens, not a real donation" box, and
   clicks **Approve in wallet**. Nothing is signed before that click.
4. MyClubs builds one legacy transaction (encoded by hand, no Solana SDK): a System Program transfer of exactly those
   lamports from the linked wallet to the recipient, plus a memo `MyClubs ClubFund Devnet demo: <campaign slug>`. It
   uses a **Devnet blockhash**, so Mainnet would reject it even if a wallet tried to send it there.
5. The wallet asks the student to approve (`solana:signTransaction`, or `solana:signAndSendTransaction` for wallets
   without sign-only).
6. The transaction id is saved in the browser **before** submitting. MyClubs submits it to Devnet **once**:
   - If the node refuses (failed simulation, e.g. not enough SOL), nothing was sent and the student may try again.
   - If the result is uncertain (timeout, dropped connection), it is never re-sent. MyClubs polls its status until it
     is confirmed, fails, or its blockhash expires (then it can never land).
7. Once Devnet confirms it, the browser asks `campaign-contribute` to verify it, sending only the campaign id, the
   signature and the claimed lamports. The page shows success only after the server records it, with the new total and
   a Solana Explorer link (`?cluster=devnet`).
8. If verification is delayed, the contribution stays saved as "waiting for verification". **Check again** re-asks the
   server; it never sends a new transaction. New contributions to that campaign stay blocked until it is resolved.

### What the server checks (it never trusts the browser's word)

`campaign-contribute` re-checks the session (confirmed @umass.edu), loads the campaign (must be active, recipient
manually confirmed) and the caller's verified linked wallet from the database. It then reads the transaction from
Solana itself, at `SOLANA_DEVNET_RPC_URL` (default `https://api.devnet.solana.com`), whose genesis hash must be Devnet's
(`EtWTRABZ…rZBG`). The contribution counts only if **all** of these hold:

| Check | Rejects |
| --- | --- |
| Transaction exists on Devnet (`getTransaction`, `confirmed` commitment) | Invented signatures, Mainnet signatures |
| `err` is null in the status and the transaction meta | Failed transactions |
| Status is `confirmed` or `finalized` | Unconfirmed (processed-only) transactions |
| The submitted signature is the transaction's first signature, and the fee payer signer is the linked wallet | Another student's transaction |
| Every transfer to the recipient comes from the linked wallet; at least one exists | Wrong recipients, third-party transfers |
| Sum of those transfers equals the claimed lamports (safe integers), and the recipient's balance grew by exactly that | Wrong or ambiguous amounts |
| Exactly one memo, equal to the campaign's memo | Transfers meant for another campaign |
| Signature not already recorded (unique), and the recipient is unique per campaign | Duplicates, double counting |

Recording is one SQL function (`clubfund_record_contribution`, service role only). It locks the campaign row, re-checks
status, recipient and wallet link, inserts the contribution and its private owner row, and adds to the total in the same
transaction. Repeating a recorded signature as the same student returns the same record (idempotent). Anyone else,
or another campaign, gets `duplicate_signature`.

### Security properties

| Threat | Protection |
| --- | --- |
| Linking someone else's wallet by typing its address | A signature from that wallet's private key is required. |
| Replay / reuse of a wallet challenge | Single use: `UPDATE … WHERE consumed_at IS NULL` in the same transaction as the insert. |
| Browser creating "verified" donations or editing totals | No insert/update/delete grants or policies on any ClubFund table; totals change only inside the service-role SQL function. |
| Trusting ids, emails or amounts sent by the browser | Identity comes only from the verified session; the amount and recipient come from the blockchain and the database. |
| Counting a transaction twice | Unique signature column, idempotent recording, row lock on the campaign. |
| Mainnet | Devnet genesis check on server and client, Devnet blockhash, `cluster=devnet` links, DB check `cluster = 'devnet'`. |
| Automatic signing or re-sending | Explicit confirmation step; one submission; uncertain results are resolved by status lookups only. |
| Invented recipient wallets | Seeded campaigns have **no** recipient; the developer sets and confirms one by hand. Changing the address clears the confirmation. |
| Non-UMass or look-alike emails | Before User Created hook + the same exact-domain check on every privileged call and in the RLS policies. |
| Secrets in the browser | Only the project URL and publishable key are public (`VITE_`). The secret key stays inside the Edge Functions. |

Privacy: the email is never put on chain, in the signed message or in public queries. Public contribution history has no
user ids, emails or wallet addresses; who made which contribution (`contribution_owners`) is readable only by that
student. Solana transactions themselves are public: Explorer shows the sending and receiving wallet addresses.

## Files

| Path | Purpose |
| --- | --- |
| `supabase/migrations/20261114120000_clubfund_wallet_links.sql` | Wallet links: tables, RLS, email hook, server-only SQL functions |
| `supabase/migrations/20261114130000_clubfund_campaigns.sql` | Campaigns, contributions, private owners, recording function, six demo campaigns |
| `supabase/functions/_shared/policy.ts` | Email rule, challenge message and checks, signature check |
| `supabase/functions/_shared/solana.ts` | Devnet constants, memo, Explorer links, the contribution verifier (shared with the app) |
| `supabase/functions/_shared/handlers.ts` | Shared request guard + the three wallet endpoints |
| `supabase/functions/_shared/contribute.ts` | The `campaign-contribute` endpoint |
| `supabase/functions/_shared/runtime.ts` | Deno wiring: auth check, service-role database calls, Devnet RPC, Ed25519 |
| `supabase/functions/{wallet-challenge,wallet-link,wallet-unlink,campaign-contribute}/index.ts` | Edge Function entry points |
| `src/lib/clubfund/*` | Supabase client, OTP, Wallet Standard, Devnet RPC, lamports, transaction builder, contribution flow |
| `src/pages/clubs/clubfund/*` | ClubFund landing + campaign browser, campaign page, contribution dialog, Wallet settings |

Entry points elsewhere in MyClubs: **ClubFund** in the MyClubs navigation; **Help Fund This Event** on a (sample) event
page and **Support This Club** on an organization profile appear only when an active demo campaign names that event
(`related_event_id`) or organization (`related_org_id`). No real organization is linked by default.

## Migrations (applied to `zanhvwuvuvfxetqkojbw` on 2026-11-14 with `supabase db push`)

**`20261114120000_clubfund_wallet_links.sql`**: tables `wallet_links` and `wallet_challenges`, RLS (owners read their
own link with a @umass.edu JWT), functions `is_umass_email`, `hook_before_user_created_umass_only` (execute:
`supabase_auth_admin`), `clubfund_issue_challenge`, `clubfund_link_wallet`, `clubfund_unlink_wallet` (execute:
`service_role`), and `grant usage on schema public to supabase_auth_admin` for the hook.

**`20261114130000_clubfund_campaigns.sql`** (requires the first):

- `campaigns`: slug, category (`club`/`event`/`charity`), title, summary, description, `goal_lamports` (bigint),
  `recipient_address` (nullable, base58, unique), `recipient_confirmed_at`, status (`draft`/`active`/`paused`/`closed`),
  optional `related_event_id`/`related_org_id`, `raised_lamports`, `contribution_count`, timestamps. Trigger keeps
  `updated_at` and clears the confirmation when the address changes.
- `campaign_contributions`: campaign, `lamports` (> 0), unique `signature`, `cluster = 'devnet'`,
  `confirmation_status` (`confirmed`/`finalized`), slot, block time, verified time.
- `contribution_owners`: contribution → user id + wallet. Private.
- RLS: `anon`/`authenticated` may `SELECT` non-draft campaigns and their contributions; `authenticated` may `SELECT`
  only their own owner rows (with a @umass.edu JWT). No write grants or policies for browsers.
- `clubfund_record_contribution(...)`: execute `service_role` only.
- Six fictional demo campaigns (two per category), `active`, **no recipient**, totals 0. The two event campaigns attach
  to the sample events `ev-hack-workshop` and `ev-open-mic`.

No destructive changes to existing objects.

## Manual setup (owner)

Do not paste secrets into chat. Steps 1 and 2 are done (2026-11-14) with the pinned CLI, `npx supabase@2.122.0`, after
`supabase login` and `supabase link --project-ref zanhvwuvuvfxetqkojbw`.

1. **Apply the migrations** (done): `npx supabase@2.122.0 db push --dry-run --linked` (lists exactly the two files),
   then `npx supabase@2.122.0 db push --linked`.
2. **Deploy the functions** (done) with "Verify JWT" **on**:
   `npx supabase@2.122.0 functions deploy wallet-challenge wallet-link wallet-unlink campaign-contribute --project-ref zanhvwuvuvfxetqkojbw --use-api`.
   Redeploy the same way after changing anything under `supabase/functions/`.
3. **Edge Function secrets** (Dashboard → Edge Functions → Secrets): `CLUBFUND_ALLOWED_ORIGINS` =
   `http://localhost:5173,http://localhost:4173,<your deployed origin>`. Optional: `SOLANA_DEVNET_RPC_URL` for a
   dedicated Devnet RPC (it must be Devnet; the function checks). `SUPABASE_URL` and the secret key are provided by
   Supabase automatically.
4. **Auth hook**: Authentication → Hooks → *Before User Created* → Postgres →
   `public.hook_before_user_created_umass_only`.
5. **Recipient wallets (manual confirmation)**: in Phantom, create one extra account per campaign you want to open (a
   developer-controlled Devnet demo wallet; never a club's or charity's address). Copy its **public** address only, then
   run in the SQL Editor, once per campaign:

   ```sql
   update public.campaigns
      set recipient_address = '<public Devnet address you control>', recipient_confirmed_at = now()
    where slug = 'demo-club-equipment';
   ```

   The campaign's Support button turns on only after this. Never share a recovery phrase or private key.
6. **Email** (already working for this project): Email provider on, short OTP expiry; templates include `{{ .Token }}`;
   custom SMTP for real students. Any OTP length from 6 to 10 digits works.
7. **Local app**: `.env.local` (git-ignored) with `VITE_SUPABASE_URL` and the **publishable** key. Optional
   `VITE_SOLANA_DEVNET_RPC_URL` (Devnet only; default `https://api.devnet.solana.com`).

## Real manual test (not run yet: needs your wallet approvals)

1. `npm run dev`, open `http://localhost:5173/clubs/clubfund`, verify your @umass.edu email with the emailed code.
2. In Phantom: Settings → Developer Settings → **Testnet Mode** on, network **Solana Devnet**.
3. Connect Phantom; click **Sign verification message** and approve in Phantom (a message, not a transaction).
4. Confirm **Wallet linked**; in the SQL Editor, `select wallet_address, verified_at from public.wallet_links;` shows it.
5. If the balance is 0, get Devnet SOL at https://faucet.solana.com for the linked address; click refresh.
6. Open **Demo Club: Equipment & Supplies** (after step 5 of the setup confirmed its recipient).
7. Click **Support This Campaign**, enter `0.01`, **Review contribution**, tick the box, **Approve in wallet**.
8. Approve the transaction in Phantom (check the recipient and amount it shows).
9. Wait for **Contribution verified**.
10. The campaign total shows 0.01 Devnet SOL and 1 verified transaction.
11. Open the Explorer link: the transaction is on **Devnet**, from your wallet to the recipient, with the memo.
12. Refresh MyClubs: the contribution is in the campaign history and under **Your verified contributions**.

## Tests

Mocked, deterministic (`npm test`):

- `tests/clubfund.test.mjs` — wallet handlers and policy with real Ed25519 keys: link, forged/tampered signatures,
  replay, expiry, wrong user/wallet/purpose, concurrency, duplicates, sessions, CORS, rate limit, unlink.
- `tests/clubfund-db.test.mjs` — wallet migration on real Postgres (PGlite) with Supabase-like roles and grants.
- `tests/clubfund-contributions.test.mjs` — integer-lamport parsing and limits, insufficient funds and rent, the
  transaction bytes (signed with a real Ed25519 key), Devnet-only constants, the verifier (invented, failed,
  unconfirmed, wrong recipient, wrong amount, another student's, ambiguous memo, third-party transfer…), and the
  `campaign-contribute` handler (auth, invalid users, campaigns, idempotency, duplicates, Mainnet genesis, RPC down).
- `tests/clubfund-campaigns-db.test.mjs` — campaign migration on PGlite: no browser writes, manual recipient
  confirmation, unique signatures, idempotent recording, totals = sum of contributions, private owners, constraints.

Browser (`npm run test:e2e`, section 25): the real UI with a **mocked** Supabase, a **mocked** Devnet RPC and a
scripted Wallet Standard wallet: campaign list and filters, balances, amount validation, review and confirmation,
wallet rejection, node refusal, delayed verification and resume after refresh, confirmed contribution with Explorer
link, failed and expired transactions, server refusal, wrong wallet, wrong network, Devnet down, history, entry points,
accessibility and 375 px layout.

Not tested automatically: real email delivery, a real Phantom signature or transaction, the deployed Edge Functions, a
live Devnet transaction, and the hook in the live project. Those are the manual test above.

## Hardening on `fix/demo-readiness` (2026-11-15) — migration applied and functions redeployed

**Wallet-verification lockout ("Too many verification requests").** Every signing attempt used to mint a new
challenge, so cancelled, failed or stuck Phantom signatures used up the 5-per-10-minutes limit. Live data showed five
link challenges in 64 s for one wallet, none consumed and no `wallet-link` call. Fixed in two layers:

- Browser (works with the currently deployed functions): the open challenge is kept for the tab and reused across
  retries and reloads; double clicks send one request; "Stop waiting" when the wallet popup never answers; the wallet's
  own error text is shown; a rate limit shows a countdown and disables the button; switching wallet accounts mid-signature
  cancels the attempt; an expired challenge is discarded and the next attempt gets a fresh one.
- Server (needs the migration + redeploy): `clubfund_request_challenge` hands back the open challenge for the same
  account, wallet, purpose and site (more than 60 s left) instead of creating a new one, and reports the seconds until
  the limit lifts (`retryAfterSeconds`, `Retry-After`). The limit on new challenges is unchanged.

**Contribution checks** are limited per student (20 Devnet verification checks per 10 minutes, stored in
`clubfund_rate_events`, service role only). Re-checks of already-counted signatures are free. A rate-limited or failed
check keeps the contribution saved with "Check again"; nothing is ever re-sent.

**Recovery by signature.** On a campaign page, "Contribution didn't finish? Check a transaction" takes a transaction
signature (from the wallet's activity or Explorer). The amount is read from Devnet and the server verifies everything
(sender = the student's verified wallet, recipient, memo, confirmation, counted once), so an unrelated signature cannot
be claimed.

**Devnet RPC** reads retry with jittered backoff and honour `Retry-After`; identical browser reads share one request;
confirmation polling slows down while Devnet errors. `sendTransaction` is never repeated.

**Deployed 2026-11-15 07:44 UTC** (in this order; both additive and backward compatible):

1. `npx supabase@2.122.0 db push --linked` → applies `20261115090000_clubfund_challenge_reuse_and_rate_limits.sql`.
2. `npx supabase@2.122.0 functions deploy wallet-challenge wallet-link wallet-unlink campaign-contribute --project-ref zanhvwuvuvfxetqkojbw --use-api`.

Until step 1 the redeployed functions fall back to the original challenge function (and skip the contribution rate
limit, as today). Rollback: redeploy the previous commit's functions; the new SQL objects can stay (unused) or be dropped
with `drop function public.clubfund_request_challenge(uuid,text,text,text,text,integer); drop function
public.clubfund_take_rate_token(uuid,text,integer,integer); drop table public.clubfund_rate_events;`.

**Recipient wallets.** `npm run clubfund:recipients` (or `npm run clubfund:recipients check <address> -- --contributor <wallet>`) lists which campaigns can take contributions and why not.
`node scripts/clubfund-recipient.mjs check <public address> --campaign demo-club-equipment --contributor <linked wallet>`
validates a recipient (base58, 32 bytes, on-curve wallet key, not a program, not the contributor, not used by another
campaign), looks it up on Devnet (read-only) and prints the one-campaign confirmation SQL. It never runs that SQL and
never asks for a recovery phrase or private key; only the owner can confirm they control the address.
