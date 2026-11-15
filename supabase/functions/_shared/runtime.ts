// Deno-only wiring for the wallet Edge Functions: the real auth check, database access (service role, server side
// only), Ed25519 and randomness. Secrets come from the Edge Function environment and never reach the browser.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import { ed25519 } from 'npm:@noble/curves@2.4.0/ed25519.js';
import { base58 } from 'npm:@scure/base@2.4.0';
import { StoreError, type AuthedUser, type Deps, type LinkRow, type Store } from './handlers.ts';
import type { CampaignRow, ContributionDeps, ContributionRow, ContributionStore, DevnetReader, Recorded } from './contribute.ts';
import type { StoredChallenge } from './policy.ts';
import { DEFAULT_DEVNET_RPC_URL, type ParsedTransaction, type SignatureStatus } from './solana.ts';

const DEFAULT_ORIGINS = ['http://localhost:5173', 'http://localhost:4173'];

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

/** The project's secret key (new `sb_secret_` keys first; the legacy service_role key stops working at the end of 2026). */
function secretKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, unknown>;
    if (typeof keys.default === 'string' && keys.default) return keys.default;
  } catch {
    // Not set or not JSON: fall back to the legacy key below.
  }
  return env('SUPABASE_SERVICE_ROLE_KEY');
}

/** Decodes a JWT payload that the auth server has already validated (used only to read the "amr" claim). */
function claims(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')));
  } catch {
    return {};
  }
}

const KNOWN = [
  'rate_limited',
  'challenge_invalid',
  'already_linked',
  'wallet_in_use',
  'duplicate_signature',
  'campaign_not_found',
  'campaign_unavailable',
  'wrong_recipient',
  'not_linked',
];
function raise(error: { message?: string } | null): never {
  const code = KNOWN.find((c) => error?.message?.includes(c));
  throw new StoreError(code ?? 'server_error');
}

function store(db: SupabaseClient): Store {
  return {
    async getLink(userId) {
      const { data, error } = await db.from('wallet_links').select('*').eq('user_id', userId).maybeSingle();
      if (error) raise(error);
      return data as LinkRow | null;
    },
    async getLinkByWallet(wallet) {
      const { data, error } = await db.from('wallet_links').select('*').eq('wallet_address', wallet).maybeSingle();
      if (error) raise(error);
      return data as LinkRow | null;
    },
    async issueChallenge(a) {
      const { data, error } = await db.rpc('clubfund_issue_challenge', {
        p_user: a.userId,
        p_wallet: a.wallet,
        p_purpose: a.purpose,
        p_nonce: a.nonce,
        p_message: a.message,
        p_ttl_seconds: a.ttlSeconds,
      });
      if (error) raise(error);
      const row = (Array.isArray(data) ? data[0] : data) as { id: string; expires_at: string } | undefined;
      if (!row) raise(null);
      return row;
    },
    async getChallenge(id) {
      const { data, error } = await db
        .from('wallet_challenges')
        .select('id, user_id, wallet_address, purpose, message, expires_at, consumed_at')
        .eq('id', id)
        .maybeSingle();
      if (error) raise(error);
      return data as StoredChallenge | null;
    },
    async linkWallet(a) {
      const { data, error } = await db.rpc('clubfund_link_wallet', { p_challenge: a.challengeId, p_user: a.userId, p_wallet: a.wallet, p_message: a.message });
      if (error) raise(error);
      return data as LinkRow;
    },
    async unlinkWallet(a) {
      const { data, error } = await db.rpc('clubfund_unlink_wallet', {
        p_user: a.userId,
        p_challenge: a.challengeId ?? null,
        p_wallet: a.wallet ?? null,
        p_message: a.message ?? null,
      });
      if (error) raise(error);
      return data === true;
    },
  };
}

