import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, CalendarHeart, HandCoins, HeartHandshake, MailCheck, PenLine, Wallet as WalletIcon } from 'lucide-react';
import { requestChallenge, submitLink, ApiProblem } from '../../../lib/clubfund/api';
import { WalletProblem, shortAddress, signMessage } from '../../../lib/clubfund/wallets';
import { PageHeader, SampleBadge } from '../../../components/ui';
import { useTitle } from '../../../hooks/useTitle';
import { cx } from '../../../lib/cx';
import { useClubFund } from './state';
import { Busy, EmailVerification, NotConfigured, Notice, PRIVACY_STATEMENT, WalletPicker, fmtWhen } from './parts';

const SSO_NOTE =
  'Verifying your email proves you can open that @umass.edu inbox. It is not UMass single sign-on and does not confirm current enrollment.';

function Steps({ current }: { current: 1 | 2 | 3 | 4 }) {
  const steps = [
    { n: 1, label: 'Verify UMass email', icon: MailCheck },
    { n: 2, label: 'Connect wallet', icon: WalletIcon },
    { n: 3, label: 'Sign to prove ownership', icon: PenLine },
  ];
  return (
    <ol className="mb-5 grid grid-cols-3 gap-2" aria-label="ClubFund setup steps">
      {steps.map((s) => {
        const done = current > s.n;
        const active = current === s.n;
        return (
          <li key={s.n} aria-current={active ? 'step' : undefined} className="min-w-0">
            <span aria-hidden className={cx('block h-1.5 rounded-full', done ? 'bg-success' : active ? 'bg-link' : 'bg-line-soft')} />
            <span className={cx('mt-1.5 flex items-center gap-1 text-xs', active ? 'font-bold text-ink' : 'text-ink-soft')}>
              <s.icon size={14} aria-hidden className="shrink-0" />
              {done && <span className="sr-only">Completed: </span>}
              <span className="truncate">{s.label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function About() {
  return (
    <section aria-labelledby="cf-about" className="card p-5">
      <h2 id="cf-about" className="font-bold text-ink">
        What is ClubFund?
      </h2>
      <p className="mt-1 text-sm text-ink">
        ClubFund will let UMass students support clubs, events and charity campaigns on Solana. First, it ties your MyClubs account to a verified
        @umass.edu email and a Solana wallet you prove you control. Fundraising itself is not live: future demos run on Solana Devnet with test
        tokens that have no monetary value.
      </p>
      <p className="mt-2 text-xs text-ink-soft">{SSO_NOTE}</p>
    </section>
  );
}

function LinkWallet() {
  const cf = useClubFund();
  const [phase, setPhase] = useState<'idle' | 'challenge' | 'signing' | 'verifying'>('idle');
  const [error, setError] = useState('');

  const sign = async () => {
    if (!cf.wallet || !cf.account) return;
    setError('');
    try {
      setPhase('challenge');
      const ch = await requestChallenge(cf.account.address, 'link');
      setPhase('signing');
      const { signedMessage, signature } = await signMessage(cf.wallet, cf.account, new TextEncoder().encode(ch.message));
      setPhase('verifying');
      const { link } = await submitLink({ challengeId: ch.challengeId, wallet: cf.account.address, signedMessage, signature });
      cf.setLink(link); // shown only after the server verified the signature and stored the link
    } catch (e) {
      setError(e instanceof ApiProblem || e instanceof WalletProblem ? e.message : 'Something went wrong. Try again.');
    } finally {
      setPhase('idle');
    }
  };

  const working = phase !== 'idle';
  return (
    <>
      <Steps current={cf.wallet ? 3 : 2} />
      <section aria-labelledby="cf-wallet" className="card space-y-4 p-5">
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
          <BadgeCheck size={18} aria-hidden className="text-success" />
          <span>
            <strong>UMass email verified:</strong> {cf.email}
          </span>
        </p>
        <h2 id="cf-wallet" className="text-lg font-bold text-ink">
          {cf.wallet ? 'Sign to prove you own this wallet' : 'Connect your Solana wallet'}
        </h2>
        <p className="text-sm text-ink">
          Connecting shows us your public address. To link it, your wallet signs a one-time message from ClubFund; we check the signature on our
          server. Signing is free, sends no transaction and moves no funds. MyClubs never asks for your recovery phrase or private key.
        </p>
        {!cf.wallet || !cf.account ? (
          <WalletPicker wallets={cf.wallets} onConnect={cf.connect} />
        ) : (
          <div className="rounded border border-line p-4" data-testid="cf-connected">
            <p className="flex items-center gap-2 text-sm text-ink">
              {cf.wallet.icon && <img src={cf.wallet.icon} alt="" width={20} height={20} className="rounded" />}
              <strong>{cf.wallet.name}</strong> connected · not linked yet
            </p>
            <p className="mt-1 font-mono text-sm text-ink" title={cf.account.address}>
              {shortAddress(cf.account.address)}
              <span className="sr-only"> (full address {cf.account.address})</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary" onClick={sign} disabled={working}>
                {phase === 'challenge' ? 'Preparing message…' : phase === 'signing' ? 'Check your wallet…' : phase === 'verifying' ? 'Verifying signature…' : 'Sign verification message'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => void cf.disconnect()} disabled={working}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {working && <Busy label={phase === 'signing' ? 'Waiting for your wallet to sign…' : 'Talking to ClubFund…'} />}
        {error && (
          <p role="alert" className="text-sm font-bold text-badge">
            {error}
          </p>
        )}
      </section>
    </>
  );
}

const CAMPAIGNS = [
  { icon: HeartHandshake, title: 'Support a Club', text: 'Chip in to a student organization you care about.' },
  { icon: CalendarHeart, title: 'Fund an Event', text: 'Back a specific campus event and see its goal and progress.' },
  { icon: HandCoins, title: 'Charity Campaigns', text: 'Join charity drives organized by student groups.' },
];

function Linked() {
  const cf = useClubFund();
  const link = cf.link!;
  return (
    <>
      <section aria-labelledby="cf-linked" className="card p-5">
        <h2 id="cf-linked" className="flex items-center gap-2 text-lg font-bold text-success">
          <BadgeCheck size={22} aria-hidden /> Wallet linked
        </h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-ink-soft">UMass email</dt>
          <dd className="text-ink">
            {cf.email} <span className="text-ink-soft">(verified)</span>
          </dd>
          <dt className="text-ink-soft">Wallet</dt>
          <dd className="font-mono text-ink" title={link.wallet_address}>
            {shortAddress(link.wallet_address)}
            <span className="sr-only"> (full address {link.wallet_address})</span>
          </dd>
          <dt className="text-ink-soft">Network</dt>
          <dd className="text-ink">Solana Devnet</dd>
          <dt className="text-ink-soft">Linked</dt>
          <dd className="text-ink">{fmtWhen(link.linked_at)}</dd>
          <dt className="text-ink-soft">Ownership</dt>
          <dd className="text-ink">Verified by wallet signature, {fmtWhen(link.verified_at)}</dd>
        </dl>
        <Link to="/clubs/clubfund/settings" className="btn btn-secondary mt-4">
          Manage wallet
        </Link>
      </section>

      <section aria-labelledby="cf-campaigns">
        <h2 id="cf-campaigns" className="section-title">
          ClubFund
        </h2>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {CAMPAIGNS.map((c) => (
            <li key={c.title} className="card flex flex-col p-4">
              <c.icon size={24} aria-hidden className="text-umass" />
              <h3 className="mt-2 font-bold text-ink">{c.title}</h3>
              <p className="mt-1 flex-1 text-sm text-ink-soft">{c.text}</p>
              <SampleBadge label="Upcoming · Devnet demo" className="mt-3 self-start" />
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <Notice tone="info" role="note">
            Campaigns are not live. Future demos will run on Solana Devnet with test tokens that have no monetary value. ClubFund does not collect
            real money or donations, and nothing here is tax-deductible.
          </Notice>
        </div>
      </section>
    </>
  );
}

export default function ClubFundHome() {
  useTitle('ClubFund');
  const cf = useClubFund();

  let body;
  if (!cf.configured)
    body = (
      <>
        <NotConfigured />
        <About />
      </>
    );
  else if (!cf.ready) body = <Busy label="Checking your ClubFund session…" />;
  else if (!cf.session)
    body = (
      <>
        {cf.sessionEnded && (
          <Notice tone="warn" role="alert">
            Your ClubFund session ended. Verify your UMass email again to continue.
          </Notice>
        )}
        <Steps current={1} />
        <section aria-labelledby="cf-verify" className="card p-5">
          <h2 id="cf-verify" className="text-lg font-bold text-ink">
            Verify your UMass email
          </h2>
          <p className="mb-3 mt-1 text-sm text-ink">We'll email a one-time code to your @umass.edu address.</p>
          <EmailVerification />
          <p className="mt-3 text-xs text-ink-soft">{SSO_NOTE}</p>
        </section>
        <About />
      </>
    );
  else if (!cf.emailAllowed)
    body = (
      <Notice tone="error" role="alert">
        <p>This account's email isn't an @umass.edu address, so it can't use ClubFund.</p>
        <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => void cf.signOut()}>
          Sign out
        </button>
      </Notice>
    );
  else if (cf.linkStatus === 'error')
    body = (
      <Notice tone="error" role="alert">
        <p>{cf.linkError?.message}</p>
        <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => void cf.refreshLink()}>
          Try again
        </button>
      </Notice>
    );
  else if (cf.linkStatus !== 'ready') body = <Busy label="Loading your wallet link…" />;
  else body = cf.link ? <Linked /> : <LinkWallet />;

  return (
    <>
      <PageHeader
        title="ClubFund"
        description="Verify your UMass email and link a Solana wallet you control. Your email is never put on the blockchain."
        actions={
          cf.session ? (
            <Link to="/clubs/clubfund/settings" className="btn btn-secondary">
              Wallet settings
            </Link>
          ) : undefined
        }
      />
      <div className="max-w-3xl space-y-5">
        {body}
        <p className="text-xs text-ink-soft">{PRIVACY_STATEMENT} Transactions on Solana, including Devnet, are publicly visible.</p>
      </div>
    </>
  );
}
