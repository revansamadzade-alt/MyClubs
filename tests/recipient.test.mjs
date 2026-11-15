// Recipient-wallet validation (scripts/lib/recipient.mjs): real Ed25519 keys and real off-curve addresses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ed25519 } from '@noble/curves/ed25519.js';
import { base58 } from '@scure/base';
import { campaignReport, confirmationSql, validateRecipient } from '../scripts/lib/recipient.mjs';

const ctx = {
  decode: (s) => base58.decode(s),
  onCurve: (b) => {
    try {
      ed25519.Point.fromBytes(b);
      return true;
    } catch {
      return false;
    }
  },
};
const wallet = (seed) => base58.encode(ed25519.getPublicKey(new Uint8Array(32).fill(seed)));
const offCurve = (() => {
  for (let i = 0; i < 255; i++) {
    const b = new Uint8Array(32).fill(i + 7);
    b[0] = i;
    if (!ctx.onCurve(b)) return base58.encode(b);
  }
  throw new Error('no off-curve sample');
})();
const RECIPIENT = wallet(21);
const CONTRIBUTOR = wallet(22);

test('a normal wallet public key passes', () => {
  assert.deepEqual(validateRecipient(` ${RECIPIENT} `, { ...ctx, contributor: CONTRIBUTOR, campaigns: [], slug: 'demo-club-equipment' }), { ok: true, problems: [] });
});

test('invalid formats, programs, off-curve addresses, the contributor and duplicates are refused', () => {
  const v = (a, extra = {}) => validateRecipient(a, { ...ctx, ...extra });
  assert.match(v('').problems[0], /No address/);
  assert.match(v('0OIl'.repeat(10)).problems[0], /Not a Solana address/);
  assert.match(v('abc').problems[0], /Not a Solana address/);
  assert.match(v(base58.encode(new Uint8Array(31).fill(5))).problems.join(), /31 bytes|Not a Solana address/);
  assert.match(v('11111111111111111111111111111111').problems[0], /System Program/);
  assert.match(v(offCurve).problems[0], /Off the Ed25519 curve/);
  assert.match(v(CONTRIBUTOR, { contributor: CONTRIBUTOR }).problems[0], /contributing wallet/);
  const campaigns = [{ slug: 'demo-event-open-mic', recipient_address: RECIPIENT }];
  assert.match(v(RECIPIENT, { campaigns, slug: 'demo-club-equipment' }).problems[0], /Already the recipient of "demo-event-open-mic"/);
  assert.equal(v(RECIPIENT, { campaigns, slug: 'demo-event-open-mic' }).ok, true, 'its own campaign is fine');
});

test('campaign report: identifies campaigns without a valid, confirmed recipient', () => {
  const report = campaignReport(
    [
      { slug: 'demo-club-equipment', status: 'active', recipient_address: RECIPIENT, recipient_confirmed_at: '2026-11-15T10:00:00Z' },
      { slug: 'demo-club-competition-travel', status: 'active', recipient_address: null, recipient_confirmed_at: null },
      { slug: 'demo-event-open-mic', status: 'active', recipient_address: wallet(23), recipient_confirmed_at: null },
      { slug: 'demo-charity-food-drive', status: 'active', recipient_address: offCurve, recipient_confirmed_at: '2026-11-15T10:00:00Z' },
      { slug: 'demo-charity-volunteer-day', status: 'paused', recipient_address: wallet(24), recipient_confirmed_at: '2026-11-15T10:00:00Z' },
      { slug: 'demo-event-hackathon-workshop', status: 'active', recipient_address: RECIPIENT, recipient_confirmed_at: '2026-11-15T10:00:00Z' },
    ],
    ctx,
  );
  const by = Object.fromEntries(report.map((r) => [r.slug, r]));
  assert.equal(by['demo-club-equipment'].ready, false, 'shares its recipient with another campaign');
  assert.deepEqual(by['demo-club-competition-travel'].problems, ['no recipient address']);
  assert.deepEqual(by['demo-event-open-mic'].problems, ['recipient not confirmed']);
  assert.match(by['demo-charity-food-drive'].problems[0], /Off the Ed25519 curve/);
  assert.deepEqual(by['demo-charity-volunteer-day'].problems, ['status is paused']);
  assert.ok(report.every((r) => !r.ready));
  const single = campaignReport([{ slug: 'demo-club-equipment', status: 'active', recipient_address: RECIPIENT, recipient_confirmed_at: '2026-11-15T10:00:00Z' }], ctx);
  assert.equal(single[0].ready, true);
});

test('confirmation SQL: one campaign, exact address, refuses unsafe input', () => {
  assert.equal(
    confirmationSql('demo-club-equipment', RECIPIENT),
    `update public.campaigns\n   set recipient_address = '${RECIPIENT}', recipient_confirmed_at = now()\n where slug = 'demo-club-equipment' and status = 'active';`,
  );
  assert.throws(() => confirmationSql("x'; drop table campaigns; --", RECIPIENT));
  assert.throws(() => confirmationSql('demo-club-equipment', "abc'; --"));
});
