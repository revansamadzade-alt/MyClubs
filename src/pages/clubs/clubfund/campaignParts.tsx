import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, CalendarHeart, ExternalLink, FlaskConical, HandCoins, HeartHandshake, RefreshCw, TriangleAlert } from 'lucide-react';
import { CATEGORY_LABEL, acceptsContributions, type Campaign, type CampaignCategory, type Contribution } from '../../../lib/clubfund/campaigns';
import { RpcProblem, ensureDevnet, getBalance } from '../../../lib/clubfund/devnet';
import { formatSol, progressPercent } from '../../../lib/clubfund/lamports';
import { shortAddress } from '../../../lib/clubfund/wallets';
import { DEVNET_LABEL, MIN_CONTRIBUTION_LAMPORTS, explorerAddressUrl, explorerTxUrl } from '../../../../supabase/functions/_shared/solana';
import { SampleBadge } from '../../../components/ui';
import { cx } from '../../../lib/cx';
import { useClubFund } from './state';
import { Notice, WalletPicker, fmtWhen } from './parts';

export const FAUCET_URL = 'https://faucet.solana.com';
export const CATEGORY_ICON = { club: HeartHandshake, event: CalendarHeart, charity: HandCoins } satisfies Record<CampaignCategory, unknown>;
export const PUBLIC_CHAIN_NOTE =
  'Solana transactions are public: anyone can see the sending and receiving wallet addresses on Solana Explorer. Your email is never put on the blockchain.';

/** The required Devnet demo label. */
export function DevnetNotice({ className }: { className?: string }) {
  return (
    <div role="note" className={cx('flex gap-2 rounded border border-warn/40 bg-warn-soft p-3 text-sm font-bold text-ink', className)} data-testid="cf-devnet-label">
      <FlaskConical size={18} aria-hidden className="mt-0.5 shrink-0 text-warn" />
      <p>{DEVNET_LABEL}</p>
    </div>
  );
}

export function CategoryChip({ category }: { category: CampaignCategory }) {
  const Icon = CATEGORY_ICON[category];
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-xs text-ink ring-1 ring-line-soft">
      <Icon size={13} aria-hidden className="text-umass" /> {CATEGORY_LABEL[category]}
    </span>
  );
}

