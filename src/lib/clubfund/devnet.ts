// Solana Devnet JSON-RPC from the browser: network check, balances, blockhashes, fees, sending and confirmation.
// Every connection is checked against the Devnet genesis hash first; there is no Mainnet endpoint anywhere.
import { toBase64 } from '../../../supabase/functions/_shared/policy';
import { DEFAULT_DEVNET_RPC_URL, DEVNET_GENESIS_HASH, type SignatureStatus } from '../../../supabase/functions/_shared/solana';

const RPC_URL = (import.meta.env.VITE_SOLANA_DEVNET_RPC_URL as string | undefined) || DEFAULT_DEVNET_RPC_URL;

export class RpcProblem extends Error {
  constructor(
    /** unavailable: no answer · wrong_network: not Devnet · rejected: the node refused (nothing was sent) · uncertain: maybe sent */
    public code: 'unavailable' | 'wrong_network' | 'rejected' | 'uncertain',
    message: string,
  ) {
    super(message);
  }
}

const UNAVAILABLE = "Can't reach Solana Devnet right now. Check your connection and try again.";

async function rpc<T>(method: string, params: unknown[], timeoutMs = 12_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new RpcProblem('unavailable', UNAVAILABLE);
  }
  if (!res.ok) throw new RpcProblem('unavailable', res.status === 429 ? 'Solana Devnet is rate-limiting requests. Wait a moment and try again.' : UNAVAILABLE);
  let body: { result?: T; error?: { message?: string } };
  try {
    body = await res.json();
  } catch {
    throw new RpcProblem('unavailable', UNAVAILABLE);
  }
  if (body.error) throw new RpcProblem('rejected', body.error.message ?? 'Solana Devnet refused the request.');
  return body.result as T;
}

let devnetOk: Promise<void> | null = null;

/** Resolves once the RPC endpoint is confirmed to be Solana Devnet. */
export function ensureDevnet(): Promise<void> {
  devnetOk ??= rpc<string>('getGenesisHash', []).then((hash) => {
    if (hash !== DEVNET_GENESIS_HASH) throw new RpcProblem('wrong_network', 'The configured Solana endpoint is not Devnet, so contributions are turned off.');
  });
  // Forget failures so the next attempt asks again.
  devnetOk.catch(() => {
    devnetOk = null;
  });
  return devnetOk;
}

export async function getBalance(address: string): Promise<number> {
  await ensureDevnet();
  return (await rpc<{ value: number }>('getBalance', [address, { commitment: 'confirmed' }])).value;
}

export async function getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
  await ensureDevnet();
  return (await rpc<{ value: { blockhash: string; lastValidBlockHeight: number } }>('getLatestBlockhash', [{ commitment: 'confirmed' }])).value;
}

/** The network fee for this exact message, in lamports (null if the node can't price it). */
export async function getFeeForMessage(message: Uint8Array): Promise<number | null> {
  await ensureDevnet();
  return (await rpc<{ value: number | null }>('getFeeForMessage', [toBase64(message), { commitment: 'confirmed' }])).value;
}

let rentMinimum: number | null = null;
/** The balance a plain wallet account must keep (rent exemption for 0 bytes of data). */
export async function getRentMinimum(): Promise<number> {
  await ensureDevnet();
  rentMinimum ??= await rpc<number>('getMinimumBalanceForRentExemption', [0]);
  return rentMinimum;
}

export async function getBlockHeight(): Promise<number> {
  return rpc<number>('getBlockHeight', [{ commitment: 'confirmed' }]);
}

export async function getSignatureStatus(signature: string): Promise<SignatureStatus | null> {
  return (await rpc<{ value: (SignatureStatus | null)[] }>('getSignatureStatuses', [[signature], { searchTransactionHistory: true }])).value[0] ?? null;
}

/**
 * Submits a signed transaction once. A refusal from the node (failed simulation, e.g. not enough SOL) means nothing
 * was sent. Any other failure (timeout, dropped connection) is uncertain: the transaction may have been sent, so the
 * caller must check its status and must not send it, or a new one, again.
 */
export async function sendSignedTransaction(tx: Uint8Array): Promise<void> {
  await ensureDevnet();
  try {
    await rpc<string>('sendTransaction', [toBase64(tx), { encoding: 'base64', preflightCommitment: 'confirmed', maxRetries: 5 }], 20_000);
  } catch (e) {
    if (e instanceof RpcProblem && e.code === 'rejected') throw new RpcProblem('rejected', explainSendRefusal(e.message));
    throw new RpcProblem('uncertain', "We couldn't confirm whether Solana Devnet received the transaction. We're checking its status; don't send it again.");
  }
}

function explainSendRefusal(message: string): string {
  if (/insufficient|debit an account|no record of a prior credit/i.test(message)) return 'Not enough Devnet SOL for this amount plus the network fee. Nothing was sent.';
  if (/blockhash not found|block height exceeded/i.test(message)) return 'The transaction expired before it was sent. Nothing was sent; you can try again.';
  return 'Solana Devnet refused the transaction during its safety check. Nothing was sent.';
}

export type Confirmation = 'confirmed' | 'failed' | 'expired' | 'unknown';

/**
 * Polls the transaction until it is confirmed or failed, or until its blockhash has expired without it landing (then
 * it can never land). "unknown" means Devnet could not be reached for long enough to tell.
 */
export async function waitForConfirmation(
  signature: string,
  lastValidBlockHeight: number,
  { timeoutMs = 120_000, intervalMs = 1_500, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)) } = {},
): Promise<Confirmation> {
  const started = Date.now();
  let errors = 0;
  while (Date.now() - started < timeoutMs) {
    try {
      const st = await getSignatureStatus(signature);
      if (st?.err != null) return 'failed';
      if (st && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) return 'confirmed';
      if (!st && (await getBlockHeight()) > lastValidBlockHeight) {
        // Expired: one last look in case it landed in the final slots.
        const last = await getSignatureStatus(signature);
        if (last?.err != null) return 'failed';
        if (last && last.confirmationStatus !== 'processed') return 'confirmed';
        if (!last) return 'expired';
      }
      errors = 0;
    } catch {
      if (++errors >= 6) return 'unknown';
    }
    await sleep(intervalMs);
  }
  return 'unknown';
}
