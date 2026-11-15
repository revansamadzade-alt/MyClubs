// Backend security tests for the ClubFund wallet Edge Functions: the real request handlers and policy code (the same
// files Deno deploys), real Ed25519 signatures from deterministic keys, and an in-memory store with the same
// single-use semantics as the SQL functions. The SQL itself is tested in clubfund-db.test.mjs.
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
const P = await server.ssrLoadModule('/supabase/functions/_shared/policy.ts');
const H = await server.ssrLoadModule('/supabase/functions/_shared/handlers.ts');
const OTP = await server.ssrLoadModule('/src/lib/clubfund/otp.ts');

const ORIGIN = 'http://localhost:5173';
const wallet = (seed) => {
  const sk = new Uint8Array(32).fill(seed);
  return { sk, address: base58.encode(ed25519.getPublicKey(sk)) };
};
const ALICE_WALLET = wallet(1);
const BOB_WALLET = wallet(2);
const users = {
  'alice-token': { id: '11111111-1111-4111-8111-111111111111', email: 'Alice@UMass.edu', emailConfirmedAt: '2026-11-14T10:00:00Z', amr: [{ method: 'otp', timestamp: 0 }] },
  'bob-token': { id: '22222222-2222-4222-8222-222222222222', email: 'bob@umass.edu', emailConfirmedAt: '2026-11-14T10:00:00Z', amr: [] },
  'gmail-token': { id: '33333333-3333-4333-8333-333333333333', email: 'eve@gmail.com', emailConfirmedAt: '2026-11-14T10:00:00Z', amr: [] },
  'lookalike-token': { id: '44444444-4444-4444-8444-444444444444', email: 'eve@umass.edu.attacker.com', emailConfirmedAt: '2026-11-14T10:00:00Z', amr: [] },
  'unconfirmed-token': { id: '55555555-5555-4555-8555-555555555555', email: 'new@umass.edu', emailConfirmedAt: null, amr: [] },
};

