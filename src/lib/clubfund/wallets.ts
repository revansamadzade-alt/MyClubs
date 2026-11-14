// Solana wallets through the Wallet Standard (Phantom, Solflare, Backpack and other compatible wallets register
// themselves). We only ever ask a wallet to connect and to sign a text message: never a transaction, never a secret.
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
import { SolanaSignMessage, type SolanaSignMessageFeature } from '@solana/wallet-standard-features';

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
  ) {
    super(message);
  }
}

function explain(e: unknown, action: 'connect' | 'sign'): WalletProblem {
  const msg = e instanceof Error ? e.message : String(e);
  const code = (e as { code?: number })?.code;
  if (code === 4001 || /reject|denied|declin|cancel/i.test(msg))
    return new WalletProblem('rejected', action === 'connect' ? 'You cancelled the connection in your wallet.' : 'You cancelled the signature in your wallet. Nothing was linked.');
  return new WalletProblem('failed', action === 'connect' ? "The wallet didn't connect. Unlock it and try again." : "The wallet couldn't sign the message. Try again.");
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
