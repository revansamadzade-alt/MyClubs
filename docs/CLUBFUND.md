# ClubFund: UMass email verification + Solana wallet linking

ClubFund ties a MyClubs account to (1) a verified **@umass.edu** inbox and (2) one **Solana wallet the student proved
they control**. It is the identity foundation for future Devnet fundraising demos. No money, tokens or transactions are
involved yet.

> Verifying an email proves access to that @umass.edu inbox. It is **not** UMass single sign-on and does not confirm
> current enrollment. The app says "UMass email verified", never "university identity verified".

Everything else in MyClubs works without ClubFund, without signing in, and without Supabase being reachable.

## How it works

1. The student enters an exact `@umass.edu` address. Supabase Auth emails a one-time code (`signInWithOtp`).
2. The student enters the code; Supabase verifies it (`verifyOtp`) and creates the session. MyClubs never generates or
   stores codes.
3. The student connects a Solana wallet (any Wallet Standard wallet: Phantom, Solflare, Backpack…). MyClubs only asks
   to connect and to sign a text message: never a transaction, never a recovery phrase or private key.
4. `wallet-challenge` (Edge Function) checks the session with the Auth server, checks the email again, and issues a
   challenge: a random 256-bit nonce, the user id, the wallet address, the app origin, the operation, and a 5-minute
   validity window, in the Sign-In With Solana message layout. Requests are rate limited (5 per user per 10 minutes).
5. The wallet signs the exact message bytes.
6. `wallet-link` checks the session and email again, confirms the challenge belongs to this user, this wallet and this
   operation, is unexpired and unused, and that the signed bytes are byte-for-byte the stored challenge. It then verifies
   the Ed25519 signature against the wallet's public key (`@noble/curves`), and only then calls one SQL function that
   consumes the challenge and stores the link in a single transaction.
7. The page shows **Wallet linked** only after the server returns the stored link.

### Security properties

| Threat | Protection |
| --- | --- |
| Linking someone else's wallet by typing its address | A signature from that wallet's private key is required. |
| Forged signature / wrong public key | Ed25519 verification against the claimed address; malformed keys or signatures fail closed. |
| Replay / reuse | Challenges are single-use: `UPDATE … WHERE consumed_at IS NULL` in the same transaction as the insert. |
| Two requests racing on one challenge | The row update serializes them; exactly one succeeds (tested). |
| Expired challenge | 5-minute lifetime, checked in the function and again in SQL. |
| Challenge for another user / wallet / purpose | All bound into the stored challenge and checked before and during consumption. |
| Signed message altered | The submitted bytes must equal the stored challenge exactly; nothing is rebuilt. |
| One wallet on many accounts / many wallets on one account | `unique` wallet address, one row per user (primary key), checked again in SQL. |
| Browser writing or "verifying" a link | RLS: browsers can only `SELECT` their own link; no insert/update/delete policies; challenges are invisible. |
| Trusting ids or emails sent by the browser | Identity comes only from the verified session; bodies never carry a user id or email. |
| Non-UMass or look-alike emails (`x@umass.edu.attacker.com`) | Before User Created hook + the same exact-domain check on every privileged call and in the RLS policy. |
| Unlinking someone's wallet | Requires a fresh signature from the linked wallet, or (lost wallet) an email code entered in the last 10 minutes. |
| Cross-origin misuse | Edge Functions accept browser calls only from `CLUBFUND_ALLOWED_ORIGINS`; JWT verification stays on. |
| Secrets in the browser | Only the project URL and publishable key are public (`VITE_`). The service role stays inside the Edge Functions. |

Privacy: the email is never put on chain or in the signed message. The email-to-wallet association is readable only by
its owner. Wallet addresses (and any future transactions) are public on Solana by nature.

## Files

| Path | Purpose |
| --- | --- |
| `supabase/migrations/20261114120000_clubfund_wallet_links.sql` | Tables, RLS, email hook function, server-only SQL functions |
| `supabase/functions/_shared/policy.ts` | Email rule, challenge message, challenge checks, signature check (shared with the app and tests) |
| `supabase/functions/_shared/handlers.ts` | Request handling for the three functions (dependency-injected, tested in Node) |
| `supabase/functions/_shared/runtime.ts` | Deno wiring: auth check, service-role database calls, Ed25519, randomness |
| `supabase/functions/wallet-{challenge,link,unlink}/index.ts` | Edge Function entry points |
| `src/lib/clubfund/*` | Supabase client (publishable key only), email OTP, Wallet Standard, API calls |
| `src/pages/clubs/clubfund/*` | ClubFund onboarding, linked landing, Wallet settings |

