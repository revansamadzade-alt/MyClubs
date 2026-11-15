import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, Info, Loader2, Lock, Wallet as WalletIcon } from 'lucide-react';
import { AuthProblem, CODE_MAX_LENGTH, RESEND_SECONDS, isCodeLengthValid, normalizeCode, requestCode, verifyCode } from '../../../lib/clubfund/auth';
import type { Wallet } from '../../../lib/clubfund/wallets';
import { WalletProblem } from '../../../lib/clubfund/wallets';
import { cx } from '../../../lib/cx';

export const PRIVACY_STATEMENT =
  'Your university email is used to verify inbox access and associate your wallet with your MyClubs account. It is not published on the blockchain.';

export function Notice({ tone = 'info', children, role }: { tone?: 'info' | 'warn' | 'error' | 'success'; children: ReactNode; role?: 'alert' | 'status' | 'note' }) {
  const styles = {
    info: 'border-[#b3d7ee] bg-[#eef6fb]',
    warn: 'border-warn/40 bg-warn-soft',
    error: 'border-badge/40 bg-[#fdeeee]',
    success: 'border-success/40 bg-[#e8f5ee]',
  }[tone];
  const Icon = tone === 'error' || tone === 'warn' ? CircleAlert : tone === 'success' ? Lock : Info;
  const color = { info: 'text-link', warn: 'text-warn', error: 'text-badge', success: 'text-success' }[tone];
  return (
    <div role={role} className={cx('flex gap-2 rounded-md border p-3 text-sm text-ink', styles)}>
      <Icon size={18} aria-hidden className={cx('mt-0.5 shrink-0', color)} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Busy({ label }: { label: string }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-ink-soft">
      <Loader2 size={16} aria-hidden className="animate-spin motion-reduce:animate-none" /> {label}
    </p>
  );
}

export function NotConfigured() {
  return (
    <Notice tone="warn" role="note">
      <p className="font-bold">ClubFund isn't set up on this copy of MyClubs.</p>
      <p className="mt-1">
        It needs the Supabase project URL and publishable key in <code>.env.local</code> (see <code>.env.example</code>). Everything else in
        MyClubs works without it.
      </p>
    </Notice>
  );
}

const PENDING_KEY = 'myclubs:clubfund:pendingCode';

function readPending(): { email: string; sentAt: number } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? 'null');
    return v && typeof v.email === 'string' && typeof v.sentAt === 'number' ? v : null;
  } catch {
    return null;
  }
}
function writePending(v: { email: string; sentAt: number } | null) {
  try {
    if (v) sessionStorage.setItem(PENDING_KEY, JSON.stringify(v));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage blocked: the code step just won't survive a refresh.
  }
}

/**
 * Email one-time-code verification. With `fixedEmail` it re-verifies the signed-in address (used before unlinking a
 * lost wallet); otherwise it asks for an @umass.edu address first.
 */
