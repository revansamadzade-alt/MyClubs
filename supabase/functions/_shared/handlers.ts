// Request handling for the three wallet Edge Functions. Everything environment-specific (auth server, database, Ed25519,
// randomness, clock) is injected, so this exact code runs in Deno on Supabase and in the Node tests.
import {
  CHALLENGE_TTL_SECONDS,
  buildChallengeMessage,
  checkChallenge,
  fromBase64,
  isUmassEmail,
  looksLikeSolanaAddress,
  signedInRecently,
  verifyWalletSignature,
  type StoredChallenge,
  type WalletPurpose,
} from './policy.ts';

export interface AuthedUser {
  id: string;
  email: string | null;
  emailConfirmedAt: string | null;
  /** The verified session's "amr" claim (sign-in methods with timestamps). */
  amr: unknown;
}

export interface LinkRow {
  user_id: string;
  wallet_address: string;
  chain: string;
  linked_at: string;
  verified_at: string;
}

/** Thrown by Store methods with a known database error code (raised by the SQL functions). */
export class StoreError extends Error {
  constructor(
    code: string,
    /** For rate_limited: seconds until the next request is allowed. */
    public retryAfter?: number,
  ) {
    super(code);
  }
}

export interface Store {
  getLink(userId: string): Promise<LinkRow | null>;
  getLinkByWallet(wallet: string): Promise<LinkRow | null>;
  /** True when the address is a ClubFund campaign's recipient (it can't also be a contributor's wallet). */
  isCampaignRecipient(wallet: string): Promise<boolean>;
  /**
   * Returns the user's still-open challenge for this wallet and purpose (`reused`), or stores a new one with this
   * nonce and message. Throws StoreError('rate_limited', retryAfter) when too many new challenges were requested.
   */
  issueChallenge(a: {
    userId: string;
    wallet: string;
    purpose: WalletPurpose;
    nonce: string;
    message: string;
    ttlSeconds: number;
  }): Promise<{ id: string; expires_at: string; message?: string; reused?: boolean }>;
  getChallenge(id: string): Promise<StoredChallenge | null>;
  /** Atomically consumes the challenge and stores the link. Throws StoreError('challenge_invalid' | 'already_linked' | 'wallet_in_use'). */
  linkWallet(a: { challengeId: string; userId: string; wallet: string; message: string }): Promise<LinkRow>;
  /** Removes the user's link, consuming the unlink challenge when one is given. Throws StoreError('challenge_invalid'). */
  unlinkWallet(a: { userId: string; challengeId?: string; wallet?: string; message?: string }): Promise<boolean>;
}

export interface Deps {
  /** Validates the bearer token with the auth server; null when missing, invalid or expired. */
  authenticate(authorization: string | null): Promise<AuthedUser | null>;
  store: Store;
  crypto: { decodeBase58(s: string): Uint8Array; verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean };
  randomNonce(): string;
  now(): Date;
  /** Web origins allowed to call the functions, e.g. ["http://localhost:5173", "https://myclubs.example"]. */
  allowedOrigins: string[];
}

export type Endpoint = 'challenge' | 'link' | 'unlink';

