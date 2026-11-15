import { useEffect, useId, useRef, useState } from 'react';
import { BadgeCheck, CircleAlert, X } from 'lucide-react';
import type { Campaign, RecordedContribution } from '../../../lib/clubfund/campaigns';
import { getFeeForMessage, getLatestBlockhash, getRentMinimum } from '../../../lib/clubfund/devnet';
import { contribute, readPending, resumeContribution, verifyContribution, type Outcome, type Phase } from '../../../lib/clubfund/flow';
import { checkAmount, formatSol } from '../../../lib/clubfund/lamports';
import { buildTransferMessage } from '../../../lib/clubfund/transfer';
import { canApproveTransactions } from '../../../lib/clubfund/wallets';
import { campaignMemo } from '../../../../supabase/functions/_shared/solana';
import { cx } from '../../../lib/cx';
import { useClubFund } from './state';
import { Busy } from './parts';
import { DevnetNotice, TxLink, type useDevnetBalance } from './campaignParts';

const FALLBACK_FEE = 5_000; // the base fee for one signature, in lamports
const FALLBACK_RENT = 890_880;
const QUICK = ['0.01', '0.05', '0.1'];

const PHASE_TEXT: Record<Phase, string> = {
  preparing: 'Preparing a Devnet transaction…',
  wallet: 'Approve the transaction in your wallet…',
  sending: 'Sending to Solana Devnet…',
  confirming: 'Waiting for Solana Devnet to confirm…',
  verifying: 'ClubFund is verifying the transaction on Devnet…',
};

type Step = 'amount' | 'review' | 'working' | 'result';