export function FundingProgress({ campaign, large }: { campaign: Campaign; large?: boolean }) {
  const pct = progressPercent(campaign.raised_lamports, campaign.goal_lamports);
  return (
    <div>
      <p className={cx('flex flex-wrap items-baseline justify-between gap-x-3 text-ink', large ? 'text-base' : 'text-sm')}>
        <span>
          <strong data-testid="cf-raised">{formatSol(campaign.raised_lamports)}</strong> of {formatSol(campaign.goal_lamports)} Devnet SOL
        </span>
        <span className="text-ink-soft">{pct}%</span>
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${campaign.title}: ${pct}% of its goal, verified contributions only`}
        className={cx('mt-1.5 overflow-hidden rounded-full bg-line-soft', large ? 'h-3' : 'h-2')}
      >
        <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-xs text-ink-soft">
        {campaign.contribution_count} verified {campaign.contribution_count === 1 ? 'transaction' : 'transactions'} on Solana Devnet
      </p>
    </div>
  );
}

export function CampaignStatus({ campaign }: { campaign: Campaign }) {
  if (campaign.status === 'closed') return <span className="text-sm text-ink-soft">Closed</span>;
  if (campaign.status === 'paused') return <span className="text-sm text-warn">Paused: not accepting contributions</span>;
  if (!acceptsContributions(campaign)) return <span className="text-sm text-ink-soft">Not open yet: recipient wallet awaiting confirmation</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm text-success">
      <BadgeCheck size={15} aria-hidden /> Open for Devnet contributions
    </span>
  );
}

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  return (
    <li className="card flex flex-col p-4" data-testid="cf-campaign">
      <div className="flex flex-wrap items-center gap-2">
        <CategoryChip category={campaign.category} />
        <SampleBadge label="Devnet demo" />
      </div>
      <h3 className="mt-2 font-bold leading-snug text-ink">
        <Link to={`/clubs/clubfund/campaigns/${campaign.slug}`} className="text-link hover:underline">
          {campaign.title}
        </Link>
      </h3>
      <p className="mt-1 flex-1 text-sm text-ink-soft">{campaign.summary}</p>
      <div className="mt-3">
        <FundingProgress campaign={campaign} />
      </div>
      <div className="mt-2">
        <CampaignStatus campaign={campaign} />
      </div>
    </li>
  );
}

export function TxLink({ signature, label }: { signature: string; label?: string }) {
  return (
    <a href={explorerTxUrl(signature)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link underline">
      {label ?? <span className="font-mono">{shortAddress(signature)}</span>}
      <ExternalLink size={13} aria-hidden />
      <span className="sr-only"> (transaction {signature} on Solana Explorer, Devnet; opens in a new tab)</span>
    </a>
  );
}

export function AddressLink({ address }: { address: string }) {
  return (
    <a href={explorerAddressUrl(address)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link underline">
      View on Solana Explorer (Devnet) <ExternalLink size={13} aria-hidden />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** Verified contributions: amount, time, status, shortened signature and Explorer link. */
export function ContributionList({ items, showCampaign }: { items: (Contribution & { campaignTitle?: string; campaignSlug?: string })[]; showCampaign?: boolean }) {
  return (
    <ul className="divide-y divide-line-soft rounded border border-line" data-testid="cf-history">
      {items.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 p-3 text-sm">
          <span className="min-w-0">
            <strong className="text-ink">{formatSol(c.lamports)} Devnet SOL</strong>
            {showCampaign && c.campaignSlug && (
              <>
                {' '}
                to{' '}
                <Link to={`/clubs/clubfund/campaigns/${c.campaignSlug}`} className="text-link hover:underline">
                  {c.campaignTitle}
                </Link>
              </>
            )}
            <span className="block text-ink-soft">{fmtWhen(c.block_time ?? c.verified_at)}</span>
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1 text-success">
              <BadgeCheck size={15} aria-hidden /> Verified ({c.confirmation_status})
            </span>
            <TxLink signature={c.signature} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export type Network = 'checking' | 'ok' | 'unreachable' | 'wrong';

/** Devnet reachability (genesis-hash checked) and the real Devnet balance of an address. No simulated balances. */
export function useDevnetBalance(address: string | null) {
  const [network, setNetwork] = useState<Network>('checking');
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    (async () => {
      try {
        await ensureDevnet();
        if (!live) return;
        setNetwork('ok');
      } catch (e) {
        if (!live) return;
        setNetwork(e instanceof RpcProblem && e.code === 'wrong_network' ? 'wrong' : 'unreachable');
        setBalance(null);
        setError(e instanceof Error ? e.message : '');
        setLoading(false);
        return;
      }
      if (!address) {
        setLoading(false);
        return;
      }
      try {
        const b = await getBalance(address);
        if (!live) return;
        setBalance(b);
        setError('');
      } catch (e) {
        if (!live) return;
        setBalance(null);
        setError(e instanceof Error ? e.message : "Couldn't read the balance.");
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [address, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { network, balance, error, loading, refresh };
}

/** Connected vs verified wallet, Devnet status, real balance and the official faucet. */
export function WalletPanel({ devnet }: { devnet: ReturnType<typeof useDevnetBalance> }) {
  const cf = useClubFund();
  const link = cf.link;
  if (!link) return null;
  const connected = cf.account?.address ?? null;
  const mismatch = !!connected && connected !== link.wallet_address;
  const low = devnet.balance !== null && devnet.balance < MIN_CONTRIBUTION_LAMPORTS + 5_000;
  return (
    <section aria-labelledby="cf-wallet-panel" className="card p-5" data-testid="cf-wallet-panel">
      <h2 id="cf-wallet-panel" className="font-bold text-ink">
        Wallet and Devnet balance
      </h2>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-ink-soft">Verified wallet</dt>
        <dd className="font-mono text-ink" title={link.wallet_address}>
          {shortAddress(link.wallet_address)} <span className="font-sans text-ink-soft">(linked to your account)</span>
          <span className="sr-only"> (full address {link.wallet_address})</span>
        </dd>
        <dt className="text-ink-soft">Connected wallet</dt>
        <dd className="text-ink" data-testid="cf-connected-wallet">
          {cf.wallet && connected ? (
            <>
              {cf.wallet.name} · <span className="font-mono">{shortAddress(connected)}</span>
              {!mismatch && <span className="text-success"> · matches</span>}
            </>
          ) : (
            'Not connected'
          )}
        </dd>
        <dt className="text-ink-soft">Network</dt>
        <dd className="text-ink" data-testid="cf-network">
          {networkText(devnet.network)}
        </dd>
        <dt className="text-ink-soft">Devnet balance</dt>
        <dd className="flex flex-wrap items-center gap-2 text-ink" data-testid="cf-balance">
          <span>{devnet.balance !== null ? `${formatSol(devnet.balance)} SOL (Devnet test tokens)` : devnet.loading ? 'Loading…' : 'Unavailable'}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={devnet.refresh} disabled={devnet.loading} aria-label="Refresh Devnet balance">
            <RefreshCw size={14} aria-hidden className={cx(devnet.loading && 'animate-spin motion-reduce:animate-none')} />
          </button>
        </dd>
      </dl>
      {mismatch && (
        <div className="mt-3">
          <Notice tone="warn" role="alert">
            The connected wallet ({shortAddress(connected!)}) isn't the wallet verified for your account ({shortAddress(link.wallet_address)}). Switch to the
            verified account in your wallet to contribute. To use a different wallet, unlink the old one in Wallet settings and verify the new one.
          </Notice>
        </div>
      )}
      {!cf.wallet && (
        <div className="mt-3">
          <p className="mb-2 text-sm text-ink">Connect your verified wallet to contribute.</p>
          <WalletPicker wallets={cf.wallets} onConnect={cf.connect} />
        </div>
      )}
      {devnet.error && devnet.network !== 'checking' && (
        <p role="alert" className="mt-2 text-sm text-badge">
          <TriangleAlert size={14} aria-hidden className="mr-1 inline" />
          {devnet.error}
        </p>
      )}
      <p className="mt-3 text-sm text-ink">
        {low && <strong>You need Devnet SOL to contribute. </strong>}
        Devnet SOL is free:{' '}
        <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="text-link underline">
          get some from the official Solana faucet<span className="sr-only"> (faucet.solana.com, opens in a new tab)</span>
        </a>{' '}
        for your verified wallet address, then refresh the balance.
      </p>
    </section>
  );
}

function networkText(n: Network) {
  return n === 'ok' ? 'Solana Devnet · connected' : n === 'checking' ? 'Checking Solana Devnet…' : n === 'wrong' ? 'Not Devnet: contributions are turned off' : "Can't reach Solana Devnet";
}

/** Wallet settings: the verified wallet's real Devnet balance, network status and the faucet. */
export function DevnetBalanceCard({ address }: { address: string }) {
  const devnet = useDevnetBalance(address);
  return (
    <section aria-labelledby="cf-devnet-balance" className="card p-5">
      <h2 id="cf-devnet-balance" className="font-bold text-ink">
        Devnet balance
      </h2>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-ink-soft">Network</dt>
        <dd className="text-ink" data-testid="cf-network">
          {networkText(devnet.network)}
        </dd>
        <dt className="text-ink-soft">Balance</dt>
        <dd className="flex flex-wrap items-center gap-2 text-ink" data-testid="cf-balance">
          <span>{devnet.balance !== null ? `${formatSol(devnet.balance)} SOL (Devnet test tokens)` : devnet.loading ? 'Loading…' : 'Unavailable'}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={devnet.refresh} disabled={devnet.loading} aria-label="Refresh Devnet balance">
            <RefreshCw size={14} aria-hidden className={cx(devnet.loading && 'animate-spin motion-reduce:animate-none')} />
          </button>
        </dd>
      </dl>
      <p className="mt-2 text-sm text-ink">
        Devnet SOL has no monetary value.{' '}
        <a href={FAUCET_URL} target="_blank" rel="noopener noreferrer" className="text-link underline">
          Get free Devnet SOL from the official Solana faucet<span className="sr-only"> (faucet.solana.com, opens in a new tab)</span>
        </a>
        .
      </p>
    </section>
  );
}
