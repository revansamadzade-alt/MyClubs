import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, SearchX } from 'lucide-react';
import { ApiProblem } from '../../../lib/clubfund/api';
import { acceptsContributions, getCampaign, listContributions, type Campaign, type Contribution, type RecordedContribution } from '../../../lib/clubfund/campaigns';
import { readPending, recheckSignature } from '../../../lib/clubfund/flow';
import { formatSol } from '../../../lib/clubfund/lamports';
import { canApproveTransactions } from '../../../lib/clubfund/wallets';
import { EVENT_BY_ID } from '../../../data/events';
import { EmptyState, SampleBadge } from '../../../components/ui';
import { useTitle } from '../../../hooks/useTitle';
import { useClubFund } from './state';
import { Busy, NotConfigured, Notice, fmtWhen } from './parts';
import { AddressLink, CampaignStatus, CategoryChip, ContributionList, DevnetNotice, FundingProgress, PUBLIC_CHAIN_NOTE, TxLink, WalletPanel, useDevnetBalance } from './campaignParts';
import { ContributeDialog } from './ContributeDialog';

export default function CampaignPage() {
  const { slug = '' } = useParams();
  const cf = useClubFund();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [history, setHistory] = useState<Contribution[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<{ resume: string | null } | null>(null);
  const [pendingSig, setPendingSig] = useState<string | null>(null);
  const devnet = useDevnetBalance(cf.link?.wallet_address ?? null);
  useTitle(campaign ? `${campaign.title} · ClubFund` : 'ClubFund campaign');

  const load = useCallback(async () => {
    if (!cf.configured) return;
    setStatus('loading');
    try {
      const c = await getCampaign(slug);
      if (!c) {
        setStatus('missing');
        return;
      }
      setCampaign(c);
      setHistory(await listContributions(c.id));
      setStatus('ready');
    } catch (e) {
      setError(e instanceof ApiProblem ? e.message : "Couldn't load this campaign.");
      setStatus('error');
    }
  }, [slug, cf.configured]);

  useEffect(() => {
    void load();
  }, [load]);

  // A contribution started earlier in this browser whose result is still unknown.
  useEffect(() => {
    if (!campaign || !cf.session) return setPendingSig(null);
    setPendingSig(readPending().find((p) => p.campaignId === campaign.id && p.userId === cf.session!.user.id)?.signature ?? null);
  }, [campaign, cf.session, dialog]);

  const recorded = (r: RecordedContribution) => {
    setCampaign((c) => (c ? { ...c, raised_lamports: r.campaign.raised_lamports, contribution_count: r.campaign.contribution_count } : c));
    setHistory((h) => (h.some((x) => x.signature === r.contribution.signature) ? h : [r.contribution, ...h]));
  };

  if (!cf.configured)
    return (
      <div className="max-w-3xl space-y-4">
        <BackLink />
        <NotConfigured />
      </div>
    );
  if (status === 'loading') return <Busy label="Loading campaign…" />;
  if (status === 'error')
    return (
      <div className="max-w-3xl space-y-4">
        <BackLink />
        <Notice tone="error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => void load()}>
            Try again
          </button>
        </Notice>
      </div>
    );
  if (status === 'missing' || !campaign)
    return (
      <div className="max-w-3xl">
        <BackLink />
        <EmptyState icon={SearchX} title="Campaign not found">
          This ClubFund campaign doesn't exist or isn't published.
        </EmptyState>
      </div>
    );

  const event = campaign.related_event_id ? EVENT_BY_ID[campaign.related_event_id] : undefined;
  const open = acceptsContributions(campaign);

  let gate: ReactNode = null;
  if (!open) gate = <p className="text-sm text-ink-soft">This campaign isn't accepting contributions right now.</p>;
  else if (!cf.ready) gate = <Busy label="Checking your ClubFund session…" />;
  else if (!cf.session || !cf.emailAllowed)
    gate = (
      <p className="text-sm text-ink">
        <Link to="/clubs/clubfund" className="text-link underline">
          Verify your UMass email
        </Link>{' '}
        and link a wallet to contribute.
      </p>
    );
  else if (cf.linkStatus === 'ready' && !cf.link)
    gate = (
      <p className="text-sm text-ink">
        <Link to="/clubs/clubfund" className="text-link underline">
          Link and verify a Solana wallet
        </Link>{' '}
        to contribute.
      </p>
    );
  else if (cf.linkStatus === 'error') gate = <p className="text-sm text-badge">{cf.linkError?.message}</p>;

  const wrongWallet = !!cf.account && !!cf.link && cf.account.address !== cf.link.wallet_address;
  const ready = open && !gate && !!cf.link && !!cf.wallet && !!cf.account && !wrongWallet && canApproveTransactions(cf.wallet) && devnet.network === 'ok';

  return (
    <article className="max-w-4xl">
      <BackLink />
      <header className="border-b border-line-soft pb-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <CategoryChip category={campaign.category} />
          <SampleBadge label="Devnet demo campaign" />
        </div>
        <h1 className="text-[1.75rem] font-bold leading-tight text-ink">{campaign.title}</h1>
        <p className="mt-1.5 text-ink-soft">{campaign.summary}</p>
      </header>

      <DevnetNotice className="mt-5" />

      <div className="mt-6 grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="cf-about-campaign">
            <h2 id="cf-about-campaign" className="section-title">
              About this demo campaign
            </h2>
            <p className="text-ink">{campaign.description}</p>
            <p className="mt-2 text-sm text-ink-soft">
              Fictional demonstration: not created, run or endorsed by any UMass organization or charity. No real money is collected and nothing is tax-deductible.
            </p>
            {event && (
              <p className="mt-3 flex items-center gap-1.5 text-sm">
                <CalendarDays size={16} aria-hidden className="text-umass" />
                Linked sample event:{' '}
                <Link to={`/clubs/events/${event.id}`} className="text-link hover:underline">
                  {event.title}
                </Link>
              </p>
            )}
          </section>

          <section aria-labelledby="cf-history-heading">
            <h2 id="cf-history-heading" className="section-title">
              Verified contributions
            </h2>
            {history.length ? (
              <ContributionList items={history} />
            ) : (
              <p className="rounded-md border border-dashed border-line bg-surface/50 p-4 text-sm text-ink-soft">No verified contributions yet.</p>
            )}
            <p className="mt-2 text-xs text-ink-soft">
              Only transactions ClubFund verified on Solana Devnet are listed and counted. {PUBLIC_CHAIN_NOTE}
            </p>
          </section>
        </div>

        <aside className="space-y-4">
          <div className="card space-y-3 border-t-4 border-t-success p-4">
            <FundingProgress campaign={campaign} large />
            <dl className="space-y-1 border-t border-line-soft pt-3 text-sm">
              <div className="flex flex-wrap justify-between gap-x-2">
                <dt className="text-ink-soft">Goal</dt>
                <dd>{formatSol(campaign.goal_lamports)} Devnet SOL</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-x-2">
                <dt className="text-ink-soft">Status</dt>
                <dd>
                  <CampaignStatus campaign={campaign} />
                </dd>
              </div>
            </dl>
            <div className="border-t border-line-soft pt-3 text-sm">
              <p className="text-ink-soft">Recipient Devnet wallet</p>
              {campaign.recipient_address ? (
                <>
                  <p className="my-1 break-all rounded-md bg-surface px-2 py-1.5 font-mono text-[0.8125rem] leading-snug text-ink" data-testid="cf-campaign-recipient">
                    {campaign.recipient_address}
                  </p>
                  <p className="text-xs text-ink-soft">
                    Demo wallet controlled by the MyClubs developer
                    {campaign.recipient_confirmed_at ? `, confirmed ${fmtWhen(campaign.recipient_confirmed_at)}` : ', not confirmed yet'}.
                  </p>
                  <AddressLink address={campaign.recipient_address} />
                </>
              ) : (
                <p className="text-ink">Not configured yet. Contributions open once the developer sets and confirms a Devnet wallet.</p>
              )}
            </div>
            {pendingSig && (
              <Notice tone="warn" role="status">
                <p>A contribution you started here hasn't been verified yet.</p>
                <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => setDialog({ resume: pendingSig })}>
                  Check its status
                </button>
              </Notice>
            )}
            <button type="button" className="btn btn-primary w-full justify-center" disabled={!ready || !!pendingSig} onClick={() => setDialog({ resume: null })}>
              Support This Campaign
            </button>
            {gate}
            {open && cf.link && cf.session && cf.emailAllowed && (
              <RecheckForm campaign={campaign} wallet={cf.link.wallet_address} userId={cf.session.user.id} onVerified={recorded} />
            )}
          </div>
          {cf.link && <WalletPanel devnet={devnet} />}
        </aside>
      </div>

      {dialog && (
        <ContributeDialog campaign={campaign} open={!!dialog} resume={dialog.resume} onClose={() => setDialog(null)} onRecorded={recorded} devnet={devnet} />
      )}
    </article>
  );
}

