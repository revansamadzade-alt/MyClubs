// Contribution tests (mocked, deterministic): integer-lamport amounts, the hand-built Devnet transfer transaction, the
// server-side transaction verifier, and the campaign-contribute request handler with an in-memory store and a fake
// Devnet RPC. These do not touch Solana or Supabase; the real Devnet transaction is the manual test in docs/CLUBFUND.md.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { ed25519 } from '@noble/curves/ed25519.js';
import { base58 } from '@scure/base';

const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  configFile: false,
  logLevel: 'silent',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());
const S = await server.ssrLoadModule('/supabase/functions/_shared/solana.ts');
const C = await server.ssrLoadModule('/supabase/functions/_shared/contribute.ts');
const H = await server.ssrLoadModule('/supabase/functions/_shared/handlers.ts');
const L = await server.ssrLoadModule('/src/lib/clubfund/lamports.ts');
const T = await server.ssrLoadModule('/src/lib/clubfund/transfer.ts');

const keypair = (seed) => {
  const sk = new Uint8Array(32).fill(seed);
  return { sk, address: base58.encode(ed25519.getPublicKey(sk)) };
};
const ALICE = keypair(1);
const BOB = keypair(2);
const RECIPIENT = keypair(9).address;
const OTHER_RECIPIENT = keypair(10).address;
const BLOCKHASH = base58.encode(new Uint8Array(32).fill(4));
const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';

// --- Amounts ----------------------------------------------------------------------------------------------------------

test('SOL amounts parse to exact integer lamports without floating point', () => {
  assert.equal(L.parseSol('1'), 1_000_000_000);
  assert.equal(L.parseSol('0.1'), 100_000_000);
  assert.equal(L.parseSol('.3'), 300_000_000);
  assert.equal(L.parseSol('0.000000001'), 1);
  assert.equal(L.parseSol(' 2.5 '), 2_500_000_000);
  assert.equal(L.parseSol('0.1') + L.parseSol('0.2'), L.parseSol('0.3'), 'no 0.30000000000000004');
  for (const bad of ['', '.', '-1', '1e3', '1,5', 'abc', '0.0000000001', '1.2.3', '+1', 'Infinity', 'NaN']) assert.equal(L.parseSol(bad), null, bad);
  assert.equal(L.formatSol(1_500_000_000), '1.5');
  assert.equal(L.formatSol(1), '0.000000001');
  assert.equal(L.formatSol(0), '0');
  assert.equal(L.formatSol(12_000_000_000_000), '12,000');
  assert.equal(L.formatSol(5000, 0), '0.000005');
});

test('funding progress: whole percent of the goal, capped at 100, zero for empty or invalid goals', () => {
  assert.equal(L.progressPercent(0, 5_000_000_000), 0);
  assert.equal(L.progressPercent(250_000_000, 5_000_000_000), 5);
  assert.equal(L.progressPercent(4_999_999_999, 5_000_000_000), 99, 'never rounds up to complete');
  assert.equal(L.progressPercent(5_000_000_000, 5_000_000_000), 100);
  assert.equal(L.progressPercent(9_000_000_000, 5_000_000_000), 100);
  assert.equal(L.progressPercent(1, 0), 0);
});

test('contribution amounts: positive, within limits, affordable including the fee, and leaving rent', () => {
  const ctx = { balance: 1_000_000_000, fee: 5_000, rentMinimum: 890_880 };
  assert.deepEqual(L.checkAmount('0.25', ctx), { ok: true, lamports: 250_000_000 });
  const reason = (v, c = ctx) => L.checkAmount(v, c).reason;
  assert.equal(reason(''), 'empty');
  assert.equal(reason('-0.1'), 'invalid');
  assert.equal(reason('0'), 'too_small');
  assert.equal(reason('0.0009'), 'too_small');
  assert.equal(reason('2.000000001', { ...ctx, balance: 10_000_000_000 }), 'too_large');
  assert.equal(reason('1'), 'insufficient', '1 SOL + fee is more than the 1 SOL balance');
  assert.match(L.checkAmount('1', ctx).message, /Not enough Devnet SOL/);
  assert.equal(reason('0.9995'), 'rent', 'would leave less than the rent-exempt minimum');
  assert.equal(L.checkAmount('0.999995', ctx).ok, true, 'emptying the wallet exactly is allowed');
  assert.equal(L.checkAmount('1.5', { ...ctx, balance: null }).ok, true, 'balance unknown: only the limits apply (the wallet and Devnet still enforce funds)');
});

