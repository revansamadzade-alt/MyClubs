// Database security tests for supabase/migrations/*_clubfund_campaigns.sql on real Postgres (PGlite), applied on top
// of the wallet-link migration with the Supabase roles, default grants and auth.uid()/auth.jwt() recreated.
// Checks: browsers can read but never write campaigns, contributions or totals; private ownership rows; manual
// recipient confirmation; unique signatures; idempotent recording; totals equal the sum of verified contributions.
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
const W_ALICE = 'GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB';
const W_BOB = '8qbHbw2BbbTHBW1sbeqakYXVKRQM8Ne7pLK7m6CVfeR';
const R1 = '4Nd1mBQtrMJVYVfKf2PJy9NZUZdTAsp7D4xWLs4gDB4T';
const R2 = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
const sig = (n) => `5${'abcdefghijkmnopqrstuvwxyz'[n]}${'K'.repeat(86)}`;
let db;
let travel; // campaign ids
let equipment;

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
const record = (a) =>
  asService(() =>
    one(`select public.clubfund_record_contribution($1, $2, $3, $4, $5, $6, $7, $8, $9) as r`, [
      a.campaign,
      a.user,
      a.wallet,
      a.recipient,
      a.lamports,
      a.signature,
      a.slot ?? 1000,
      a.blockTime ?? '2026-11-14T12:00:00Z',
      a.confirmation ?? 'confirmed',
    ]).then((x) => x.r),
  );
const totals = (id) => one(`select raised_lamports::bigint as raised, contribution_count as n from public.campaigns where id = $1`, [id]);

before(async () => {
  db = await PGlite.create();
  await db.exec(SUPABASE_LIKE);
  await db.exec(file('_clubfund_wallet_links.sql'));
  await db.exec(file('_clubfund_campaigns.sql'));
  await db.query(`insert into auth.users (id, email) values ($1, 'alice@umass.edu'), ($2, 'bob@umass.edu')`, [ALICE, BOB]);
  await db.query(`insert into public.wallet_links (user_id, wallet_address, verified_at) values ($1, $2, now()), ($3, $4, now())`, [ALICE, W_ALICE, BOB, W_BOB]);
  travel = (await one(`select id from public.campaigns where slug = 'demo-club-competition-travel'`)).id;
  equipment = (await one(`select id from public.campaigns where slug = 'demo-club-equipment'`)).id;
});

test('demo campaigns: three categories, fictional, Devnet, no recipient yet, nothing raised', async () => {
  const rows = (await db.query(`select slug, category, status, recipient_address, recipient_confirmed_at, raised_lamports, contribution_count, description from public.campaigns order by slug`)).rows;
  assert.equal(rows.length, 6);
  assert.deepEqual([...new Set(rows.map((r) => r.category))].sort(), ['charity', 'club', 'event']);
  for (const r of rows) {
    assert.equal(r.status, 'active');
    assert.equal(r.recipient_address, null, `${r.slug} has no invented recipient`);
    assert.equal(r.recipient_confirmed_at, null);
    assert.equal(Number(r.raised_lamports), 0, 'no fabricated totals');
    assert.equal(r.contribution_count, 0);
    assert.match(r.description, /Solana Devnet/);
  }
  assert.ok(rows.filter((r) => r.category === 'charity').every((r) => /not a real charitable fundraiser/.test(r.description)));
});

test('browsers cannot create, edit or delete campaigns, contributions, owners or totals', async () => {
  for (const [role, claims] of [['anon', null], ['authenticated', user(ALICE, 'alice@umass.edu')]]) {
    await fails(as(role, claims, () => one(`insert into public.campaigns (slug, category, title, summary, description, goal_lamports) values ('x-y', 'club', 'abc', 'abc', 'abc', 1)`)), /permission denied/);
    await fails(as(role, claims, () => one(`update public.campaigns set raised_lamports = 999`)), /permission denied/);
    await fails(as(role, claims, () => one(`update public.campaigns set recipient_address = $1, recipient_confirmed_at = now()`, [R1])), /permission denied/);
    await fails(as(role, claims, () => one(`delete from public.campaigns`)), /permission denied/);
    await fails(as(role, claims, () => one(`insert into public.campaign_contributions (campaign_id, lamports, signature, confirmation_status, slot) values ($1, 5, $2, 'confirmed', 1)`, [travel, sig(20)])), /permission denied/);
    await fails(as(role, claims, () => one(`update public.campaign_contributions set lamports = 1`)), /permission denied/);
    await fails(as(role, claims, () => one(`delete from public.campaign_contributions`)), /permission denied/);
    await fails(as(role, claims, () => one(`insert into public.contribution_owners (contribution_id, user_id, wallet_address) values (gen_random_uuid(), $1, $2)`, [ALICE, W_ALICE])), /permission denied/);
    await fails(
      as(role, claims, () => one(`select public.clubfund_record_contribution($1, $2, $3, $4, 5, $5, 1, now(), 'confirmed')`, [travel, ALICE, W_ALICE, R1, sig(21)])),
      /permission denied/,
    );
  }
});