## Migration summary (awaiting approval — not applied)

Creates, in schema `public`:

- **Tables** `wallet_links` (user_id PK → `auth.users` on delete cascade, unique `wallet_address`, chain, method,
  linked_at, verified_at) and `wallet_challenges` (id, user_id → `auth.users` cascade, wallet_address, purpose
  link/unlink, unique nonce, message, issued_at, expires_at ≤ 10 min, consumed_at).
- **RLS** enabled on both. One policy: authenticated users may `SELECT` their own `wallet_links` row when their JWT email
  is an exact @umass.edu address. All default grants to `anon`/`authenticated` revoked, then `SELECT` on `wallet_links`
  granted to `authenticated` only. No policies on `wallet_challenges`.
- **Functions** `is_umass_email(text)`, `hook_before_user_created_umass_only(jsonb)` (execute: `supabase_auth_admin`
  only), and `clubfund_issue_challenge`, `clubfund_link_wallet`, `clubfund_unlink_wallet` (execute: `service_role`
  only). No destructive changes to existing objects.

## Manual setup (owner)

Nothing below has been done yet. Do not paste secrets into chat.

1. **Connect the Supabase MCP in Claude Code** (`/mcp` → `supabase` → authenticate) so the migration and functions can be
   applied after approval. Alternatively apply them yourself:
   - SQL: Dashboard → SQL Editor → run the migration file.
   - Functions: `supabase functions deploy wallet-challenge wallet-link wallet-unlink --project-ref zanhvwuvuvfxetqkojbw`
     (keep "Verify JWT" **on**).
2. **Edge Function secret**: Dashboard → Edge Functions → Secrets → `CLUBFUND_ALLOWED_ORIGINS` =
   `http://localhost:5173,http://localhost:4173,<your deployed origin>`.
3. **Auth hook**: Authentication → Hooks → *Before User Created* → Postgres → `public.hook_before_user_created_umass_only`.
4. **Email sign-in**: Authentication → Providers → Email: enabled, *Confirm email* on, short OTP expiry (e.g. 600 s).
   Any OTP length from 6 to 10 digits works; the app sends the code to Supabase exactly as entered.
5. **Email templates**: Authentication → Email Templates → *Magic Link* and *Confirm signup*: include the code, e.g.
   `Your ClubFund code is {{ .Token }}. It expires soon. If you didn't request it, ignore this email.`
6. **SMTP (required for real students)**: Supabase's built-in email only delivers to project team members and is
   heavily rate limited. Authentication → SMTP Settings → use a provider such as Resend or Postmark with a sender
   address on a domain you control, verified in the provider (SPF/DKIM DNS records). Then raise the email rate limit
   under Authentication → Rate Limits as appropriate.
7. **URL configuration**: Authentication → URL Configuration → Site URL = the deployed origin (codes don't use
   redirects, but emails link back to it).
8. **Local app**: create `.env.local` (ignored by git) from `.env.example` with
   `VITE_SUPABASE_URL=https://zanhvwuvuvfxetqkojbw.supabase.co` and the **publishable** key from Project Settings → API
   Keys. Never the secret/service-role key.
9. **Real-world check**: request a code to a real @umass.edu inbox, enter it, connect Phantom (Settings → Developer
   settings → Testnet mode / Devnet), approve the signature, confirm "Wallet linked", then unlink from Wallet settings.

## Tests

- `tests/clubfund.test.mjs` — the real handler and policy code with real Ed25519 keys from fixed seeds: valid link,
  forged/wrong-key/tampered/malformed signatures, replay, expiry, wrong user/wallet/purpose, altered message,
  concurrent submissions, duplicate wallet/account, unauthenticated/non-UMass/look-alike/unconfirmed sessions, body
  spoofing, CORS, rate limit, unlink by signature and by fresh email code.
- `tests/clubfund-db.test.mjs` — the migration on real Postgres (PGlite) with Supabase-like roles and default grants:
  email rule, auth hook, grants, RLS isolation, single-use challenges, expiry, uniqueness, rate limit, unlink, cascade.
- Browser section 25 — the real UI and supabase-js requests against a **mocked** Supabase (request interception) and a
  scripted Wallet Standard wallet. It does not prove email delivery or real signature verification.

Not tested: real email delivery, a real Phantom signature, the deployed Edge Functions, and the hook in a live project.
`runtime.ts` and the function entry points were not type-checked with Deno locally.