function contributionStore(db: SupabaseClient): ContributionStore {
  const links = store(db);
  return {
    getLink: links.getLink,
    async getCampaign(id) {
      const { data, error } = await db
        .from('campaigns')
        .select('id, slug, status, recipient_address, recipient_confirmed_at, raised_lamports, contribution_count')
        .eq('id', id)
        .maybeSingle();
      if (error) raise(error);
      return data as CampaignRow | null;
    },
    async findContribution(signature) {
      const { data, error } = await db
        .from('campaign_contributions')
        .select('id, campaign_id, lamports, signature, confirmation_status, slot, block_time, verified_at, contribution_owners(user_id)')
        .eq('signature', signature)
        .maybeSingle();
      if (error) raise(error);
      if (!data) return null;
      const owners = (data as { contribution_owners?: { user_id: string } | { user_id: string }[] | null }).contribution_owners;
      const owner = Array.isArray(owners) ? owners[0] : owners;
      return { ...(data as ContributionRow), user_id: owner?.user_id ?? null };
    },
    async recordContribution(a) {
      const { data, error } = await db.rpc('clubfund_record_contribution', {
        p_campaign: a.campaignId,
        p_user: a.userId,
        p_wallet: a.wallet,
        p_recipient: a.recipient,
        p_lamports: a.lamports,
        p_signature: a.signature,
        p_slot: a.slot,
        p_block_time: a.blockTime,
        p_confirmation: a.confirmation,
      });
      if (error) raise(error);
      return data as Recorded;
    },
  };
}

/** Reads Solana Devnet over JSON-RPC. The endpoint is checked against the Devnet genesis hash before it is trusted. */
function devnetReader(): DevnetReader {
  const url = Deno.env.get('SOLANA_DEVNET_RPC_URL') || DEFAULT_DEVNET_RPC_URL;
  let genesis: string | null = null;
  const rpc = async <T>(method: string, params: unknown[]): Promise<T> => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
    const out = (await res.json()) as { result?: T; error?: { message?: string } };
    if (out.error) throw new Error(out.error.message ?? 'RPC error');
    return out.result as T;
  };
  return {
    async genesisHash() {
      genesis ??= await rpc<string>('getGenesisHash', []);
      return genesis;
    },
    async getSignatureStatus(signature) {
      const r = await rpc<{ value: (SignatureStatus | null)[] }>('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
      return r.value[0] ?? null;
    },
    getTransaction: (signature) =>
      rpc<ParsedTransaction | null>('getTransaction', [signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]),
  };
}

let shared: { db: SupabaseClient; base: Pick<Deps, 'authenticate' | 'allowedOrigins'> } | null = null;

function sharedDeps() {
  if (shared) return shared;
  // Service role stays inside the function; it is only used with ids taken from the verified session.
  const db = createClient(env('SUPABASE_URL'), secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const allowed = (Deno.env.get('CLUBFUND_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  shared = {
    db,
    base: {
      async authenticate(authorization): Promise<AuthedUser | null> {
        const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
        if (!token) return null;
        const { data, error } = await db.auth.getUser(token);
        if (error || !data.user) return null;
        return { id: data.user.id, email: data.user.email ?? null, emailConfirmedAt: data.user.email_confirmed_at ?? null, amr: claims(token).amr };
      },
      allowedOrigins: allowed.length ? allowed : DEFAULT_ORIGINS,
    },
  };
  return shared;
}

let cached: Deps | null = null;

export function runtimeDeps(): Deps {
  if (cached) return cached;
  const { db, base } = sharedDeps();
  cached = {
    ...base,
    store: store(db),
    crypto: { decodeBase58: (s) => base58.decode(s), verify: (sig, msg, pk) => ed25519.verify(sig, msg, pk) },
    randomNonce() {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    },
    now: () => new Date(),
  };
  return cached;
}

let cachedContribution: ContributionDeps | null = null;

export function contributionDeps(): ContributionDeps {
  if (cachedContribution) return cachedContribution;
  const { db, base } = sharedDeps();
  cachedContribution = { ...base, store: contributionStore(db), devnet: devnetReader() };
  return cachedContribution;
}