// --- Transaction bytes ------------------------------------------------------------------------------------------------

test('transfer transaction: one signer, exact recipient, u64 lamports, campaign memo, Devnet blockhash', () => {
  const memo = S.campaignMemo('demo-club-equipment');
  const msg = T.buildTransferMessage({ from: ALICE.address, to: RECIPIENT, lamports: 123_456_789, memo, recentBlockhash: BLOCKHASH });
  assert.deepEqual([...msg.slice(0, 3)], [1, 0, 2], 'header: 1 signature, 2 read-only programs');
  assert.equal(msg[3], 4, 'four account keys');
  const keys = [0, 1, 2, 3].map((i) => base58.encode(msg.slice(4 + 32 * i, 36 + 32 * i)));
  assert.deepEqual(keys, [ALICE.address, RECIPIENT, S.SYSTEM_PROGRAM_ID, S.MEMO_PROGRAM_ID]);
  assert.equal(base58.encode(msg.slice(132, 164)), BLOCKHASH);
  let at = 164;
  assert.equal(msg[at++], 2, 'two instructions');
  assert.deepEqual([...msg.slice(at, at + 4)], [2, 2, 0, 1], 'System program; accounts from, to');
  at += 4;
  assert.equal(msg[at++], 12);
  const data = new DataView(msg.buffer, msg.byteOffset + at, 12);
  assert.equal(data.getUint32(0, true), 2, 'SystemInstruction::Transfer');
  assert.equal(data.getBigUint64(4, true), 123_456_789n);
  at += 12;
  assert.deepEqual([...msg.slice(at, at + 2)], [3, 0], 'Memo program, no accounts');
  at += 2;
  assert.equal(msg[at++], memo.length);
  assert.equal(new TextDecoder().decode(msg.slice(at)), memo);

  const unsigned = T.unsignedTransaction(msg);
  assert.throws(() => T.readSignedTransaction(unsigned), /did not sign/);
  const signed = unsigned.slice();
  signed.set(ed25519.sign(msg, ALICE.sk), 1);
  const read = T.readSignedTransaction(signed);
  assert.ok(ed25519.verify(base58.decode(read.signature), read.message, base58.decode(ALICE.address)), 'the signature is the transaction id over the exact message');
  assert.equal(S.looksLikeTxSignature(read.signature), true);

  assert.throws(() => T.buildTransferMessage({ from: ALICE.address, to: RECIPIENT, lamports: 0.5, memo, recentBlockhash: BLOCKHASH }), /whole number/);
  assert.throws(() => T.buildTransferMessage({ from: ALICE.address, to: RECIPIENT, lamports: -1, memo, recentBlockhash: BLOCKHASH }), /positive/);
  assert.throws(() => T.buildTransferMessage({ from: ALICE.address, to: ALICE.address, lamports: 1, memo, recentBlockhash: BLOCKHASH }), /differ/);
  assert.throws(() => T.buildTransferMessage({ from: ALICE.address, to: 'not-an-address', lamports: 1, memo, recentBlockhash: BLOCKHASH }));
});

