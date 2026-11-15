// Database tests for supabase/migrations/*_clubfund_challenge_reuse_and_rate_limits.sql on real Postgres (PGlite),
// applied on top of the wallet-link and campaign migrations with Supabase-like roles and default grants.
// Regression for the live "Too many verification requests" lockout: retries must reuse the open challenge.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const dir = new URL('../supabase/migrations/', import.meta.url);
const file = (suffix) => readFileSync(new URL(readdirSync(dir).find((f) => f.endsWith(suffix)), dir), 'utf8');

const SUPABASE_LIKE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create role supabase_auth_admin nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
  grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;
  grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role, supabase_auth_admin;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const WALLETS = ['GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB', '8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR', '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T', '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin', 'So11111111111111111111111111111111111111112', 'Vote111111111111111111111111111111111111111'];
let db;
let nonce = 0;

const one = async (sql, params) => (await db.query(sql, params)).rows[0];
async function as(role, fn) {
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}
const asService = (fn) => as('service_role', fn);
const message = (wallet, site = 'localhost:5173', extra = '') =>
  `${site} wants you to sign in with your Solana account:\n${wallet}\n\nLink this wallet.\n\nURI: http://${site}\nVersion: 1\nNonce: ${++nonce}${extra}`;
const request = (user, wallet, opts = {}) =>
  asService(() =>
    one(`select * from public.clubfund_request_challenge($1, $2, $3, $4, $5, 300)`, [user, wallet, opts.purpose ?? 'link', String(++nonce).padStart(40, 'n'), opts.message ?? message(wallet, opts.site)]),
  );
const rejects = async (promise, pattern, detail) => {
  await assert.rejects(promise, (e) => {
    assert.match(String(e.message), pattern);
    if (detail) detail(e.detail);
    return true;
  });
};

before(async () => {
  db = await PGlite.create();
  await db.exec(SUPABASE_LIKE);
  for (const f of ['_clubfund_wallet_links.sql', '_clubfund_campaigns.sql', '_clubfund_challenge_reuse_and_rate_limits.sql']) await db.exec(file(f));
  await db.query(`insert into auth.users (id, email) values ($1, 'alice@umass.edu'), ($2, 'bob@umass.edu')`, [ALICE, BOB]);
});

test('retries reuse the open challenge: same id and exact text, and no extra rows', async () => {
  const first = await request(ALICE, WALLETS[0]);
  assert.equal(first.reused, false);
  for (let i = 0; i < 10; i++) {
    const again = await request(ALICE, WALLETS[0]);
    assert.equal(again.reused, true);
    assert.equal(again.id, first.id);
    assert.equal(again.message, first.message, 'the stored text, not the newly proposed one');
  }
  assert.equal((await one(`select count(*)::int as n from public.wallet_challenges where user_id = $1`, [ALICE])).n, 1);
});

test('no reuse once consumed, near expiry, for another purpose, or for another site', async () => {
  const open = await request(ALICE, WALLETS[0]);
  await db.query(`update public.wallet_challenges set expires_at = now() + interval '30 seconds' where id = $1`, [open.id]);
  const fresh = await request(ALICE, WALLETS[0]);
  assert.equal(fresh.reused, false, 'under a minute left: a new one');
  await db.query(`update public.wallet_challenges set consumed_at = now() where id = $1`, [fresh.id]);
  assert.equal((await request(ALICE, WALLETS[0])).reused, false, 'used: a new one');
  assert.equal((await request(ALICE, WALLETS[0], { purpose: 'unlink' })).reused, false, 'other purpose');
  assert.equal((await request(ALICE, WALLETS[0], { site: 'myclubs.example' })).reused, false, 'other site');
});

test('new challenges are limited to 5 per 10 minutes and the error says when the next one is allowed', async () => {
  await db.query(`update public.wallet_challenges set issued_at = now() - interval '30 minutes', expires_at = now() - interval '25 minutes' where user_id = $1`, [ALICE]);
  for (const w of WALLETS.slice(0, 5)) assert.equal((await request(ALICE, w)).reused, false);
  await rejects(request(ALICE, WALLETS[5]), /rate_limited/, (detail) => assert.ok(Number(detail) > 590 && Number(detail) <= 600, `retry after ${detail}`));
  assert.equal((await request(ALICE, WALLETS[2])).reused, true, 'open challenges are still handed back while limited');
  assert.equal((await request(BOB, WALLETS[5])).reused, false, 'limits are per account');
  await db.query(`update public.wallet_challenges set issued_at = issued_at - interval '9 minutes 50 seconds', expires_at = expires_at - interval '9 minutes 50 seconds' where user_id = $1`, [ALICE]);
  await rejects(request(ALICE, WALLETS[5]), /rate_limited/, (detail) => assert.ok(Number(detail) <= 10, `retry after ${detail}`));
  await rejects(asService(() => one(`select * from public.clubfund_request_challenge($1, $2, 'link', $3, 'm', 30)`, [BOB, WALLETS[1], 'x'.repeat(40)])), /invalid_ttl/);
});

test('the original challenge function keeps working for already-deployed Edge Functions', async () => {
  const r = await asService(() => one(`select * from public.clubfund_issue_challenge($1, $2, 'link', $3, 'm', 300)`, [BOB, WALLETS[0], 'o'.repeat(40)]));
  assert.ok(r.id);
});

test('per-account rate tokens: limit, retry time, per-user and per-window, old events cleaned up', async () => {
  const take = (user) => asService(() => one(`select public.clubfund_take_rate_token($1, 'contribute', 3, 600)`, [user]));
  for (let i = 0; i < 3; i++) await take(ALICE);
  await rejects(take(ALICE), /rate_limited/, (detail) => assert.ok(Number(detail) > 590 && Number(detail) <= 600, `retry after ${detail}`));
  await take(BOB);
  await db.query(`update public.clubfund_rate_events set created_at = created_at - interval '11 minutes' where user_id = $1`, [ALICE]);
  await take(ALICE);
  assert.equal((await one(`select count(*)::int as n from public.clubfund_rate_events where user_id = $1`, [ALICE])).n, 1, 'expired events removed');
  await rejects(asService(() => one(`select public.clubfund_take_rate_token($1, 'contribute', 0, 600)`, [ALICE])), /invalid_rate/);
  await rejects(asService(() => one(`select public.clubfund_take_rate_token($1, 'other', 3, 600)`, [ALICE])), /check constraint/);
});

test('browsers can neither call the new functions nor see or change rate-limit state', async () => {
  for (const role of ['anon', 'authenticated']) {
    await rejects(as(role, () => one(`select * from public.clubfund_request_challenge($1, $2, 'link', $3, 'm', 300)`, [ALICE, WALLETS[0], 'z'.repeat(40)])), /permission denied/);
    await rejects(as(role, () => one(`select public.clubfund_take_rate_token($1, 'contribute', 100, 600)`, [ALICE])), /permission denied/);
    await rejects(as(role, () => one(`select * from public.clubfund_rate_events`)), /permission denied/);
    await rejects(as(role, () => one(`delete from public.clubfund_rate_events`)), /permission denied/);
  }
});
