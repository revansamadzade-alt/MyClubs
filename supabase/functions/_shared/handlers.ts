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
export class StoreError extends Error {}

export interface Store {
  getLink(userId: string): Promise<LinkRow | null>;
  getLinkByWallet(wallet: string): Promise<LinkRow | null>;
  /** Throws StoreError('rate_limited') when the user requested too many challenges. */
  issueChallenge(a: { userId: string; wallet: string; purpose: WalletPurpose; nonce: string; message: string; ttlSeconds: number }): Promise<{ id: string; expires_at: string }>;
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
  not_linked: 'Your account has no linked wallet.',
  not_linked_wallet: 'Connect the wallet that is linked to your account to unlink it.',
  rate_limited: 'Too many verification requests. Wait a few minutes and try again.',
  challenge_not_found: 'That verification request was not found. Start again.',
  wallet_mismatch: 'The signature came from a different wallet than the one being linked.',
  purpose_mismatch: 'That signature was made for a different action. Start again.',
  message_mismatch: 'The signed message does not match the verification request. Start again.',
  challenge_used: 'That verification request was already used. Start again.',
  challenge_expired: 'That verification request expired. Start again.',
  signature_invalid: 'The wallet signature could not be verified. Start again.',
  recent_sign_in_required: 'For your security, verify your UMass email again (within the last 10 minutes) to unlink without your wallet.',
  server_error: 'Something went wrong on our side. Try again.',
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
  not_linked: 404,
  not_linked_wallet: 409,
  rate_limited: 429,
  challenge_not_found: 404,
  wallet_mismatch: 400,
  purpose_mismatch: 400,
  message_mismatch: 400,
  challenge_used: 409,
  challenge_expired: 410,
  signature_invalid: 422,
  recent_sign_in_required: 401,
  server_error: 500,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
const fail = (code: string, cors: Record<string, string>) => json({ error: { code, message: MESSAGES[code] ?? MESSAGES.server_error } }, STATUS[code] ?? 500, cors);

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

const storeCode = (e: unknown) => (e instanceof StoreError ? e.message : 'server_error');

export async function handle(endpoint: Endpoint, req: Request, deps: Deps): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors = corsHeaders(origin, deps.allowedOrigins);
  // Browsers always send Origin on cross-origin requests; refuse sites that are not on the allow list.
  if (origin && !deps.allowedOrigins.includes(origin)) return fail('origin_not_allowed', cors);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return fail('method_not_allowed', cors);

  // Identity comes only from the verified session, never from the request body.
  const user = await deps.authenticate(req.headers.get('authorization'));
  if (!user) return fail('not_signed_in', cors);
  if (!isUmassEmail(user.email)) return fail('email_not_allowed', cors);
  if (!user.emailConfirmedAt) return fail('email_not_verified', cors);

  const body = await readJson(req);
  if (!body) return fail('bad_request', cors);

  try {
    if (endpoint === 'challenge') return await challenge(body, user, deps, cors, origin);
    if (endpoint === 'link') return await link(body, user, deps, cors);
    return await unlink(body, user, deps, cors);
  } catch (e) {
    return fail(storeCode(e), cors);
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
  return json({ challengeId: issued.id, message, expiresAt: issued.expires_at }, 200, cors);
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
