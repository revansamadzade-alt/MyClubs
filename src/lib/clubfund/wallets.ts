// Solana wallets through the Wallet Standard (Phantom, Solflare, Backpack and other compatible wallets register
// themselves). We ask a wallet to connect, to sign a text message (proving ownership), and, only after the student
// confirms a contribution, to approve one Devnet transfer. Never a secret, never an automatic signature.
import { getWallets } from '@wallet-standard/app';
import type { Wallet, WalletAccount } from '@wallet-standard/base';
import {
  StandardConnect,
  StandardDisconnect,
  StandardEvents,
  type StandardConnectFeature,
  type StandardDisconnectFeature,
  type StandardEventsFeature,
} from '@wallet-standard/features';
import {
  SolanaSignAndSendTransaction,
  SolanaSignMessage,
  SolanaSignTransaction,
  type SolanaSignAndSendTransactionFeature,
  type SolanaSignMessageFeature,
  type SolanaSignTransactionFeature,
} from '@solana/wallet-standard-features';
import { base58 } from '@scure/base';
import { DEVNET_CHAIN } from '../../../supabase/functions/_shared/solana';

export type { Wallet, WalletAccount };

const LAST_WALLET = 'myclubs:clubfund:lastWallet';

const isSolanaAccount = (a: WalletAccount) => a.chains.some((c) => c.startsWith('solana:'));

/** Wallets that can connect, hold a Solana account and sign messages. */
export function usableWallet(w: Wallet): boolean {
  return w.chains.some((c) => c.startsWith('solana:')) && StandardConnect in w.features && SolanaSignMessage in w.features;
}

/** Current usable wallets plus a subscription to wallets registering later (extensions load asynchronously). */
export function watchWallets(onChange: (wallets: Wallet[]) => void): () => void {
  const api = getWallets();
  const emit = () => onChange(api.get().filter(usableWallet));
  emit();
  const off1 = api.on('register', emit);
  const off2 = api.on('unregister', emit);
  return () => {
    off1();
    off2();
  };
}

export class WalletProblem extends Error {
  constructor(
    public code: 'rejected' | 'no_account' | 'unsupported' | 'failed',
    message: string,
    /** The wallet's own error text, for troubleshooting (never contains keys). */
    public detail?: string,
  ) {
    super(message);
  }
}

/** A short, single-line version of the wallet's error message. */
const walletSaid = (msg: string) => msg.replace(/\s+/g, ' ').trim().slice(0, 160) || undefined;

function explain(e: unknown, action: 'connect' | 'sign' | 'transaction'): WalletProblem {
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: number })?.code;
  if (code === 4001 || /reject|denied|declin|cancel/i.test(msg))
    return new WalletProblem(
      'rejected',
      action === 'connect'
        ? 'You cancelled the connection in your wallet.'
        : action === 'sign'
          ? 'You cancelled the signature in your wallet. Nothing was linked.'
          : 'You declined the transaction in your wallet. Nothing was sent.',
      walletSaid(msg),
    );
  return new WalletProblem(
    'failed',
    action === 'connect'
      ? "The wallet didn't connect. Unlock it and try again."
      : action === 'sign'
        ? "The wallet couldn't sign the message. Unlock it, check it's on the account shown here, and try again."
        : "The wallet couldn't sign the transaction. Nothing was sent.",
    walletSaid(msg),
  );
}

/** Connects (or silently reconnects) and returns the wallet's first Solana account. */
export async function connectWallet(wallet: Wallet, silent = false): Promise<WalletAccount> {
  const feature = (wallet.features as StandardConnectFeature)[StandardConnect];
  let accounts: readonly WalletAccount[];
  try {
    ({ accounts } = await feature.connect(silent ? { silent: true } : undefined));
  } catch (e) {
    throw explain(e, 'connect');
  }
  const account = accounts.find(isSolanaAccount) ?? wallet.accounts.find(isSolanaAccount);
  if (!account) throw new WalletProblem('no_account', 'This wallet has no Solana account. Create one in the wallet, then connect again.');
  try {
    localStorage.setItem(LAST_WALLET, wallet.name);
  } catch {
    // Storage blocked: reconnecting after a refresh just won't be automatic.
  }
  return account;
}

