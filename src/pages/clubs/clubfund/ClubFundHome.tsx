import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BadgeCheck, MailCheck, PenLine, Wallet as WalletIcon } from 'lucide-react';
import { requestChallenge, submitLink, ApiProblem } from '../../../lib/clubfund/api';
import { CATEGORY_LABEL, listCampaigns, listMyContributions, type Campaign, type CampaignCategory, type MyContribution } from '../../../lib/clubfund/campaigns';
import { readPending } from '../../../lib/clubfund/flow';
import { formatSol } from '../../../lib/clubfund/lamports';
import { WalletProblem, shortAddress, signMessage } from '../../../lib/clubfund/wallets';
import { ChipGroup, PageHeader } from '../../../components/ui';
import { useTitle } from '../../../hooks/useTitle';
import { cx } from '../../../lib/cx';
import { useClubFund } from './state';
import { Busy, EmailVerification, NotConfigured, Notice, PRIVACY_STATEMENT, WalletPicker, fmtWhen } from './parts';
import { CampaignCard, ContributionList, DevnetNotice, PUBLIC_CHAIN_NOTE, WalletPanel, useDevnetBalance } from './campaignParts';

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
        ClubFund lets UMass students try fundraising for clubs, events and charity causes on Solana Devnet. It ties your MyClubs account to a
        verified @umass.edu email and a Solana wallet you prove you control. Every campaign is a fictional demo, and contributions use Devnet test
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

function Linked() {
  const cf = useClubFund();
  const link = cf.link!;
  const devnet = useDevnetBalance(link.wallet_address);
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
          <dt className="text-ink-soft">Ownership</dt>
          <dd className="text-ink">Verified by wallet signature, {fmtWhen(link.verified_at)}</dd>
        </dl>
        <Link to="/clubs/clubfund/settings" className="btn btn-secondary mt-4">
          Manage wallet
        </Link>
      </section>
      <WalletPanel devnet={devnet} />
    </>
  );
}

type Filter = 'all' | CampaignCategory;

function CampaignBrowser() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('category');
  const filter: Filter = raw === 'club' || raw === 'event' || raw === 'charity' ? raw : 'all';
  const [items, setItems] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<ApiProblem | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setError(null);
    listCampaigns()
      .then((c) => live && setItems(c))
      .catch((e) => live && setError(e instanceof ApiProblem ? e : new ApiProblem('server_error', "Couldn't load campaigns.")));
    return () => {
      live = false;
    };
  }, [tick]);

  const count = (f: Filter) => (items ?? []).filter((c) => f === 'all' || c.category === f).length;
  const shown = (items ?? []).filter((c) => filter === 'all' || c.category === filter);
  return (
    <section aria-labelledby="cf-campaigns">
      <h2 id="cf-campaigns" className="section-title">
        Demo campaigns
      </h2>
      {error ? (
        <Notice tone={error.code === 'not_set_up' ? 'warn' : 'error'} role="alert">
          <p>{error.message}</p>
          {error.code !== 'not_set_up' && (
            <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => setTick((t) => t + 1)}>
              Try again
            </button>
          )}
        </Notice>
      ) : !items ? (
        <Busy label="Loading campaigns…" />
      ) : (
        <>
          <ChipGroup
            label="Campaign category"
            value={filter}
            onChange={(v) => setParams(v === 'all' ? {} : { category: v }, { replace: true })}
            options={[
              { value: 'all' as Filter, label: 'All campaigns', count: count('all') },
              ...(Object.keys(CATEGORY_LABEL) as CampaignCategory[]).map((k) => ({ value: k as Filter, label: CATEGORY_LABEL[k], count: count(k) })),
            ]}
          />
          {shown.length ? (
            <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((c) => (
                <CampaignCard key={c.id} campaign={c} />
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-ink-soft">No campaigns in this category yet.</p>
          )}
          <p className="mt-3 text-xs text-ink-soft">
            Totals count only contributions ClubFund verified on Solana Devnet. Campaigns are fictional and not affiliated with any UMass organization or charity.
          </p>
        </>
      )}
    </section>
  );
}

function MyContributions() {
  const cf = useClubFund();
  const [items, setItems] = useState<MyContribution[] | null>(null);
  const [error, setError] = useState('');
  const pending = readPending().filter((p) => p.userId === cf.session?.user.id);

  useEffect(() => {
    let live = true;
    listMyContributions()
      .then((c) => live && setItems(c))
      .catch((e) => live && setError(e instanceof ApiProblem ? e.message : "Couldn't load your contributions."));
    return () => {
      live = false;
    };
  }, []);

  return (
    <section aria-labelledby="cf-mine">
      <h2 id="cf-mine" className="section-title">
        Your verified contributions
      </h2>
      {pending.length > 0 && (
        <div className="mb-3">
          <Notice tone="warn" role="status">
            <p className="font-bold">Waiting for verification</p>
            <ul className="mt-1 space-y-1">
              {pending.map((p) => (
                <li key={p.signature}>
                  {formatSol(p.lamports)} Devnet SOL ·{' '}
                  <Link to={'/clubs/clubfund/campaigns/' + p.slug} className="text-link underline">
                    check its status
                  </Link>
                </li>
              ))}
            </ul>
          </Notice>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm text-badge">
          {error}
        </p>
      ) : !items ? (
        <Busy label="Loading your contributions…" />
      ) : items.length ? (
        <ContributionList items={items.map((c) => ({ ...c, campaignTitle: c.campaign?.title, campaignSlug: c.campaign?.slug }))} showCampaign />
      ) : (
        <p className="text-sm text-ink-soft">No verified contributions yet. Pick a demo campaign above to try one with Devnet SOL.</p>
      )}
    </section>
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
        description="Support fictional demo campaigns with Solana Devnet test tokens. Verify your UMass email and link a Solana wallet you control to contribute."
        actions={
          cf.session ? (
            <Link to="/clubs/clubfund/settings" className="btn btn-secondary">
              Wallet settings
            </Link>
          ) : undefined
        }
      />
      <div className="max-w-5xl space-y-6">
        <DevnetNotice />
        <div className="max-w-3xl space-y-5">{body}</div>
        {cf.configured && <CampaignBrowser />}
        {cf.configured && cf.link && <MyContributions />}
        <p className="text-xs text-ink-soft">
          {PRIVACY_STATEMENT} {PUBLIC_CHAIN_NOTE}
        </p>
      </div>
    </>
  );
}