test('contributions are refused until the developer confirms a recipient; changing the address clears the confirmation', async () => {
  await fails(record({ campaign: travel, user: ALICE, wallet: W_ALICE, recipient: R1, lamports: 1_000_000, signature: sig(0) }), /campaign_unavailable/);
  await db.query(`update public.campaigns set recipient_address = $1 where id = $2`, [R1, travel]);
  await fails(record({ campaign: travel, user: ALICE, wallet: W_ALICE, recipient: R1, lamports: 1_000_000, signature: sig(0) }), /campaign_unavailable/);
  await db.query(`update public.campaigns set recipient_confirmed_at = now() where id = $1`, [travel]);
  assert.ok((await one(`select recipient_confirmed_at from public.campaigns where id = $1`, [travel])).recipient_confirmed_at);
  await db.query(`update public.campaigns set recipient_address = $1 where id = $2`, [R2, travel]);
  assert.equal((await one(`select recipient_confirmed_at from public.campaigns where id = $1`, [travel])).recipient_confirmed_at, null, 'new address needs confirming again');
  await db.query(`update public.campaigns set recipient_address = $1, recipient_confirmed_at = now() where id = $2`, [R1, travel]);
  await fails(db.query(`update public.campaigns set recipient_address = $1 where id = $2`, [R1, equipment]), /duplicate key|unique/);
  await fails(db.query(`update public.campaigns set recipient_confirmed_at = now(), recipient_address = null where id = $1`, [equipment]), /check constraint/);
  await db.query(`update public.campaigns set recipient_address = $1, recipient_confirmed_at = now() where id = $2`, [R2, equipment]);
});

test('recording: wrong recipient, unlinked wallet, another wallet and paused campaigns are refused', async () => {
  await fails(record({ campaign: travel, user: ALICE, wallet: W_ALICE, recipient: R2, lamports: 1_000_000, signature: sig(1) }), /wrong_recipient/);
  await fails(record({ campaign: travel, user: ALICE, wallet: W_BOB, recipient: R1, lamports: 1_000_000, signature: sig(1) }), /not_linked/);
  await db.query(`update public.campaigns set status = 'paused' where id = $1`, [travel]);
  await fails(record({ campaign: travel, user: ALICE, wallet: W_ALICE, recipient: R1, lamports: 1_000_000, signature: sig(1) }), /campaign_unavailable/);
  await db.query(`update public.campaigns set status = 'active' where id = $1`, [travel]);
  await fails(record({ campaign: '00000000-0000-4000-8000-000000000000', user: ALICE, wallet: W_ALICE, recipient: R1, lamports: 1, signature: sig(1) }), /campaign_not_found/);
  assert.deepEqual(await totals(travel), { raised: 0, n: 0 });
});

test('a verified contribution updates the total once; re-checking is idempotent; reuse by anyone else is refused', async () => {
  const first = await record({ campaign: travel, user: ALICE, wallet: W_ALICE, recipient: R1, lamports: 250_000_000, signature: sig(2) });
  assert.equal(first.created, true);
  assert.equal(first.raised_lamports, 250_000_000);
  assert.equal(first.contribution_count, 1);
  assert.equal(first.contribution.signature, sig(2));
  const again = await record({ campaign: travel, user: ALICE, wallet: W_ALICE, recipient: R1, lamports: 250_000_000, signature: sig(2) });
  assert.equal(again.created, false);
  assert.equal(again.contribution.id, first.contribution.id);
  assert.deepEqual(await totals(travel), { raised: 250_000_000, n: 1 }, 'counted once');
  await fails(record({ campaign: travel, user: BOB, wallet: W_BOB, recipient: R1, lamports: 250_000_000, signature: sig(2) }), /duplicate_signature/);
  await fails(record({ campaign: equipment, user: ALICE, wallet: W_ALICE, recipient: R2, lamports: 250_000_000, signature: sig(2) }), /duplicate_signature/);
  await fails(db.query(`insert into public.campaign_contributions (campaign_id, lamports, signature, confirmation_status, slot) values ($1, 1, $2, 'confirmed', 1)`, [travel, sig(2)]), /duplicate key|unique/);
});

