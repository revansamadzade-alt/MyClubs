// ClubFund server calls. The browser can only read its own wallet link (Row Level Security); creating or removing a
// link goes through the wallet Edge Functions, which verify the session, the @umass.edu email and the signature.
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { toBase64, type WalletPurpose } from '../../../supabase/functions/_shared/policy';
import { supabase } from './client';

export interface WalletLink {
  wallet_address: string;
  chain: string;
  linked_at: string;
  verified_at: string;
}

export class ApiProblem extends Error {
  constructor(
    public code: string,
    message: string,
    /** Seconds until a rate-limited request may be repeated (from the server). */
    public retryAfter?: number,
  ) {
    super(message);
  }
}

/**
 * Browsers hide why a cross-origin call failed. An opaque no-cors request tells "the server is reachable" (so this
 * site's origin was most likely refused) apart from "offline".
 */
async function unreachable(fn: string): Promise<ApiProblem> {
  const base = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  try {
    await fetch(`${base}/functions/v1/${fn}`, { method: 'GET', mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(6_000) });
  } catch {
    return new ApiProblem('network', "Can't reach ClubFund right now. Check your connection and try again.");
  }
  return new ApiProblem(
    'origin_blocked',
    `ClubFund's server is reachable but blocked this request from ${location.origin}. Try again; if it keeps happening, this site's address must be added to CLUBFUND_ALLOWED_ORIGINS on the server.`,
  );
}

/** The signed-in user's verified wallet link, or null. */
export async function fetchLink(): Promise<WalletLink | null> {
  const { data, error } = await supabase().from('wallet_links').select('wallet_address, chain, linked_at, verified_at').maybeSingle();
  if (error) {
    if (error.code === 'PGRST205' || error.code === '42P01')
      throw new ApiProblem('not_set_up', "ClubFund's database isn't set up yet, so wallets can't be linked.");
    if (/fetch|network/i.test(error.message)) throw new ApiProblem('network', "Can't reach ClubFund right now. Check your connection and try again.");
    throw new ApiProblem('server_error', "Couldn't load your wallet link. Try again.");
  }
  return data as WalletLink | null;
}

export async function call<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().functions.invoke(fn, { body });
  if (!error) return data as T;
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    let parsed: { error?: { code?: string; message?: string } } | null = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    const retryAfter = (parsed?.error as { retryAfterSeconds?: unknown } | undefined)?.retryAfterSeconds;
    if (parsed?.error?.code) throw new ApiProblem(parsed.error.code, parsed.error.message ?? 'Request failed.', typeof retryAfter === 'number' ? retryAfter : undefined);
    if (res.status === 404) throw new ApiProblem('not_deployed', "ClubFund's wallet service isn't deployed yet.");
    if (res.status === 401) throw new ApiProblem('not_signed_in', 'Your session has ended. Verify your UMass email again.');
    throw new ApiProblem('server_error', 'Something went wrong on our side. Try again.');
  }
  if (error instanceof FunctionsFetchError) throw await unreachable(fn);
  if (error instanceof FunctionsRelayError) throw new ApiProblem('server_error', 'ClubFund is temporarily unavailable. Try again.');
  throw new ApiProblem('server_error', 'Something went wrong. Try again.');
}

export interface Challenge {
  challengeId: string;
  message: string;
  expiresAt: string;
  /** The server handed back an open challenge instead of creating a new one. */
  reused?: boolean;
}

export const requestChallenge = (wallet: string, purpose: WalletPurpose) => call<Challenge>('wallet-challenge', { wallet, purpose });

export interface Proof {
  challengeId: string;
  wallet: string;
  signedMessage: Uint8Array;
  signature: Uint8Array;
}

const proofBody = (p: Proof) => ({ challengeId: p.challengeId, wallet: p.wallet, signedMessage: toBase64(p.signedMessage), signature: toBase64(p.signature) });

export const submitLink = (p: Proof) => call<{ link: WalletLink }>('wallet-link', proofBody(p));
export const unlinkWithSignature = (p: Proof) => call<{ unlinked: true }>('wallet-unlink', { method: 'signature', ...proofBody(p) });
export const unlinkAfterRecentSignIn = () => call<{ unlinked: true }>('wallet-unlink', { method: 'recent-sign-in' });
