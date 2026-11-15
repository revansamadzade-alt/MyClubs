// Pure checks for ClubFund recipient wallets (used by scripts/clubfund-recipient.mjs and its tests).
// A recipient must be a normal Solana wallet public key the developer controls: base58, 32 bytes, on the Ed25519 curve
// (program-derived addresses are off-curve and have no private key), not a program, not the contributing wallet, and
// not used by another campaign. These checks cannot prove who controls an address: only the owner can confirm that.

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

/**
 * @param {string} address
 * @param {{ decode: (s: string) => Uint8Array, onCurve: (bytes: Uint8Array) => boolean, contributor?: string|null,
 *   campaigns?: { slug: string, recipient_address: string|null }[], slug?: string }} ctx
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function validateRecipient(address, ctx) {
  const problems = [];
  const a = typeof address === 'string' ? address.trim() : '';
  if (!a) return { ok: false, problems: ['No address given.'] };
  if (!BASE58.test(a)) return { ok: false, problems: ['Not a Solana address: use the base58 public address (32–44 letters and digits, no 0, O, I or l).'] };
  let bytes;
  try {
    bytes = ctx.decode(a);
  } catch {
    return { ok: false, problems: ['Not valid base58.'] };
  }
  if (bytes.length !== 32) return { ok: false, problems: [`Decodes to ${bytes.length} bytes; a Solana public key is 32 bytes.`] };
  if (a === SYSTEM_PROGRAM_ID || bytes.every((b) => b === 0)) problems.push('That is the System Program address, not a wallet.');
  else if (!ctx.onCurve(bytes)) problems.push('Off the Ed25519 curve (a program-derived address): no wallet holds its key. Use a normal Phantom account address.');
  if (ctx.contributor && a === ctx.contributor.trim()) problems.push('Same as the contributing wallet. Use a different Phantom account as the recipient.');
  const other = (ctx.campaigns ?? []).find((c) => c.recipient_address === a && c.slug !== ctx.slug);
  if (other) problems.push(`Already the recipient of "${other.slug}". Each campaign needs its own recipient.`);
  return { ok: problems.length === 0, problems };
}

/**
 * Campaigns that cannot take contributions, and why.
 * @param {{ slug: string, status: string, recipient_address: string|null, recipient_confirmed_at: string|null }[]} campaigns
 * @param {{ decode: (s: string) => Uint8Array, onCurve: (bytes: Uint8Array) => boolean }} ctx
 */
export function campaignReport(campaigns, ctx) {
  return campaigns.map((c) => {
    const problems = [];
    if (!c.recipient_address) problems.push('no recipient address');
    else {
      const v = validateRecipient(c.recipient_address, { ...ctx, campaigns, slug: c.slug });
      problems.push(...v.problems);
      if (!c.recipient_confirmed_at) problems.push('recipient not confirmed');
    }
    if (c.status !== 'active') problems.push(`status is ${c.status}`);
    return { slug: c.slug, recipient: c.recipient_address, ready: problems.length === 0, problems };
  });
}

/** The approval-gated SQL that sets and confirms one campaign's recipient (never run by the script). */
export function confirmationSql(slug, address) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error('bad slug');
  if (!BASE58.test(address)) throw new Error('bad address');
  return `update public.campaigns\n   set recipient_address = '${address}', recipient_confirmed_at = now()\n where slug = '${slug}' and status = 'active';`;
}
