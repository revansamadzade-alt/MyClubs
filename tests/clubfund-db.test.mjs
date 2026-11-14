// Database security tests for supabase/migrations/*_clubfund_wallet_links.sql on real Postgres (PGlite), with the
// Supabase roles, default grants and auth.uid()/auth.jwt() functions recreated. Checks RLS, grants, the email hook,
// single-use challenges, one-wallet rules and cascades. (True parallel sessions are not possible in PGlite; concurrent
// consumption relies on the single UPDATE ... WHERE consumed_at IS NULL, and is exercised in clubfund.test.mjs.)
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const dir = new URL('../supabase/migrations/', import.meta.url);
const migration = readdirSync(dir).filter((f) => f.endsWith('_clubfund_wallet_links.sql')).map((f) => readFileSync(new URL(f, dir), 'utf8'))[0];

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
  -- Supabase's default privileges: new public tables and functions are granted to the API roles.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const EVE = '33333333-3333-4333-8333-333333333333';
const W1 = 'GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB';
const W2 = '8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR';
const W3 = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T';
let db;

const one = async (sql, params) => (await db.query(sql, params)).rows[0];
async function as(role, claims, fn) {
  await db.exec(`set role ${role}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [claims?.sub ?? '', JSON.stringify(claims ?? {})]);
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false)`);
  }
}
const asService = (fn) => as('service_role', null, fn);
const user = (sub, email) => ({ sub, email, role: 'authenticated' });
const fails = async (promise, pattern) => {
  await assert.rejects(promise, (e) => {
    assert.match(String(e.message), pattern);
    return true;
  });
};
let nonce = 0;
const issue = (u, wallet, purpose = 'link', message = `msg-${u}-${wallet}-${purpose}`) =>
  asService(() => one(`select * from public.clubfund_issue_challenge($1, $2, $3, $4, $5, 300)`, [u, wallet, purpose, String(++nonce).padStart(40, 'x'), message]));

before(async () => {
  db = await PGlite.create();
  await db.exec(SUPABASE_LIKE);
  await db.exec(migration);
  await db.query(`insert into auth.users (id, email) values ($1, 'alice@umass.edu'), ($2, 'bob@umass.edu'), ($3, 'eve@gmail.com')`, [ALICE, BOB, EVE]);
});

test('email rule in the database matches the app: exact @umass.edu only', async () => {
  for (const ok of ['alice@umass.edu', ' Alice@UMass.EDU ', 'first.last+clubs@umass.edu', 'alice@umass.edu\n'])
    assert.equal((await one('select public.is_umass_email($1) as v', [ok])).v, true, ok);
  for (const bad of ['alice@cs.umass.edu', 'alice@umass.edu.attacker.com', 'alice@umass.education', 'a@b@umass.edu', '.a@umass.edu', 'a..b@umass.edu', 'ali ce@umass.edu', '', null])
    assert.equal((await one('select public.is_umass_email($1) as v', [bad])).v, false, String(bad));
});

test('Before User Created hook allows @umass.edu and rejects everything else with 403', async () => {
  const hook = (email) => one(`select public.hook_before_user_created_umass_only($1::jsonb) as r`, [JSON.stringify({ metadata: {}, user: { email } })]).then((x) => x.r);
  assert.deepEqual(await hook('New.Student@umass.edu'), {});
  for (const bad of ['eve@gmail.com', 'eve@umass.edu.attacker.com', 'eve@cs.umass.edu', null]) {
    const r = await hook(bad);
    assert.equal(r.error.http_code, 403, String(bad));
  }
  await as('supabase_auth_admin', null, () => one(`select public.hook_before_user_created_umass_only('{"user":{"email":"a@umass.edu"}}'::jsonb) as r`));
  await fails(as('authenticated', user(ALICE, 'alice@umass.edu'), () => one(`select public.hook_before_user_created_umass_only('{}'::jsonb)`)), /permission denied/);
});