const MESSAGES: Record<string, string> = {
  origin_not_allowed: 'This site is not allowed to use ClubFund.',
  method_not_allowed: 'Use POST.',
  not_signed_in: 'Your session has ended. Verify your UMass email again.',
  email_not_allowed: 'ClubFund is only for verified @umass.edu email addresses.',
  email_not_verified: 'Verify your UMass email first.',
  bad_request: 'The request was incomplete. Try again.',
  invalid_wallet: 'That is not a valid Solana wallet address.',
  already_linked: 'Your account already has a linked wallet. Unlink it first to link a different one.',
  wallet_in_use: 'This wallet is already linked to another MyClubs account.',
  wallet_is_recipient: "That address is a ClubFund campaign's recipient wallet. Switch your wallet to your own account and link that one.",
  not_linked: 'Your account has no linked wallet.',
  not_linked_wallet: 'Connect the wallet that is linked to your account to unlink it.',
  rate_limited: 'Too many wallet verification requests. Wait a few minutes and try again.',
  verify_rate_limited: 'Too many contribution checks. Wait a few minutes, then check again.',
  challenge_not_found: 'That verification request was not found. Start again.',
  wallet_mismatch: 'The signature came from a different wallet than the one being linked.',
  purpose_mismatch: 'That signature was made for a different action. Start again.',
  message_mismatch: 'The signed message does not match the verification request. Start again.',
  challenge_used: 'That verification request was already used. Start again.',
  challenge_expired: 'That verification request expired. Start again.',
  signature_invalid: 'The wallet signature could not be verified. Start again.',
  recent_sign_in_required: 'For your security, verify your UMass email again (within the last 10 minutes) to unlink without your wallet.',
  server_error: 'Something went wrong on our side. Try again.',
  // Contributions
  campaign_not_found: 'That campaign was not found.',
  campaign_unavailable: 'This campaign is not accepting Devnet contributions right now.',
  invalid_amount: 'Enter an amount between 0.001 and 2 Devnet SOL.',
  invalid_signature: 'That is not a valid Solana transaction signature.',
  duplicate_signature: 'This transaction has already been counted.',
  tx_not_found: 'The transaction was not found on Solana Devnet yet.',
  tx_not_confirmed: 'The transaction is not confirmed on Solana Devnet yet.',
  tx_failed: 'The transaction failed on Solana Devnet, so nothing was counted.',
  wrong_wallet: 'The transaction was not sent from your verified linked wallet.',
  wrong_recipient: "The transaction did not pay this campaign's recipient address.",
  amount_mismatch: 'The amount on the blockchain does not match this contribution.',
  campaign_mismatch: 'The transaction is not marked for this campaign.',
  rpc_unavailable: "Can't reach Solana Devnet right now. Try checking again in a moment.",
  wrong_network: 'The server is not connected to Solana Devnet.',
};

const STATUS: Record<string, number> = {
  origin_not_allowed: 403,
  method_not_allowed: 405,
  not_signed_in: 401,
  email_not_allowed: 403,
  email_not_verified: 403,
  bad_request: 400,
  invalid_wallet: 400,
  already_linked: 409,
  wallet_in_use: 409,
  wallet_is_recipient: 409,
  not_linked: 404,
  not_linked_wallet: 409,
  rate_limited: 429,
  verify_rate_limited: 429,
  challenge_not_found: 404,
  wallet_mismatch: 400,
  purpose_mismatch: 400,
  message_mismatch: 400,
  challenge_used: 409,
  challenge_expired: 410,
  signature_invalid: 422,
  recent_sign_in_required: 401,
  server_error: 500,
  campaign_not_found: 404,
  campaign_unavailable: 409,
  invalid_amount: 400,
  invalid_signature: 400,
  duplicate_signature: 409,
  tx_not_found: 404,
  tx_not_confirmed: 409,
  tx_failed: 422,
  wrong_wallet: 403,
  wrong_recipient: 422,
  amount_mismatch: 422,
  campaign_mismatch: 422,
  rpc_unavailable: 503,
  wrong_network: 500,
};

export const DEFAULT_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:4173'];

/**
 * Parses CLUBFUND_ALLOWED_ORIGINS: a comma-separated list of exact origins (scheme://host[:port]), e.g.
 * "https://myclubs.vercel.app,http://localhost:5173". Wildcards, paths and non-http(s) schemes are rejected (never
 * "allow every site"). When the variable is unset or has no valid entry, local development origins are used.
 */
