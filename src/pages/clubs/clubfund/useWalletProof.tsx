import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiProblem, type Proof } from '../../../lib/clubfund/api';
import { CHALLENGE_SPENT, challengeFor, forgetChallenge, readRetryAt, writeRetryAt } from '../../../lib/clubfund/challenge';
import { WalletProblem, signMessage } from '../../../lib/clubfund/wallets';
import type { WalletPurpose } from '../../../../supabase/functions/_shared/policy';
import { useClubFund } from './state';
import { Busy } from './parts';

export type ProofPhase = 'idle' | 'challenge' | 'signing' | 'verifying';

const fmtWait = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s} s`);

/**
 * One wallet-ownership proof (link or unlink): get the challenge (reusing an open one), have the wallet sign it, send
 * the proof. Guards against double submission, lets the student stop waiting for a wallet popup that never appeared,
 * reuses the challenge after cancelled or failed signatures, and turns a rate limit into a countdown.
 */
export function useWalletProof(purpose: WalletPurpose) {
  const cf = useClubFund();
  const [phase, setPhase] = useState<ProofPhase>('idle');
  const [error, setError] = useState('');
  const [detail, setDetail] = useState('');
  const [retryAt, setRetryAt] = useState(readRetryAt);
  const [now, setNow] = useState(() => Date.now());
  const attempt = useRef(0);
  const busy = useRef(false);
  /** The account this attempt is for, from the challenge request to the server's answer. */
  const attemptFor = useRef<string | null>(null);

  useEffect(() => {
    if (retryAt <= Date.now()) return;
    const t = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= retryAt) window.clearInterval(t);
    }, 1000);
    return () => window.clearInterval(t);
  }, [retryAt]);
  const waitSeconds = retryAt > now ? Math.ceil((retryAt - now) / 1000) : 0;

  const reset = useCallback((message = '') => {
    attempt.current++;
    busy.current = false;
    attemptFor.current = null;
    setPhase('idle');
    setError(message);
    setDetail('');
  }, []);

  // The wallet switched accounts during an attempt: its challenge and signature belong to the previous account, so
  // the attempt is abandoned (any late result is ignored) and the next one starts for the account now shown.
  const address = cf.account?.address ?? null;
  useEffect(() => {
    if (attemptFor.current && attemptFor.current !== address)
      reset(
        address
          ? 'Your wallet switched accounts, so that request was cancelled. Check the account shown here, then sign again.'
          : 'Your wallet disconnected, so that request was cancelled.',
      );
  }, [address, reset]);

  const run = useCallback(
    async (wallet: string, submit: (proof: Proof) => Promise<void>) => {
      if (busy.current || !cf.wallet || !cf.account || !cf.session || retryAt > Date.now()) return;
      if (cf.account.address !== wallet) {
        setError("The connected wallet isn't the one to sign with. Switch accounts in your wallet.");
        return;
      }
      busy.current = true;
      const mine = ++attempt.current;
      const live = () => mine === attempt.current;
      const w = cf.wallet;
      const account = cf.account;
      attemptFor.current = wallet;
      setError('');
      setDetail('');
      try {
        setPhase('challenge');
        const ch = await challengeFor(cf.session.user.id, wallet, purpose);
        if (!live()) return;
        setPhase('signing');
        const signed = await signMessage(w, account, new TextEncoder().encode(ch.message));
        if (!live()) return; // the student stopped waiting or switched accounts; ignore a late signature
        setPhase('verifying');
        await submit({ challengeId: ch.challengeId, wallet, signedMessage: signed.signedMessage, signature: signed.signature });
        forgetChallenge();
      } catch (e) {
        if (!live()) return;
        if (e instanceof ApiProblem) {
          if (CHALLENGE_SPENT.has(e.code)) forgetChallenge();
          if (e.code === 'rate_limited') {
            const at = Date.now() + Math.max(30, e.retryAfter ?? 600) * 1000;
            writeRetryAt(at);
            setRetryAt(at);
            setNow(Date.now());
          }
          setError(
            e.code === 'challenge_expired'
              ? 'That verification request expired before it was signed. Click the button again to get a new one.'
              : e.code === 'rate_limited'
                ? 'To protect accounts, ClubFund allows 5 new wallet verification requests per 10 minutes.'
                : e.message,
          );
        } else if (e instanceof WalletProblem) {
          setError(e.code === 'rejected' ? `${e.message} You can sign again; the same request is reused.` : e.message);
          setDetail(e.detail ?? '');
        } else setError('Something went wrong. Try again.');
      } finally {
        if (live()) {
          busy.current = false;
          attemptFor.current = null;
          setPhase('idle');
        }
      }
    },
    [cf.wallet, cf.account, cf.session, purpose, retryAt],
  );

  const stopWaiting = useCallback(
    () => reset("Stopped waiting for the wallet. If a wallet request is still open, close it, then sign again (the same request is reused)."),
    [reset],
  );

  return { phase, working: phase !== 'idle', error, detail, waitSeconds, run, stopWaiting };
}

/** Status, errors, the wallet's own message and the rate-limit countdown for a wallet proof. */
export function ProofFeedback({ proof }: { proof: ReturnType<typeof useWalletProof> }) {
  return (
    <>
      {proof.working && (
        <div className="flex flex-wrap items-center gap-3">
          <Busy label={proof.phase === 'signing' ? 'Waiting for your wallet to sign… (check the wallet extension if no window opened)' : 'Talking to ClubFund…'} />
          {proof.phase === 'signing' && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={proof.stopWaiting}>
              Stop waiting
            </button>
          )}
        </div>
      )}
      {proof.error && (
        <div role="alert" className="text-sm text-badge" data-testid="cf-proof-error">
          <p className="font-bold">{proof.error}</p>
          {proof.waitSeconds > 0 && <p className="mt-1">You can try again in {fmtWait(proof.waitSeconds)}.</p>}
          {proof.detail && <p className="mt-1 font-normal text-ink-soft">Wallet message: {proof.detail}</p>}
        </div>
      )}
    </>
  );
}

export const proofButtonLabel = (proof: ReturnType<typeof useWalletProof>, idle: string) =>
  proof.waitSeconds > 0
    ? `Try again in ${fmtWait(proof.waitSeconds)}`
    : proof.phase === 'challenge'
      ? 'Preparing message…'
      : proof.phase === 'signing'
        ? 'Check your wallet…'
        : proof.phase === 'verifying'
          ? 'Verifying signature…'
          : idle;