test('browsers cannot touch challenges or write links; privileged functions are service-role only', async () => {
  for (const [role, claims] of [['anon', null], ['authenticated', user(ALICE, 'alice@umass.edu')]]) {
    await fails(as(role, claims, () => one('select * from public.wallet_challenges')), /permission denied/);
    await fails(as(role, claims, () => one(`insert into public.wallet_links (user_id, wallet_address, verified_at) values ($1, $2, now())`, [ALICE, W1])), /permission denied/);
    await fails(as(role, claims, () => one(`update public.wallet_links set verified_at = now()`)), /permission denied/);
    await fails(as(role, claims, () => one(`delete from public.wallet_links`)), /permission denied/);
    await fails(as(role, claims, () => one(`select * from public.clubfund_issue_challenge($1, $2, 'link', $3, 'm', 300)`, [ALICE, W1, 'n'.repeat(40)])), /permission denied/);
    await fails(as(role, claims, () => one(`select public.clubfund_link_wallet($1, $2, $3, 'm')`, ['00000000-0000-4000-8000-000000000000', ALICE, W1])), /permission denied/);
    await fails(as(role, claims, () => one(`select public.clubfund_unlink_wallet($1)`, [ALICE])), /permission denied/);
  }
  await fails(as('anon', null, () => one('select * from public.wallet_links')), /permission denied/);
});

test('link: consumes the challenge once; replays, other users, other wallets, altered messages and wrong purpose fail', async () => {
  const ch = await issue(ALICE, W1, 'link', 'alice links W1');
  const call = (args) => asService(() => one(`select * from public.clubfund_link_wallet($1, $2, $3, $4)`, args));
  await fails(call([ch.id, BOB, W1, 'alice links W1']), /challenge_invalid/);
  await fails(call([ch.id, ALICE, W2, 'alice links W1']), /challenge_invalid/);
  await fails(call([ch.id, ALICE, W1, 'alice links W1 (edited)']), /challenge_invalid/);
  const unlinkCh = await issue(ALICE, W1, 'unlink', 'alice unlink');
  await fails(call([unlinkCh.id, ALICE, W1, 'alice unlink']), /challenge_invalid/);
  const link = await call([ch.id, ALICE, W1, 'alice links W1']);
  assert.equal(link.wallet_address, W1);
  assert.ok(link.verified_at);
  await fails(call([ch.id, ALICE, W1, 'alice links W1']), /challenge_invalid/);
  assert.ok((await one(`select consumed_at from public.wallet_challenges where id = $1`, [ch.id])).consumed_at);
});

test('expired challenges cannot be used', async () => {
  const ch = await issue(BOB, W2, 'link', 'bob links W2');
  await db.query(`update public.wallet_challenges set issued_at = now() - interval '20 minutes', expires_at = now() - interval '15 minutes' where id = $1`, [ch.id]);
  await fails(asService(() => one(`select * from public.clubfund_link_wallet($1, $2, $3, $4)`, [ch.id, BOB, W2, 'bob links W2'])), /challenge_invalid/);
});

test('one account per wallet and one wallet per account', async () => {
  const taken = await issue(BOB, W1, 'link', 'bob tries W1');
  await fails(asService(() => one(`select * from public.clubfund_link_wallet($1, $2, $3, $4)`, [taken.id, BOB, W1, 'bob tries W1'])), /wallet_in_use/);
  const second = await issue(ALICE, W3, 'link', 'alice second wallet');
  await fails(asService(() => one(`select * from public.clubfund_link_wallet($1, $2, $3, $4)`, [second.id, ALICE, W3, 'alice second wallet'])), /already_linked/);
  await fails(db.query(`insert into public.wallet_links (user_id, wallet_address, verified_at) values ($1, $2, now())`, [BOB, W1]), /duplicate key|unique/);
  await fails(db.query(`insert into public.wallet_links (user_id, wallet_address, verified_at) values ($1, $2, now())`, [BOB, 'not-base58-0OIl']), /check constraint/);
});