/** In-memory store mirroring the SQL functions: atomic single-use consumption, one wallet per user, unique wallets. */
function memoryStore() {
  const links = new Map();
  const challenges = new Map();
  const recipients = new Set();
  let seq = 0;
  return {
    links,
    challenges,
    recipients,
    async getLink(userId) { return links.get(userId) ?? null; },
    async getLinkByWallet(w) { return [...links.values()].find((l) => l.wallet_address === w) ?? null; },
    async isCampaignRecipient(w) { return recipients.has(w); },
    async issueChallenge(a) {
      // Mirrors clubfund_request_challenge: an open challenge (same user, wallet, purpose and site, > 60 s left) is
      // handed back; otherwise at most 5 new ones per user in 10 minutes.
      const line = (m, n) => m.split('\n')[n - 1];
      const open = [...challenges.values()]
        .filter((c) => c.user_id === a.userId && c.wallet_address === a.wallet && c.purpose === a.purpose && !c.consumed_at)
        .filter((c) => new Date(c.expires_at).getTime() > clock.now.getTime() + 60_000)
        .filter((c) => line(c.message, 1) === line(a.message, 1) && line(c.message, 6) === line(a.message, 6))
        .at(-1);
      if (open) return { id: open.id, expires_at: open.expires_at, message: open.message, reused: true };
      const recent = [...challenges.values()].filter((c) => c.user_id === a.userId && new Date(c.issued_at).getTime() > clock.now.getTime() - 600_000);
      if (recent.length >= 5) {
        const oldest = Math.min(...recent.slice(-5).map((c) => new Date(c.issued_at).getTime()));
        throw new H.StoreError('rate_limited', Math.max(1, Math.ceil((oldest + 600_000 - clock.now.getTime()) / 1000)));
      }
      const id = `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;
      const expires_at = new Date(clock.now.getTime() + a.ttlSeconds * 1000).toISOString();
      challenges.set(id, { id, user_id: a.userId, wallet_address: a.wallet, purpose: a.purpose, message: a.message, issued_at: clock.now.toISOString(), expires_at, consumed_at: null });
      return { id, expires_at, message: a.message, reused: false };
    },
    async getChallenge(id) { const c = challenges.get(id); return c ? { ...c } : null; },
    async linkWallet(a) {
      const c = challenges.get(a.challengeId);
      if (!c || c.user_id !== a.userId || c.wallet_address !== a.wallet || c.purpose !== 'link' || c.message !== a.message || c.consumed_at || new Date(c.expires_at) <= clock.now)
        throw new H.StoreError('challenge_invalid');
      c.consumed_at = clock.now.toISOString();
      if (links.has(a.userId)) throw new H.StoreError('already_linked');
      if ([...links.values()].some((l) => l.wallet_address === a.wallet)) throw new H.StoreError('wallet_in_use');
      const row = { user_id: a.userId, wallet_address: a.wallet, chain: 'solana:devnet', linked_at: clock.now.toISOString(), verified_at: clock.now.toISOString() };
      links.set(a.userId, row);
      return row;
    },
    async unlinkWallet(a) {
      if (a.challengeId) {
        const c = challenges.get(a.challengeId);
        if (!c || c.user_id !== a.userId || c.purpose !== 'unlink' || c.wallet_address !== a.wallet || c.message !== a.message || c.consumed_at || new Date(c.expires_at) <= clock.now)
          throw new H.StoreError('challenge_invalid');
        c.consumed_at = clock.now.toISOString();
      }
      return links.delete(a.userId);
    },
  };
}

const clock = { now: new Date('2026-11-14T12:00:00Z') };
let nonceSeq = 0;
function deps(store = memoryStore()) {
  return {
    store,
    authenticate: async (auth) => users[auth?.replace(/^Bearer /, '')] ?? null,
    crypto: { decodeBase58: (s) => base58.decode(s), verify: (sig, msg, pk) => ed25519.verify(sig, msg, pk) },
    randomNonce: () => String(++nonceSeq).padStart(64, 'a'),
    now: () => clock.now,
    allowedOrigins: [ORIGIN],
  };
}

const call = async (d, endpoint, body, token = 'alice-token', origin = ORIGIN, method = 'POST') => {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  if (origin) headers.origin = origin;
  const res = await H.handle(endpoint, new Request(`https://x.supabase.co/functions/v1/wallet-${endpoint}`, { method, headers, body: method === 'POST' ? JSON.stringify(body) : undefined }), d);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
};
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const sign = (w, message) => {
  const bytes = new TextEncoder().encode(message);
  return { signedMessage: b64(bytes), signature: b64(ed25519.sign(bytes, w.sk)) };
};
async function proveLink(d, w = ALICE_WALLET, token = 'alice-token') {
  const ch = await call(d, 'challenge', { wallet: w.address, purpose: 'link' }, token);
  assert.equal(ch.status, 200, JSON.stringify(ch.body));
  return { ch: ch.body, proof: { challengeId: ch.body.challengeId, wallet: w.address, ...sign(w, ch.body.message) } };
}

test('email policy: exact @umass.edu only (case-insensitive), look-alikes and malformed addresses rejected', () => {
  for (const ok of ['alice@umass.edu', ' Alice@UMass.EDU ', 'first.last+clubs@umass.edu', 'a_b-c@umass.edu']) assert.equal(P.isUmassEmail(ok), true, ok);
  for (const bad of ['alice@cs.umass.edu', 'alice@umass.edu.attacker.com', 'alice@umass.education', 'alice@umassedu', 'alice@xumass.edu', 'alice@@umass.edu', 'a@b@umass.edu', '@umass.edu', '.alice@umass.edu', 'alice.@umass.edu', 'al..ice@umass.edu', 'al ice@umass.edu', 'alice@umass.edu\nx', 'ali\nce@umass.edu', `${'a'.repeat(65)}@umass.edu`, '', null, 42])
    assert.equal(P.isUmassEmail(bad), false, String(bad));
});

test('challenge message names app, wallet, account, operation, nonce and validity; no email', () => {
  const m = P.buildChallengeMessage({ domain: 'localhost:5173', uri: ORIGIN, address: ALICE_WALLET.address, userId: users['alice-token'].id, purpose: 'link', nonce: 'n'.repeat(64), issuedAt: new Date('2026-11-14T12:00:00Z'), expiresAt: new Date('2026-11-14T12:05:00Z') });
  assert.equal(m.split('\n')[0], 'localhost:5173 wants you to sign in with your Solana account:');
  for (const part of [ALICE_WALLET.address, `Nonce: ${'n'.repeat(64)}`, 'Issued At: 2026-11-14T12:00:00.000Z', 'Expiration Time: 2026-11-14T12:05:00.000Z', 'Request ID: link-wallet', `myclubs:account:${users['alice-token'].id}`, 'moves no funds'])
    assert.ok(m.includes(part), part);
  assert.equal(m.includes('@'), false, 'no email address in the signed message');
});

test('regression (live Phantom error): the challenge is valid SIWS text with no Chain ID line', () => {
  // Phantom refused "as the chain ID does not match the provided chain ID for verification": it checks an SIWS
  // message's optional Chain ID against its own selected network. The field must be absent.
  const m = P.buildChallengeMessage({ domain: 'localhost:5173', uri: ORIGIN, address: ALICE_WALLET.address, userId: users['alice-token'].id, purpose: 'link', nonce: 'a1'.repeat(32), issuedAt: new Date('2026-11-15T12:00:00Z'), expiresAt: new Date('2026-11-15T12:05:00Z') });
  assert.equal(/chain id/i.test(m), false, 'no Chain ID field');
  // SIWS layout (Phantom sign-in-with-solana ABNF): header, address, blank, statement, blank, then advanced fields in order.
  const lines = m.split('\n');
  assert.equal(lines[0], 'localhost:5173 wants you to sign in with your Solana account:');
  assert.equal(lines[1], ALICE_WALLET.address);
  assert.equal(lines[2], '');
  assert.ok(lines[3].length > 0 && !lines[3].includes('\n'));
  assert.equal(lines[4], '');
  const fields = lines.slice(5);
  assert.deepEqual(fields.map((l) => l.split(':')[0]), ['URI', 'Version', 'Nonce', 'Issued At', 'Expiration Time', 'Request ID', 'Resources', '- myclubs']);
  assert.equal(fields[0], `URI: ${ORIGIN}`);
  assert.equal(fields[1], 'Version: 1');
  assert.match(fields[2], /^Nonce: [A-Za-z0-9]{8,}$/, 'alphanumeric nonce, at least 8 characters');
  const issued = Date.parse(fields[3].slice('Issued At: '.length));
  const expires = Date.parse(fields[4].slice('Expiration Time: '.length));
  assert.ok(expires > issued && expires - issued <= 10 * 60_000, "within Phantom's 10-minute window");
  const unlink = P.buildChallengeMessage({ domain: 'myclubs.example', uri: 'https://myclubs.example', address: ALICE_WALLET.address, userId: 'u', purpose: 'unlink', nonce: 'b2'.repeat(32), issuedAt: new Date(), expiresAt: new Date(Date.now() + 300_000) });
  assert.equal(/chain id/i.test(unlink), false);
});

test("a campaign's recipient wallet can't be linked as a student's own wallet", async () => {
  const d = deps();
  d.store.recipients.add(BOB_WALLET.address);
  const res = await call(d, 'challenge', { wallet: BOB_WALLET.address, purpose: 'link' });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'wallet_is_recipient');
  assert.equal(d.store.challenges.size, 0, 'no challenge issued');
  assert.equal((await call(d, 'challenge', { wallet: ALICE_WALLET.address, purpose: 'link' })).status, 200, 'the student can link their own account');
});

test('Ed25519 verification: correct signature passes; forged, wrong key, tampered or malformed inputs fail', () => {
  const msg = new TextEncoder().encode('exact bytes');
  const sig = ed25519.sign(msg, ALICE_WALLET.sk);
  const c = deps().crypto;
  assert.equal(P.verifyWalletSignature(ALICE_WALLET.address, msg, sig, c), true);
  assert.equal(P.verifyWalletSignature(BOB_WALLET.address, msg, sig, c), false, 'different public key');
  assert.equal(P.verifyWalletSignature(ALICE_WALLET.address, new TextEncoder().encode('exact bytes!'), sig, c), false, 'tampered message');
  const forged = sig.slice(); forged[10] ^= 1;
  assert.equal(P.verifyWalletSignature(ALICE_WALLET.address, msg, forged, c), false, 'forged signature');
  assert.equal(P.verifyWalletSignature(ALICE_WALLET.address, msg, sig.slice(0, 63), c), false, 'short signature');
  assert.equal(P.verifyWalletSignature('0OIl' + ALICE_WALLET.address.slice(4), msg, sig, c), false, 'not base58');
  assert.equal(P.verifyWalletSignature(base58.encode(new Uint8Array(31).fill(9)), msg, sig, c), false, '31-byte key');
});

test('link: full flow stores the link only after a valid signature over the exact challenge', async () => {
  const d = deps();
  const { ch, proof } = await proveLink(d);
  assert.match(ch.message, /^localhost:5173 wants you to sign in/);
  assert.equal(d.store.links.size, 0, 'nothing stored before the proof');
  const res = await call(d, 'link', proof);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.link.wallet_address, ALICE_WALLET.address);
  assert.equal(d.store.links.get(users['alice-token'].id).wallet_address, ALICE_WALLET.address);
  assert.equal(res.headers.get('access-control-allow-origin'), ORIGIN);
});

