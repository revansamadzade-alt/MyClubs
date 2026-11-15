// Keeps this tab's current wallet challenge so a cancelled, failed or interrupted signature can be retried with the
// same challenge instead of asking the server for a new one. Before this, every retry minted a new challenge and five
// retries hit the server's limit ("Too many verification requests"). The challenge text is not secret (the wallet
// shows it to the student); the server binds it to this account, wallet, purpose and site, it is single use, and it
// expires after 5 minutes. The server also hands back the same open challenge (other tabs, cleared storage).
import { requestChallenge, type Challenge } from './api';
import type { WalletPurpose } from '../../../supabase/functions/_shared/policy';

const KEY = 'myclubs:clubfund:challenge';
const RETRY_KEY = 'myclubs:clubfund:retryAt';
/** Keep at least this long to sign; otherwise get a fresh challenge. */
const MIN_REMAINING_MS = 60_000;

interface Saved extends Challenge {
  userId: string;
  wallet: string;
  purpose: WalletPurpose;
  origin: string;
}

function read(): Saved | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    return v && typeof v.challengeId === 'string' && typeof v.message === 'string' && typeof v.expiresAt === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function forgetChallenge(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** The saved challenge for this account, wallet and purpose if it still has time left; otherwise a new one. */
export async function challengeFor(userId: string, wallet: string, purpose: WalletPurpose, now = Date.now()): Promise<Challenge> {
  const saved = read();
  if (
    saved &&
    saved.userId === userId &&
    saved.wallet === wallet &&
    saved.purpose === purpose &&
    saved.origin === location.origin &&
    // Challenges from before 2026-11-15 carried an SIWS "Chain ID" line that Phantom refuses to show.
    !/\nChain ID:/.test(saved.message) &&
    Date.parse(saved.expiresAt) - now > MIN_REMAINING_MS
  )
    return { challengeId: saved.challengeId, message: saved.message, expiresAt: saved.expiresAt };
  const fresh = await requestChallenge(wallet, purpose);
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ challengeId: fresh.challengeId, message: fresh.message, expiresAt: fresh.expiresAt, userId, wallet, purpose, origin: location.origin }));
  } catch {
    // Storage blocked: the server still returns the same open challenge on retry.
  }
  return fresh;
}

/** Server answers after which the saved challenge can't be used again. */
export const CHALLENGE_SPENT = new Set(['challenge_not_found', 'challenge_used', 'challenge_expired', 'message_mismatch', 'purpose_mismatch', 'wallet_mismatch', 'signature_invalid']);

/** When a rate-limited student may ask again (ms since epoch), remembered for this tab. */
export function readRetryAt(): number {
  try {
    const v = Number(sessionStorage.getItem(RETRY_KEY));
    return Number.isFinite(v) && v > Date.now() ? v : 0;
  } catch {
    return 0;
  }
}
export function writeRetryAt(at: number): void {
  try {
    if (at > Date.now()) sessionStorage.setItem(RETRY_KEY, String(at));
    else sessionStorage.removeItem(RETRY_KEY);
  } catch {
    // ignore
  }
}