test('Devnet only: fixed Devnet genesis hash and Explorer links that always select the Devnet cluster', () => {
  assert.equal(S.DEVNET_GENESIS_HASH, 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
  assert.notEqual(S.DEVNET_GENESIS_HASH, MAINNET_GENESIS);
  assert.equal(S.DEFAULT_DEVNET_RPC_URL, 'https://api.devnet.solana.com');
  const sig = '5'.repeat(88);
  assert.equal(S.explorerTxUrl(sig), `https://explorer.solana.com/tx/${sig}?cluster=devnet`);
  assert.equal(S.explorerAddressUrl(RECIPIENT), `https://explorer.solana.com/address/${RECIPIENT}?cluster=devnet`);
  assert.match(S.DEVNET_LABEL, /^Demo fundraising only — uses Solana Devnet test tokens with no monetary value\. No real donations are collected\.$/);
});

// --- Verifier ---------------------------------------------------------------------------------------------------------

let sigSeq = 0;
const newSig = () => base58.encode(ed25519.sign(new Uint8Array([++sigSeq]), ALICE.sk));
function chainTx({ signature = newSig(), from = ALICE.address, to = RECIPIENT, lamports = 50_000_000, memo = S.campaignMemo('demo-club-equipment'), err = null, extra = [], recipientDelta } = {}) {
  return {
    signature,
    status: { confirmationStatus: 'confirmed', err },
    tx: {
      slot: 4242,
      blockTime: 1_794_571_200,
      meta: { err, fee: 5000, preBalances: [9_000_000_000, 1_000_000, 1, 1], postBalances: [9_000_000_000 - lamports - 5000, 1_000_000 + (recipientDelta ?? lamports), 1, 1] },
      transaction: {
        signatures: [signature],
        message: {
          accountKeys: [
            { pubkey: from, signer: true, writable: true },
            { pubkey: to, signer: false, writable: true },
            { pubkey: S.SYSTEM_PROGRAM_ID, signer: false, writable: false },
            { pubkey: S.MEMO_PROGRAM_ID, signer: false, writable: false },
          ],
          instructions: [
            { programId: S.SYSTEM_PROGRAM_ID, program: 'system', parsed: { type: 'transfer', info: { source: from, destination: to, lamports } } },
            ...(memo === null ? [] : [{ programId: S.MEMO_PROGRAM_ID, program: 'spl-memo', parsed: memo }]),
            ...extra,
          ],
        },
      },
    },
  };
}
const expectFor = (c, over = {}) => ({ signature: c.signature, wallet: ALICE.address, recipient: RECIPIENT, lamports: 50_000_000, memo: S.campaignMemo('demo-club-equipment'), ...over });
const verdict = (c, over, status = c.status, tx = c.tx) => {
  const v = S.verifyContribution(tx, status, expectFor(c, over));
  return v.ok ? 'ok' : v.code;
};

test('verifier accepts only a confirmed, successful transfer of the exact amount from the linked wallet to the recipient', () => {
  const good = chainTx();
  const v = S.verifyContribution(good.tx, good.status, expectFor(good));
  assert.deepEqual(v, { ok: true, lamports: 50_000_000, slot: 4242, blockTime: '2026-11-13T12:00:00.000Z', confirmation: 'confirmed' });
  assert.equal(verdict(good, {}, { confirmationStatus: 'finalized', err: null }), 'ok');
});

test('verifier rejects invented, failed, unconfirmed, misdirected, mis-sized, mis-attributed and foreign transactions', () => {
  const good = chainTx();
  assert.equal(verdict(good, {}, null, null), 'tx_not_found', 'invented or Mainnet signature: Devnet has no such transaction');
  const failed = chainTx({ err: { InstructionError: [0, { Custom: 1 }] } });
  assert.equal(verdict(failed), 'tx_failed');
  assert.equal(verdict(good, {}, { confirmationStatus: 'processed', err: null }), 'tx_not_confirmed');
  assert.equal(verdict(good, {}, { confirmationStatus: 'confirmed', err: null }, null), 'tx_not_found', 'status seen but transaction not retrievable yet');
  assert.equal(verdict(good, { recipient: OTHER_RECIPIENT }), 'wrong_recipient');
  assert.equal(verdict(good, { lamports: 60_000_000 }), 'amount_mismatch', 'the browser claimed a different amount');
  assert.equal(verdict(good, { wallet: BOB.address }), 'wrong_wallet', "another student's transaction");
  assert.equal(verdict(good, { signature: newSig() }), 'wrong_wallet', 'signature is not this transaction id');
  assert.equal(verdict(chainTx({ memo: null })), 'campaign_mismatch', 'no campaign memo');
  assert.equal(verdict(chainTx({ memo: S.campaignMemo('demo-club-competition-travel') })), 'campaign_mismatch', 'memo for another campaign');
  assert.equal(
    verdict(chainTx({ extra: [{ programId: S.MEMO_PROGRAM_ID, parsed: S.campaignMemo('demo-club-equipment') }] })),
    'campaign_mismatch',
    'two memos are ambiguous',
  );
  assert.equal(verdict(chainTx({ recipientDelta: 70_000_000 })), 'amount_mismatch', 'recipient balance moved by a different amount');
  const fromBob = chainTx({ from: BOB.address });
  assert.equal(verdict(fromBob), 'wrong_wallet');
  const notSigner = chainTx();
  notSigner.tx.transaction.message.accountKeys[0].signer = false;
  assert.equal(verdict(notSigner), 'wrong_wallet');
  const fractional = chainTx({ lamports: 1.5 });
  assert.equal(verdict(fractional, { lamports: 1.5 }), 'amount_mismatch', 'lamports must be integers');
  const sneaky = chainTx({ extra: [{ programId: S.SYSTEM_PROGRAM_ID, parsed: { type: 'transfer', info: { source: BOB.address, destination: RECIPIENT, lamports: 1 } } }] });
  assert.equal(verdict(sneaky), 'wrong_wallet', 'a transfer to the recipient from anyone else');
  assert.equal(verdict(good, { recipient: ALICE.address }), 'wrong_recipient');
});

// --- Request handler --------------------------------------------------------------------------------------------------

const ORIGIN = 'http://localhost:5173';
const USERS = {
  'alice-token': { id: '11111111-1111-4111-8111-111111111111', email: 'alice@umass.edu', emailConfirmedAt: '2026-11-14T10:00:00Z', amr: [] },
  'bob-token': { id: '22222222-2222-4222-8222-222222222222', email: 'bob@umass.edu', emailConfirmedAt: '2026-11-14T10:00:00Z', amr: [] },
  'carol-token': { id: '66666666-6666-4666-8666-666666666666', email: 'carol@umass.edu', emailConfirmedAt: '2026-11-14T10:00:00Z', amr: [] },
  'gmail-token': { id: '33333333-3333-4333-8333-333333333333', email: 'eve@gmail.com', emailConfirmedAt: '2026-11-14T10:00:00Z', amr: [] },
  'unconfirmed-token': { id: '55555555-5555-4555-8555-555555555555', email: 'new@umass.edu', emailConfirmedAt: null, amr: [] },
};
const EQUIPMENT = '0c0c0c0c-1111-4111-8111-000000000001';
const TRAVEL = '0c0c0c0c-1111-4111-8111-000000000002';
const UNCONFIRMED = '0c0c0c0c-1111-4111-8111-000000000003';

/** Mirrors clubfund_record_contribution: availability, recipient and link checks, idempotency, unique signatures, totals. */
function memoryStore() {
  const campaigns = new Map([
    [EQUIPMENT, { id: EQUIPMENT, slug: 'demo-club-equipment', status: 'active', recipient_address: RECIPIENT, recipient_confirmed_at: '2026-11-14T09:00:00Z', raised_lamports: 0, contribution_count: 0 }],
    [TRAVEL, { id: TRAVEL, slug: 'demo-club-competition-travel', status: 'active', recipient_address: OTHER_RECIPIENT, recipient_confirmed_at: '2026-11-14T09:00:00Z', raised_lamports: 0, contribution_count: 0 }],
    [UNCONFIRMED, { id: UNCONFIRMED, slug: 'demo-charity-food-drive', status: 'active', recipient_address: keypair(11).address, recipient_confirmed_at: null, raised_lamports: 0, contribution_count: 0 }],
  ]);
  const links = new Map([
    [USERS['alice-token'].id, { user_id: USERS['alice-token'].id, wallet_address: ALICE.address, chain: 'solana:devnet', linked_at: '', verified_at: '' }],
    [USERS['bob-token'].id, { user_id: USERS['bob-token'].id, wallet_address: BOB.address, chain: 'solana:devnet', linked_at: '', verified_at: '' }],
  ]);
  const rows = new Map();
  let seq = 0;
  return {
    campaigns,
    rows,
    async getLink(id) {
      return links.get(id) ?? null;
    },
    async getCampaign(id) {
      const c = campaigns.get(id);
      return c ? { ...c } : null;
    },
    async findContribution(sig) {
      const r = rows.get(sig);
      return r ? { ...r.row, user_id: r.user_id } : null;
    },
    async recordContribution(a) {
      const c = campaigns.get(a.campaignId);
      if (!c) throw new H.StoreError('campaign_not_found');
      if (c.status !== 'active' || !c.recipient_confirmed_at) throw new H.StoreError('campaign_unavailable');
      if (c.recipient_address !== a.recipient) throw new H.StoreError('wrong_recipient');
      if (links.get(a.userId)?.wallet_address !== a.wallet) throw new H.StoreError('not_linked');
      const prior = rows.get(a.signature);
      if (prior) {
        if (prior.user_id === a.userId && prior.row.campaign_id === a.campaignId) return { created: false, contribution: prior.row, raised_lamports: c.raised_lamports, contribution_count: c.contribution_count };
        throw new H.StoreError('duplicate_signature');
      }
      const row = { id: `c-${++seq}`, campaign_id: a.campaignId, lamports: a.lamports, signature: a.signature, confirmation_status: a.confirmation, slot: a.slot, block_time: a.blockTime, verified_at: '2026-11-14T12:00:00Z' };
      rows.set(a.signature, { row, user_id: a.userId });
      c.raised_lamports += a.lamports;
      c.contribution_count += 1;
      return { created: true, contribution: row, raised_lamports: c.raised_lamports, contribution_count: c.contribution_count };
    },
  };
}

function fakeDevnet() {
  const chain = new Map();
  return {
    chain,
    genesis: S.DEVNET_GENESIS_HASH,
    down: false,
    calls: 0,
    async genesisHash() {
      this.calls++;
      if (this.down) throw new Error('RPC down');
      return this.genesis;
    },
    async getSignatureStatus(sig) {
      if (this.down) throw new Error('RPC down');
      return chain.get(sig)?.status ?? null;
    },
    async getTransaction(sig) {
      if (this.down) throw new Error('RPC down');
      return chain.get(sig)?.tx ?? null;
    },
  };
}

function setup() {
  const store = memoryStore();
  const devnet = fakeDevnet();
  const deps = { store, devnet, authenticate: async (h) => USERS[h?.replace(/^Bearer /, '')] ?? null, allowedOrigins: [ORIGIN] };
  const post = async (body, token = 'alice-token', { origin = ORIGIN, method = 'POST' } = {}) => {
    const headers = { 'content-type': 'application/json' };
    if (token) headers.authorization = `Bearer ${token}`;
    if (origin) headers.origin = origin;
    const res = await C.handleContribution(new Request('https://x.supabase.co/functions/v1/campaign-contribute', { method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined }), deps);
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, code: text ? JSON.parse(text)?.error?.code : null };
  };
  const onChain = (c) => (devnet.chain.set(c.signature, c), c);
  return { store, devnet, post, onChain };
}