test('link: someone else\'s wallet (address only, no key) cannot be linked', async () => {
  const d = deps();
  const ch = await call(d, 'challenge', { wallet: BOB_WALLET.address, purpose: 'link' });
  const res = await call(d, 'link', { challengeId: ch.body.challengeId, wallet: BOB_WALLET.address, ...sign(ALICE_WALLET, ch.body.message) });
  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'signature_invalid');
  assert.equal(d.store.links.size, 0);
});

test('link: replayed, expired, wrong-user, wrong-wallet, altered-message and wrong-purpose proofs are refused', async () => {
  const d = deps();
  const { proof } = await proveLink(d);
  assert.equal((await call(d, 'link', proof)).status, 200);
  const replay = await call(d, 'link', proof);
  assert.equal(replay.body.error.code, 'challenge_used', 'replay');

  const d2 = deps();
  const p2 = (await proveLink(d2)).proof;
  assert.equal((await call(d2, 'link', p2, 'bob-token')).body.error.code, 'challenge_not_found', "another user's challenge");
  assert.equal((await call(d2, 'link', { ...p2, wallet: BOB_WALLET.address })).body.error.code, 'wallet_mismatch', 'claimed key differs from challenge');
  const altered = { ...p2, ...sign(ALICE_WALLET, `${(await d2.store.getChallenge(p2.challengeId)).message}\nextra`) };
  assert.equal((await call(d2, 'link', altered)).body.error.code, 'message_mismatch', 'signed bytes differ from the challenge');
  const saved = clock.now;
  clock.now = new Date(saved.getTime() + 301_000);
  const expired = await call(d2, 'link', p2);
  clock.now = saved;
  assert.equal(expired.status, 410);
  assert.equal(expired.body.error.code, 'challenge_expired');
  const unlinkCh = await call(d2, 'challenge', { wallet: ALICE_WALLET.address, purpose: 'unlink' });
  assert.equal(unlinkCh.body.error.code, 'not_linked', 'no unlink challenge without a link');
  assert.equal(d2.store.links.size, 0);
});

