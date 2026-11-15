// Deno-only wiring for the wallet Edge Functions: the real auth check, database access (service role, server side
// only), Ed25519 and randomness. Secrets come from the Edge Function environment and never reach the browser.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';
import { ed25519 } from 'npm:@noble/curves@2.4.0/ed25519.js';
import { base58 } from 'npm:@scure/base@2.4.0';
import { StoreError, type AuthedUser, type Deps, type LinkRow, type Store } from './handlers.ts';
import type { StoredChallenge } from './policy.ts';

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

const KNOWN = ['rate_limited', 'challenge_invalid', 'already_linked', 'wallet_in_use'];
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

let cached: Deps | null = null;

export function runtimeDeps(): Deps {
  if (cached) return cached;
  // Service role stays inside the function; it is only used with ids taken from the verified session.
  const db = createClient(env('SUPABASE_URL'), secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  const allowed = (Deno.env.get('CLUBFUND_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  cached = {
    async authenticate(authorization): Promise<AuthedUser | null> {
      const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
      if (!token) return null;
      const { data, error } = await db.auth.getUser(token);
      if (error || !data.user) return null;
      return { id: data.user.id, email: data.user.email ?? null, emailConfirmedAt: data.user.email_confirmed_at ?? null, amr: claims(token).amr };
    },
    store: store(db),
    crypto: { decodeBase58: (s) => base58.decode(s), verify: (sig, msg, pk) => ed25519.verify(sig, msg, pk) },
    randomNonce() {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    },
    now: () => new Date(),
    allowedOrigins: allowed.length ? allowed : DEFAULT_ORIGINS,
  };
  return cached;
}