test('RLS: owners see only their own link, and only with a @umass.edu session', async () => {
  const mine = await as('authenticated', user(ALICE, 'alice@umass.edu'), () => db.query('select wallet_address from public.wallet_links'));
  assert.deepEqual(mine.rows, [{ wallet_address: W1 }]);
  const bobs = await as('authenticated', user(BOB, 'bob@umass.edu'), () => db.query('select * from public.wallet_links'));
  assert.equal(bobs.rows.length, 0, "Bob cannot see Alice's link");
  const lookalike = await as('authenticated', user(ALICE, 'alice@umass.edu.attacker.com'), () => db.query('select * from public.wallet_links'));
  assert.equal(lookalike.rows.length, 0, 'a session without a @umass.edu email sees nothing');
});

test('challenge creation is rate limited per user', async () => {
  const fresh = '44444444-4444-4444-8444-444444444444';
  await db.query(`insert into auth.users (id, email) values ($1, 'rate@umass.edu')`, [fresh]);
  for (let i = 0; i < 5; i++) await issue(fresh, W3, 'link', `rate ${i}`);
  await fails(issue(fresh, W3, 'link', 'rate 6'), /rate_limited/);
  await fails(asService(() => one(`select * from public.clubfund_issue_challenge($1, $2, 'link', $3, 'm', 3600)`, [BOB, W3, 'z'.repeat(40)])), /invalid_ttl/);
});

test('unlink: needs an unlink challenge for the linked wallet (single use); lost-wallet path removes the link', async () => {
  // Earlier tests used up Alice's 5-per-10-minutes allowance; age those challenges out of the window.
  await db.query(`update public.wallet_challenges set issued_at = now() - interval '30 minutes', expires_at = now() - interval '25 minutes' where user_id = $1`, [ALICE]);
  const wrongWallet = await issue(ALICE, W2, 'unlink', 'alice unlink W2');
  await fails(asService(() => one(`select public.clubfund_unlink_wallet($1, $2, $3, $4) as r`, [ALICE, wrongWallet.id, W2, 'alice unlink W2'])), /challenge_invalid/);
  const ch = await issue(ALICE, W1, 'unlink', 'alice unlink W1');
  const r = await asService(() => one(`select public.clubfund_unlink_wallet($1, $2, $3, $4) as r`, [ALICE, ch.id, W1, 'alice unlink W1']));
  assert.equal(r.r, true);
  await fails(asService(() => one(`select public.clubfund_unlink_wallet($1, $2, $3, $4) as r`, [ALICE, ch.id, W1, 'alice unlink W1'])), /challenge_invalid/);
  // Re-link, then remove via the lost-wallet path (the Edge Function requires a fresh email-code sign-in first).
  const relink = await issue(ALICE, W1, 'link', 'alice relinks');
  await asService(() => one(`select * from public.clubfund_link_wallet($1, $2, $3, $4)`, [relink.id, ALICE, W1, 'alice relinks']));
  assert.equal((await asService(() => one(`select public.clubfund_unlink_wallet($1) as r`, [ALICE]))).r, true);
  assert.equal((await one(`select count(*)::int as n from public.wallet_links where user_id = $1`, [ALICE])).n, 0);
});

test('deleting an account deletes its link and challenges', async () => {
  const ch = await issue(BOB, W2, 'link', 'bob links W2 again');
  await asService(() => one(`select * from public.clubfund_link_wallet($1, $2, $3, $4)`, [ch.id, BOB, W2, 'bob links W2 again']));
  await db.query(`delete from auth.users where id = $1`, [BOB]);
  assert.equal((await one(`select count(*)::int as n from public.wallet_links where user_id = $1`, [BOB])).n, 0);
  assert.equal((await one(`select count(*)::int as n from public.wallet_challenges where user_id = $1`, [BOB])).n, 0);
});