export function parseAllowedOrigins(raw: string | undefined | null): { origins: string[]; rejected: string[]; usingDefaults: boolean } {
  const origins: string[] = [];
  const rejected: string[] = [];
  for (const part of (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    let ok: string | null = null;
    if (!part.includes('*')) {
      try {
        const u = new URL(part);
        const bare = part.replace(/\/$/, '');
        if ((u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password && u.origin === bare.toLowerCase()) ok = u.origin;
      } catch {
        ok = null;
      }
    }
    if (ok) {
      if (!origins.includes(ok)) origins.push(ok);
    } else rejected.push(part);
  }
  return origins.length ? { origins, rejected, usingDefaults: false } : { origins: [...DEFAULT_ALLOWED_ORIGINS], rejected, usingDefaults: true };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  const h: Record<string, string> = { Vary: 'Origin' };
  if (origin && allowed.includes(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type';
    h['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    h['Access-Control-Max-Age'] = '600';
  }
  return h;
}

export function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
export const fail = (code: string, cors: Record<string, string>, retryAfter?: number) => {
  const wait = retryAfter && Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : undefined;
  const res = json({ error: { code, message: MESSAGES[code] ?? MESSAGES.server_error, ...(wait ? { retryAfterSeconds: wait } : {}) } }, STATUS[code] ?? 500, cors);
  if (wait) res.headers.set('Retry-After', String(wait));
  return res;
};
/** The error response for a failed store call (keeps the retry time of a rate limit). */
export const failStore = (e: unknown, cors: Record<string, string>, rename: Record<string, string> = {}) => {
  const code = storeCode(e);
  return fail(rename[code] ?? code, cors, e instanceof StoreError ? e.retryAfter : undefined);
};

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > 16_384) return null;
  try {
    const text = await req.text();
    if (text.length > 16_384) return null;
    const v: unknown = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const storeCode = (e: unknown) => (e instanceof StoreError ? e.message : 'server_error');

export interface Guarded {
  user: AuthedUser;
  body: Record<string, unknown>;
  cors: Record<string, string>;
  origin: string | null;
}

/**
 * The checks every ClubFund function runs first: allowed origin, CORS preflight, POST only, a valid session for a
 * confirmed @umass.edu address, and a small JSON body. Returns the response to send when a check fails.
 */
export async function guard(req: Request, deps: Pick<Deps, 'authenticate' | 'allowedOrigins'>): Promise<Response | Guarded> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, deps.allowedOrigins);
  // Browsers always send Origin on cross-origin requests; refuse sites that are not on the allow list.
  if (origin && !deps.allowedOrigins.includes(origin)) {
    // Visible in the Edge Function logs: the exact origin to add to CLUBFUND_ALLOWED_ORIGINS if it is a real deployment.
    console.warn(`origin_not_allowed: ${origin} is not in CLUBFUND_ALLOWED_ORIGINS`);
    return fail('origin_not_allowed', cors);
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return fail('method_not_allowed', cors);

  // Identity comes only from the verified session, never from the request body.
  const user = await deps.authenticate(req.headers.get('authorization'));
  if (!user) return fail('not_signed_in', cors);
  if (!isUmassEmail(user.email)) return fail('email_not_allowed', cors);
  if (!user.emailConfirmedAt) return fail('email_not_verified', cors);

  const body = await readJson(req);
  if (!body) return fail('bad_request', cors);
  return { user, body, cors, origin };
}

export async function handle(endpoint: Endpoint, req: Request, deps: Deps): Promise<Response> {
  const g = await guard(req, deps);
  if (g instanceof Response) return g;
  const { user, body, cors, origin } = g;

  try {
    if (endpoint === 'challenge') return await challenge(body, user, deps, cors, origin);
    if (endpoint === 'link') return await link(body, user, deps, cors);
    return await unlink(body, user, deps, cors);
  } catch (e) {
    return failStore(e, cors);
  }
}

async function challenge(body: Record<string, unknown>, user: AuthedUser, deps: Deps, cors: Record<string, string>, origin: string | null) {
  const { wallet, purpose } = body;
  if (purpose !== 'link' && purpose !== 'unlink') return fail('bad_request', cors);
  if (!looksLikeSolanaAddress(wallet)) return fail('invalid_wallet', cors);
  let key: Uint8Array;
  try {
    key = deps.crypto.decodeBase58(wallet);
  } catch {
    return fail('invalid_wallet', cors);
  }
  if (key.length !== 32) return fail('invalid_wallet', cors);

  const own = await deps.store.getLink(user.id);
  if (purpose === 'link') {
    if (own) return fail('already_linked', cors);
    const other = await deps.store.getLinkByWallet(wallet);
    if (other && other.user_id !== user.id) return fail('wallet_in_use', cors);
    if (await deps.store.isCampaignRecipient(wallet)) return fail('wallet_is_recipient', cors);
  } else {
    if (!own) return fail('not_linked', cors);
    if (own.wallet_address !== wallet) return fail('not_linked_wallet', cors);
  }

  const appOrigin = origin ?? deps.allowedOrigins[0];
  const issuedAt = deps.now();
  const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_SECONDS * 1000);
  const nonce = deps.randomNonce();
  const message = buildChallengeMessage({ domain: new URL(appOrigin).host, uri: appOrigin, address: wallet, userId: user.id, purpose, nonce, issuedAt, expiresAt });
  const issued = await deps.store.issueChallenge({ userId: user.id, wallet, purpose, nonce, message, ttlSeconds: CHALLENGE_TTL_SECONDS });
  // A reused challenge keeps its original text: those are the exact bytes the wallet must sign.
  return json({ challengeId: issued.id, message: issued.message ?? message, expiresAt: issued.expires_at, reused: issued.reused === true }, 200, cors);
}

function readProof(body: Record<string, unknown>) {
  const { challengeId, wallet } = body;
  const signedMessage = fromBase64(body.signedMessage);
  const signature = fromBase64(body.signature);
  if (typeof challengeId !== 'string' || !UUID.test(challengeId) || !looksLikeSolanaAddress(wallet) || !signedMessage || !signature) return null;
  return { challengeId, wallet, signedMessage, signature };
}

async function verifyProof(
  proof: NonNullable<ReturnType<typeof readProof>>,
  purpose: WalletPurpose,
  user: AuthedUser,
  deps: Deps,
): Promise<{ problem: string } | { message: string }> {
  const ch = await deps.store.getChallenge(proof.challengeId);
  const problem = checkChallenge(ch, { userId: user.id, wallet: proof.wallet, purpose, signedMessage: proof.signedMessage, now: deps.now() });
  if (problem) return { problem };
  // The signature is checked over the exact submitted bytes, which were just confirmed to equal the stored challenge.
  if (!verifyWalletSignature(proof.wallet, proof.signedMessage, proof.signature, deps.crypto)) return { problem: 'signature_invalid' };
  return { message: ch!.message };
}

async function link(body: Record<string, unknown>, user: AuthedUser, deps: Deps, cors: Record<string, string>) {
  const proof = readProof(body);
  if (!proof) return fail('bad_request', cors);
  const v = await verifyProof(proof, 'link', user, deps);
  if ('problem' in v) return fail(v.problem, cors);
  try {
    const row = await deps.store.linkWallet({ challengeId: proof.challengeId, userId: user.id, wallet: proof.wallet, message: v.message });
    return json({ link: { wallet_address: row.wallet_address, chain: row.chain, linked_at: row.linked_at, verified_at: row.verified_at } }, 200, cors);
  } catch (e) {
    const code = storeCode(e);
    // The challenge was consumed by a concurrent request between our check and the atomic update.
    return fail(code === 'challenge_invalid' ? 'challenge_used' : code, cors);
  }
}

async function unlink(body: Record<string, unknown>, user: AuthedUser, deps: Deps, cors: Record<string, string>) {
  const own = await deps.store.getLink(user.id);
  if (!own) return fail('not_linked', cors);
  if (body.method === 'recent-sign-in') {
    // Lost-wallet path: no signature, but the email code must have been entered within the last few minutes.
    if (!signedInRecently(user.amr, deps.now())) return fail('recent_sign_in_required', cors);
    await deps.store.unlinkWallet({ userId: user.id });
    return json({ unlinked: true }, 200, cors);
  }
  if (body.method !== 'signature') return fail('bad_request', cors);
  const proof = readProof(body);
  if (!proof) return fail('bad_request', cors);
  if (proof.wallet !== own.wallet_address) return fail('not_linked_wallet', cors);
  const v = await verifyProof(proof, 'unlink', user, deps);
  if ('problem' in v) return fail(v.problem, cors);
  try {
    await deps.store.unlinkWallet({ userId: user.id, challengeId: proof.challengeId, wallet: proof.wallet, message: v.message });
  } catch (e) {
    const code = storeCode(e);
    return fail(code === 'challenge_invalid' ? 'challenge_used' : code, cors);
  }
  return json({ unlinked: true }, 200, cors);
}
