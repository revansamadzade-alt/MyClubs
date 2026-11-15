// One contribution, start to finish: build a Devnet transfer, have the student approve it in their wallet, submit it
// once, wait for Solana to confirm it, then ask ClubFund's server to verify and record it. A contribution is shown as
// successful only after that server verification. A transaction whose fate is unknown is never sent again: its
// signature is saved first, so its status can always be checked instead.
import { ApiProblem } from './api';
import { submitContribution, type Campaign, type RecordedContribution } from './campaigns';
import { RpcProblem, ensureDevnet, getLatestBlockhash, getParsedTransaction, sendSignedTransaction, waitForConfirmation, type Confirmation } from './devnet';
import { buildTransferMessage, readSignedTransaction, unsignedTransaction } from './transfer';
import { WalletProblem, approveTransaction, type Wallet, type WalletAccount } from './wallets';
import { campaignMemo, looksLikeTxSignature, transferredLamports, type ParsedTransaction } from '../../../supabase/functions/_shared/solana';

export type Phase = 'preparing' | 'wallet' | 'sending' | 'confirming' | 'verifying';

export type Outcome =
  | { kind: 'verified'; signature: string; result: RecordedContribution }
  /** The student declined in the wallet: nothing was sent. */
  | { kind: 'declined'; message: string }
  /** Definitely not sent (refused before submission). Safe to try again. */
  | { kind: 'not_sent'; message: string }
  /** It may have been sent. Do not send again; check its status. */
  | { kind: 'uncertain'; signature: string; message: string }
  /** It landed on Devnet but failed, so nothing moved except possibly the fee. */
  | { kind: 'failed'; signature: string; message: string }
  /** It never landed and now never can. Safe to try again. */
  | { kind: 'expired'; signature: string; message: string }
  /** Confirmed on Devnet, but ClubFund could not verify it yet. Check again shortly. */
  | { kind: 'verify_delayed'; signature: string; message: string }
  /** ClubFund's server refused to count it (wrong wallet, duplicate, …). */
  | { kind: 'refused'; signature: string; code: string; message: string };

export interface Pending {
  signature: string;
  campaignId: string;
  slug: string;
  lamports: number;
  lastValidBlockHeight: number;
  /** Who started it (so another account on this browser never resumes it). */
  userId: string;
  startedAt: string;
}

const PENDING_KEY = 'myclubs:clubfund:pending';

export function readPending(): Pending[] {
  try {
    const v = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((p) => p && typeof p.signature === 'string' && typeof p.campaignId === 'string') : [];
  } catch {
    return [];
  }
}
function writePending(list: Pending[]) {
  try {
    if (list.length) localStorage.setItem(PENDING_KEY, JSON.stringify(list));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage blocked: an interrupted contribution can still be found in the wallet's activity and on Explorer.
  }
}
export const savePending = (p: Pending) => writePending([...readPending().filter((x) => x.signature !== p.signature), p]);
export const clearPending = (signature: string) => writePending(readPending().filter((x) => x.signature !== signature));

const RETRYABLE = new Set(['tx_not_found', 'tx_not_confirmed', 'rpc_unavailable', 'network']);
const KEEP_PENDING = new Set(['server_error', 'not_deployed', 'origin_blocked', 'wrong_network']);

/** Server verification, re-asked a few times while Devnet's view catches up. Never re-sends anything. */
export async function verifyContribution(
  pending: Pending,
  { attempts = 4, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms)) } = {},
): Promise<Outcome> {
  let last: ApiProblem | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const result = await submitContribution(pending.campaignId, pending.signature, pending.lamports);
      clearPending(pending.signature);
      return { kind: 'verified', signature: pending.signature, result };
    } catch (e) {
      const p = e instanceof ApiProblem ? e : new ApiProblem('server_error', 'Something went wrong on our side.');
      if (!RETRYABLE.has(p.code)) {
        if (p.code === 'not_signed_in') return { kind: 'verify_delayed', signature: pending.signature, message: 'Your session ended. Verify your UMass email again, then check this contribution.' };
        if (p.code === 'verify_rate_limited') {
          const mins = Math.max(1, Math.ceil((p.retryAfter ?? 600) / 60));
          return {
            kind: 'verify_delayed',
            signature: pending.signature,
            message: `ClubFund limits how often contributions are checked. Check again in about ${mins} minute${mins === 1 ? '' : 's'}. Nothing will be sent again.`,
          };
        }
        // Our side or the connection failed: keep it saved and checkable; nothing about the transaction is wrong.
        if (KEEP_PENDING.has(p.code)) return { kind: 'verify_delayed', signature: pending.signature, message: `${p.message} The transaction is saved; check again in a moment.` };
        clearPending(pending.signature);
        return { kind: 'refused', signature: pending.signature, code: p.code, message: p.message };
      }
      last = p;
      if (i < attempts - 1) await sleep(2_000 * (i + 1));
    }
  }
  return {
    kind: 'verify_delayed',
    signature: pending.signature,
    message: `${last?.message ?? 'Verification is taking longer than usual.'} The transaction is confirmed on Devnet; it will count once ClubFund verifies it.`,
  };
}

function afterConfirmation(c: Confirmation, pending: Pending): Outcome | null {
  if (c === 'failed') {
    clearPending(pending.signature);
    return { kind: 'failed', signature: pending.signature, message: 'The transaction failed on Solana Devnet, so it was not counted.' };
  }
  if (c === 'expired') {
    clearPending(pending.signature);
    return { kind: 'expired', signature: pending.signature, message: 'The transaction was never processed and has expired. No Devnet SOL moved; you can try again.' };
  }
  if (c === 'unknown')
    return {
      kind: 'uncertain',
      signature: pending.signature,
      message: "We can't tell yet whether the transaction went through. Don't send another one: check its status in a moment.",
    };
  return null;
}

