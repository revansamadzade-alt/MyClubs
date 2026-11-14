// Shared ClubFund rules. Pure TypeScript with no imports, so the Edge Functions (Deno), the web app (Vite) and the Node
// tests all run exactly the same code. Cryptography is passed in (Ed25519 verify, base58 decode) by the caller.

export const CHALLENGE_TTL_SECONDS = 300;
export const RECENT_SIGN_IN_SECONDS = 600;
export const SOLANA_CHAIN_ID = 'devnet';
export type WalletPurpose = 'link' | 'unlink';

/** Lower-cased, trimmed email. */
export const normalizeEmail = (raw: string): string => raw.trim().toLowerCase();

const LOCAL_PART = /^[a-z0-9_%+-]+(\.[a-z0-9_%+-]+)*$/;

/**
 * Exact @umass.edu addresses only: no subdomains (x@cs.umass.edu), no look-alikes (x@umass.edu.attacker.com,
 * x@umass.education), one "@", a dot-atom local part. Mirrors public.is_umass_email() in the database.
 */
export function isUmassEmail(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const email = normalizeEmail(raw);
  if (email.length > 254) return false;
  const at = email.indexOf('@');
  if (at < 1 || at !== email.lastIndexOf('@')) return false;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return domain === 'umass.edu' && local.length <= 64 && LOCAL_PART.test(local);
}

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
/** Shape check for a Solana address (base58). The decoded length is checked again where the key is used. */
export const looksLikeSolanaAddress = (s: unknown): s is string => typeof s === 'string' && BASE58.test(s);

export interface ChallengeFields {
  domain: string;
  uri: string;
  address: string;
  userId: string;
  purpose: WalletPurpose;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
}

/**
 * The exact text the wallet signs, in the Sign-In With Solana message layout so wallets can display it clearly.
 * It names the app, the wallet, the MyClubs account, the operation, a random nonce and the validity window.
 * It contains no email address.
 */
export function buildChallengeMessage(c: ChallengeFields): string {
  const statement =
    c.purpose === 'link'
      ? 'Link this wallet to your MyClubs ClubFund account. Signing proves you control this wallet. It is free, sends no transaction and moves no funds.'
      : 'Unlink this wallet from your MyClubs ClubFund account. Signing is free, sends no transaction and moves no funds.';
  return [
    `${c.domain} wants you to sign in with your Solana account:`,
    c.address,
    '',
    statement,
    '',
    `URI: ${c.uri}`,
    'Version: 1',
    `Chain ID: ${SOLANA_CHAIN_ID}`,
    `Nonce: ${c.nonce}`,
    `Issued At: ${c.issuedAt.toISOString()}`,
    `Expiration Time: ${c.expiresAt.toISOString()}`,
    `Request ID: ${c.purpose}-wallet`,
    'Resources:',
    `- myclubs:account:${c.userId}`,
  ].join('\n');
}

export interface StoredChallenge {
  id: string;
  user_id: string;
  wallet_address: string;
  purpose: WalletPurpose;
  message: string;
  expires_at: string;
  consumed_at: string | null;
}

export type ChallengeProblem = 'challenge_not_found' | 'wallet_mismatch' | 'purpose_mismatch' | 'message_mismatch' | 'challenge_used' | 'challenge_expired';

/**
 * Checks a stored challenge against the authenticated user and the submitted proof. The submitted bytes must be
 * byte-for-byte the stored message: nothing is rebuilt or reformatted before verification.
 */
export function checkChallenge(
  ch: StoredChallenge | null,
  expect: { userId: string; wallet: string; purpose: WalletPurpose; signedMessage: Uint8Array; now: Date },
): ChallengeProblem | null {
  if (!ch || ch.user_id !== expect.userId) return 'challenge_not_found';
  if (ch.purpose !== expect.purpose) return 'purpose_mismatch';
  if (ch.wallet_address !== expect.wallet) return 'wallet_mismatch';
  if (!sameBytes(new TextEncoder().encode(ch.message), expect.signedMessage)) return 'message_mismatch';
  if (ch.consumed_at) return 'challenge_used';
  if (new Date(ch.expires_at).getTime() <= expect.now.getTime()) return 'challenge_expired';
  return null;
}

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/**
 * Ed25519 proof that the holder of `address` signed exactly `message`. Returns false for malformed keys or signatures
 * rather than throwing.
 */
export function verifyWalletSignature(
  address: string,
  message: Uint8Array,
  signature: Uint8Array,
  crypto: { decodeBase58(s: string): Uint8Array; verify(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean },
): boolean {
  if (!looksLikeSolanaAddress(address) || signature.length !== 64 || message.length === 0) return false;
  let publicKey: Uint8Array;
  try {
    publicKey = crypto.decodeBase58(address);
  } catch {
    return false;
  }
  if (publicKey.length !== 32) return false;
  try {
    return crypto.verify(signature, message, publicKey) === true;
  } catch {
    return false;
  }
}

/**
 * True when the session's most recent email-code sign-in happened within `maxAgeSeconds` (Supabase puts it in the JWT
 * "amr" claim). Used to allow unlinking a lost wallet without its signature.
 */
export function signedInRecently(amr: unknown, now: Date, maxAgeSeconds = RECENT_SIGN_IN_SECONDS): boolean {
  if (!Array.isArray(amr)) return false;
  const latest = Math.max(
    0,
    ...amr
      .filter((a): a is { method: string; timestamp: number } => !!a && typeof a === 'object' && (a as { method?: unknown }).method === 'otp')
      .map((a) => Number(a.timestamp) || 0),
  );
  return latest > 0 && now.getTime() / 1000 - latest <= maxAgeSeconds;
}

export const toBase64 = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

export function fromBase64(s: unknown): Uint8Array | null {
  if (typeof s !== 'string' || s.length > 8000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return null;
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}
