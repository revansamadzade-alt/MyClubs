// Re-checks hand-verified membership statements against the public Campus Pulse organization pages
// (https://umassamherst.campuslabs.com/engage/organization/<id>; never the /engage/api/ endpoints, which robots.txt
// disallows). Run: npm run check:membership
//
// For each organization with verified info in scripts/curated-clubs.json:
//   confirmed   – the quoted evidence is still on the page: `lastChecked` is set to today (curated file + snapshot).
//   changed     – the page no longer contains the quote: flagged for manual review. The verified info is NOT changed.
//   unavailable – the page could not be read: nothing changes.
// It also lists membership wording found on curated organizations that have no verified info yet (leads only).
// Nothing is ever marked application-required automatically; a person updates curated-clubs.json after reviewing.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkMembershipEvidence, membershipLeads, stripHtml } from './lib/feeds.mjs';

const CP = 'https://umassamherst.campuslabs.com/engage';
const CURATED_FILE = fileURLToPath(new URL('./curated-clubs.json', import.meta.url));
const SNAPSHOT_FILE = fileURLToPath(new URL('../src/data/generated/campus-data.json', import.meta.url));
const today = new Date().toISOString().slice(0, 10);

function pageText(html) {
  const i = html.indexOf('window.initialAppState');
  if (i < 0) return '';
  const s = html.indexOf('{', i);
  let depth = 0;
  let j = s;
  for (; j < html.length; j++) {
    if (html[j] === '{') depth++;
    else if (html[j] === '}' && --depth === 0) break;
  }
  const org = JSON.parse(html.slice(s, j + 1)).preFetchedData?.organization;
  return org ? `${stripHtml(org.summary ?? '')} ${stripHtml(org.description ?? '')}` : '';
}

async function fetchPage(id) {
  const r = await fetch(`${CP}/organization/${id}`, {
    headers: { 'User-Agent': 'MyClubs HackUMass prototype (membership re-check)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return pageText(await r.text());
}

const curated = JSON.parse(readFileSync(CURATED_FILE, 'utf8'));
const report = { confirmed: [], changed: [], unavailable: [], leads: [] };
for (const c of curated) {
  let text = '';
  try {
    text = await fetchPage(c.id);
  } catch (e) {
    if (c.application) report.unavailable.push(`${c.id} (${e.message})`);
    continue;
  }
  if (c.application) {
    const result = checkMembershipEvidence(text, c.application.evidence);
    report[result].push(c.id);
    if (result === 'confirmed') c.application.lastChecked = today;
  } else {
    for (const lead of membershipLeads(text).slice(0, 3)) report.leads.push(`${c.id}: ${lead.slice(0, 200)}`);
  }
  await new Promise((r) => setTimeout(r, 300)); // be gentle with the public site
}

writeFileSync(CURATED_FILE, `${JSON.stringify(curated, null, 1)}\n`);
// Keep the committed snapshot in step (the same copy `npm run sync:data` makes).
const snapshot = JSON.parse(readFileSync(SNAPSHOT_FILE, 'utf8'));
for (const c of curated) {
  const club = snapshot.clubs.find((x) => x.id === c.id);
  if (club && c.application) club.application = c.application;
}
writeFileSync(SNAPSHOT_FILE, `${JSON.stringify(snapshot, null, 1)}\n`);

console.log(`Membership re-check ${today}`);
console.log(`  confirmed (lastChecked updated): ${report.confirmed.join(', ') || 'none'}`);
console.log(`  CHANGED — review by hand, verified info left as is: ${report.changed.join(', ') || 'none'}`);
console.log(`  unavailable (nothing changed): ${report.unavailable.join(', ') || 'none'}`);
console.log(`  leads on organizations without verified info (verify before adding anything):`);
for (const l of report.leads) console.log(`    - ${l}`);
if (report.changed.length) process.exitCode = 2;
