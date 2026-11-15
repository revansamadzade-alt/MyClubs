#!/usr/bin/env node
// ClubFund recipient wallets: read-only checks, then the exact SQL to confirm one (which this script never runs).
//
//   node scripts/clubfund-recipient.mjs status
//       Lists every campaign and why it can or cannot take contributions (missing, invalid, unconfirmed recipient…).
//       Exit code 1 when no campaign is ready.
//
//   node scripts/clubfund-recipient.mjs check <public address> [--campaign demo-club-equipment] [--contributor <your linked wallet>]
//       Validates the address (base58, 32 bytes, on-curve wallet key, not a program, not the contributor, not used by
//       another campaign) and looks it up on Solana Devnet (read-only). Prints the SQL to set and confirm it for the
//       campaign. Apply that SQL only after you have checked the address yourself.
//
// Reads VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY from the environment or .env.local (public values; the key
// is never printed). Never asks for or accepts a recovery phrase or private key.
import { readFileSync, existsSync } from 'node:fs';
import { ed25519 } from '@noble/curves/ed25519.js';
import { base58 } from '@scure/base';
import { campaignReport, confirmationSql, validateRecipient } from './lib/recipient.mjs';

const DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const root = new URL('..', import.meta.url);

function env() {
  const out = { ...process.env };
  const file = new URL('.env.local', root);
  if (existsSync(file))
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !out[m[1]]) out[m[1]] = m[2].trim();
    }
  return out;
}

const ctx = {
  decode: (s) => base58.decode(s),
  onCurve: (bytes) => {
    try {
      ed25519.Point.fromBytes(bytes);
      return true;
    } catch {
      return false;
    }
  },
};

async function campaigns(e) {
  if (!e.VITE_SUPABASE_URL || !e.VITE_SUPABASE_PUBLISHABLE_KEY) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or create .env.local).');
  const res = await fetch(`${e.VITE_SUPABASE_URL.replace(/\/$/, '')}/rest/v1/campaigns?select=slug,title,status,recipient_address,recipient_confirmed_at&order=slug`, {
    headers: { apikey: e.VITE_SUPABASE_PUBLISHABLE_KEY, Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Could not read campaigns (HTTP ${res.status}). Are the ClubFund migrations applied?`);
  return res.json();
}

async function devnet(e, method, params) {
  const url = e.SOLANA_DEVNET_RPC_URL || e.VITE_SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com';
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(10_000) });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

async function main() {
  const [cmd, address, ...rest] = process.argv.slice(2);
  const opt = (name) => {
    const i = rest.indexOf(`--${name}`);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const e = env();

  if (cmd === 'status') {
    const report = campaignReport(await campaigns(e), ctx);
    for (const r of report) console.log(`${r.ready ? 'READY  ' : 'BLOCKED'} ${r.slug}${r.ready ? '' : ` (${r.problems.join('; ')})`}`);
    const ready = report.filter((r) => r.ready).length;
    console.log(`\n${ready} of ${report.length} campaigns can take Devnet contributions.`);
    process.exit(ready ? 0 : 1);
  }

  if (cmd === 'check' && address) {
    const slug = opt('campaign') ?? 'demo-club-equipment';
    const list = await campaigns(e);
    const target = list.find((c) => c.slug === slug);
    if (!target) throw new Error(`No published campaign "${slug}".`);
    const v = validateRecipient(address, { ...ctx, contributor: opt('contributor') ?? null, campaigns: list, slug });
    if ((await devnet(e, 'getGenesisHash', [])) !== DEVNET_GENESIS_HASH) throw new Error('The Solana endpoint is not Devnet.');
    const info = v.problems.some((p) => p.startsWith('Not')) ? null : await devnet(e, 'getAccountInfo', [address.trim(), { encoding: 'base64', commitment: 'confirmed' }]);
    if (info?.value?.executable) v.problems.push('That address is an executable program on Devnet, not a wallet.');
    else if (info?.value && info.value.owner !== '11111111111111111111111111111111') v.problems.push(`Owned by program ${info.value.owner}, not a plain wallet account.`);
    console.log(`Campaign:  ${slug} (${target.title})`);
    console.log(`Address:   ${address.trim()}`);
    console.log(`On Devnet: ${info?.value ? `exists, ${(info.value.lamports / 1e9).toFixed(4)} SOL` : 'no account yet (fine: it is created by the first transfer)'}`);
    if (!opt('contributor')) console.log('Note:      pass --contributor <your linked wallet> to check the recipient is a different account.');
    if (v.problems.length) {
      console.log(`\nNOT OK:\n- ${v.problems.join('\n- ')}`);
      process.exit(1);
    }
    console.log('\nChecks passed. Confirm in Phantom that this is an account YOU control (copy it from Phantom, never type it).');
    console.log('Then, with approval, run this in the Supabase SQL Editor (it enables contributions for this campaign only):\n');
    console.log(confirmationSql(slug, address.trim()));
    return;
  }

  console.log('Usage:\n  node scripts/clubfund-recipient.mjs status\n  node scripts/clubfund-recipient.mjs check <public address> [--campaign <slug>] [--contributor <your linked wallet>]');
  process.exit(2);
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