test('link: two concurrent submissions of one challenge — exactly one succeeds', async () => {
  const d = deps();
  const { proof } = await proveLink(d);
  const results = await Promise.all([call(d, 'link', proof), call(d, 'link', proof)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(d.store.links.size, 1);
});

test('link: a wallet linked to one account cannot be linked to another; one wallet per account', async () => {
  const d = deps();
  assert.equal((await call(d, 'link', (await proveLink(d)).proof)).status, 200);
  const other = await call(d, 'challenge', { wallet: ALICE_WALLET.address, purpose: 'link' }, 'bob-token');
  assert.equal(other.status, 409);
  assert.equal(other.body.error.code, 'wallet_in_use');
  const second = await call(d, 'challenge', { wallet: BOB_WALLET.address, purpose: 'link' });
  assert.equal(second.body.error.code, 'already_linked');
});

test('authorization: no session, expired session, non-UMass, look-alike and unconfirmed emails are refused', async () => {
  const d = deps();
  const body = { wallet: ALICE_WALLET.address, purpose: 'link' };
  assert.equal((await call(d, 'challenge', body, null)).status, 401);
  assert.equal((await call(d, 'challenge', body, 'expired-or-forged-token')).status, 401);
  assert.equal((await call(d, 'challenge', body, 'gmail-token')).body.error.code, 'email_not_allowed');
  assert.equal((await call(d, 'challenge', body, 'lookalike-token')).body.error.code, 'email_not_allowed');
  assert.equal((await call(d, 'challenge', body, 'unconfirmed-token')).body.error.code, 'email_not_verified');
  // A body cannot choose the user: identity comes from the token only.
  const spoof = await call(d, 'challenge', { ...body, userId: users['bob-token'].id, email: 'bob@umass.edu' }, 'gmail-token');
  assert.equal(spoof.status, 403);
  assert.equal(d.store.challenges.size, 0);
});

test('cross-origin: unknown sites are refused; allowed origin gets CORS headers; preflight works', async () => {
  const d = deps();
  const evil = await call(d, 'challenge', { wallet: ALICE_WALLET.address, purpose: 'link' }, 'alice-token', 'https://evil.example');
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
  const pre = await H.handle('challenge', new Request('https://x/functions/v1/wallet-challenge', { method: 'OPTIONS', headers: { origin: ORIGIN } }), d);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal((await call(d, 'challenge', {}, 'alice-token', ORIGIN, 'GET')).status, 405);
});

test('challenge requests validate input', async () => {
  const d = deps();
  assert.equal((await call(d, 'challenge', { wallet: 'not-a-wallet', purpose: 'link' })).body.error.code, 'invalid_wallet');
  assert.equal((await call(d, 'challenge', { wallet: ALICE_WALLET.address, purpose: 'drain' })).body.error.code, 'bad_request');
});

test('regression: retrying after a cancelled or failed signature reuses the open challenge instead of burning the limit', async () => {
  const d = deps();
  const first = await call(d, 'challenge', { wallet: ALICE_WALLET.address, purpose: 'link' });
  assert.equal(first.body.reused, false);
  // The live failure: five retries (cancelled/failed wallet popups) minted five challenges and locked the student out.
  for (let i = 0; i < 8; i++) {
    const again = await call(d, 'challenge', { wallet: ALICE_WALLET.address, purpose: 'link' });
    assert.equal(again.status, 200, `retry ${i + 1}`);
    assert.equal(again.body.reused, true);
    assert.equal(again.body.challengeId, first.body.challengeId);
    assert.equal(again.body.message, first.body.message, 'the same exact bytes to sign');
  }
  assert.equal(d.store.challenges.size, 1);
  // The reused challenge is still single-use: once linked it cannot be replayed.
  const proof = { challengeId: first.body.challengeId, wallet: ALICE_WALLET.address, ...sign(ALICE_WALLET, first.body.message) };
  assert.equal((await call(d, 'link', proof)).status, 200);
  assert.equal((await call(d, 'link', proof)).body.error.code, 'challenge_used');
});

test('challenge reuse stops near expiry, for other wallets or purposes, and for other sites', async () => {
  const d = deps();
  const a = await call(d, 'challenge', { wallet: ALICE_WALLET.address, purpose: 'link' });
  const saved = clock.now;
  clock.now = new Date(saved.getTime() + 250_000); // 50 s left: too little to sign comfortably
  const late = await call(d, 'challenge', { wallet: ALICE_WALLET.address, purpose: 'link' });
  assert.equal(late.body.reused, false);
  assert.notEqual(late.body.challengeId, a.body.challengeId);
  clock.now = saved;
  const otherWallet = await call(d, 'challenge', { wallet: BOB_WALLET.address, purpose: 'link' });
  assert.equal(otherWallet.body.reused, false);
  d.allowedOrigins.push('https://myclubs.example');
  const otherSite = await call(d, 'challenge', { wallet: ALICE_WALLET.address, purpose: 'link' }, 'alice-token', 'https://myclubs.example');
  assert.equal(otherSite.body.reused, false, 'a challenge shows the requesting site, so another site gets its own');
  assert.match(otherSite.body.message, /^myclubs\.example wants you/);
});

test('new challenges are still limited to 5 per 10 minutes, with the time until the next one', async () => {
  const d = deps();
  const extra = [3, 4, 5, 6, 7].map((seed) => wallet(seed));
  for (const w of extra) assert.equal((await call(d, 'challenge', { wallet: w.address, purpose: 'link' })).status, 200);
  const limited = await call(d, 'challenge', { wallet: wallet(8).address, purpose: 'link' });
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error.code, 'rate_limited');
  assert.equal(limited.body.error.retryAfterSeconds, 600);
  assert.equal(limited.headers.get('retry-after'), '600');
  // Open challenges are still handed back while new ones are limited.
  assert.equal((await call(d, 'challenge', { wallet: extra[0].address, purpose: 'link' })).body.reused, true);
  const saved = clock.now;
  clock.now = new Date(saved.getTime() + 601_000);
  assert.equal((await call(d, 'challenge', { wallet: wallet(8).address, purpose: 'link' })).status, 200, 'allowed again after the window');
  clock.now = saved;
});

test('unlink with the linked wallet\'s signature; a different wallet cannot unlink', async () => {
  const d = deps();
  await call(d, 'link', (await proveLink(d)).proof);
  const wrong = await call(d, 'challenge', { wallet: BOB_WALLET.address, purpose: 'unlink' });
  assert.equal(wrong.body.error.code, 'not_linked_wallet');
  const ch = await call(d, 'challenge', { wallet: ALICE_WALLET.address, purpose: 'unlink' });
  const proof = { method: 'signature', challengeId: ch.body.challengeId, wallet: ALICE_WALLET.address, ...sign(ALICE_WALLET, ch.body.message) };
  const forged = await call(d, 'unlink', { ...proof, ...sign(BOB_WALLET, ch.body.message) });
  assert.equal(forged.body.error.code, 'signature_invalid');
  // A link challenge cannot be used to unlink.
  assert.equal(d.store.links.size, 1);
  const ok = await call(d, 'unlink', proof);
  assert.equal(ok.status, 200);
  assert.equal(d.store.links.size, 0);
  assert.equal((await call(d, 'unlink', proof)).body.error.code, 'not_linked');
});

test('lost wallet: unlink without a signature only after a fresh email-code sign-in', async () => {
  const d = deps();
  await call(d, 'link', (await proveLink(d)).proof);
  const now = clock.now.getTime() / 1000;
  users['alice-token'].amr = [{ method: 'otp', timestamp: now - 3600 }];
  const stale = await call(d, 'unlink', { method: 'recent-sign-in' });
  assert.equal(stale.body.error.code, 'recent_sign_in_required');
  users['alice-token'].amr = [{ method: 'password', timestamp: now - 10 }];
  assert.equal((await call(d, 'unlink', { method: 'recent-sign-in' })).body.error.code, 'recent_sign_in_required', 'only an email code counts');
  users['alice-token'].amr = [{ method: 'otp', timestamp: now - 120 }];
  assert.equal((await call(d, 'unlink', { method: 'recent-sign-in' })).status, 200);
  assert.equal(d.store.links.size, 0);
  users['alice-token'].amr = [{ method: 'otp', timestamp: 0 }];
});

test('wrong-purpose proof: a link signature cannot unlink', async () => {
  const d = deps();
  const first = await proveLink(d);
  await call(d, 'link', first.proof);
  // Re-submit the (already used) link challenge as an unlink proof.
  const res = await call(d, 'unlink', { method: 'signature', ...first.proof });
  assert.equal(res.body.error.code, 'purpose_mismatch');
  assert.equal(d.store.links.size, 1);
});

test('email codes: 6 to 10 digits accepted as strings, leading zeros kept, 8-digit codes never shortened', () => {
  for (const code of ['012345', '00000000', '01234567', '0123456789'])
    assert.equal(OTP.isCodeLengthValid(code), true, code);
  for (const code of ['', '01234', '01234567890', '0123456a', '1234 5678'])
    assert.equal(OTP.isCodeLengthValid(code), false, JSON.stringify(code));
  assert.equal(OTP.normalizeCode('01234567'), '01234567');
  assert.equal(typeof OTP.normalizeCode('01234567'), 'string');
  assert.equal(OTP.normalizeCode('000000'), '000000', 'all zeros stay six characters');
  assert.equal(OTP.normalizeCode(' 0123 4567 '), '01234567', 'pasted spacing removed');
  assert.equal(OTP.normalizeCode('0123-4567'), '01234567');
  assert.equal(OTP.normalizeCode('012345678901'), '0123456789', 'never longer than the 10-digit maximum');
  assert.equal(OTP.normalizeCode(OTP.normalizeCode('01234567')), '01234567', 'stable when applied again');
});

test('allowed origins: exact origins only, never wildcards; local defaults when unset or invalid', () => {
  assert.deepEqual(H.parseAllowedOrigins(undefined), { origins: H.DEFAULT_ALLOWED_ORIGINS, rejected: [], usingDefaults: true });
  const r = H.parseAllowedOrigins(
    ' https://myclubs.vercel.app/ , http://localhost:5173,HTTPS://MyClubs-git-main-team.vercel.app,https://*.vercel.app,*,https://x.com/path,ftp://a.b,javascript:alert(1),https://user:pw@x.com,https://myclubs.vercel.app',
  );
  assert.deepEqual(r.origins, ['https://myclubs.vercel.app', 'http://localhost:5173', 'https://myclubs-git-main-team.vercel.app']);
  assert.deepEqual(r.rejected, ['https://*.vercel.app', '*', 'https://x.com/path', 'ftp://a.b', 'javascript:alert(1)', 'https://user:pw@x.com']);
  assert.equal(r.usingDefaults, false);
  const onlyBad = H.parseAllowedOrigins('*, https://*.vercel.app');
  assert.equal(onlyBad.usingDefaults, true, 'a wildcard never means "all sites": only local development stays allowed');
  assert.deepEqual(onlyBad.origins, H.DEFAULT_ALLOWED_ORIGINS);
});
