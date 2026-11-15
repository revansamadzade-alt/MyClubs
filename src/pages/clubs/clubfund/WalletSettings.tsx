import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, TriangleAlert } from 'lucide-react';
import { ApiProblem, unlinkAfterRecentSignIn, unlinkWithSignature } from '../../../lib/clubfund/api';
import { WalletProblem, shortAddress } from '../../../lib/clubfund/wallets';
import { PageHeader } from '../../../components/ui';
import { useTitle } from '../../../hooks/useTitle';
import { useClubFund } from './state';
import { Busy, EmailVerification, NotConfigured, Notice, PRIVACY_STATEMENT, WalletPicker, fmtWhen } from './parts';
import { DevnetBalanceCard, PUBLIC_CHAIN_NOTE } from './campaignParts';
import { ProofFeedback, proofButtonLabel, useWalletProof } from './useWalletProof';

function Unlink() {
  const cf = useClubFund();
  const link = cf.link!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [lost, setLost] = useState(false);
  const matches = cf.account?.address === link.wallet_address;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      cf.setLink(null); // the server confirmed the association was deleted
    } catch (e) {
      setError(e instanceof ApiProblem || e instanceof WalletProblem ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const proof = useWalletProof('unlink');
  const withSignature = () =>
    void proof.run(link.wallet_address, async (p) => {
      await unlinkWithSignature(p);
      cf.setLink(null); // the server confirmed the association was deleted
    });

  return (
    <section aria-labelledby="cf-unlink" className="card p-5">
      <h2 id="cf-unlink" className="font-bold text-ink">
        Unlink wallet
      </h2>
      <p className="mt-1 text-sm text-ink">
        Unlinking deletes the verified association between this wallet and your MyClubs account from our database. To prove it's you, sign with
        the linked wallet.
      </p>
      {matches ? (
        <button type="button" className="btn btn-secondary mt-3" onClick={withSignature} disabled={busy || proof.working || proof.waitSeconds > 0}>
          {proofButtonLabel(proof, 'Sign and unlink')}
        </button>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">Connect the linked wallet ({shortAddress(link.wallet_address)}) in this browser to unlink with a signature.</p>
      )}
      <div className="mt-4 border-t border-line-soft pt-3">
        {!lost ? (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLost(true)}>
            Lost access to this wallet?
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-ink">
              Verify your UMass email again. Within 10 minutes of entering the new code you can unlink without the wallet. The old wallet is not
              moved, frozen or changed.
            </p>
            <EmailVerification fixedEmail={cf.email ?? ''} submitLabel="Verify and unlink" onVerified={() => void run(unlinkAfterRecentSignIn)} />
          </div>
        )}
      </div>
      <ProofFeedback proof={proof} />
      {busy && <Busy label="Unlinking…" />}
      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-badge">
          {error}
        </p>
      )}
    </section>
  );
}

export default function WalletSettings() {
  useTitle('Wallet settings');
  const cf = useClubFund();

  let body;
  if (!cf.configured) body = <NotConfigured />;
  else if (!cf.ready) body = <Busy label="Checking your ClubFund session…" />;
  else if (!cf.session)
    body = (
      <Notice tone="info" role="note">
        {cf.sessionEnded ? 'Your ClubFund session ended. ' : ''}
        <Link to="/clubs/clubfund" className="text-link underline">
          Verify your UMass email
        </Link>{' '}
        to manage a wallet.
      </Notice>
    );
  else {
    const link = cf.link;
    const mismatch = !!link && !!cf.account && cf.account.address !== link.wallet_address;
    body = (
      <>
        <section aria-labelledby="cf-account" className="card p-5">
          <h2 id="cf-account" className="font-bold text-ink">
            Account
          </h2>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-ink">
            <BadgeCheck size={18} aria-hidden className="text-success" />
            <span>
              <strong>UMass email verified:</strong> {cf.email}
            </span>
          </p>
          <p className="mt-1 text-xs text-ink-soft">Inbox access verified by a one-time code. This is not UMass single sign-on.</p>
          <button type="button" className="btn btn-secondary mt-3" onClick={() => void cf.signOut()}>
            Sign out
          </button>
          <p className="mt-1 text-xs text-ink-soft">Signing out deletes the ClubFund session stored in this browser.</p>
        </section>

        <section aria-labelledby="cf-linked-wallet" className="card p-5">
          <h2 id="cf-linked-wallet" className="font-bold text-ink">
            Linked wallet
          </h2>
          {cf.linkStatus === 'loading' || cf.linkStatus === 'idle' ? (
            <Busy label="Loading your wallet link…" />
          ) : cf.linkStatus === 'error' ? (
            <p role="alert" className="mt-2 text-sm font-bold text-badge">
              {cf.linkError?.message}
            </p>
          ) : link ? (
            <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-ink-soft">Address</dt>
              <dd className="break-all font-mono text-ink">{link.wallet_address}</dd>
              <dt className="text-ink-soft">Linked</dt>
              <dd className="text-ink">{fmtWhen(link.linked_at)}</dd>
              <dt className="text-ink-soft">Status</dt>
              <dd className="text-ink">Ownership verified by signature ({fmtWhen(link.verified_at)})</dd>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-ink">
              No wallet linked.{' '}
              <Link to="/clubs/clubfund" className="text-link underline">
                Link a wallet
              </Link>
            </p>
          )}
        </section>

        <section aria-labelledby="cf-browser-wallet" className="card p-5">
          <h2 id="cf-browser-wallet" className="font-bold text-ink">
            Wallet in this browser
          </h2>
          {cf.wallet && cf.account ? (
            <>
              <p className="mt-2 text-sm text-ink">
                <strong>{cf.wallet.name}</strong> connected: <span className="font-mono">{shortAddress(cf.account.address)}</span>
              </p>
              {mismatch && (
                <p role="status" className="mt-2 flex items-start gap-1.5 text-sm font-bold text-warn">
                  <TriangleAlert size={16} aria-hidden className="mt-0.5 shrink-0" />
                  This is not the wallet linked to your account ({shortAddress(link!.wallet_address)}).
                </p>
              )}
              <button type="button" className="btn btn-secondary mt-3" onClick={() => void cf.disconnect()}>
                Disconnect wallet
              </button>
              <p className="mt-1 text-xs text-ink-soft">Disconnect only stops this browser's connection. Your linked wallet stays linked.</p>
            </>
          ) : (
            <div className="mt-2">
              <WalletPicker wallets={cf.wallets} onConnect={cf.connect} />
            </div>
          )}
        </section>

        {link && cf.linkStatus === 'ready' && <DevnetBalanceCard address={link.wallet_address} />}
        {link && cf.linkStatus === 'ready' && <Unlink />}
      </>
    );
  }

  return (
    <>
      <PageHeader title="Wallet settings" description="Your verified UMass email, your linked Solana wallet, and the wallet connected in this browser." />
      <div className="max-w-3xl space-y-5">
        {body}
        <section aria-labelledby="cf-privacy" className="text-sm text-ink">
          <h2 id="cf-privacy" className="font-bold">
            Privacy
          </h2>
          <p className="mt-1">{PRIVACY_STATEMENT}</p>
          <p className="mt-1 text-ink-soft">
            {PUBLIC_CHAIN_NOTE} Unlinking deletes the email-to-wallet association from our database (verified contributions stay counted, as they
            are on the blockchain); signing out deletes this browser's session.
          </p>
        </section>
      </div>
    </>
  );
}