/** A real signed transfer built by the browser code, then the parsed form Devnet would return for it. */
function realTransfer(from, to, lamports, slug) {
  const memo = S.campaignMemo(slug);
  const msg = T.buildTransferMessage({ from: from.address, to, lamports, memo, recentBlockhash: BLOCKHASH });
  const signed = T.unsignedTransaction(msg);
  signed.set(ed25519.sign(msg, from.sk), 1);
  const { signature } = T.readSignedTransaction(signed);
  return chainTx({ signature, from: from.address, to, lamports, memo });
}

test('contribute endpoint: origin, preflight, session, @umass.edu and confirmed email are required', async () => {
  const { post } = setup();
  const body = { campaignId: EQUIPMENT, signature: newSig(), lamports: 50_000_000 };
  assert.equal((await post(body, 'alice-token', { method: 'OPTIONS' })).status, 204);
  assert.equal((await post(body, 'alice-token', { origin: 'https://evil.example' })).code, 'origin_not_allowed');
  assert.equal((await post(body, null)).status, 401);
  assert.equal((await post(body, 'forged-token')).status, 401);
  assert.equal((await post(body, 'gmail-token')).code, 'email_not_allowed');
  assert.equal((await post(body, 'unconfirmed-token')).code, 'email_not_verified');
  assert.equal((await post(body, 'alice-token', { method: 'GET' })).status, 405);
});

