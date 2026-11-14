import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { clubfundConfigured, supabase } from '../../../lib/clubfund/client';
import { isUmassEmail, signOut as authSignOut } from '../../../lib/clubfund/auth';
import { ApiProblem, fetchLink, type WalletLink } from '../../../lib/clubfund/api';
import {
  connectWallet,
  disconnectWallet,
  lastWalletName,
  onAccountsChange,
  watchWallets,
  type Wallet,
  type WalletAccount,
} from '../../../lib/clubfund/wallets';

interface ClubFundValue {
  configured: boolean;
  /** The stored session has been checked (restored or not). */
  ready: boolean;
  session: Session | null;
  email: string | null;
  /** The verified session's email is an exact @umass.edu address. */
  emailAllowed: boolean;
  /** The session ended on its own (expired or revoked), not by signing out. */
  sessionEnded: boolean;
  link: WalletLink | null;
  linkStatus: 'idle' | 'loading' | 'ready' | 'error';
  linkError: ApiProblem | null;
  refreshLink(): Promise<void>;
  setLink(link: WalletLink | null): void;
  wallets: Wallet[];
  wallet: Wallet | null;
  account: WalletAccount | null;
  connect(wallet: Wallet): Promise<void>;
  disconnect(): Promise<void>;
  signOut(): Promise<void>;
}

const Ctx = createContext<ClubFundValue | null>(null);

export function useClubFund(): ClubFundValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useClubFund must be used inside ClubFundProvider');
  return v;
}

export function ClubFundProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!clubfundConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [link, setLink] = useState<WalletLink | null>(null);
  const [linkStatus, setLinkStatus] = useState<ClubFundValue['linkStatus']>('idle');
  const [linkError, setLinkError] = useState<ApiProblem | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const signingOut = useRef(false);
  const triedReconnect = useRef(false);

  // Session: restored from this browser on load, then kept current (refreshes, expiry, sign-out in another tab).
  useEffect(() => {
    if (!clubfundConfigured) return;
    const sb = supabase();
    let live = true;
    sb.auth
      .getSession()
      .then(({ data }) => live && setSession(data.session))
      .catch(() => undefined)
      .finally(() => live && setReady(true));
    const { data } = sb.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_OUT') {
        if (!signingOut.current) setSessionEnded(true);
        signingOut.current = false;
        setLink(null);
        setLinkStatus('idle');
      }
      if (event === 'SIGNED_IN') setSessionEnded(false);
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const email = session?.user.email ?? null;
  const emailAllowed = isUmassEmail(email);
  const userId = session?.user.id ?? null;

  const refreshLink = useCallback(async () => {
    setLinkStatus('loading');
    setLinkError(null);
    try {
      setLink(await fetchLink());
      setLinkStatus('ready');
    } catch (e) {
      setLinkError(e instanceof ApiProblem ? e : new ApiProblem('server_error', "Couldn't load your wallet link."));
      setLinkStatus('error');
    }
  }, []);

  useEffect(() => {
    if (userId && emailAllowed) void refreshLink();
  }, [userId, emailAllowed, refreshLink]);

  // Wallets announce themselves asynchronously; reconnect silently to the last one used (no prompt).
  useEffect(() => watchWallets(setWallets), []);
  useEffect(() => {
    if (triedReconnect.current || wallet) return;
    const last = lastWalletName();
    const w = last ? wallets.find((x) => x.name === last) : undefined;
    if (!w) return;
    triedReconnect.current = true;
    connectWallet(w, true)
      .then((a) => {
        setWallet(w);
        setAccount(a);
      })
      .catch(() => undefined);
  }, [wallets, wallet]);

  useEffect(() => {
    if (!wallet) return;
    return onAccountsChange(wallet, (a) => {
      setAccount(a);
      if (!a) setWallet(null);
    });
  }, [wallet]);

  const connect = useCallback(async (w: Wallet) => {
    const a = await connectWallet(w);
    setWallet(w);
    setAccount(a);
  }, []);

  const disconnect = useCallback(async () => {
    if (wallet) await disconnectWallet(wallet);
    setWallet(null);
    setAccount(null);
  }, [wallet]);

  const signOut = useCallback(async () => {
    signingOut.current = true;
    await authSignOut();
    setSession(null);
    setLink(null);
    setLinkStatus('idle');
    setSessionEnded(false);
  }, []);

  return (
    <Ctx.Provider
      value={{
        configured: clubfundConfigured,
        ready,
        session,
        email,
        emailAllowed,
        sessionEnded,
        link,
        linkStatus,
        linkError,
        refreshLink,
        setLink,
        wallets,
        wallet,
        account,
        connect,
        disconnect,
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
