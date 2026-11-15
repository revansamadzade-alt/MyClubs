// The campaign-contribute Edge Function. The browser reports "I sent this transaction for this campaign"; the server
// treats that only as a pointer. It fetches the transaction from Solana Devnet itself, checks it against the
// authenticated user's verified wallet and the campaign's confirmed recipient, and only then records it. Environment
// specifics (auth server, database, Devnet RPC) are injected so the same code runs in Deno and in the Node tests.
import { UUID, fail, guard, json, storeCode, type Deps, type LinkRow } from './handlers.ts';
import {
  DEVNET_GENESIS_HASH,
  MAX_CONTRIBUTION_LAMPORTS,
  MIN_CONTRIBUTION_LAMPORTS,
  campaignMemo,
  looksLikeTxSignature,
  verifyContribution,
  type ParsedTransaction,
  type SignatureStatus,
} from './solana.ts';

export interface CampaignRow {
  id: string;
  slug: string;
  status: string;
  recipient_address: string | null;
  recipient_confirmed_at: string | null;
  raised_lamports: number;
  contribution_count: number;
}

export interface ContributionRow {
  id: string;
  campaign_id: string;
  lamports: number;
  signature: string;
  confirmation_status: string;
  slot: number;
  block_time: string | null;
  verified_at: string;
}

export interface Recorded {
  created: boolean;
  contribution: ContributionRow;
  raised_lamports: number;
  contribution_count: number;
}

export interface ContributionStore {
  getLink(userId: string): Promise<LinkRow | null>;
  getCampaign(id: string): Promise<CampaignRow | null>;
  /** The already-recorded contribution with this signature (and who recorded it), if any. */
  findContribution(signature: string): Promise<(ContributionRow & { user_id: string | null }) | null>;
  /**
   * Records a verified contribution and adds it to the campaign total in one transaction. Idempotent for the same
   * user, campaign and signature. Throws StoreError('duplicate_signature' | 'campaign_unavailable' | 'wrong_recipient' | 'not_linked').
   */
  recordContribution(a: {
    campaignId: string;
    userId: string;
    wallet: string;
    recipient: string;
    lamports: number;
    signature: string;
    slot: number;
    blockTime: string | null;
    confirmation: string;
  }): Promise<Recorded>;
}

export interface DevnetReader {
  genesisHash(): Promise<string>;
  getSignatureStatus(signature: string): Promise<SignatureStatus | null>;
  getTransaction(signature: string): Promise<ParsedTransaction | null>;
}

export interface ContributionDeps extends Pick<Deps, 'authenticate' | 'allowedOrigins'> {
  store: ContributionStore;
  devnet: DevnetReader;
}

const publicRow = (r: ContributionRow): ContributionRow => ({
  id: r.id,
  campaign_id: r.campaign_id,
  lamports: r.lamports,
  signature: r.signature,
  confirmation_status: r.confirmation_status,
  slot: r.slot,
  block_time: r.block_time,
  verified_at: r.verified_at,
});

export async function handleContribution(req: Request, deps: ContributionDeps): Promise<Response> {
  const g = await guard(req, deps);
  if (g instanceof Response) return g;
  const { user, body, cors } = g;

  const { campaignId, signature, lamports } = body;
  if (typeof campaignId !== 'string' || !UUID.test(campaignId)) return fail('campaign_not_found', cors);
  if (!looksLikeTxSignature(signature)) return fail('invalid_signature', cors);
  if (typeof lamports !== 'number' || !Number.isSafeInteger(lamports) || lamports < MIN_CONTRIBUTION_LAMPORTS || lamports > MAX_CONTRIBUTION_LAMPORTS)
    return fail('invalid_amount', cors);

  try {
    const campaign = await deps.store.getCampaign(campaignId);
    if (!campaign) return fail('campaign_not_found', cors);
    if (campaign.status !== 'active' || !campaign.recipient_address || !campaign.recipient_confirmed_at) return fail('campaign_unavailable', cors);

    const link = await deps.store.getLink(user.id);
    if (!link) return fail('not_linked', cors);

    // Already counted? The same user re-checking the same contribution gets the stored record back (idempotent);
    // anyone else, or another campaign, is refused.
    const existing = await deps.store.findContribution(signature);
    if (existing) {
      if (existing.user_id !== user.id || existing.campaign_id !== campaign.id) return fail('duplicate_signature', cors);
      return json(
        { created: false, contribution: publicRow(existing), campaign: { raised_lamports: campaign.raised_lamports, contribution_count: campaign.contribution_count } },
        200,
        cors,
      );
    }

    let status: SignatureStatus | null;
    let tx: ParsedTransaction | null;
    try {
      if ((await deps.devnet.genesisHash()) !== DEVNET_GENESIS_HASH) return fail('wrong_network', cors);
      [status, tx] = await Promise.all([deps.devnet.getSignatureStatus(signature), deps.devnet.getTransaction(signature)]);
    } catch {
      return fail('rpc_unavailable', cors);
    }

    const v = verifyContribution(tx, status, {
      signature,
      wallet: link.wallet_address,
      recipient: campaign.recipient_address,
      lamports,
      memo: campaignMemo(campaign.slug),
    });
    if (!v.ok) return fail(v.code, cors);

    const rec = await deps.store.recordContribution({
      campaignId: campaign.id,
      userId: user.id,
      wallet: link.wallet_address,
      recipient: campaign.recipient_address,
      lamports: v.lamports,
      signature,
      slot: v.slot,
      blockTime: v.blockTime,
      confirmation: v.confirmation,
    });
    return json(
      { created: rec.created, contribution: publicRow(rec.contribution), campaign: { raised_lamports: rec.raised_lamports, contribution_count: rec.contribution_count } },
      rec.created ? 201 : 200,
      cors,
    );
  } catch (e) {
    return fail(storeCode(e), cors);
  }
}