/** Re-checks a saved contribution whose result was not known (after a refresh, a dropped connection, …). */
export async function resumeContribution(pending: Pending, onPhase: (p: Phase) => void = () => {}): Promise<Outcome> {
  onPhase('confirming');
  const c = await waitForConfirmation(pending.signature, pending.lastValidBlockHeight, { timeoutMs: 30_000 });
  const stop = afterConfirmation(c, pending);
  if (stop) return stop;
  onPhase('verifying');
  return verifyContribution(pending);
}

export async function contribute(a: {
  wallet: Wallet;
  account: WalletAccount;
  campaign: Campaign;
  lamports: number;
  userId: string;
  onPhase: (p: Phase) => void;
}): Promise<Outcome> {
  const { wallet, account, campaign, lamports } = a;
  if (!campaign.recipient_address) return { kind: 'not_sent', message: 'This campaign has no confirmed recipient yet.' };

  a.onPhase('preparing');
  let blockhash: { blockhash: string; lastValidBlockHeight: number };
  try {
    await ensureDevnet();
    blockhash = await getLatestBlockhash();
  } catch (e) {
    return { kind: 'not_sent', message: e instanceof RpcProblem ? e.message : "Can't reach Solana Devnet right now." };
  }
  const message = buildTransferMessage({
    from: account.address,
    to: campaign.recipient_address,
    lamports,
    memo: campaignMemo(campaign.slug),
    recentBlockhash: blockhash.blockhash,
  });

  a.onPhase('wallet');
  let approved: Awaited<ReturnType<typeof approveTransaction>>;
  try {
    approved = await approveTransaction(wallet, account, unsignedTransaction(message));
  } catch (e) {
    const p = e instanceof WalletProblem ? e : new WalletProblem('failed', "The wallet couldn't sign the transaction. Nothing was sent.");
    return p.code === 'rejected' ? { kind: 'declined', message: p.message } : { kind: 'not_sent', message: p.message };
  }

  let signature: string;
  let signed: Uint8Array | null = null;
  try {
    if ('sentSignature' in approved) signature = approved.sentSignature;
    else ({ signature } = readSignedTransaction((signed = approved.signedTransaction)));
  } catch {
    return { kind: 'not_sent', message: "The wallet didn't return a signed transaction. Nothing was sent." };
  }

  // Saved before submitting: from here on, the fate of this exact transaction can always be looked up.
  const pending: Pending = {
    signature,
    campaignId: campaign.id,
    slug: campaign.slug,
    lamports,
    lastValidBlockHeight: blockhash.lastValidBlockHeight,
    userId: a.userId,
    startedAt: new Date().toISOString(),
  };
  savePending(pending);

  if (signed) {
    a.onPhase('sending');
    try {
      await sendSignedTransaction(signed);
    } catch (e) {
      if (e instanceof RpcProblem && e.code === 'rejected') {
        clearPending(signature);
        return { kind: 'not_sent', message: e.message };
      }
      // Uncertain: fall through and find out by its signature. Never submit it again.
    }
  }

  a.onPhase('confirming');
  const stop = afterConfirmation(await waitForConfirmation(signature, blockhash.lastValidBlockHeight), pending);
  if (stop) return stop;

  a.onPhase('verifying');
  return verifyContribution(pending);
}

export type RecheckResult = { kind: 'verified'; result: RecordedContribution } | { kind: 'problem'; message: string };

/**
 * Recovery for a contribution whose result was lost (another browser, cleared storage): the student pastes the
 * transaction signature. The amount is read from Devnet, then the server verifies everything itself (sender = this
 * student's verified wallet, recipient, memo, confirmation, not counted before), so an unrelated signature can't be
 * claimed.
 */
export async function recheckSignature(a: { campaign: Campaign; signature: string; wallet: string; userId: string }): Promise<RecheckResult> {
  const signature = a.signature.trim();
  if (!looksLikeTxSignature(signature)) return { kind: 'problem', message: "That isn't a Solana transaction signature (it is about 88 letters and digits)." };
  if (!a.campaign.recipient_address) return { kind: 'problem', message: 'This campaign has no confirmed recipient.' };
  let tx: ParsedTransaction | null;
  try {
    tx = await getParsedTransaction(signature);
  } catch (e) {
    return { kind: 'problem', message: e instanceof RpcProblem ? e.message : "Can't reach Solana Devnet right now." };
  }
  if (!tx) return { kind: 'problem', message: 'Solana Devnet has no confirmed transaction with that signature yet. Check it, or wait a few seconds and try again.' };
  const lamports = transferredLamports(tx, a.wallet, a.campaign.recipient_address);
  if (!lamports) return { kind: 'problem', message: "That transaction didn't send Devnet SOL from your verified wallet to this campaign's recipient." };
  const out = await verifyContribution(
    { signature, campaignId: a.campaign.id, slug: a.campaign.slug, lamports, lastValidBlockHeight: 0, userId: a.userId, startedAt: new Date().toISOString() },
    { attempts: 2 },
  );
  return out.kind === 'verified' ? { kind: 'verified', result: out.result } : { kind: 'problem', message: 'message' in out ? out.message : 'It could not be verified.' };
}