export function EmailVerification({ fixedEmail, onVerified, submitLabel = 'Verify' }: { fixedEmail?: string; onVerified?: () => void; submitLabel?: string }) {
  const id = useId();
  const [pending, setPending] = useState(() => (fixedEmail ? null : readPending()));
  const [email, setEmail] = useState(fixedEmail ?? '');
  const [code, setCode] = useState('');
  const [error, setError] = useState<AuthProblem | null>(null);
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const codeRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pending) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [pending]);
  const wait = pending ? Math.max(0, RESEND_SECONDS - Math.floor((now - pending.sentAt) / 1000)) : 0;

  const send = async (target: string) => {
    setBusy('send');
    setError(null);
    try {
      const normalized = await requestCode(target);
      const p = { email: normalized, sentAt: Date.now() };
      setNow(p.sentAt);
      setPending(p);
      if (!fixedEmail) writePending(p);
      setCode('');
      requestAnimationFrame(() => codeRef.current?.focus());
    } catch (e) {
      setError(e instanceof AuthProblem ? e : new AuthProblem('unknown', 'Something went wrong. Try again.'));
      if (!pending) requestAnimationFrame(() => emailRef.current?.focus());
    } finally {
      setBusy(null);
    }
  };

  const verify = async () => {
    if (!pending) return;
    setBusy('verify');
    setError(null);
    try {
      await verifyCode(pending.email, code);
      writePending(null);
      setPending(null);
      onVerified?.();
    } catch (e) {
      setError(e instanceof AuthProblem ? e : new AuthProblem('unknown', 'Something went wrong. Try again.'));
      requestAnimationFrame(() => codeRef.current?.focus());
    } finally {
      setBusy(null);
    }
  };

  const errorId = `${id}-error`;
  const errorBox = error && (
    <p id={errorId} role="alert" className="mt-2 text-sm font-bold text-badge">
      {error.message}
    </p>
  );

  if (!pending)
    return (
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void send(fixedEmail ?? email);
        }}
        aria-label="Request a verification code"
      >
        {fixedEmail ? (
          <p className="text-sm text-ink">
            We'll send a new code to <strong>{fixedEmail}</strong>.
          </p>
        ) : (
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-ink">UMass email address</span>
            <input
              ref={emailRef}
              type="email"
              inputMode="email"
              autoComplete="email"
              spellCheck={false}
              placeholder="jdoe@umass.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error?.code === 'invalid_email' || undefined}
              aria-describedby={error ? errorId : undefined}
              className="input sm:max-w-sm"
              data-testid="cf-email"
            />
          </label>
        )}
        {errorBox}
        <button type="submit" className="btn btn-primary mt-3" disabled={busy === 'send'}>
          {busy === 'send' ? 'Sending code…' : 'Send verification code'}
        </button>
      </form>
    );

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void verify();
      }}
      aria-label="Enter your verification code"
    >
      <p className="text-sm text-ink" role="status">
        We sent a verification code to <strong>{pending.email}</strong>. It expires after a short time.
      </p>
      <label className="mt-3 block">
        <span className="mb-1 block text-sm font-bold text-ink">Verification code</span>
        <input
          ref={codeRef}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={CODE_MAX_LENGTH}
          value={code}
          onChange={(e) => setCode(normalizeCode(e.target.value))}
          aria-invalid={error?.code === 'bad_code' || undefined}
          aria-describedby={error ? `${id}-code-help ${errorId}` : `${id}-code-help`}
          className="input w-full max-w-[14rem] text-center font-mono text-lg tracking-[0.25em]"
          data-testid="cf-code"
        />
        <span id={`${id}-code-help`} className="mt-1 block text-xs text-ink-soft">
          Enter all the digits from the email.
        </span>
      </label>
      {errorBox}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="submit" className="btn btn-primary" disabled={!isCodeLengthValid(code) || busy === 'verify'}>
          {busy === 'verify' ? 'Verifying…' : submitLabel}
        </button>
        <button type="button" className="btn btn-secondary" disabled={wait > 0 || busy === 'send'} onClick={() => void send(pending.email)} data-testid="cf-resend">
          {wait > 0 ? `Resend code in ${wait} s` : busy === 'send' ? 'Sending…' : 'Resend code'}
        </button>
        {!fixedEmail && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              writePending(null);
              setPending(null);
              setError(null);
              setCode('');
            }}
          >
            Use a different email
          </button>
        )}
      </div>
    </form>
  );
}

/** Wallet choices (Wallet Standard wallets detected in this browser), or how to get one. */
export function WalletPicker({ wallets, onConnect }: { wallets: Wallet[]; onConnect: (w: Wallet) => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  if (!wallets.length)
    return (
      <Notice tone="info" role="note">
        <p className="font-bold">No Solana wallet found in this browser.</p>
        <p className="mt-1">
          Install a Solana wallet such as{' '}
          <a href="https://phantom.com/download" target="_blank" rel="noopener noreferrer" className="text-link underline">
            Phantom<span className="sr-only"> (opens in a new tab)</span>
          </a>
          , set it to <strong>Devnet</strong>, then reload this page. MyClubs will never ask for your recovery phrase.
        </p>
      </Notice>
    );
  return (
    <div>
      <ul className="flex flex-wrap gap-2" aria-label="Wallets in this browser">
        {wallets.map((w) => (
          <li key={w.name}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy !== null}
              onClick={async () => {
                setBusy(w.name);
                setError('');
                try {
                  await onConnect(w);
                } catch (e) {
                  setError(e instanceof WalletProblem ? e.message : "The wallet didn't connect. Try again.");
                } finally {
                  setBusy(null);
                }
              }}
            >
              {w.icon ? <img src={w.icon} alt="" width={20} height={20} className="rounded" /> : <WalletIcon size={18} aria-hidden />}
              {busy === w.name ? `Connecting ${w.name}…` : `Connect ${w.name}`}
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-badge">
          {error}
        </p>
      )}
    </div>
  );
}

export const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
