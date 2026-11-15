// Solana Devnet rules shared by the browser and the contribution Edge Function. Pure: no imports, no I/O, so the same
// code runs in Deno on Supabase, in the browser bundle and in the Node tests.
//
// ClubFund is a demo on Solana Devnet only. Devnet SOL is a test token with no monetary value. There is no Mainnet code
// path: the RPC endpoint is checked against the Devnet genesis hash, transactions are built on a Devnet blockhash (which
// Mainnet rejects), and Explorer links always select the Devnet cluster.

export const DEVNET_CHAIN = 'solana:devnet';
/** Genesis hash of Solana Devnet. Mainnet is 5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d. */
export const DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const DEFAULT_DEVNET_RPC_URL = 'https://api.devnet.solana.com';
export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
export const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

export const LAMPORTS_PER_SOL = 1_000_000_000;
/** 0.001 SOL: above the rent-exempt minimum for an empty account, so a transfer to a fresh recipient cannot fail on rent. */
export const MIN_CONTRIBUTION_LAMPORTS = 1_000_000;
/** 2 SOL per contribution keeps the demo to small amounts. */
export const MAX_CONTRIBUTION_LAMPORTS = 2 * LAMPORTS_PER_SOL;

export const DEVNET_LABEL = 'Demo fundraising only — uses Solana Devnet test tokens with no monetary value. No real donations are collected.';

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

/** A base58 Ed25519 transaction signature (64 bytes encode to 64–88 characters). */
export function looksLikeTxSignature(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 64 && v.length <= 88 && BASE58.test(v);
}

/** The memo every ClubFund transfer carries, binding the transaction to exactly one campaign. Public on the blockchain. */
export const campaignMemo = (slug: string) => `MyClubs ClubFund Devnet demo: ${slug}`;

export const explorerTxUrl = (signature: string) => `https://explorer.solana.com/tx/${encodeURIComponent(signature)}?cluster=devnet`;
export const explorerAddressUrl = (address: string) => `https://explorer.solana.com/address/${encodeURIComponent(address)}?cluster=devnet`;

// --- Verification of a submitted contribution ------------------------------------------------------------------------

/** The parts of a `getTransaction(signature, { encoding: 'jsonParsed' })` result that verification reads. */
export interface ParsedTransaction {
  slot: number;
  blockTime: number | null;
  meta: { err: unknown; fee?: number; preBalances: number[]; postBalances: number[] } | null;
  transaction: {
    signatures: string[];
    message: {
      accountKeys: { pubkey: string; signer: boolean; writable: boolean }[];
      instructions: { programId: string; program?: string; parsed?: unknown }[];
    };
  };
}

/** One entry of `getSignatureStatuses`. */
export interface SignatureStatus {
  confirmationStatus: 'processed' | 'confirmed' | 'finalized' | null;
  err: unknown;
}

export interface ExpectedContribution {
  signature: string;
  /** The authenticated user's verified linked wallet. */
  wallet: string;
  /** The campaign's manually confirmed recipient. */
  recipient: string;
  /** The amount the browser says it sent, in lamports. It must equal what the blockchain shows. */
  lamports: number;
  memo: string;
}

export type ContributionProblem =
  | 'tx_not_found'
  | 'tx_not_confirmed'
  | 'tx_failed'
  | 'wrong_wallet'
  | 'wrong_recipient'
  | 'amount_mismatch'
  | 'campaign_mismatch';

export type VerifiedContribution = { ok: true; lamports: number; slot: number; blockTime: string | null; confirmation: 'confirmed' | 'finalized' };

/**
 * Checks a Devnet transaction fetched by the server (never one described by the browser) against the expected
 * contribution. Only a successful, confirmed transaction whose fee payer is the linked wallet, which moves exactly the
 * claimed lamports from that wallet to the campaign recipient and carries the campaign memo, passes.
 */
export function verifyContribution(
  tx: ParsedTransaction | null,
  status: SignatureStatus | null,
  expected: ExpectedContribution,
): VerifiedContribution | { ok: false; code: ContributionProblem } {
  const no = (code: ContributionProblem) => ({ ok: false as const, code });
  if (!tx && !status) return no('tx_not_found');
  if ((status && status.err != null) || (tx?.meta && tx.meta.err != null)) return no('tx_failed');
  if (!status || (status.confirmationStatus !== 'confirmed' && status.confirmationStatus !== 'finalized')) return no('tx_not_confirmed');
  if (!tx || !tx.meta) return no('tx_not_found');

  // The submitted signature must be the transaction's own first signature (the fee payer's).
  if (tx.transaction.signatures[0] !== expected.signature) return no('wrong_wallet');
  const keys = tx.transaction.message.accountKeys;
  if (!keys.length || keys[0].pubkey !== expected.wallet || !keys[0].signer) return no('wrong_wallet');
  if (expected.recipient === expected.wallet) return no('wrong_recipient');

  type Transfer = { source?: unknown; destination?: unknown; lamports?: unknown };
  const transfers = tx.transaction.message.instructions
    .filter((ix) => ix.programId === SYSTEM_PROGRAM_ID && (ix.parsed as { type?: string } | undefined)?.type === 'transfer')
    .map((ix) => ((ix.parsed as { info?: Transfer }).info ?? {}) as Transfer);
  const toRecipient = transfers.filter((t) => t.destination === expected.recipient);
  if (!toRecipient.length) return no('wrong_recipient');
  if (toRecipient.some((t) => t.source !== expected.wallet)) return no('wrong_wallet');

  let total = 0;
  for (const t of toRecipient) {
    if (typeof t.lamports !== 'number' || !Number.isSafeInteger(t.lamports) || t.lamports <= 0) return no('amount_mismatch');
    total += t.lamports;
  }
  if (!Number.isSafeInteger(total) || total !== expected.lamports) return no('amount_mismatch');

  // The recipient's balance must have grown by exactly that amount: no other transfer in this transaction touched it.
  const r = keys.findIndex((k) => k.pubkey === expected.recipient);
  const delta = r >= 0 ? (tx.meta.postBalances[r] ?? NaN) - (tx.meta.preBalances[r] ?? NaN) : NaN;
  if (delta !== total) return no('amount_mismatch');

  const memos = tx.transaction.message.instructions.filter((ix) => ix.programId === MEMO_PROGRAM_ID).map((ix) => ix.parsed);
  if (memos.length !== 1 || memos[0] !== expected.memo) return no('campaign_mismatch');

  return {
    ok: true,
    lamports: total,
    slot: tx.slot,
    blockTime: tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : null,
    confirmation: status.confirmationStatus,
  };
}