/** Stops this browser's connection to the wallet. It does not change anything stored in your MyClubs account. */
export async function disconnectWallet(wallet: Wallet): Promise<void> {
  try {
    localStorage.removeItem(LAST_WALLET);
  } catch {
    // ignore
  }
  const feature = (wallet.features as Partial<StandardDisconnectFeature>)[StandardDisconnect];
  await feature?.disconnect().catch(() => undefined);
}

export function lastWalletName(): string | null {
  try {
    return localStorage.getItem(LAST_WALLET);
  } catch {
    return null;
  }
}

/** Follows account switches inside the wallet. */
export function onAccountsChange(wallet: Wallet, cb: (account: WalletAccount | null) => void): () => void {
  const events = (wallet.features as Partial<StandardEventsFeature>)[StandardEvents];
  if (!events) return () => undefined;
  return events.on('change', (props) => {
    if (props.accounts) cb(props.accounts.find(isSolanaAccount) ?? null);
  });
}

/** Asks the wallet to sign exactly these bytes. Returns the bytes the wallet reports it signed, and the signature. */
export async function signMessage(wallet: Wallet, account: WalletAccount, message: Uint8Array): Promise<{ signedMessage: Uint8Array; signature: Uint8Array }> {
  const feature = (wallet.features as Partial<SolanaSignMessageFeature>)[SolanaSignMessage];
  if (!feature) throw new WalletProblem('unsupported', 'This wallet cannot sign messages. Use Phantom, Solflare or another Solana wallet.');
  let out;
  try {
    [out] = await feature.signMessage({ account, message });
  } catch (e) {
    throw explain(e, 'sign');
  }
  if (!out) throw new WalletProblem('failed', "The wallet didn't return a signature. Try again.");
  return { signedMessage: out.signedMessage, signature: out.signature };
}

export const shortAddress = (a: string) => (a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

/** The wallet can approve transactions (sign only, or sign and send). */
export function canApproveTransactions(w: Wallet): boolean {
  return SolanaSignTransaction in w.features || SolanaSignAndSendTransaction in w.features;
}

/**
 * Asks the wallet to approve one transaction. Wallets that can sign without sending return the signed bytes, and
 * MyClubs submits them to Devnet itself. Wallets that only sign-and-send submit it themselves and return the signature.
 */
export async function approveTransaction(
  wallet: Wallet,
  account: WalletAccount,
  transaction: Uint8Array,
): Promise<{ signedTransaction: Uint8Array } | { sentSignature: string }> {
  const signOnly = (wallet.features as Partial<SolanaSignTransactionFeature>)[SolanaSignTransaction];
  const signAndSend = (wallet.features as Partial<SolanaSignAndSendTransactionFeature>)[SolanaSignAndSendTransaction];
  if (!signOnly && !signAndSend) throw new WalletProblem('unsupported', "This wallet can't approve Solana transactions. Use Phantom or Solflare.");
  try {
    if (signOnly) {
      const [out] = await signOnly.signTransaction({ account, transaction, chain: DEVNET_CHAIN });
      if (!out?.signedTransaction) throw new Error('no transaction returned');
      return { signedTransaction: out.signedTransaction };
    }
    const [out] = await signAndSend!.signAndSendTransaction({ account, transaction, chain: DEVNET_CHAIN });
    if (!out?.signature) throw new Error('no signature returned');
    return { sentSignature: base58.encode(out.signature) };
  } catch (e) {
    const problem = e instanceof WalletProblem ? e : explain(e, 'transaction');
    // A sign-and-send wallet may have submitted the transaction before reporting an error.
    if (!signOnly && problem.code === 'failed')
      throw new WalletProblem('failed', "Your wallet reported an error. Check its activity list before trying again, so you don't send twice.");
    throw problem;
  }
}