test('contribute endpoint: bad input, unknown or closed campaigns and unlinked students are refused before Devnet is asked', async () => {
  const { post, devnet, store } = setup();
  const sig = newSig();
  assert.equal((await post({ campaignId: 'nope', signature: sig, lamports: 50_000_000 })).code, 'campaign_not_found');
  assert.equal((await post({ campaignId: '0c0c0c0c-1111-4111-8111-00000000ffff', signature: sig, lamports: 50_000_000 })).status, 404);
  assert.equal((await post({ campaignId: EQUIPMENT, signature: 'invented', lamports: 50_000_000 })).code, 'invalid_signature');
  for (const lamports of [0, -1, 1.5, 999_999, 2_000_000_001, '50000000', null])
    assert.equal((await post({ campaignId: EQUIPMENT, signature: sig, lamports })).code, 'invalid_amount', String(lamports));
  assert.equal((await post({ campaignId: UNCONFIRMED, signature: sig, lamports: 50_000_000 })).code, 'campaign_unavailable', 'recipient not confirmed');
  store.campaigns.get(TRAVEL).status = 'closed';
  assert.equal((await post({ campaignId: TRAVEL, signature: sig, lamports: 50_000_000 })).code, 'campaign_unavailable');
  assert.equal((await post({ campaignId: EQUIPMENT, signature: sig, lamports: 50_000_000 }, 'carol-token')).code, 'not_linked');
  assert.equal(devnet.calls, 0);
});