test('totals always equal the sum of verified contributions (integer lamports)', async () => {
  await record({ campaign: travel, user: BOB, wallet: W_BOB, recipient: R1, lamports: 1_000_000, signature: sig(3) });
  await record({ campaign: travel, user: ALICE, wallet: W_ALICE, recipient: R1, lamports: 1_999_999_999, signature: sig(4), confirmation: 'finalized' });
  await record({ campaign: equipment, user: BOB, wallet: W_BOB, recipient: R2, lamports: 7_000_000, signature: sig(5) });
  for (const id of [travel, equipment]) {
    const sum = await one(`select coalesce(sum(lamports), 0)::bigint as s, count(*)::int as n from public.campaign_contributions where campaign_id = $1`, [id]);
    assert.deepEqual(await totals(id), { raised: sum.s, n: sum.n });
  }
  assert.deepEqual(await totals(travel), { raised: 2_250_999_999, n: 3 });
});

test('constraints: positive lamports, Devnet only, valid signatures and confirmation levels', async () => {
  const ins = (lamports, signature, cluster = 'devnet', status = 'confirmed') =>
    db.query(`insert into public.campaign_contributions (campaign_id, lamports, signature, cluster, confirmation_status, slot) values ($1, $2, $3, $4, $5, 1)`, [travel, lamports, signature, cluster, status]);
  await fails(ins(0, sig(10)), /check constraint/);
  await fails(ins(-5, sig(10)), /check constraint/);
  await fails(ins(5, sig(10), 'mainnet-beta'), /check constraint/);
  await fails(ins(5, sig(10), 'devnet', 'processed'), /check constraint/);
  await fails(ins(5, 'not-a-signature-0OIl'), /check constraint/);
  await fails(record({ campaign: travel, user: ALICE, wallet: W_ALICE, recipient: R1, lamports: 0, signature: sig(11) }), /check constraint/);
  assert.deepEqual(await totals(travel), { raised: 2_250_999_999, n: 3 }, 'failed inserts change nothing');
});

test('public reads: published campaigns and history without personal data; ownership rows are private', async () => {
  const anonCampaigns = await as('anon', null, () => db.query(`select slug from public.campaigns`));
  assert.equal(anonCampaigns.rows.length, 6);
  await db.query(`update public.campaigns set status = 'draft' where slug = 'demo-charity-volunteer-day'`);
  assert.equal((await as('anon', null, () => db.query(`select slug from public.campaigns`))).rows.length, 5, 'drafts are hidden');

  const history = await as('anon', null, () => db.query(`select * from public.campaign_contributions where campaign_id = $1 order by verified_at`, [travel]));
  assert.equal(history.rows.length, 3);
  for (const r of history.rows) for (const k of ['user_id', 'wallet_address', 'email']) assert.ok(!(k in r), `history has no ${k}`);

  await fails(as('anon', null, () => db.query(`select * from public.contribution_owners`)), /permission denied/);
  const alice = await as('authenticated', user(ALICE, 'alice@umass.edu'), () =>
    db.query(`select o.user_id, c.signature from public.contribution_owners o join public.campaign_contributions c on c.id = o.contribution_id`),
  );
  assert.ok(alice.rows.length === 2 && alice.rows.every((r) => r.user_id === ALICE), 'Alice sees only her own');
  const lookalike = await as('authenticated', user(ALICE, 'alice@umass.edu.attacker.com'), () => db.query(`select * from public.contribution_owners`));
  assert.equal(lookalike.rows.length, 0);
});

test('deleting an account keeps the public, on-chain history but removes the private ownership link', async () => {
  await db.query(`delete from auth.users where id = $1`, [BOB]);
  assert.equal((await one(`select count(*)::int as n from public.contribution_owners where user_id = $1`, [BOB])).n, 0);
  assert.equal((await one(`select count(*)::int as n from public.campaign_contributions where signature = $1`, [sig(3)])).n, 1);
});