export function ContributeDialog({
  campaign,
  open,
  onClose,
  onRecorded,
  devnet,
  resume,
}: {
  campaign: Campaign;
  open: boolean;
  onClose: () => void;
  onRecorded: (r: RecordedContribution) => void;
  devnet: ReturnType<typeof useDevnetBalance>;
  /** A saved, unresolved contribution to check instead of starting a new one. */
  resume?: string | null;
}) {
  const cf = useClubFund();
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<Step>('amount');
  const [amount, setAmount] = useState('');
  const [touched, setTouched] = useState(false);
  const [fee, setFee] = useState(FALLBACK_FEE);
  const [feeKnown, setFeeKnown] = useState(false);
  const [rent, setRent] = useState(FALLBACK_RENT);
  const [ack, setAck] = useState(false);
  const [phase, setPhase] = useState<Phase>('preparing');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const working = step === 'working';

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  // Fresh dialog: reset, and estimate the real fee for this exact transfer (Devnet prices the message itself).
  useEffect(() => {
    if (!open) return;
    setStep(resume ? 'working' : 'amount');
    setOutcome(null);
    setAck(false);
    setTouched(false);
    let live = true;
    if (cf.link && campaign.recipient_address) {
      getLatestBlockhash()
        .then(({ blockhash }) =>
          getFeeForMessage(
            buildTransferMessage({ from: cf.link!.wallet_address, to: campaign.recipient_address!, lamports: 1_000_000, memo: campaignMemo(campaign.slug), recentBlockhash: blockhash }),
          ),
        )
        .then((f) => {
          if (live && typeof f === 'number') {
            setFee(f);
            setFeeKnown(true);
          }
        })
        .catch(() => undefined);
      getRentMinimum()
        .then((r) => live && setRent(r))
        .catch(() => undefined);
    }
    if (resume) {
      const pending = readPending().find((p) => p.signature === resume);
      if (pending) void run(() => resumeContribution(pending, setPhase));
      else {
        setOutcome({ kind: 'not_sent', message: 'That contribution is no longer saved in this browser. Check your wallet activity or Solana Explorer.' });
        setStep('result');
      }
    }
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, resume]);

  const check = checkAmount(amount, { balance: devnet.balance, fee, rentMinimum: rent });
  const wrongWallet = !!cf.account && !!cf.link && cf.account.address !== cf.link.wallet_address;
  const canSend = !!cf.wallet && !!cf.account && !!cf.link && !wrongWallet && canApproveTransactions(cf.wallet) && devnet.network === 'ok';

  async function run(fn: () => Promise<Outcome>) {
    setStep('working');
    setPhase('preparing');
    const out = await fn();
    setOutcome(out);
    setStep('result');
    if (out.kind === 'verified') onRecorded(out.result);
    devnet.refresh();
  }

  const start = () => {
    if (!check.ok || !canSend || !ack || !cf.session) return;
    void run(() => contribute({ wallet: cf.wallet!, account: cf.account!, campaign, lamports: check.lamports, userId: cf.session!.user.id, onPhase: setPhase }));
  };

  const checkAgain = (signature: string) => {
    const pending = readPending().find((p) => p.signature === signature);
    if (!pending) return;
    void run(() => (outcome?.kind === 'verify_delayed' ? verifyContribution(pending) : resumeContribution(pending, setPhase)));
  };

  const close = () => ref.current?.close();
  const amountError = touched && !check.ok ? check.message : '';
  const lamports = check.ok ? check.lamports : null;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        if (working) e.preventDefault(); // keep the dialog while a transaction is in flight
      }}
      aria-labelledby={`${id}-title`}
      className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-md border border-line bg-white p-0 text-ink shadow-xl backdrop:bg-black/40"
      data-testid="cf-contribute-dialog"
    >
      {open && (
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <h2 id={`${id}-title`} className="text-xl font-bold leading-snug">
              Support {campaign.title}
            </h2>
            <button type="button" onClick={close} disabled={working} className="grid h-8 w-8 shrink-0 place-items-center rounded hover:bg-surface" aria-label="Close">
              <X size={18} aria-hidden />
            </button>
          </div>
          <DevnetNotice className="mt-3" />

          {step === 'amount' && (
            <form
              className="mt-4 space-y-4"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                setTouched(true);
                if (check.ok && canSend) setStep('review');
              }}
            >
              <div className="text-sm">
                <p className="text-ink-soft">Recipient (developer-controlled Devnet demo wallet)</p>
                <p className="mt-1 break-all rounded-md bg-surface px-2 py-1.5 font-mono text-[0.8125rem] leading-snug text-ink" data-testid="cf-recipient">
                  {campaign.recipient_address}
                </p>
              </div>
              <p className="text-sm text-ink">
                Your Devnet balance:{' '}
                <strong>{devnet.balance !== null ? `${formatSol(devnet.balance)} SOL` : devnet.loading ? 'loading…' : 'unavailable'}</strong>
              </p>
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-ink">Amount (Devnet SOL)</span>
                <input
                  className="input max-w-[12rem]"
                  inputMode="decimal"
                  autoComplete="off"
                  spellCheck={false}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(',', '.'))}
                  onBlur={() => setTouched(true)}
                  aria-invalid={!!amountError || undefined}
                  aria-describedby={`${id}-amount-help${amountError ? ` ${id}-amount-error` : ''}`}
                  data-testid="cf-amount"
                />
                <span id={`${id}-amount-help`} className="mt-1 block text-xs text-ink-soft">
                  Between 0.001 and 2 Devnet SOL. Network fee {feeKnown ? '' : 'about '}
                  {formatSol(fee)} SOL.
                </span>
              </label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Quick amounts">
                {QUICK.map((q) => (
                  <button key={q} type="button" className={cx('chip')} aria-pressed={amount === q} onClick={() => (setAmount(q), setTouched(true))}>
                    {q} SOL
                  </button>
                ))}
              </div>
              {amountError && (
                <p id={`${id}-amount-error`} role="alert" className="text-sm font-bold text-badge">
                  {amountError}
                </p>
              )}
              {!canSend && <SendBlocker wrongWallet={wrongWallet} network={devnet.network} />}
              <div className="flex flex-wrap gap-2">
                <button type="submit" className="btn btn-primary" disabled={!canSend}>
                  Review contribution
                </button>
                <button type="button" className="btn btn-secondary" onClick={close}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {step === 'review' && lamports !== null && (
            <div className="mt-4 space-y-4">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-md border border-line-soft bg-surface p-3 text-sm" data-testid="cf-review">
                <dt className="text-ink-soft">Campaign</dt>
                <dd>{campaign.title}</dd>
                <dt className="text-ink-soft">From</dt>
                <dd className="break-all font-mono">{cf.link?.wallet_address}</dd>
                <dt className="text-ink-soft">To</dt>
                <dd className="break-all font-mono">{campaign.recipient_address}</dd>
                <dt className="text-ink-soft">Amount</dt>
                <dd>
                  <strong>{formatSol(lamports)} Devnet SOL</strong> ({lamports.toLocaleString('en-US')} lamports)
                </dd>
                <dt className="text-ink-soft">Network fee</dt>
                <dd>
                  {feeKnown ? '' : 'about '}
                  {formatSol(fee)} SOL
                </dd>
                <dt className="text-ink-soft">Network</dt>
                <dd>Solana Devnet (test network)</dd>
              </dl>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={ack} onChange={(e) => setAck(e.target.checked)} data-testid="cf-ack" />
                <span>I understand this sends Devnet test tokens with no monetary value. It is not a real donation and is not tax-deductible.</span>
              </label>
              <p className="text-xs text-ink-soft">Your wallet will ask you to approve this exact transfer. Nothing is signed automatically.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-primary" disabled={!ack || !canSend} onClick={start}>
                  Approve in wallet
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setStep('amount')}>
                  Back
                </button>
              </div>
            </div>
          )}

          {step === 'working' && (
            <div className="mt-4 space-y-3" data-testid="cf-working">
              <Busy label={PHASE_TEXT[phase]} />
              <p className="text-xs text-ink-soft">Keep this window open. A contribution counts only after ClubFund verifies it on Solana Devnet.</p>
            </div>
          )}

          {step === 'result' && outcome && <Result outcome={outcome} onClose={close} onRetry={() => setStep('review')} onCheckAgain={checkAgain} />}
        </div>
      )}
    </dialog>
  );
}