test('contribute endpoint: verifies on Devnet, records once, totals update; re-checks are idempotent', async () => {
  const { post, onChain, store, devnet } = setup();
  const c = onChain(realTransfer(ALICE, RECIPIENT, 50_000_000, 'demo-club-equipment'));
  const first = await post({ campaignId: EQUIPMENT, signature: c.signature, lamports: 50_000_000, wallet: BOB.address, userId: USERS['bob-token'].id });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.created, true);
  assert.equal(first.body.contribution.lamports, 50_000_000);
  assert.equal(first.body.contribution.signature, c.signature);
  assert.deepEqual(first.body.campaign, { raised_lamports: 50_000_000, contribution_count: 1 });
  assert.ok(!('user_id' in first.body.contribution), 'no account id in the response');
  assert.equal(store.rows.get(c.signature).user_id, USERS['alice-token'].id, 'owner comes from the session, not the body');

  const calls = devnet.calls;
  const again = await post({ campaignId: EQUIPMENT, signature: c.signature, lamports: 50_000_000 });
  assert.equal(again.status, 200);
  assert.equal(again.body.created, false);
  assert.deepEqual(again.body.campaign, { raised_lamports: 50_000_000, contribution_count: 1 }, 'counted once');
  assert.equal(devnet.calls, calls, 'already verified: Devnet is not asked again');

  const second = onChain(realTransfer(ALICE, RECIPIENT, 7_000_000, 'demo-club-equipment'));
  assert.equal((await post({ campaignId: EQUIPMENT, signature: second.signature, lamports: 7_000_000 })).status, 201);
  assert.equal(store.campaigns.get(EQUIPMENT).raised_lamports, 57_000_000);
  assert.equal(store.campaigns.get(EQUIPMENT).contribution_count, 2);
});