/**
 * Recovery for a contribution whose result was lost (another browser, cleared storage, closed tab): paste the
 * transaction signature. The server re-verifies it on Devnet (from this student's verified wallet, to this campaign's
 * recipient, with its memo, counted at most once), so nobody can claim someone else's transaction.
 */
function RecheckForm({ campaign, wallet, userId, onVerified }: { campaign: Campaign; wallet: string; userId: string; onVerified: (r: RecordedContribution) => void }) {
  const [signature, setSignature] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string; signature?: string } | null>(null);
  const inFlight = useRef(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (inFlight.current || !signature.trim()) return;
    inFlight.current = true;
    setBusy(true);
    setResult(null);
    const r = await recheckSignature({ campaign, signature, wallet, userId });
    if (r.kind === 'verified') {
      onVerified(r.result);
      setResult({
        ok: true,
        text: `Verified: ${formatSol(r.result.contribution.lamports)} Devnet SOL ${r.result.created ? 'is now counted' : 'was already counted'}.`,
        signature: r.result.contribution.signature,
      });
      setSignature('');
    } else setResult({ ok: false, text: r.message });
    inFlight.current = false;
    setBusy(false);
  };

  return (
    <details className="text-sm" data-testid="cf-recheck">
      <summary className="cursor-pointer text-link">Contribution didn't finish? Check a transaction</summary>
      <form onSubmit={submit} className="mt-2 space-y-2" noValidate>
        <label className="block">
          <span className="mb-1 block font-bold text-ink">Transaction signature</span>
          <input
            className="input font-mono text-xs"
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            data-testid="cf-recheck-signature"
          />
        </label>
        <p className="text-xs text-ink-soft">
          From your wallet's activity or Solana Explorer. Only a transfer from your verified wallet to this campaign's recipient can count, and only once.
          Nothing is sent.
        </p>
        <button type="submit" className="btn btn-secondary btn-sm" disabled={busy || !signature.trim()}>
          {busy ? 'Checking…' : 'Check transaction'}
        </button>
        {result && (
          <p role={result.ok ? 'status' : 'alert'} className={result.ok ? 'text-success' : 'font-bold text-badge'} data-testid="cf-recheck-result">
            {result.text} {result.signature && <TxLink signature={result.signature} label="View on Solana Explorer (Devnet)" />}
          </p>
        )}
      </form>
    </details>
  );
}

function BackLink() {
  return (
    <Link to="/clubs/clubfund" className="mb-4 inline-flex items-center gap-1.5 text-sm text-link hover:underline">
      <ArrowLeft size={16} aria-hidden /> All ClubFund campaigns
    </Link>
  );
}