function SendBlocker({ wrongWallet, network }: { wrongWallet: boolean; network: string }) {
  const cf = useClubFund();
  const msg = !cf.wallet
    ? 'Connect your verified wallet first.'
    : wrongWallet
      ? "The connected wallet isn't your verified wallet. Switch accounts in your wallet."
      : !canApproveTransactions(cf.wallet)
        ? "This wallet can't approve Solana transactions. Use Phantom or Solflare."
        : network === 'wrong'
          ? 'The Solana endpoint is not Devnet, so contributions are turned off.'
          : network === 'checking'
            ? 'Checking Solana Devnet…'
            : "Can't reach Solana Devnet right now.";
  return (
    <p role="alert" className="text-sm font-bold text-badge">
      {msg}
    </p>
  );
}

function Result({ outcome, onClose, onRetry, onCheckAgain }: { outcome: Outcome; onClose: () => void; onRetry: () => void; onCheckAgain: (sig: string) => void }) {
  if (outcome.kind === 'verified') {
    const c = outcome.result.contribution;
    return (
      <div className="mt-4 space-y-3 rounded-md border border-success/40 bg-[#e8f5ee] p-4" role="status" data-testid="cf-result" data-kind="verified">
        <p className="flex items-center gap-2 text-lg font-bold text-success">
          <BadgeCheck size={22} aria-hidden /> Contribution verified
        </p>
        <p className="text-sm">
          {formatSol(c.lamports)} Devnet SOL was confirmed on Solana Devnet ({c.confirmation_status}) and verified by ClubFund.
          {outcome.result.created ? '' : ' It had already been counted, so the total did not change.'}
        </p>
        <p className="text-sm">
          New verified total: <strong>{formatSol(outcome.result.campaign.raised_lamports)} Devnet SOL</strong> from {outcome.result.campaign.contribution_count}{' '}
          {outcome.result.campaign.contribution_count === 1 ? 'transaction' : 'transactions'}.
        </p>
        <p className="text-sm">
          <TxLink signature={c.signature} label="View the transaction on Solana Explorer (Devnet)" />
        </p>
        <button type="button" className="btn btn-primary" onClick={onClose}>
          Done
        </button>
      </div>
    );
  }
  const retryable = outcome.kind === 'declined' || outcome.kind === 'not_sent' || outcome.kind === 'expired' || outcome.kind === 'failed';
  const checkable = outcome.kind === 'uncertain' || outcome.kind === 'verify_delayed';
  const title =
    outcome.kind === 'declined'
      ? 'Transaction declined'
      : outcome.kind === 'not_sent'
        ? 'Nothing was sent'
        : outcome.kind === 'expired'
          ? 'Transaction expired'
          : outcome.kind === 'failed'
            ? 'Transaction failed'
            : outcome.kind === 'uncertain'
              ? 'Status not known yet'
              : outcome.kind === 'verify_delayed'
                ? 'Verification delayed'
                : outcome.code === 'duplicate_signature'
                  ? 'Already counted'
                  : 'Not counted';
  return (
    <div className="mt-4 space-y-3" data-testid="cf-result" data-kind={outcome.kind}>
      <p role="alert" className={cx('flex items-center gap-2 font-bold', checkable ? 'text-warn' : 'text-badge')}>
        <CircleAlert size={20} aria-hidden /> {title}
      </p>
      <p className="text-sm">{outcome.message}</p>
      {'signature' in outcome && (
        <p className="text-sm">
          <TxLink signature={outcome.signature} label="Look up the transaction on Solana Explorer (Devnet)" />
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {checkable && 'signature' in outcome && (
          <button type="button" className="btn btn-primary" onClick={() => onCheckAgain(outcome.signature)}>
            Check again
          </button>
        )}
        {retryable && (
          <button type="button" className="btn btn-primary" onClick={onRetry}>
            Try again
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