test('contribute endpoint: duplicates, other students, wrong recipients, amounts and networks are refused', async () => {
  const { post, onChain, devnet, store } = setup();
  const alices = onChain(realTransfer(ALICE, RECIPIENT, 50_000_000, 'demo-club-equipment'));
  assert.equal((await post({ campaignId: EQUIPMENT, signature: alices.signature, lamports: 50_000_000 }, 'bob-token')).code, 'wrong_wallet', "Bob claims Alice's transaction");
  assert.equal((await post({ campaignId: EQUIPMENT, signature: alices.signature, lamports: 50_000_000 })).status, 201);
  assert.equal((await post({ campaignId: EQUIPMENT, signature: alices.signature, lamports: 50_000_000 }, 'bob-token')).code, 'duplicate_signature');
  assert.equal((await post({ campaignId: TRAVEL, signature: alices.signature, lamports: 50_000_000 })).code, 'duplicate_signature', 'one transaction, one campaign');

  const misdirected = onChain(realTransfer(ALICE, RECIPIENT, 10_000_000, 'demo-club-equipment'));
  assert.equal((await post({ campaignId: TRAVEL, signature: misdirected.signature, lamports: 10_000_000 })).code, 'wrong_recipient');
  const claimedMore = onChain(realTransfer(ALICE, RECIPIENT, 10_000_000, 'demo-club-equipment'));
  assert.equal((await post({ campaignId: EQUIPMENT, signature: claimedMore.signature, lamports: 20_000_000 })).code, 'amount_mismatch');
  const failed = onChain(chainTx({ err: { InstructionError: [0, 'InsufficientFunds'] } }));
  assert.equal((await post({ campaignId: EQUIPMENT, signature: failed.signature, lamports: 50_000_000 })).code, 'tx_failed');
  const pending = onChain(realTransfer(ALICE, RECIPIENT, 10_000_000, 'demo-club-equipment'));
  pending.status = { confirmationStatus: 'processed', err: null };
  assert.equal((await post({ campaignId: EQUIPMENT, signature: pending.signature, lamports: 10_000_000 })).code, 'tx_not_confirmed');
  assert.equal((await post({ campaignId: EQUIPMENT, signature: newSig(), lamports: 10_000_000 })).status, 404, 'invented or Mainnet signature is not on Devnet');

  devnet.genesis = MAINNET_GENESIS;
  const fresh = realTransfer(ALICE, RECIPIENT, 10_000_000, 'demo-club-equipment');
  onChain(fresh);
  assert.equal((await post({ campaignId: EQUIPMENT, signature: fresh.signature, lamports: 10_000_000 })).code, 'wrong_network', 'never verifies against Mainnet');
  devnet.genesis = S.DEVNET_GENESIS_HASH;
  devnet.down = true;
  const down = await post({ campaignId: EQUIPMENT, signature: fresh.signature, lamports: 10_000_000 });
  assert.deepEqual([down.status, down.code], [503, 'rpc_unavailable']);
  devnet.down = false;
  assert.equal((await post({ campaignId: EQUIPMENT, signature: fresh.signature, lamports: 10_000_000 })).status, 201, 'works once Devnet is back');
  assert.equal(store.campaigns.get(EQUIPMENT).raised_lamports, 60_000_000, 'only the two verified transfers count');
});
