// MyClubs end-to-end browser QA: headless Chrome via the DevTools Protocol, no extra dependencies.
// Usage: start the app (npm run dev), then `npm run test:e2e`.
// Env: MYCLUBS_BASE_URL (default http://localhost:5173), CHROME_PATH, MYCLUBS_TEST_NOW (default 2026-11-13T12:00:00),
//      MYCLUBS_TEST_TZ (default America/New_York). The page clock is fixed so results do not depend on today's date.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.MYCLUBS_BASE_URL ?? 'http://localhost:5173';
const TEST_NOW = process.env.MYCLUBS_TEST_NOW ?? '2026-11-13T12:00:00';
const TEST_TZ = process.env.MYCLUBS_TEST_TZ ?? 'America/New_York';
const OUT = fileURLToPath(new URL('./output/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const CHROME =
  process.env.CHROME_PATH ??
  [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find((p) => existsSync(p));
if (!CHROME) throw new Error('Chrome not found. Set CHROME_PATH.');
try {
  await fetch(BASE);
} catch {
  throw new Error(`App not reachable at ${BASE}. Start it with npm run dev.`);
}

const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const consoleIssues = new Set();
const check = (area, name, pass, detail = '') => results.push({ area, name, pass: !!pass, detail: String(detail ?? '').slice(0, 220) });

const chrome = spawn(
  CHROME,
  ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'myclubs-qa-'))}`, '--disable-gpu', '--no-first-run', '--no-default-browser-check', ...(process.env.CI ? ['--no-sandbox'] : []), 'about:blank'],
  { stdio: 'ignore' },
);

async function json(path, method = 'GET') {
  for (let i = 0; i < 80; i++) {
    try { return await (await fetch(`http://127.0.0.1:${PORT}${path}`, { method })).json(); } catch { await sleep(250); }
  }
  throw new Error('chrome not reachable');
}

/** Fixed-offset clock: time still advances, but starts at `iso` (local time in the emulated time zone). */
const clockScript = (iso) => `(() => {
  const RealDate = Date; const offset = new RealDate(${JSON.stringify(iso)}).getTime() - RealDate.now();
  class TestDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(RealDate.now() + offset); else super(...a); }
    static now() { return RealDate.now() + offset; }
  }
  globalThis.Date = TestDate;
})();`;

/** A DevTools connection to one tab, with the fixed clock and time zone applied. */
async function connect(wsUrl, onEvent) {
  const sock = new WebSocket(wsUrl);
  await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
  let n = 0;
  const waiting = new Map();
  const call = (method, params = {}) => new Promise((res) => { const id = ++n; waiting.set(id, res); sock.send(JSON.stringify({ id, method, params })); });
  sock.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); return; }
    onEvent?.(m, call);
  };
  await call('Page.enable');
  await call('Runtime.enable');
  await call('Emulation.setTimezoneOverride', { timezoneId: TEST_TZ });
  let clockId = (await call('Page.addScriptToEvaluateOnNewDocument', { source: clockScript(TEST_NOW) })).result.identifier;
  const setClock = async (iso) => {
    await call('Page.removeScriptToEvaluateOnNewDocument', { identifier: clockId });
    clockId = (await call('Page.addScriptToEvaluateOnNewDocument', { source: clockScript(iso) })).result.identifier;
  };
  return { sock, call, setClock };
}

const target = (await json('/json/list')).find((t) => t.type === 'page');
const main = await connect(target.webSocketDebuggerUrl, (m, call) => {
  if (m.method === 'Runtime.exceptionThrown') consoleIssues.add('EXCEPTION ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300));
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(m.params.type))
    consoleIssues.add(m.params.type.toUpperCase() + ' ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  if (m.method === 'Page.javascriptDialogOpening') call('Page.handleJavaScriptDialog', { accept: true });
});
const ws = main.sock;
const send = main.call;
const setClock = main.setClock;

const HELPERS = `
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const byText = (sel, text, r = document) => $$(sel, r).find(e => e.textContent.trim().includes(text));
const typeInto = (el, value) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
};
const cards = () => $$('main article').filter(a => !a.querySelector('article'));
const cardTitles = () => cards().map(a => a.querySelector('h3 a')?.textContent.trim()).filter(Boolean);
const card = (title) => cards().find(a => a.querySelector('h3')?.textContent.trim() === title);
const ls = (k) => JSON.parse(localStorage.getItem(k) ?? 'null');
`;

async function evalIn(call, expr) {
  const r = await call('Runtime.evaluate', { expression: `(async () => { ${HELPERS}\n${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) {
    const d = r.result.exceptionDetails;
    // First line of the error plus the start of the failing expression, so a crash names its step.
    throw new Error(`${String(d.exception?.description ?? d.text).split('\n')[0]} — in: ${expr.slice(0, 140)}`);
  }
  return r.result?.result?.value;
}
const ev = (expr) => evalIn(send, expr);
async function waitFor(expr, timeout = 4000, call = send) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { if (await evalIn(call, `return !!(${expr})`)) return true; } catch {}
    await sleep(80);
  }
  return false;
}
// Resolves once the DOM has been quiet for a moment (capped): waits for React to finish, not for a fixed time.
const QUIET = `await new Promise((res) => { let t; const loading = () => [...document.querySelectorAll('[role=status]')].some((e) => e.textContent.trim() === 'Loading…'); const done = (force) => { if (!force && loading()) { t = setTimeout(done, 60); return; } obs.disconnect(); clearTimeout(t); clearTimeout(cap); res(true); }; const obs = new MutationObserver(() => { clearTimeout(t); t = setTimeout(done, 120); }); obs.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true }); t = setTimeout(done, 120); const cap = setTimeout(() => done(true), 8000); }); return true`;
async function settle(call = send) { try { await evalIn(call, QUIET); } catch {} }
// Ready = the new document (the old one is marked before navigating), a page heading, and no lazy-loading placeholder.
const ready = `document.readyState === 'complete' && !window.__leaving && document.querySelector('main h1, main h2') && ![...document.querySelectorAll('main [role=status]')].some((e) => e.textContent.trim() === 'Loading…')`;
const markLeaving = (call) => evalIn(call, 'window.__leaving = true; return true').catch(() => {});
async function goto(path, call = send) { await markLeaving(call); await call('Page.navigate', { url: BASE + path }); await waitFor(ready, 8000, call); await settle(call); }
async function reload() { await markLeaving(send); await send('Page.reload', {}); await waitFor(ready, 8000); await settle(); }
async function click(expr, _legacy, call = send) { await evalIn(call, `const el = ${expr}; if (!el) throw new Error('not found: ' + ${JSON.stringify(expr)}); el.click(); return true`); await settle(call); }
const path = () => ev(`return location.pathname + location.search`);
async function viewport(width, height = 900) { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 }); }
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64')); }
async function section(area, fn) { try { await fn(); } catch (e) { check(area, 'section crashed', false, e.message); } }

await viewport(1440);
await goto('/');
await ev(`localStorage.clear(); return true`);

const esc = async () => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await settle(); };
const view = (v) => `byText('[aria-label="Calendar view"] button', ${JSON.stringify(v)})`;
const chips = (t) => `$$('main button[aria-label]').filter(b => b.getAttribute('aria-label').startsWith(${JSON.stringify(t + '.')}))`;
const labels = (t) => ev(`return ${chips(t)}.map(b => b.getAttribute('aria-label'))`);
const dayLabel = (n) => `(() => { const d = new Date(); d.setDate(d.getDate() + ${n}); return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }); })()`;
const inAgendaDay = (t, n) => ev(`const day = ${dayLabel(n)}; const sec = $$('main section[aria-labelledby^="day-"]').find(s => s.querySelector('h3').textContent.includes(day)); return !!sec && $$('button', sec).some(b => b.textContent.trim() === ${JSON.stringify(t)})`);
const panel = () => ev(`const h = $('#overlaps-heading'); return h ? $$('li', h.parentElement).map(li => li.textContent.replace(/\\s+/g, ' ')) : []`);
const countDow = (dows, days = 14) => ev(`let n = 0; for (let i = 0; i < ${days}; i++) { const d = new Date(); d.setDate(d.getDate() + i); if (${JSON.stringify(dows)}.includes(d.getDay())) n++; } return n`);
const profileFollow = `$('main header button[aria-pressed]')`;

// 1. Search
await section('1 Search', async () => {
  await goto('/clubs/discover');
  const search = async (q) => { await ev(`typeInto($('main input[type=search]'), ${JSON.stringify(q)}); return true`); await settle(); return ev(`return cardTitles()`); };
  let n = await search('robot');
  check('1 Search', 'name match "robot"', JSON.stringify(n) === '["UMass Robotics Club"]', n);
  check('1 Search', 'query stored in URL', (await path()).includes('q=robot'));
  n = await search('cappella');
  check('1 Search', 'description keyword "cappella"', JSON.stringify(n) === '["Vocal Suspects"]', n);
  n = await search('CHESS');
  check('1 Search', 'case-insensitive "CHESS"', JSON.stringify(n) === '["Chess Club"]', n);
  n = await search('consulting non-profits');
  check('1 Search', 'multi-term search', JSON.stringify(n) === '["180 Degrees Consulting"]', n);
  n = await search('radio');
  check('1 Search', 'keyword "radio"', JSON.stringify(n) === '["WMUA Radio Station"]', n);
  n = await search('zzzz');
  check('1 Search', 'no-match empty state', n.length === 0 && (await ev(`return document.body.textContent.includes('No organizations match')`)));
  await click(`byText('main button', 'Clear filters')`);
  await waitFor(`cardTitles().length > 50`, 4000);
  const totalClubs = await ev(`return (+((document.body.textContent.match(/Showing (\\d+) of \\1 organizations/) || [])[1] || 0))`);
  check('1 Search', `Clear filters restores all (${totalClubs})`, totalClubs >= 50 && (await ev(`return cardTitles().length`)) === totalClubs && (await ev(`return $('main input[type=search]').value === ''`)));
  check('1 Search', 'result count text matches cards', await ev(`return (+((document.body.textContent.match(/Showing (\\d+) of \\1 organizations/) || [])[1] || 0)) === cardTitles().length`));
});

// 2. Category
await section('2 Category', async () => {
  await goto('/clubs/discover');
  const chip = (t) => `byText('[aria-label="Filter by category"] button', ${JSON.stringify(t)})`;
  await click(chip('Engineering'));
  let n = (await ev(`return cardTitles()`)).sort();
  check('2 Category', 'Engineering → 3 correct clubs', JSON.stringify(n) === JSON.stringify(['3D Printing Club', 'Engineers Without Borders', 'UMass Robotics Club']), n);
  check('2 Category', 'chip aria-pressed', await ev(`return ${chip('Engineering')}.getAttribute('aria-pressed') === 'true'`));
  await ev(`typeInto($('main input[type=search]'), 'printers'); return true`); await waitFor(`cardTitles().length === 1`, 4000);
  n = await ev(`return cardTitles()`);
  check('2 Category', 'category + search combine', JSON.stringify(n) === '["3D Printing Club"]', n);
  await ev(`typeInto($('main input[type=search]'), ''); return true`); await waitFor(`cardTitles().length > 1`, 4000);
  await click(chip('Business'));
  n = (await ev(`return cardTitles()`)).sort();
  check('2 Category', 'Business includes curated business clubs', ['180 Degrees Consulting', 'Accounting Association', 'Isenberg Investment Club', 'Isenberg Sustainability Club'].every((x) => n.includes(x)) && (await ev(`return cards().every(c => c.textContent.includes('Business'))`)), n);
  check('2 Category', 'chip counts add up to the directory', await ev(`const chips = $$('[aria-label="Filter by category"] button'); const all = +chips[0].textContent.match(/(\\d+)/)[1]; return chips.slice(1).reduce((s, c) => s + +c.textContent.match(/(\\d+)\\s*$/)[1], 0) === all`));
  await click(chip('All'));
  await waitFor(`cardTitles().length > 50`, 4000);
  check('2 Category', 'All → full directory', (await ev(`return cardTitles().length`)) === (await ev(`return (+((document.body.textContent.match(/Showing (\\d+) of \\1 organizations/) || [])[1] || 0))`)));
});

// 3. Sort + show
await section('3 Sort', async () => {
  await goto('/clubs/discover');
  let n = await ev(`return cardTitles()`);
  check('3 Sort', 'default A–Z', JSON.stringify(n) === JSON.stringify([...n].sort((a, b) => a.localeCompare(b))), n.slice(0, 3));
  await ev(`typeInto($$('main select')[1], 'name-desc'); return true`);
  await waitFor(`cardTitles()[0].localeCompare(cardTitles().at(-1)) > 0`, 3000);
  n = await ev(`return cardTitles()`);
  check('3 Sort', 'Z–A', JSON.stringify(n) === JSON.stringify([...n].sort((a, b) => b.localeCompare(a))) && n[0].localeCompare(n.at(-1)) > 0, n.slice(0, 3));
  check('3 Sort', 'sort stored in URL', (await path()).includes('sort=name-desc'));
  await ev(`typeInto($$('main select')[1], 'name'); return true`); await waitFor(`cardTitles()[0].localeCompare(cardTitles().at(-1)) < 0`, 4000);
  await ev(`typeInto($$('main select')[0], 'following'); return true`); await waitFor(`cardTitles().length < 10`, 4000);
  n = await ev(`return cardTitles()`);
  check('3 Sort', 'Show: Following (seeded 2)', JSON.stringify(n) === JSON.stringify(['Chess Club', 'UMass Robotics Club']), n);
  await ev(`typeInto($$('main select')[0], 'not'); return true`); await waitFor(`cardTitles().length > 50`, 4000);
  check('3 Sort', 'Show: Not following → all but 2', await ev(`const all = +((document.body.textContent.match(/of (\\d+) organizations/) || [])[1] || 0); return all >= 50 && cardTitles().length === all - 2`));
});

// 4. Profile
await section('4 Profile', async () => {
  await goto('/clubs/discover?cat=Technology');
  await click(`card('Women in Cybersecurity at UMass Amherst').querySelector('h3 a')`);
  await waitFor(`location.pathname === '/clubs/discover/womenincybersecurity'`);
  check('4 Profile', 'card title opens profile', (await path()) === '/clubs/discover/womenincybersecurity', await path());
  check('4 Profile', 'profile h1 + document.title', await ev(`return $('main h1').textContent.trim() === 'Women in Cybersecurity at UMass Amherst' && document.title.startsWith('Women in Cybersecurity')`));
  check('4 Profile', 'breadcrumb shows club', await ev(`return $('nav[aria-label=Breadcrumb]').textContent.includes('Women in Cybersecurity')`));
  check('4 Profile', 'Campus Pulse source link', await ev(`return $$('main a').some(a => a.href === 'https://umassamherst.campuslabs.com/engage/organization/womenincybersecurity' && a.target === '_blank' && a.rel.includes('noopener'))`));
  check('4 Profile', 'missing schedule labeled', await ev(`const t = $('main').textContent; return t.includes('No verified meeting schedule') && t.includes('Meets weekly (day and time not listed)') && t.includes('Location not listed')`));
  check('4 Profile', 'no events labeled, links to Campus Pulse events', await ev(`return $('main').textContent.includes('No verified upcoming events yet') && $$('main a').some(a => a.href.endsWith('/organization/womenincybersecurity/events'))`));
  await click(`byText('main a', 'All organizations')`);
  check('4 Profile', '"All organizations" link keeps filters', (await path()) === '/clubs/discover?cat=Technology', await path());
  await click(`card('Women in Cybersecurity at UMass Amherst').querySelector('a.btn')`);
  check('4 Profile', '"View profile" button opens profile', (await path()) === '/clubs/discover/womenincybersecurity');
  await ev(`history.back(); return true`); await waitFor(`location.pathname === '/clubs/discover'`, 4000); await settle();
  check('4 Profile', 'browser Back keeps filters', (await path()) === '/clubs/discover?cat=Technology', await path());
  await goto('/clubs/discover/chessclub');
  check('4 Profile', 'verified schedule shown with next meeting', await ev(`const t = $('main').textContent; return t.includes('Mondays') && t.includes('Thursdays') && t.includes('6:00 – 9:00 PM') && t.includes('Next meeting') && t.includes('Blue Wall')`));
  await click(`byText('nav[aria-label=Breadcrumb] a', 'Discover')`);
  check('4 Profile', 'breadcrumb Discover link', (await path()) === '/clubs/discover');
  await goto('/clubs/discover/does-not-exist');
  check('4 Profile', 'unknown club → not-found state', await ev(`return document.body.textContent.includes('Organization not found')`));
});

// 5 + 6. Follow + My Clubs
await section('5 Follow', async () => {
  await goto('/clubs/discover');
  const btn = (t) => `card(${JSON.stringify(t)}).querySelector('button[aria-pressed]')`;
  const navCount = `(($('#clubs-nav').textContent.match(/My Clubs & Associations(\\d+)/) || [])[1] || '0')`;
  await click(btn('Vocal Suspects'));
  check('5 Follow', 'Follow → pressed + "Following"', await ev(`const b = ${btn('Vocal Suspects')}; return b.getAttribute('aria-pressed') === 'true' && b.textContent.includes('Following')`));
  check('5 Follow', 'toast announced', await ev(`return $('[role=status]').textContent.includes('Following Vocal Suspects')`));
  check('5 Follow', 'side-nav count 2 → 3', (await ev(`return ${navCount}`)) === '3');
  check('5 Follow', 'localStorage updated', (await ev(`return ls('myclubs:followed')`)).includes('thevocalsuspects'));
  await click(btn('Vocal Suspects'));
  check('5 Follow', 'Unfollow → unpressed, count 2', (await ev(`return ${btn('Vocal Suspects')}.getAttribute('aria-pressed')`)) === 'false' && (await ev(`return ${navCount}`)) === '2');
  await goto('/clubs/discover/umoc');
  await click(profileFollow);
  check('5 Follow', 'Follow from profile page', (await ev(`return ${profileFollow}.getAttribute('aria-pressed')`)) === 'true');

  await click(`byText('#clubs-nav a', 'My Clubs')`);
  check('6 My Clubs', 'side nav → /clubs/following', (await path()) === '/clubs/following');
  const listed = await ev(`return $$('main section')[0].textContent`);
  check('6 My Clubs', 'followed clubs listed', ['Outing Club', 'Chess Club', 'UMass Robotics Club'].every((c) => listed.includes(c)), listed.slice(0, 120));
  check('6 My Clubs', 'count "You follow 3 clubs"', await ev(`return $('main').textContent.includes('You follow 3 clubs')`));
  check('6 My Clubs', 'missing schedule labeled in list', await ev(`return $$('main section')[0].textContent.includes('Meeting times not listed')`));
  check('6 My Clubs', 'feed: verified meetings + verified events only', await ev(`const t = $('#upcoming-heading').parentElement.textContent; return t.includes('Chess Club') && t.includes('Wilderness First Aid Course') && !t.includes('UMass Robotics Club') && !t.includes('Outing Club · ')`));
  const unfollowRow = `byText('button', 'Unfollow', $$('main li').find(li => li.textContent.includes('Outing Club') && byText('button', 'Unfollow', li)))`;
  await click(unfollowRow);
  check('6 My Clubs', 'Unfollow from My Clubs removes row', await ev(`return !$$('main section')[0].textContent.includes('Outing Club') && $('main').textContent.includes('You follow 2 clubs')`));
  await click(`byText('main a', 'Open profile')`);
  check('6 My Clubs', '"Open profile" works', (await path()).startsWith('/clubs/discover/'));
  await goto('/clubs/following');
  for (let i = 0; i < 3; i++) if (await ev(`return !!byText('main button', 'Unfollow')`)) await click(`byText('main button', 'Unfollow')`);
  check('6 My Clubs', 'empty state when none followed', await ev(`return $('main').textContent.includes("You're not following any clubs yet")`));
});

// 8 + 9. Save + where saved events appear
await section('8 Save', async () => {
  await ev(`localStorage.clear(); return true`);
  await goto('/clubs/events');
  const sbtn = (t) => `card(${JSON.stringify(t)}).querySelector('button[aria-pressed]')`;
  const tab = (t) => `byText('[aria-label="Event lists"] button', ${JSON.stringify(t)})`;
  check('8 Save', 'tabs initial: Saved (2)', await ev(`return ${tab('Saved')}.textContent.includes('(2)')`), await ev(`return $('[aria-label="Event lists"]').textContent`));
  check('8 Save', 'long list is paged (fast) with Show more', await ev(`return cards().length <= 40 && !!byText('main button', 'Show') && byText('main button', 'Show').textContent.includes('more')`));
  check('8 Save', 'every event card labeled verified XOR sample', await ev(`return cards().every(c => c.textContent.includes('Verified · ') !== c.textContent.includes('Sample event'))`));
  check('8 Save', 'sample cards never link to clubs; club-linked cards are verified', await ev(`return cards().every(c => !$$('a', c).some(a => a.pathname.startsWith('/clubs/discover/')) || c.textContent.includes('Verified · '))`));
  check('8 Save', 'both public sources credited', await ev(`const t = $('aside[aria-label="Data sources"]').textContent; return t.includes('Campus Pulse public events RSS') && t.includes('UMass Amherst Events Calendar')`));
  check('8 Save', 'data source note says snapshot, not live', await ev(`const n = $('aside[aria-label="Data sources"]'); return !!n && n.textContent.includes('snapshot, not live') && n.textContent.includes('updated')`));
  await ev(`typeInto($$('main select')[1], 'verified'); return true`); await waitFor(`cards().length > 0 && cards().every(c => c.textContent.includes('Verified · '))`, 4000);
  const vc = await ev(`return { n: cards().length, all: cards().every(c => c.textContent.includes('Verified · ')) }`);
  check('8 Save', `source filter: verified only (${vc.n})`, vc.all && vc.n >= 15, JSON.stringify(vc));
  await goto('/clubs/events?src=sample&q=capture');
  await click(sbtn('Capture the Flag Practice Night'));
  check('8 Save', 'Save → pressed + Saved (3)', await ev(`return ${sbtn('Capture the Flag Practice Night')}.getAttribute('aria-pressed') === 'true' && ${tab('Saved')}.textContent.includes('(3)')`));
  check('8 Save', 'localStorage savedEvents', (await ev(`return ls('myclubs:savedEvents')`)).includes('ev-ctf'));
  await click(sbtn('Capture the Flag Practice Night'));
  check('8 Save', 'Unsave → Saved (2)', await ev(`return ${sbtn('Capture the Flag Practice Night')}.getAttribute('aria-pressed') === 'false' && ${tab('Saved')}.textContent.includes('(2)')`));
  await click(sbtn('Capture the Flag Practice Night'));
  await goto('/clubs/events/ev-ctf');
  check('8 Save', 'detail page reflects saved state', (await ev(`return $('main header button[aria-pressed]').getAttribute('aria-pressed')`)) === 'true');
  await click(`$('main header button[aria-pressed]')`);
  await click(`$('main header button[aria-pressed]')`);
  check('8 Save', 'detail page toggle twice → saved', (await ev(`return ls('myclubs:savedEvents')`)).includes('ev-ctf'));

  await goto('/clubs/events');
  await click(tab('Saved'));
  const t = (await ev(`return cardTitles()`)).sort();
  check('9 Saved views', 'Saved tab lists saved events', JSON.stringify(t) === JSON.stringify(['Capture the Flag Practice Night', 'Fall A Cappella Showcase', 'Fall Career & Internship Fair']), t);
  await click(tab('From clubs'));
  check('9 Saved views', 'From-clubs tab = only followed clubs\' verified events', await ev(`return cardTitles().length === 0 ? $('main').textContent.includes('No verified events from the clubs you follow yet') : cards().every(c => c.textContent.includes('Verified · ') && $$('a', c).some(a => ['/clubs/discover/chessclub', '/clubs/discover/roboticsclub'].includes(a.pathname)))`));
  await goto('/clubs/campus-life');
  await click(view('Agenda'));
  const life = await ev(`return $('main').textContent`);
  check('9 Saved views', 'Campus Life shows saved events', ['Capture the Flag Practice Night', 'Fall Career & Internship Fair', 'Fall A Cappella Showcase'].every((x) => life.includes(x)));
  check('9 Saved views', 'Campus Life shows verified meetings (Chess Club)', (await labels('Chess Club')).length === (await countDow([1, 4])));
  check('9 Saved views', 'no meetings for club without schedule (Robotics)', (await labels('UMass Robotics Club')).length === 0);
  check('9 Saved views', 'Campus Life shows academic items', life.includes('HW 6: Graph Algorithms'));
  check('9 Saved views', 'Overlaps detected', life.includes('Schedule overlaps') && /\d+Upcoming conflicts?/.test(life));
  await click(`byText('main button', 'Saved events')`);
  check('9 Saved views', 'Kind toggle hides saved events', !(await ev(`return $$('main button[aria-label]').some(b => b.getAttribute('aria-label').startsWith('Capture the Flag'))`)));
  await click(`byText('main button', 'Saved events')`);
  await goto('/clubs/events/ev-robot-demo');
  await click(`$('main header button[aria-pressed]')`);
  await goto('/clubs/campus-life');
  await click(view('Week'));
  const w0 = await ev(`return $('main').textContent.includes('Robot Showcase & Demo Day')`);
  await click(`$('main button[aria-label="Next week"]')`);
  const w1 = await ev(`return $('main').textContent.includes('Robot Showcase & Demo Day')`);
  check('9 Saved views', 'week navigation (day-8 event in next week)', !w0 && w1, `w0=${w0} w1=${w1}`);

  await goto('/clubs/events?src=sample');
  await ev(`typeInto($('main input[type=search]'), 'pizza'); return true`); await waitFor(`cardTitles().length < 5`, 4000);
  let r = await ev(`return cardTitles()`);
  check('8 Save', 'event search "pizza"', JSON.stringify(r) === '["Intro to Hackathons Workshop"]', r);
  await ev(`typeInto($('main input[type=search]'), ''); return true`); await waitFor(`cardTitles().length > 1`, 4000);
  const allSample = await ev(`return cardTitles().length`);
  await click(`byText('[aria-label="Filter by category"] button', 'Gaming')`);
  await waitFor(`cardTitles().length < ${allSample}`, 4000);
  r = await ev(`return cardTitles()`);
  check('8 Save', 'event category Gaming', JSON.stringify(r) === '["Smash Bros. Fall Tournament"]', r);
  await click(`byText('[aria-label="Filter by category"] button', 'All')`);
  await waitFor(`cardTitles().length === ${allSample}`, 4000);
  await ev(`typeInto($('main select'), 'week'); return true`); await waitFor(`cardTitles().length < ${allSample}`, 4000);
  const wk = await ev(`return cardTitles().length`);
  await ev(`typeInto($('main select'), 'two-weeks'); return true`); await waitFor(`cardTitles().length > ${wk}`, 4000);
  const two = await ev(`return cardTitles().length`);
  check('8 Save', 'date filter 7d=13 / 14d=21 (sample events)', wk === 13 && two === 21, `7d=${wk} 14d=${two}`);
});

// 7. Persistence + reviews + reset + corrupt/legacy storage
await section('7 Persist', async () => {
  await goto('/clubs/discover/activeminds');
  await click(profileFollow);
  await click(`byText('main button', 'Post review')`);
  check('7 Persist', 'review: rating required', await ev(`return $('[role=alert]')?.textContent.includes('Choose a star rating')`));
  await click(`$$('main fieldset input[type=radio]')[3]`);
  await ev(`typeInto($('main textarea'), 'short'); return true`);
  await click(`byText('main button', 'Post review')`);
  check('7 Persist', 'review: min length enforced', await ev(`return $('[role=alert]')?.textContent.includes('at least 10')`));
  await ev(`typeInto($('main textarea'), 'QA review: welcoming discussion meetings.'); return true`);
  await click(`byText('main button', 'Post review')`);
  check('7 Persist', 'review posted + avg 4.0', await ev(`return $('main').textContent.includes('QA review: welcoming discussion') && $('main').textContent.includes('4.0')`));
  await reload();
  check('7 Persist', 'reload: follow persisted', (await ev(`return ${profileFollow}.getAttribute('aria-pressed')`)) === 'true');
  check('7 Persist', 'reload: review persisted', await ev(`return $('main').textContent.includes('QA review: welcoming discussion')`));
  await goto('/clubs/events');
  check('7 Persist', 'reload: saved events persisted', await ev(`return byText('[aria-label="Event lists"] button', 'Saved').textContent.includes('(4)')`), await ev(`return $('[aria-label="Event lists"]').textContent`));
  await goto('/clubs/discover/activeminds');
  await click(`byText('main button', 'Delete')`);
  check('7 Persist', 'review delete', !(await ev(`return $('main').textContent.includes('QA review: welcoming discussion')`)));
  await ev(`window.confirm = () => true; return true`);
  await click(`byText('header button', 'Reset demo')`);
  check('7 Persist', 'Reset demo restores seeds', JSON.stringify(await ev(`return ls('myclubs:followed')`)) === JSON.stringify(['chessclub', 'roboticsclub']) && JSON.stringify(await ev(`return ls('myclubs:savedEvents')`)) === JSON.stringify(['ev-career-fair', 'ev-acappella']));
  await ev(`localStorage.setItem('myclubs:followed', '{"bad":true}'); localStorage.setItem('myclubs:savedEvents', 'null'); return true`);
  await reload();
  check('7 Persist', 'corrupted localStorage does not crash', await ev(`return !!$('main h1')`));
  await ev(`localStorage.setItem('myclubs:followed', JSON.stringify(['robotics', 'hack-collective', 'chess', 'chess'])); return true`);
  await goto('/clubs/following');
  check('7 Persist', 'removed demo follows are announced', await ev(`return $('[role=status]').textContent.includes('Removed 1 fictional demo club')`), await ev(`return $('[role=status]').textContent`));
  check('7 Persist', 'legacy follows migrate to real equivalents', JSON.stringify(await ev(`return ls('myclubs:followed')`)) === JSON.stringify(['roboticsclub', 'chessclub']) && (await ev(`return $('main').textContent.includes('You follow 2 clubs')`)), JSON.stringify(await ev(`return ls('myclubs:followed')`)));
  await ev(`localStorage.setItem('myclubs:followed', JSON.stringify(['hack-collective', 'data-science'])); return true`);
  await reload();
  check('7 Persist', 'old default follows replaced by new defaults', JSON.stringify(await ev(`return ls('myclubs:followed')`)) === JSON.stringify(['chessclub', 'roboticsclub']));
  await ev(`localStorage.clear(); return true`);
});

// 13. Real-data integrity across all profiles
await section('13 Real data', async () => {
  await goto('/clubs/discover');
  const ids = await ev(`return cards().map(c => c.querySelector('h3 a').getAttribute('href').split('/').pop())`);
  check('13 Real data', `${ids.length} organizations, all Campus Pulse badged`, ids.length >= 50 && ids.length <= 100 && (await ev(`return cards().every(c => c.textContent.includes('Campus Pulse'))`)), ids.length);
  let bad = [];
  for (const id of ids) {
    await goto(`/clubs/discover/${id}`);
    const ok = await ev(`const t = $('main').textContent; const a = $$('main a'); return a.some(x => x.href.startsWith('https://umassamherst.campuslabs.com/engage/')) && !a.some(x => x.href.startsWith('mailto:')) && !/\\d+ members/.test(t) && t.includes('Source: Campus Pulse listing, retrieved')`);
    if (!ok) bad.push(id);
  }
  check('13 Real data', 'every profile: source link, retrieval date, no emails, no member counts', bad.length === 0, bad);
  await ev(`localStorage.setItem('myclubs:followed', JSON.stringify(${JSON.stringify(ids)})); localStorage.setItem('myclubs:savedEvents', '[]'); return true`);
  await goto('/clubs/campus-life');
  await click(view('Agenda'));
  const meetingTitles = await ev(`return [...new Set($$('main button[aria-label]').map(b => b.getAttribute('aria-label')).filter(l => l.includes('. Club meeting.')).map(l => l.split('. Club meeting.')[0]))]`);
  check('13 Real data', 'following all 20: only fully listed schedules generate meetings', JSON.stringify(meetingTitles.sort()) === JSON.stringify(['Accounting Association', 'Chess Club']), meetingTitles);
  const expected = (await countDow([1, 4])) + (await countDow([3]));
  const got = await ev(`return $$('main button[aria-label]').filter(b => b.getAttribute('aria-label').includes('. Club meeting.')).length`);
  check('13 Real data', `meeting occurrences match listed weekdays (${got}/${expected})`, got === expected);
  await ev(`localStorage.clear(); return true`);
});

// 10. Navigation
await section('10 Nav', async () => {
  await goto('/');
  await click(`byText('nav[aria-label="Global navigation"] a', 'MyClubs')`);
  await waitFor(`location.pathname === '/clubs/discover'`);
  check('10 Nav', 'global MyClubs → /clubs/discover', (await path()) === '/clubs/discover');
  for (const [label, p, h1] of [['My Clubs & Associations', '/clubs/following', 'My Clubs & Associations'], ['Campus Events', '/clubs/events', 'Campus Events'], ['My Campus Life', '/clubs/campus-life', 'My Campus Life'], ['Discover', '/clubs/discover', 'Discover Student Organizations']]) {
    await click(`byText('#clubs-nav a', ${JSON.stringify(label)})`);
    await waitFor(`$('main h1')?.textContent.trim() === ${JSON.stringify(h1)}`);
    const ok = (await path()) === p && (await ev(`return $('main h1').textContent.trim() === ${JSON.stringify(h1)} && byText('#clubs-nav a', ${JSON.stringify(label)}).getAttribute('aria-current') === 'page' && byText('nav[aria-label="Global navigation"] a', 'MyClubs').getAttribute('aria-current') === 'page'`));
    check('10 Nav', `side nav → ${label} (+active states)`, ok, await path());
  }
  await goto('/clubs/events/ev-ctf');
  check('10 Nav', 'event breadcrumb trail', await ev(`return $('nav[aria-label=Breadcrumb]').textContent.replace(/\\s+/g, ' ').includes('MyClubsCampus EventsCapture the Flag')`));
  await click(`byText('nav[aria-label=Breadcrumb] a', 'Campus Events')`);
  check('10 Nav', 'breadcrumb back to Campus Events', (await path()) === '/clubs/events');
  await click(`$('header button[aria-controls=clubs-nav]')`);
  check('10 Nav', 'collapse section nav', !(await ev(`return !!$('#clubs-nav')`)));
  await click(`$('header button[aria-controls=clubs-nav]')`);
  await goto('/');
  await click(`byText('main a', 'Show all in My Campus Life')`);
  check('10 Nav', 'Dashboard → My Campus Life link', (await path()) === '/clubs/campus-life');
  await goto('/calendar');
  check('10 Nav', 'placeholder page renders', await ev(`return $('main').textContent.includes('Prototype section')`));
  await goto('/nope');
  check('10 Nav', '404 route renders', await ev(`return $('main').textContent.includes('Page not found')`));
  await viewport(375, 812);
  await goto('/');
  const burger = `$('button[aria-label="Open global navigation"]')`;
  const openDrawer = async () => { await ev(`${burger}.focus(); ${burger}.click(); return true`); await waitFor(`$('#mobile-nav').open`, 3000); await settle(); };
  const key = async (k, code, vk) => { await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); await settle(); };
  await openDrawer();
  check('10 Nav', 'mobile drawer opens as modal', await ev(`return $('#mobile-nav').open && $('#mobile-nav').matches(':modal')`));
  check('10 Nav', 'drawer moves focus inside', await ev(`return $('#mobile-nav').contains(document.activeElement)`));
  let escaped = 0;
  const visited = new Set();
  for (let i = 0; i < 16; i++) {
    await key('Tab', 'Tab', 9);
    const r = await ev(`const a = document.activeElement; return { out: !!a && a !== document.body && !$('#mobile-nav').contains(a), id: a ? a.textContent.trim().slice(0, 20) + '|' + (a.getAttribute('aria-label') || '') : '' }`);
    if (r.out) escaped++;
    visited.add(r.id);
  }
  check('10 Nav', `Tab cycles inside drawer (${visited.size} stops)`, escaped === 0 && visited.size >= 10, `escaped=${escaped}`);
  await key('Escape', 'Escape', 27);
  await waitFor(`!$('#mobile-nav').open`, 3000);
  check('10 Nav', 'Escape closes drawer', !(await ev(`return $('#mobile-nav').open`)));
  check('10 Nav', 'focus returns to menu button', await ev(`return document.activeElement === ${burger}`));
  await openDrawer();
  await click(`byText('#mobile-nav a', 'MyClubs')`, 300);
  check('10 Nav', 'drawer link navigates + closes', (await path()) === '/clubs/discover' && !(await ev(`return $('#mobile-nav').open`)));
  await click(`byText('nav[aria-label="MyClubs sections"] a', 'Campus Events')`);
  check('10 Nav', 'mobile section tabs', (await path()) === '/clubs/events');
});

// 12. Calendar journeys (Tests A–E)
await section('12 Calendar', async () => {
  await viewport(1440);
  await goto('/');
  await ev(`localStorage.clear(); return true`);

  // Test A
  await goto('/clubs/discover');
  await click(`card('Outing Club').querySelector('button[aria-pressed]')`);
  await click(`byText('#clubs-nav a', 'My Clubs')`);
  check('A Follow', 'followed club listed in My Clubs', await ev(`return $$('main section')[0].textContent.includes('Outing Club')`));
  await reload();
  check('A Follow', 'still followed after refresh (count 3)', await ev(`return $$('main section')[0].textContent.includes('Outing Club') && $('main').textContent.includes('You follow 3 clubs')`));

  // Test B
  await goto('/clubs/events?src=sample&q=pitch');
  await click(`card('Startup Pitch Night').querySelector('button[aria-pressed]')`);
  await goto('/clubs/campus-life');
  await click(view('Agenda'));
  check('B Save', 'saved event on correct date', await inAgendaDay('Startup Pitch Night', 7));
  let l = await labels('Startup Pitch Night');
  check('B Save', 'shown once, as Saved event', l.length === 1 && l[0].includes('Saved event'), l);
  await click(`${chips('Startup Pitch Night')}[0]`);
  check('B Save', 'click opens details dialog with sample host', await ev(`const d = $('dialog[open]'); return !!d && d.textContent.includes('Startup Pitch Night') && d.textContent.includes('Sample host (demo data)')`));
  await click(`$('dialog[open] button[aria-pressed]')`);
  check('B Save', 'popup badge updates on unsave', await ev(`const d = $('dialog[open]'); return d.textContent.includes('Event (not saved)') && !d.textContent.includes('Saved event') && d.querySelector('button[aria-pressed]').getAttribute('aria-pressed') === 'false'`));
  await click(`$('dialog[open] button[aria-pressed]')`);
  check('B Save', 'popup badge updates on re-save', await ev(`const d = $('dialog[open]'); return d.textContent.includes('Saved event') && d.querySelector('button[aria-pressed]').getAttribute('aria-pressed') === 'true'`));
  await click(`$('dialog[open] button[aria-pressed]')`);
  await esc();
  check('B Save', 'Escape closes dialog', !(await ev(`return !!$('dialog[open]')`)));
  check('B Save', 'unsave removes it from calendar immediately', (await labels('Startup Pitch Night')).length === 0 && !(await ev(`return ls('myclubs:savedEvents')`)).includes('ev-pitch-night'));
  check('B Save', 'followed club without full schedule adds no meetings (Outing Club)', (await labels('Outing Club')).length === 0);
  await goto('/clubs/events/ev-sunrise-hike');
  await click(`$('main header button[aria-pressed]')`);
  await goto('/clubs/campus-life');
  l = await labels('Sunrise Hike: Mount Sugarloaf');
  check('B Save', 'saved event appears once on its date', l.length === 1 && l[0].includes('Saved event') && (await inAgendaDay('Sunrise Hike: Mount Sugarloaf', 4)), l);

  // Test C
  await goto('/clubs/discover/umassaccountingassociation');
  await click(profileFollow);
  await goto('/clubs/events/ev-robot-demo');
  await click(`$('main header button[aria-pressed]')`);
  await goto('/clubs/campus-life');
  const expected = await countDow([3]);
  l = await labels('Accounting Association');
  check('C Meetings', `weekly occurrences generated (${l.length}/${expected})`, l.length === expected && l.every((x) => x.includes('Club meeting') && x.includes('6:00 – 7:00 PM')), l.length);
  await goto('/clubs/discover/umassaccountingassociation');
  await click(profileFollow);
  await goto('/clubs/campus-life');
  check('C Meetings', 'unfollow removes meetings', (await labels('Accounting Association')).length === 0);
  check('C Meetings', 'independently saved event kept', (await labels('Robot Showcase & Demo Day')).length === 1);
  check('C Meetings', 'other saved events kept', (await labels('Sunrise Hike: Mount Sugarloaf')).length === 1);

  // Test D
  await goto('/clubs/events/ev-ctf');
  await click(`$('main header button[aria-pressed]')`);
  await goto('/clubs/events/ev-film');
  await click(`$('main header button[aria-pressed]')`);
  await goto('/clubs/events/ev-ultimate');
  await click(`$('main header button[aria-pressed]')`);
  await goto('/clubs/events/ev-dataviz');
  await click(`$('main header button[aria-pressed]')`);
  await goto('/clubs/campus-life');
  const p = await panel();
  check('D Conflicts', 'exam vs saved event flagged with window', p.some((t) => t.includes('Midterm Exam 2') && t.includes('Fall A Cappella Showcase') && t.includes('7:30 – 9:00 PM (90 min)')), p);
  check('D Conflicts', 'two saved events overlap flagged', p.some((t) => t.includes('Capture the Flag Practice Night') && t.includes('Student Short Film Screening') && t.includes('7:30 – 9:30 PM (120 min)')), p);
  check('D Conflicts', 'deadline inside an event not flagged', !p.some((t) => t.includes('Career Values')), p);
  check('D Conflicts', 'back-to-back events not flagged', !p.some((t) => t.includes('Ultimate Frisbee Open Scrimmage') && t.includes('Data Viz Lightning Talks')), p);
  check('D Conflicts', 'unsaved events not flagged', !p.some((t) => t.includes('Smash Bros.')), p);
  await click(`${chips('Midterm Exam 2')}[0]`);
  check('D Conflicts', 'dialog shows conflict details', await ev(`const t = $('dialog[open]').textContent; return t.includes('Schedule conflict') && t.includes('Overlap 7:30 – 9:00 PM (90 min)') && t.includes('Course')`));
  await shot('cal-dialog');
  await esc();
  await click(`${chips('HW 6: Graph Algorithms')}[0]`);
  check('D Conflicts', 'deadline dialog explains no-conflict rule', await ev(`const t = $('dialog[open]').textContent; return t.includes('Algorithms & Data Structures') && t.includes('never counted as a schedule conflict')`));
  await esc();

  await click(view('Month'));
  await shot('cal-month');
  const monthName = await ev(`return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })`);
  check('Calendar views', 'month view title', (await ev(`return $('main h2[aria-live]').textContent`)) === monthName);
  check('Calendar views', 'month view shows mixed items', await ev(`return ${chips('HW 6: Graph Algorithms')}.length === 1 && $$('main button[aria-label]').some(b => b.getAttribute('aria-label').includes('Club meeting'))`));
  await click(`$('main button[aria-label="Next month"]')`);
  const nextName = await ev(`const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })`);
  check('Calendar views', 'next month navigation', (await ev(`return $('main h2[aria-live]').textContent`)) === nextName);
  await click(`byText('main button', 'Today')`);
  check('Calendar views', 'Today returns', (await ev(`return $('main h2[aria-live]').textContent`)) === monthName);
  await reload();
  check('Calendar views', 'view choice persists', (await ev(`return ${view('Month')}.getAttribute('aria-pressed')`)) === 'true');
  check('Persist', 'calendar data persists after refresh', (await labels('Sunrise Hike: Mount Sugarloaf')).length === 1);

  await goto('/');
  check('E Regression', 'dashboard: 8 course cards + To Do', await ev(`return $$('main article').length === 8 && $('main h1').textContent === 'Dashboard' && $('aside h2').textContent.includes('To Do')`));
  check('E Regression', 'dashboard Coming Up shows verified meetings', await ev(`return $('aside').textContent.includes('Chess Club')`));
});

// 14. Verified events journey
await section('14 Verified events', async () => {
  await viewport(1440);
  await goto('/');
  await ev(`localStorage.clear(); return true`);
  const longDay = (iso) => `new Date(${JSON.stringify(iso)}).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })`;
  const inDay = (title, iso) => ev(`const day = ${longDay(iso)}; const sec = $$('main section[aria-labelledby^="day-"]').find(s => s.querySelector('h3').textContent.includes(day)); return !!sec && $$('button', sec).some(b => b.textContent.trim() === ${JSON.stringify(title)})`);

  await goto('/clubs/discover?q=vietnamese');
  await click(`card('Vietnamese Students Association').querySelector('h3 a')`);
  check('V Events', 'profile lists its verified upcoming events', await ev(`const t = $('main').textContent; return t.includes('Fall 2026 Food Fair') && t.includes('VSA Escape Room')`));
  check('V Events', 'profile official website link opens externally', await ev(`return $$('main a').some(a => a.textContent.includes('Website') && a.href.startsWith('http') && a.target === '_blank')`));
  await click(profileFollow);
  await goto('/clubs/following');
  check('V Events', 'followed host listed + its events in feed', await ev(`return $$('main section')[0].textContent.includes('Vietnamese Students Association') && $('#upcoming-heading').parentElement.textContent.includes('Fall 2026 Food Fair')`));

  await goto('/clubs/events/cp-12912251');
  check('V Events', 'official event link + no-RSVP notice', await ev(`return $$('main a').some(a => a.href === 'https://umassamherst.campuslabs.com/engage/event/12912251' && a.target === '_blank') && $('main').textContent.includes('does not RSVP or register you')`));
  check('V Events', 'host links to club profile', await ev(`return $$('main a').some(a => a.pathname === '/clubs/discover/vietnamesestudentassociation')`));
  check('V Events', 'published date shown correctly', await ev(`return $('main').textContent.includes(${longDay('2026-11-14T12:00:00-05:00')})`));

  await goto('/clubs/campus-life');
  await click(`byText('[aria-label="Calendar view"] button', 'Agenda')`);
  check('V Events', 'followed host event auto-included on its date', await inDay('Fall 2026 Food Fair', '2026-11-14T12:00:00-05:00'));

  await goto('/clubs/discover/umoc');
  await click(profileFollow);
  await goto('/clubs/campus-life');
  let l = await labels('Wilderness First Aid Course (Wild Med)');
  check('V Events', 'two separate verified sessions, not saved', l.length === 2 && l.every((x) => x.includes('Club event (not saved)')), l);
  await goto('/clubs/events/cp-12940827');
  await click(`$('main header button[aria-pressed]')`);
  await goto('/clubs/campus-life');
  l = await labels('Wilderness First Aid Course (Wild Med)');
  check('V Events', 'follow + save does not duplicate', l.length === 2 && l.filter((x) => x.includes('Saved event')).length === 1, l);
  await goto('/clubs/discover/umoc');
  await click(profileFollow);
  await goto('/clubs/campus-life');
  l = await labels('Wilderness First Aid Course (Wild Med)');
  check('V Events', 'unfollow keeps the saved session only', l.length === 1 && l[0].includes('Saved event'), l);
  check('V Events', 'saved verified event on correct date', await inDay('Wilderness First Aid Course (Wild Med)', '2026-11-14T09:00:00-05:00'));

  await goto('/clubs/events/cp-12955880');
  await click(`$('main header button[aria-pressed]')`);
  await goto('/clubs/campus-life');
  const p = await panel();
  check('V Events', 'verified event vs followed club meeting conflict', p.some((t) => t.includes('General Body Meeting: Coping with Family Stress') && t.includes('Chess Club') && t.includes('(60 min)')), p);
  await goto('/clubs/events/cp-12955880');
  await click(`$('main header button[aria-pressed]')`);
  await goto('/clubs/campus-life');
  check('V Events', 'unsave verified event updates calendar', (await labels('General Body Meeting: Coping with Family Stress')).length === 0);
  await ev(`localStorage.clear(); return true`);
});

// 15. Find My Fit + demo class schedule + judge demo journey
await section('15 Find My Fit', async () => {
  await viewport(1440);
  await goto('/');
  await ev(`localStorage.clear(); return true`);
  const group = (s) => `$('#group-${s}')`;
  const namesIn = (s) => ev(`const g = ${group(s)}; return g.tagName === 'DETAILS' ? $$('li[data-club]', g).map(li => li.querySelector('a').textContent.trim()) : $$('h3 a', g.closest('section')).map(a => a.textContent.trim())`);

  // Journey: dashboard → MyClubs → Discover → Find My Fit
  await click(`byText('nav[aria-label="Global navigation"] a', 'MyClubs')`);
  await waitFor(`location.pathname === '/clubs/discover'`);
  await click(`byText('main a', 'Find My Fit')`);
  await waitFor(`$('#group-fits') && $('#group-unknown')`);
  check('F Fit', 'Discover "Find My Fit" button opens page', (await path()) === '/clubs/fit', '/clubs/applications', '/clubs/applications/demo-org', await path());
  check('F Fit', 'section nav marks Find My Fit active', await ev(`return byText('#clubs-nav a', 'Find My Fit').getAttribute('aria-current') === 'page'`));
  check('F Fit', 'demo class schedule labeled', await ev(`return $('main').textContent.includes('Demo class schedule') && /\\d+ class sessions/.test($('main').textContent)`));

  const fits = await namesIn('fits');
  const partial = await namesIn('partial');
  const unknown = await namesIn('unknown');
  check('F Fit', 'Accounting Association fits (Wed 6–7 PM free)', fits.includes('Accounting Association'), fits);
  check('F Fit', 'Chess Club is a partial fit', partial.includes('Chess Club'), partial);
  check('F Fit', 'overlap explained exactly (Thu lab, 90 min)', await ev(`const fc = $('#fit-chessclub').closest('article'); return fc.textContent.includes('Overlaps COMPSCI 235 Lab (6:30 – 8:00 PM) for 90 min')`));
  check('F Fit', 'clubs without times are separate, no times shown', unknown.includes('UMass Robotics Club') && unknown.includes('Habitat for Humanity') && !(await ev(`return !!$('#fit-roboticsclub')`)), unknown.length);
  const total = fits.length + partial.length + (await namesIn('conflicts')).length + unknown.length;
  const allNames = [...fits, ...partial, ...(await namesIn('conflicts')), ...unknown];
  check('F Fit', `every club classified exactly once (${total})`, total >= 50 && new Set(allNames).size === total);
  check('F Fit', 'only verified meeting schedules produce meetings', await ev(`return $$('main article').filter(a => a.textContent.includes('Weekly meeting') || a.textContent.includes('Club meeting')).map(a => a.querySelector('h3').textContent.trim()).every(n => ['Accounting Association', 'Chess Club'].includes(n))`));

  // Interests re-rank
  await click(`byText('[aria-labelledby="interests-label"] button', 'Sports & Recreation')`);
  const firstFit = await ev(`return $$('article', ${group('fits')}.closest('section'))[0]?.textContent ?? ''`);
  check('F Fit', 'interest match ranks first + labeled', firstFit.includes('Sports & Recreation') && firstFit.includes('Matches your interests'), firstFit.slice(0, 80));
  await reload();
  check('F Fit', 'interests persist after refresh', (await ev(`return byText('[aria-labelledby="interests-label"] button', 'Sports & Recreation').getAttribute('aria-pressed')`)) === 'true');

  // Follow a compatible club from Find My Fit → updates everywhere
  await click(`$('#fit-umassaccountingassociation').closest('article').querySelector('button[aria-pressed]')`);
  check('F Fit', 'follow from Find My Fit updates card + nav count', await ev(`const a = $('#fit-umassaccountingassociation').closest('article'); return a.textContent.includes('Following') && byText('#clubs-nav a', 'My Clubs').textContent.includes('3')`));
  check('F Fit', 'your-schedule counts include new meetings', await ev(`return /[1-9]\\d* meetings? of clubs you follow/.test($('#your-schedule').parentElement.parentElement.textContent)`));

  // Save an event, then the combined calendar shows classes + clubs + events + conflicts
  await goto('/clubs/events/cp-12955880');
  await click(`$('main header button[aria-pressed]')`);
  await goto('/clubs/campus-life');
  await click(`byText('[aria-label="Calendar view"] button', 'Agenda')`);
  const labs = await labels('COMPSCI 235 Lab');
  check('F Fit', 'class schedule on calendar (weekly lab)', labs.length === (await countDow([4])) && labs.every((l) => l.includes('Academic')), labs.length);
  check('F Fit', 'followed club meetings on calendar (Accounting)', (await labels('Accounting Association')).length === (await countDow([3])));
  const p = await panel();
  check('F Fit', 'existing conflict shown: Chess vs CS 235 Lab (90 min)', p.some((t) => t.includes('Chess Club') && t.includes('COMPSCI 235 Lab') && t.includes('6:30 – 8:00 PM (90 min)')), p.slice(0, 3));
  check('F Fit', 'saved verified event conflicts with Chess (60 min)', p.some((t) => t.includes('General Body Meeting: Coping with Family Stress') && t.includes('Chess Club') && t.includes('(60 min)')));
  await click(`${chips('COMPSCI 235 Lab')}[0]`);
  check('F Fit', 'class item dialog labeled demo + course', await ev(`const t = $('dialog[open]').textContent; return t.includes('demo class schedule') && t.includes('Computer Systems Foundations')`));
  await esc();
  await goto('/');
  check('F Fit', 'dashboard To Do unaffected by class schedule', await ev(`return !$('aside').textContent.includes('Lab (demo')`));
  await ev(`localStorage.clear(); return true`);
});

// 16. Semester bounds, ended events and midnight refresh under controlled clocks
await section('16 Time', async () => {
  await viewport(1440);
  await goto('/');
  await ev(`localStorage.clear(); return true`);
  const recurring = () => ev(`return $$('main button[aria-label]').filter(b => /^(COMPSCI|CICS|ENVSCI) \\d+ (Lecture|Lab|Seminar|Discussion)\\./.test(b.getAttribute('aria-label')) || b.getAttribute('aria-label').includes('. Club meeting.')).length`);
  const title = () => ev(`return $('main h2[aria-live]').textContent`);

  await goto('/clubs/campus-life');
  await click(view('Month'));
  check('T Time', 'classes + meetings inside semester (Nov)', (await recurring()) > 0);
  await click(`$('main button[aria-label="Next month"]')`);
  await click(`$('main button[aria-label="Next month"]')`);
  check('T Time', 'none after semester end (Jan 2027)', (await title()) === 'January 2027' && (await recurring()) === 0, await title());
  await click(`byText('main button', 'Today')`);
  for (let i = 0; i < 4; i++) await click(`$('main button[aria-label="Previous month"]')`);
  check('T Time', 'none before semester start (Jul 2026)', (await title()) === 'July 2026' && (await recurring()) === 0, await title());

  await goto('/clubs/events/cp-12912251');
  await click(`$('main header button[aria-pressed]')`);
  await setClock('2026-11-25T12:00:00');
  await goto('/clubs/events?q=food%20fair');
  check('T Time', 'ended verified event left upcoming list', !(await ev(`return cardTitles()`)).includes('Fall 2026 Food Fair'));
  await click(`byText('[aria-label="Event lists"] button', 'Past')`);
  check('T Time', 'Past tab lists it with Ended badge', await ev(`const c = card('Fall 2026 Food Fair'); return !!c && c.textContent.includes('Ended')`));
  await goto('/clubs/events?view=past&q=wilderness');
  check('T Time', 'unsaved ended events cannot be saved', await ev(`const c = card('Wilderness First Aid Course (Wild Med)'); const b = $$('button', c).find(x => x.textContent.includes('Ended')); return !!b && b.disabled`));
  await goto('/clubs/events?view=saved');
  check('T Time', 'saved ended event stays visible in Saved', await ev(`const c = card('Fall 2026 Food Fair'); return !!c && c.textContent.includes('Ended') && !!c.querySelector('button[aria-pressed="true"]')`));
  await goto('/clubs/events/cp-12912251');
  check('T Time', 'detail says ended, published date unchanged', await ev(`const t = $('main').textContent; return t.includes('This event ended on') && t.includes('Saturday, November 14') && t.includes('12:00 – 3:00 PM')`));
  await goto('/clubs/discover/vietnamesestudentassociation');
  check('T Time', 'profile separates past events', await ev(`const t = $('main').textContent; return /Past events \\(\\d+\\)/.test(t) && t.includes('VSA Escape Room')`));

  await setClock('2026-11-13T23:59:50');
  await goto('/clubs/campus-life');
  await click(view('Month'));
  const startDay = await ev(`window.__noReload = true; return $('main').dataset.day`);
  const rolled = await waitFor(`$('main').dataset.day === '2026-11-14'`, 20000);
  check('T Time', 'midnight refresh without reload', startDay === '2026-11-13' && rolled && (await ev(`return window.__noReload === true`)), startDay);
  check('T Time', 'today highlight moved to the 14th', await ev(`return $$('main button.bg-umass').some(b => b.textContent.trim() === '14')`));
  await setClock(TEST_NOW);
});

// 17. Cross-tab synchronization through the storage event
await section('17 Sync', async () => {
  await goto('/');
  await ev(`localStorage.clear(); return true`);
  const tab = await json(`/json/new?${encodeURIComponent(BASE + '/')}`, 'PUT');
  const b = await connect(tab.webSocketDebuggerUrl);
  const inB = (expr, ms = 4000) => waitFor(expr, ms, b.call);
  await goto('/clubs/discover');
  await goto('/clubs/following', b.call);
  await click(`card('Vocal Suspects').querySelector('button[aria-pressed]')`);
  check('S Sync', 'follow in tab A appears in tab B', await inB(`$$('main section')[0]?.textContent.includes('Vocal Suspects')`));
  await click(`card('Vocal Suspects').querySelector('button[aria-pressed]')`);
  check('S Sync', 'unfollow in tab A disappears in tab B', await inB(`!$('main').textContent.includes('Vocal Suspects')`));
  await goto('/clubs/events', b.call);
  await goto('/clubs/events/cp-12964906');
  await click(`$('main header button[aria-pressed]')`);
  check('S Sync', 'save in tab A updates Saved in tab B', await inB(`byText('[aria-label="Event lists"] button', 'Saved').textContent.includes('(3)')`));
  await goto('/clubs/discover/activeminds');
  await goto('/clubs/discover/activeminds', b.call);
  await click(`$$('main fieldset input[type=radio]')[4]`);
  await ev(`typeInto($('main textarea'), 'Sync test review from tab A.'); return true`);
  await click(`byText('main button', 'Post review')`);
  check('S Sync', 'review in tab A appears in tab B', await inB(`$('main').textContent.includes('Sync test review from tab A.')`));
  await ev(`localStorage.setItem('myclubs:followed', '{"broken":'); return true`);
  await settle(b.call);
  check('S Sync', 'corrupted write from another tab ignored safely', await evalIn(b.call, `return !!$('main h1') && $('main').textContent.includes('Active Minds')`));
  b.sock.close();
  await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`).catch(() => {});
  await ev(`localStorage.clear(); return true`);
});

// 18. Phone week view
await section('18 Mobile week', async () => {
  await viewport(375, 812);
  await goto('/clubs/campus-life');
  await click(view('Week'));
  check('M Week', 'phone week view is a stacked day list', await ev(`const l = $('[aria-label="Week, one day per row"]'); return !!l && $$('h3', l).length === 7 && !$$('main .grid-cols-7').length`));
  check('M Week', 'no horizontal page scroll', await ev(`return document.documentElement.scrollWidth <= 375`));
  await click(`$('[aria-label="Week, one day per row"] li button')`);
  check('M Week', 'items open details on phone', await ev(`return !!$('dialog[open]')`));
  await esc();
  await viewport(1440);
  await goto('/clubs/campus-life');
  check('M Week', 'desktop keeps the 7-column grid', await ev(`return $$('main .grid-cols-7').length > 0 && !$('[aria-label="Week, one day per row"]')`));
});

// 19. Judge demo scenario still works after the real events have passed
await section('19 Demo', async () => {
  await viewport(1440);
  await setClock('2026-12-01T12:00:00');
  await goto('/');
  await ev(`localStorage.clear(); return true`);
  await goto('/clubs/discover');
  await ev(`typeInto($('main input[type=search]'), 'chess'); return true`);
  await waitFor(`cardTitles().length < 5`, 4000);
  check('Z Demo', 'search finds Chess Club', JSON.stringify(await ev(`return cardTitles()`)) === '["Chess Club"]');
  await goto('/clubs/fit');
  const group = (s) => ev(`const g = $('#group-${s}'); return g.tagName === 'DETAILS' ? $$('li[data-club]', g).map(li => li.querySelector('a').textContent.trim()) : $$('h3 a', g.closest('section')).map(a => a.textContent.trim())`);
  check('Z Demo', 'Find My Fit: Accounting fits, Chess partial', (await group('fits')).includes('Accounting Association') && (await group('partial')).includes('Chess Club'));
  check('Z Demo', 'unknown schedules explained', await ev(`return $('[data-club="womenincybersecurity"]').textContent.includes('Listed schedule is incomplete') && $('[data-club="kpopdanceclub"]').textContent.includes('Next listed event') && $('[data-club="roboticsclub"]').textContent.includes('no meeting times')`));
  check('Z Demo', 'official page links on fit results', await ev(`return $$('main a').filter(a => a.textContent.includes('Official page') && a.target === '_blank').length >= 5`));
  await click(`$('#fit-umassaccountingassociation').closest('article').querySelector('button[aria-pressed]')`);
  await goto('/clubs/events?src=sample');
  await click(`card('Intramural Volleyball Night').querySelector('button[aria-pressed]')`);
  await goto('/clubs/campus-life');
  await click(view('Agenda'));
  const p = await panel();
  check('Z Demo', 'demo conflict: volleyball vs Thursday lab (60 min)', p.some((t) => t.includes('Intramural Volleyball Night') && t.includes('COMPSCI 235 Lab') && t.includes('(60 min)')), p.slice(0, 3));
  check('Z Demo', 'academic + club meetings together', (await labels('Accounting Association')).length > 0 && (await ev(`return $$('main button[aria-label]').some(b => b.getAttribute('aria-label').startsWith('COMPSCI 235 Lab.'))`)));
  await setClock(TEST_NOW);
  await ev(`localStorage.clear(); return true`);
});

// 20. Applications tracker + demo application
await section('20 Applications', async () => {
  await viewport(1440);
  await goto('/');
  await ev(`localStorage.clear(); return true`);
  await goto('/clubs/discover');
  await click(`byText('#clubs-nav a', 'Applications')`);
  await waitFor(`$('main h1')?.textContent.trim() === 'Applications'`);
  check('P Apps', 'section nav → Applications, empty state', (await path()) === '/clubs/applications' && (await ev(`return $('main').textContent.includes('No applications tracked yet')`)));

  await goto('/clubs/discover?process=required');
  const req = (await ev(`return cardTitles()`)).sort();
  check('P Apps', 'filter: application required (verified only)', JSON.stringify(req) === JSON.stringify(['Best Buddies', 'Comedy League']), req);
  const sideBySide = (root) => `(() => { const f = ${root}.querySelector('button[aria-pressed]'); const a = f?.nextElementSibling; return !!a && a.tagName === 'BUTTON' && /Apply|View application/.test(a.textContent) && Math.abs(a.getBoundingClientRect().top - f.getBoundingClientRect().top) < 2; })()`;
  check('P Apps', 'required cards: label, Follow and Apply side by side', await ev(`return cards().every(c => c.textContent.includes('Application required') && ${sideBySide('c')})`));
  await goto('/clubs/discover?process=open');
  const open = (await ev(`return cardTitles()`)).sort();
  check('P Apps', 'filter: open membership (verified)', JSON.stringify(open) === JSON.stringify(['Chess Club', 'Isenberg Investment Club', 'Outing Club', 'UMass Gaming and Esports Club', 'UMass Ski and Board Club', "Ultimate Frisbee - Women's"]), open);
  check('P Apps', 'open-membership clubs have no Apply button', await ev(`return cards().every(c => !byText('a, button', 'Apply', c))`));
  await goto('/clubs/discover');
  check('P Apps', 'Apply only on the 2 verified clubs', (await ev(`return $$('main article button').filter(b => b.textContent.trim().startsWith('Apply')).length`)) === 2);

  await goto('/clubs/discover/comedyleague');
  await click(`$('main header button[aria-pressed]')`);
  check('P Apps', 'following does not start an application', (await ev(`return (ls('myclubs:applications') ?? []).length`)) === 0);
  check('P Apps', 'profile shows verified process, quote, deadline not listed', await ev(`const t = $('main').textContent; return t.includes('Membership & applications') && t.includes('You MUST AUDITION to join!') && t.includes('Deadline not listed') && t.includes('Application link not available')`));
  check('P Apps', 'profile header: label, Follow and Apply side by side', await ev(`return $('main article > header').textContent.includes('Application required') && ${sideBySide("$('main article > header')")}`));
  await goto('/clubs/discover/roboticsclub');
  check('P Apps', 'unknown process is not assumed', await ev(`const t = $('main').textContent; return t.includes('Application process not listed') && !byText('main a, main button', 'Apply')`));

  await goto('/clubs/discover/comedyleague');
  await click(`byText('main header button', 'Apply')`);
  await waitFor(`location.pathname === '/clubs/applications/comedyleague/apply'`);
  check('P Apps', 'Apply opens that organization\'s application form', (await ev(`const t = $('main').textContent; return $('main h1').textContent === 'Apply to Comedy League' && t.includes('Application link not available') && t.includes('MyClubs never submits anything')`)));
  check('P Apps', 'Apply saves it as Interested', await ev(`const a = ls('myclubs:applications'); return a.length === 1 && a[0].clubId === 'comedyleague' && a[0].status === 'interested'`));
  await goto('/clubs/discover/comedyleague');
  await click(`byText('main header button', 'View application')`);
  await waitFor(`location.pathname === '/clubs/applications/comedyleague'`);
  check('P Apps', 'Apply again: View application, no duplicate', (await ev(`return ls('myclubs:applications').length`)) === 1);
  await ev(`typeInto($('main select'), 'draft'); typeInto($('main input[type=url]'), 'not a link'); return true`);
  await click(`byText('main button', 'Save tracker')`);
  check('P Apps', 'invalid link rejected', await ev(`return !!$('[role=alert]') && $('[role=alert]').textContent.includes('https://')`));
  await ev(`typeInto($('main input[type=url]'), 'https://umassamherst.campuslabs.com/engage/organization/comedyleague'); typeInto($('main textarea'), 'Audition piece: 2-minute improv scene.'); return true`);
  await click(`byText('main button', 'Save tracker')`);
  await reload();
  await ev(`typeInto($('[data-testid=date-date]'), '2026-11-20'); return true`);
  await click(`byText('main button', 'Add date')`);
  await reload();
  check('P Apps', 'tracker persists after refresh', await ev(`const a = ls('myclubs:applications')[0]; return a.status === 'draft' && a.dates?.[0]?.date === '2026-11-20' && a.dates[0].kind === 'reminder' && !('reminder' in a) && a.notes.startsWith('Audition') && $('main').textContent.includes('Draft in progress')`));
  await goto('/clubs/applications');
  check('P Apps', 'card: status, progress, deadline, reminder, link', await ev(`const c = cards()[0]; const t = c.textContent; return t.includes('Draft in progress') && t.includes('Deadline not listed') && t.includes('(you entered this)') && t.includes('Link you saved') && !!c.querySelector('ol[aria-label^="Progress: step 2 of 5"]')`));
  await goto('/clubs/applications/comedyleague');
  await ev(`typeInto($('main select'), 'submitted'); return true`);
  await click(`byText('main button', 'Save tracker')`);
  check('P Apps', 'status update is labeled self-reported', await ev(`return $('main').textContent.includes('Submitted externally (self-reported)')`));

  const tab = await json(`/json/new?${encodeURIComponent(BASE + '/')}`, 'PUT');
  const b = await connect(tab.webSocketDebuggerUrl);
  await goto('/clubs/applications', b.call);
  await goto('/clubs/discover?process=required');
  await click(`byText('button', 'Apply', card('Best Buddies'))`);
  check('P Apps', 'Apply on a Discover card opens that organization', await waitFor(`location.pathname === '/clubs/applications/bestbuddies/apply' && $('main h1')?.textContent.includes('Best Buddies')`));
  check('P Apps', 'tracking in tab A appears in tab B', await waitFor(`$('main').textContent.includes('Best Buddies')`, 4000, b.call));
  b.sock.close();
  await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`).catch(() => {});

  await goto('/clubs/applications');
  await click(`byText('main button', 'Remove')`);
  check('P Apps', 'remove from tracker', (await ev(`return ls('myclubs:applications').length`)) === 1 && (await ev(`return cards().length`)) === 1);

  check('P Apps', 'demo callout: labeled and fictional', await ev(`const t = $('#demo-app').closest('section').textContent; return t.includes('Demo only — not sent to the organization.') && t.includes('fictional')`));
  check('P Apps', 'nav counts: My Clubs & Associations 3, Applications 1', await ev(`const t = $('#clubs-nav').textContent; return /My Clubs & Associations\\s*3/.test(t) && /Applications\\s*1/.test(t)`));

  for (const p of ['/clubs/applications', '/clubs/applications/demo-org', '/clubs/applications/comedyleague', '/clubs/discover?process=required', '/clubs/discover/bestbuddies']) {
    await viewport(375, 812);
    await goto(p);
    check('P Apps', `no horizontal scroll at 375px: ${p}`, await ev(`return document.documentElement.scrollWidth <= 375`));
  }
  await goto('/clubs/discover?process=required');
  check('P Apps', 'mobile: Follow and Apply stay side by side on cards', await ev(`return cards().length === 2 && cards().every(c => ${sideBySide('c')})`));
  await goto('/clubs/discover/bestbuddies');
  check('P Apps', 'mobile: Follow and Apply side by side on profile', await ev(`return ${sideBySide("$('main article > header')")}`));
  await viewport(1440);
  await ev(`localStorage.clear(); return true`);
});

// 21. Application forms: category templates, validation, résumé, drafts, review, demo completion
await section('21 Application forms', async () => {
  await viewport(1440);
  await goto('/');
  await ev(`localStorage.clear(); return true`);
  const A = 'Q Forms';
  const fill = (map) => ev(`const m = ${JSON.stringify(map)}; for (const [k, v] of Object.entries(m)) typeInto($('#f-' + k), v); return true`);
  const stepTitle = () => ev(`return $('#step-heading')?.textContent.trim()`);
  const next = () => click(`byText('main button', 'Next')`, 300);
  const mainText = () => ev(`return $('main').textContent`);
  const toastSays = (s) => waitFor(`$$('[role=status]').some(e => e.textContent.includes(${JSON.stringify(s)}))`, 2500);
  const setFile = (name, body, type) =>
    ev(`const dt = new DataTransfer(); dt.items.add(new File([${body}], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} })); const i = $('[data-testid=resume-input]'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); return true`);
  const idbResume = (id) =>
    ev(`return await new Promise((res) => { const q = indexedDB.open('myclubs-files'); q.onupgradeneeded = () => q.result.createObjectStore('resumes'); q.onsuccess = () => { const g = q.result.transaction('resumes').objectStore('resumes').get(${JSON.stringify(id)}); g.onsuccess = () => { res(g.result ? g.result.name + ':' + (g.result.blob instanceof Blob) : null); q.result.close(); }; }; q.onerror = () => res('error'); })`);

  // Templates follow the organization's field; browsing a form tracks nothing.
  await goto('/clubs/applications/comedyleague/apply?view=review');
  let t = await mainText();
  check(A, 'audition org → audition template: reel link, no GitHub, schedule not invented', t.includes('Performance reel or portfolio link') && !t.includes('GitHub') && t.includes('What draws you to audition for this group?') && t.includes('Audition schedule not listed'));
  check(A, 'real org: sample questions kept apart from the official process', t.includes("Sample application questions — not Comedy League's official application.") && t.includes('You MUST AUDITION') && t.includes('Application link not available'));
  await goto('/clubs/applications/bestbuddies/apply?view=review');
  t = await mainText();
  check(A, 'service org → service questions, optional résumé', t.includes("What motivates you to participate in this organization's mission?") && t.includes('Résumé (PDF)') && !t.includes('GitHub'));
  await goto('/clubs/applications/roboticsclub/apply');
  check(A, 'no form when an application is not verified as required', (await mainText()).includes('No application form for this organization'));
  check(A, 'opening forms does not track anything', (await ev(`return (ls('myclubs:applications') ?? []).length`)) === 0);

  // 1–2. Discover the demo organization, click Apply.
  await goto('/clubs/discover?process=required');
  check(A, 'demo organization discoverable and labeled', await ev(`const c = $('[data-testid=demo-org-card]'); return !!c && c.textContent.includes('Demo organization') && c.textContent.includes('Application required (demo)') && !c.querySelector('button[aria-pressed]')`));
  check(A, 'demo card does not change real directory counts', await ev(`return cards().length === 2 && $('main').textContent.includes('Showing 2 of 78')`));
  await click(`byText('[data-testid=demo-org-card] button', 'Apply')`);
  await waitFor(`location.pathname === '/clubs/applications/demo-org/apply'`);
  t = await mainText();
  check(A, 'Apply opens the form with org name, category and notice', t.includes('Apply to Campus Builders Collective (demo)') && t.includes('Engineering') && t.includes('Demo only — not sent to the organization.') && t.includes('Sample application questions'));
  check(A, 'progress indicator: 4 steps, step 1 current', await ev(`const li = $$('ol[aria-label="Application steps"] li'); return li.length === 4 && li[0].getAttribute('aria-current') === 'step'`));
  check(A, 'tech form: Step 1 personal fields with required/optional labels', await ev(`return ['fullName','email','major','classYear','minor'].every(id => $('#f-' + id)) && $('label[for=f-minor]').textContent.includes('(optional)') && $('label[for=f-fullName]').textContent.includes('(required)')`));

  // 3. Validation on step 1.
  await next();
  check(A, 'required fields block Next with specific messages', (await stepTitle()) === 'Personal information' && (await ev(`return $('[role=alert]').textContent.includes('4 answers need attention') && $('#f-fullName-error').textContent === 'Enter your full name.' && document.activeElement.id === 'f-fullName'`)));
  await fill({ fullName: 'Alex Minuteman', email: 'alex@gmail.com', major: 'Computer Science', classYear: '2028' });
  await next();
  check(A, 'email must be a UMass address', await ev(`return $('#f-email').getAttribute('aria-invalid') === 'true' && $('#f-email-error').textContent.includes('UMass email')`));
  await fill({ email: 'aminuteman@umass.edu' });
  await next();
  check(A, 'valid step 1 → step 2', (await stepTitle()) === 'Résumé & professional links');
  check(A, 'technical fields: GitHub, LinkedIn, portfolio, résumé', await ev(`return ['github','linkedin','portfolio'].every(id => $('#f-' + id)) && !!$('[data-testid=resume-drop]') && $('label[for=f-github]').textContent.includes('(optional)')`));

  // 5. Résumé validation, drag-and-drop, replace/remove, sample, IndexedDB only.
  await setFile('notes.docx', `'hello'`, 'application/msword');
  await waitFor(`$$('main [role=alert]').length`, 3000);
  check(A, 'résumé: non-PDF rejected', await ev(`return [...$$('main [role=alert]')].some(e => e.textContent.includes("isn't a PDF"))`));
  await setFile('huge.pdf', 'new Uint8Array(6 * 1024 * 1024)', 'application/pdf');
  await waitFor(`[...$$('main [role=alert]')].some(e => e.textContent.includes('MB'))`, 3000);
  check(A, 'résumé: over 5 MB rejected', await ev(`return [...$$('main [role=alert]')].some(e => e.textContent.includes('under 5 MB'))`));
  await setFile('fake.pdf', `'not really a pdf'`, 'application/pdf');
  await waitFor(`[...$$('main [role=alert]')].some(e => e.textContent.includes('fake.pdf'))`, 3000);
  check(A, 'résumé: fake PDF rejected', await ev(`return [...$$('main [role=alert]')].some(e => e.textContent.includes("doesn't look like a valid PDF")) && !$('[data-testid=resume-attached]')`));
  await ev(`const dt = new DataTransfer(); dt.items.add(new File(['%PDF-1.4 my resume'], 'my-resume.pdf', { type: 'application/pdf' })); $('[data-testid=resume-drop]').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); return true`);
  await waitFor(`$('[data-testid=resume-attached]')`);
  check(A, 'résumé: drag-and-drop attaches and shows the file name', await ev(`return $('[data-testid=resume-attached]').textContent.includes('my-resume.pdf') && !$$('main [role=alert]').some(e => e.textContent.includes('PDF'))`));
  check(A, 'résumé stored in IndexedDB', (await idbResume('demo-org')) === 'my-resume.pdf:true');
  await click(`byText('[data-testid=resume-attached] button', 'Remove')`, 300);
  check(A, 'résumé: remove deletes the local copy', !(await ev(`return !!$('[data-testid=resume-attached]')`)) && (await idbResume('demo-org')) === null);
  await click(`byText('main button', 'Use sample résumé')`, 600);
  await waitFor(`$('[data-testid=resume-attached]')`);
  check(A, 'résumé: sample PDF attaches (demo)', await ev(`return $('[data-testid=resume-attached]').textContent.includes('sample-resume.pdf')`));
  check(A, 'résumé file never stored in localStorage', await ev(`const s = localStorage.getItem('myclubs:applications'); return s.includes('"name":"sample-resume.pdf"') && s.length < 3000 && !s.includes('PDF-')`));

  // 4. Links: GitHub must be a profile; LinkedIn must be a profile.
  await fill({ github: 'https://github.com/alex/robot-arm', linkedin: 'linkedin.com/company/umass' });
  await next();
  check(A, 'GitHub repository link rejected (profile required)', await ev(`return $('#f-github-error')?.textContent.includes('GitHub profile link')`));
  check(A, 'LinkedIn company page rejected', await ev(`return $('#f-linkedin-error')?.textContent.includes('LinkedIn profile link')`));
  await fill({ github: 'github.com/alex-minuteman', linkedin: '' });
  await next();
  check(A, 'valid links → step 3 (organization questions)', (await stepTitle()) === 'Organization questions' && (await mainText()).includes('Sample questions for technology & engineering organizations'));
  check(A, 'tech questions shown', await ev(`return ['tools','projects','whyTech','techAreas','role','techTeam','commitment','anythingElse'].every(id => $('#f-' + id))`));

  // 6–8. Draft save, refresh, continue; answers kept across steps.
  await fill({ projects: 'Built a line-following robot with two friends.', whyTech: 'I want to build things with a team.' });
  check(A, 'character counter', await ev(`return $$('main span').some(s => s.textContent.trim() === '46/1000')`));
  await click(`byText('main button', 'Save draft')`);
  check(A, 'Save draft confirms local-only save', await toastSays('Draft saved in this browser. Nothing was sent.'));
  await reload();
  check(A, 'after refresh: same step, answers restored', (await stepTitle()) === 'Organization questions' && (await ev(`return $('#f-projects').value.startsWith('Built a line-following robot')`)));
  check(A, 'draft status in storage', await ev(`const a = ls('myclubs:applications')[0]; return a.status === 'draft' && a.form.values.github === 'https://github.com/alex-minuteman' && a.form.resume.name === 'sample-resume.pdf'`));
  await click(`byText('main button', 'Previous')`, 300);
  await waitFor(`$('[data-testid=resume-attached]')`, 2000);
  check(A, 'after refresh: résumé still attached (IndexedDB)', await ev(`return $('[data-testid=resume-attached]').textContent.includes('sample-resume.pdf') && $('#f-github').value === 'https://github.com/alex-minuteman'`));
  await click(`byText('main button', 'Previous')`, 300);
  check(A, 'Previous keeps step 1 answers', await ev(`return $('#f-fullName').value === 'Alex Minuteman' && $('#f-classYear').value === '2028'`));
  await next();
  await next();
  await next();
  check(A, 'required questions on step 3 enforced', (await stepTitle()) === 'Organization questions' && (await ev(`return ['techAreas','role','techTeam','commitment'].every(id => $('#f-' + id + '-error')) && !$('#f-tools-error')`)));
  await fill({ techAreas: 'Robotics and web apps', role: 'Software development', techTeam: 'FIRST Robotics in high school.', commitment: '2–4 hours' });
  await next();

  // 9. Review.
  check(A, 'review screen lists every answer', (await stepTitle()) === 'Review your answers' && (await ev(`const t = $('main').textContent; return t.includes('Alex Minuteman') && t.includes('aminuteman@umass.edu') && t.includes('https://github.com/alex-minuteman') && t.includes('sample-resume.pdf') && t.includes('Not provided') && t.includes('FIRST Robotics')`)));
  await click(`byText('main button', 'Edit Personal information')`, 300);
  check(A, 'Edit from review jumps to that step', (await stepTitle()) === 'Personal information');
  await fill({ major: 'Computer Engineering' });
  await next();
  await next();
  await next();
  check(A, 'edited answer appears on review', (await mainText()).includes('Computer Engineering'));
  await click(`byText('main button', 'Copy answers')`, 300);
  check(A, 'copy answers gives feedback', await waitFor(`$$('[role=status]').some(e => /Answers copied|Couldn't copy/.test(e.textContent))`, 2500));

  // 10–11. Finish → prepared, never "sent".
  await click(`byText('main button', 'Finish Demo Application')`, 300);
  t = await mainText();
  check(A, 'finish → "Demo application prepared — not submitted"', t.includes('Demo application prepared — not submitted to the organization.') && t.includes('Prepared (demo)') && !/application was sent|submitted successfully/i.test(t));
  check(A, 'stored as prepared', await ev(`const a = ls('myclubs:applications')[0]; return a.status === 'prepared' && !!a.form.preparedAt`));
  await reload();
  check(A, 'confirmation persists after refresh', (await mainText()).includes('Demo application prepared — not submitted to the organization.'));
  await click(`byText('main a', 'View in My Applications')`);
  await waitFor(`location.pathname === '/clubs/applications'`);
  check(A, 'appears in My Applications as Prepared (demo)', await ev(`const c = cards().find(x => x.textContent.includes('Campus Builders Collective')); const t = c?.textContent ?? ''; return t.includes('Prepared (demo)') && t.includes('Demo organization') && t.includes('(not submitted)') && !!c.querySelector('ol[aria-label^="Progress: step 3 of 5"]') && !!byText('a', 'Review answers', c)`));
  check(A, 'nav count: Applications 1', await ev(`return /Applications\\s*1/.test($('#clubs-nav').textContent)`));
  await goto('/clubs/applications/demo-org');
  t = await mainText();
  check(A, 'overview: form status, résumé, export', t.includes('— not submitted to the organization.') && t.includes('Résumé: sample-resume.pdf') && (await ev(`return !!byText('main button', 'Download (.txt)') && !!byText('main a', 'Review answers')`)));

  // Cross-tab: an edit in tab A shows up in tab B; editing a prepared application returns it to draft.
  const tab = await json(`/json/new?${encodeURIComponent(BASE + '/')}`, 'PUT');
  const b = await connect(tab.webSocketDebuggerUrl);
  await goto('/clubs/applications/demo-org', b.call);
  await goto('/clubs/applications/demo-org/apply');
  await click(`byText('main button', 'Edit answers')`, 300);
  await fill({ minor: 'Mathematics' });
  await click(`byText('main button', 'Save draft')`);
  check(A, 'editing a prepared application returns it to draft', await ev(`const a = ls('myclubs:applications')[0]; return a.status === 'draft' && !a.form.preparedAt && a.form.values.minor === 'Mathematics'`));
  check(A, 'draft change in tab A appears in tab B', await waitFor(`$('main').textContent.includes('Draft:')`, 4000, b.call));
  b.sock.close();
  await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`).catch(() => {});

  // A real organization: prepared answers point to the official process.
  await goto('/clubs/discover/comedyleague');
  await click(`byText('main article > header button', 'Apply')`);
  await waitFor(`location.pathname === '/clubs/applications/comedyleague/apply'`);
  check(A, 'personal details carry no sensitive fields', await ev(`return $$('main form [id^=f-]').length === 5 && !/pronoun|gender|ethnic|race|birth|home address|phone|student id|social security/i.test($('main form').textContent)`));
  await fill({ fullName: 'Alex Minuteman', email: 'aminuteman@umass.edu', major: 'Theater', classYear: '2029' });
  await next();
  check(A, 'creative step 2: portfolio first, résumé optional', await ev(`return $('#step-heading').textContent === 'Résumé & professional links' && !!$('#f-portfolio') && !$('#f-github')`));
  await next();
  await fill({ auditionInterest: 'I love ensemble comedy.', performRole: 'Performer and writer', auditionAvailability: 'Weekday evenings', commitment: 'Not sure yet' });
  await next();
  await click(`byText('main button', 'Finish — mark answers prepared')`, 300);
  t = await mainText();
  check(A, 'real org: prepared, with official next step', t.includes('Answers prepared — not submitted to the organization.') && t.includes('Answers prepared — not submitted') && !t.includes('Demo application prepared') && t.includes("apply through Comedy League's official process") && t.includes('contact them on Campus Pulse'));

  // Removing an application deletes its résumé.
  await goto('/clubs/applications');
  await click(`byText('main button', 'Remove Campus Builders Collective')`);
  for (let i = 0; i < 20 && (await idbResume('demo-org')) !== null; i++) await sleep(100);
  check(A, 'removing the application deletes its résumé', (await idbResume('demo-org')) === null && (await ev(`return !ls('myclubs:applications').some(a => a.clubId === 'demo-org')`)));
  check(A, 'demo callout returns after removal', await ev(`return !!$('#demo-app')`));

  // Corrupted storage: one bad entry does not wipe the others.
  await ev(`const n = new Date().toISOString(); localStorage.setItem('myclubs:applications', JSON.stringify([{ clubId: 'bestbuddies', status: 'interested', createdAt: n, updatedAt: n }, { clubId: 'x', status: 'bogus' }, null, 'junk'])); return true`);
  await reload();
  check(A, 'corrupted entries skipped, valid ones kept', await ev(`return cardTitles().includes('Best Buddies') && cards().length === 1`));

  for (const p of ['/clubs/applications/demo-org/apply', '/clubs/applications/demo-org/apply?view=review', '/clubs/applications/comedyleague/apply']) {
    await viewport(375, 812);
    await goto(p);
    check(A, `no horizontal scroll at 375px: ${p}`, await ev(`return document.documentElement.scrollWidth <= 375`));
  }
  check(A, 'mobile: compact stepper', await ev(`return $$('ol[aria-label="Application steps"] li').length >= 3`));
  await viewport(1440);
  await goto('/');
  await ev(`localStorage.clear(); return true`);
});

// 22. Reliability: autosave + refresh, two-tab editing, résumé viewing/storage failures, real export contents
await section('22 Reliability', async () => {
  const A = 'R Reliability';
  await viewport(1440);
  await goto('/');
  await ev(`localStorage.clear(); return true`);
  const fill = (map, call = send) => evalIn(call, `const m = ${JSON.stringify(map)}; for (const [k, v] of Object.entries(m)) typeInto($('#f-' + k), v); return true`);
  const stored = (id) => ev(`return (ls('myclubs:applications') ?? []).find((a) => a.clubId === ${JSON.stringify(id)}) ?? null`);
  const idb = (key) =>
    ev(`return await new Promise((res) => { const q = indexedDB.open('myclubs-files'); q.onupgradeneeded = () => q.result.createObjectStore('resumes'); q.onsuccess = () => { const g = q.result.transaction('resumes').objectStore('resumes').get(${JSON.stringify(key)}); g.onsuccess = () => { res(g.result ? g.result.name : null); q.result.close(); }; }; q.onerror = () => res('error'); })`);
  const setFile = (name, body) =>
    ev(`const dt = new DataTransfer(); dt.items.add(new File([${body}], ${JSON.stringify(name)}, { type: 'application/pdf' })); const i = $('[data-testid=resume-input]'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); return true`);
  const STEP_TITLES = ['Personal information', 'Résumé & professional links', 'Organization questions', 'Review your answers'];
  const toStep = async (title) => {
    await waitFor(`$('#step-heading')`, 3000);
    for (let i = 0; i < 6; i++) {
      const cur = await ev(`return $('#step-heading')?.textContent`);
      if (cur === title) return true;
      const dir = STEP_TITLES.indexOf(cur) < STEP_TITLES.indexOf(title) ? 'Next' : 'Previous';
      await click(`byText('main button', ${JSON.stringify(dir)})`);
      await waitFor(`$('#step-heading')?.textContent !== ${JSON.stringify(cur)}`, 2000);
    }
    return false;
  };
  const toPersonal = async (path = '/clubs/applications/demo-org/apply') => {
    await goto(path);
    await fill({ fullName: 'Alex Minuteman', email: 'aminuteman@umass.edu', major: 'Computer Science', classYear: '2028' });
  };

  // Autosave: typing then refreshing immediately keeps the text (flushed on pagehide, not only after the debounce).
  await toPersonal();
  check(A, 'save indicator: Saving… while a change is pending', await ev(`return $('[data-testid=save-state]').textContent.includes('Saving')`));
  await waitFor(`$('[data-testid=save-state]').textContent.startsWith('Saved in this browser at')`, 3000);
  check(A, 'save indicator: Saved only after the write', await ev(`return $('[data-testid=save-state]').textContent.startsWith('Saved in this browser at') && ls('myclubs:applications')[0].form.values.fullName === 'Alex Minuteman'`));
  // Type and mark this document in one step, then refresh at once (well inside the autosave delay).
  await ev(`typeInto($('#f-minor'), 'Mathematics and Statistics'); window.__leaving = true; return true`);
  await send('Page.reload', {});
  await waitFor(`!window.__leaving && document.readyState === 'complete' && $('#f-minor')`, 8000);
  check(A, 'rapid typing then immediate refresh keeps the text', await ev(`return $('#f-minor').value === 'Mathematics and Statistics' && $('#f-fullName').value === 'Alex Minuteman'`));
  await ev(`typeInto($('#f-minor'), 'Mathematics'); return true`);
  await goto('/clubs/applications');
  check(A, 'leaving the page right after typing keeps the text', (await stored('demo-org'))?.form?.values?.minor === 'Mathematics');

  // Two tabs, same application: no silent overwrite.
  await goto('/clubs/applications/demo-org/apply');
  const tab = await json(`/json/new?${encodeURIComponent(BASE + '/')}`, 'PUT');
  const b = await connect(tab.webSocketDebuggerUrl);
  const evB = (expr) => evalIn(b.call, expr);
  await goto('/clubs/applications/demo-org/apply', b.call);
  check(A, 'other tab detected (both tabs told)', (await waitFor(`$('[data-testid=other-tab]')`, 3000, b.call)) && (await waitFor(`$('[data-testid=other-tab]')`, 3000)));
  await evB(`typeInto($('#f-major'), 'Edited in tab B'); return true`);
  await ev(`typeInto($('#f-major'), 'Edited in tab A'); return true`);
  await click(`byText('main button', 'Save draft')`);
  check(A, 'tab B sees a conflict instead of overwriting', await waitFor(`$('[data-testid=conflict]')`, 3000, b.call));
  await sleep(700); // longer than the autosave delay: tab B's pending save must not have been written
  check(A, 'newer answers from tab A are kept', (await stored('demo-org'))?.form?.values?.major === 'Edited in tab A');
  check(A, 'tab B save state says not saved', await evB(`return $('[data-testid=save-state]').textContent.includes('changed in another tab')`));
  await evalIn(b.call, `byText('main button', "Keep this tab's version").click(); return true`);
  await waitFor(`ls('myclubs:applications').find((a) => a.clubId === 'demo-org').form.values.major === 'Edited in tab B'`, 3000);
  check(A, "keep this tab's version writes it deliberately", (await stored('demo-org'))?.form?.values?.major === 'Edited in tab B');
  check(A, 'tab A (no unsaved edits) loads the newer version automatically', await waitFor(`$('#f-major').value === 'Edited in tab B' && $('[data-testid=form-notice]')?.textContent.includes('another tab')`, 3000));
  // Conflict resolved the other way: load the other tab's version.
  await evB(`typeInto($('#f-major'), 'Tab B again'); return true`);
  await ev(`typeInto($('#f-major'), 'Tab A wins'); return true`);
  await click(`byText('main button', 'Save draft')`);
  await waitFor(`$('[data-testid=conflict]')`, 3000, b.call);
  await evalIn(b.call, `byText('main button', "Load the other tab's version").click(); return true`);
  check(A, "load the other tab's version replaces local edits", await waitFor(`$('#f-major').value === 'Tab A wins' && !$('[data-testid=conflict]')`, 3000, b.call));
  // Different applications in two tabs: both saved, no warning.
  await goto('/clubs/applications/bestbuddies/apply', b.call);
  await fill({ fullName: 'Tab B on Best Buddies' }, b.call);
  await ev(`typeInto($('#f-fullName'), 'Tab A on demo'); return true`);
  await click(`byText('main button', 'Save draft')`);
  await evalIn(b.call, `byText('main button', 'Save draft').click(); return true`);
  await waitFor(`ls('myclubs:applications').some((a) => a.clubId === 'bestbuddies' && a.form?.values?.fullName === 'Tab B on Best Buddies')`, 3000);
  check(A, 'separate applications edited at once: both kept, no warning', (await stored('demo-org'))?.form?.values?.fullName === 'Tab A on demo' && (await stored('bestbuddies'))?.form?.values?.fullName === 'Tab B on Best Buddies' && !(await evB(`return !!$('[data-testid=conflict]')`)) && !(await ev(`return !!$('[data-testid=conflict]')`)));
  b.sock.close();
  await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`).catch(() => {});
  check(A, 'other-tab notice clears when that tab closes', await waitFor(`!$('[data-testid=other-tab]')`, 3000));

  // Résumé: view opens the right file, popup blocking, cleanup, missing file, replace.
  await goto('/clubs/applications/demo-org/apply');
  await toStep('Résumé & professional links');
  await setFile('marker-resume.pdf', `'%PDF-1.4 MARKER-ONE body'`);
  await waitFor(`$('[data-testid=resume-attached]')?.textContent.includes('marker-resume.pdf')`);
  await ev(`window.__opened = []; window.open = (u) => { window.__opened.push(u); return { opener: {} }; }; return true`);
  await click(`byText('[data-testid=resume-attached] button', 'View')`);
  const viewed = await ev(`const u = window.__opened[0]; if (!u) return null; const b = await (await fetch(u)).blob(); return { url: u, type: b.type, text: await b.text() }`);
  check(A, 'View opens the attached PDF (blob URL, PDF type, right bytes)', viewed?.url?.startsWith('blob:') && viewed.type === 'application/pdf' && viewed.text.includes('MARKER-ONE'), JSON.stringify(viewed));
  await ev(`window.open = () => null; return true`);
  await click(`byText('[data-testid=resume-attached] button', 'View')`);
  check(A, 'popup blocked: clear message and a download fallback', await ev(`return [...$$('main [role=alert]')].some(e => e.textContent.includes('blocked the new tab')) && $$('main a[download]').some(a => a.getAttribute('download') === 'marker-resume.pdf')`));
  await setFile('second-resume.pdf', `'%PDF-1.4 MARKER-TWO body'`);
  await waitFor(`$('[data-testid=resume-attached]')?.textContent.includes('second-resume.pdf')`);
  check(A, 'Replace swaps the stored file', (await idb('demo-org')) === 'second-resume.pdf' && (await stored('demo-org'))?.form?.resume?.name === 'second-resume.pdf');
  await reload();
  await toStep('Résumé & professional links');
  await waitFor(`$('[data-testid=resume-attached]')`);
  await ev(`window.__opened = []; window.open = (u) => { window.__opened.push(u); return { opener: {} }; }; window.__revoked = 0; const r = URL.revokeObjectURL.bind(URL); URL.revokeObjectURL = (u) => { window.__revoked++; r(u); }; return true`);
  await click(`byText('[data-testid=resume-attached] button', 'View')`);
  const afterRefresh = await ev(`const u = window.__opened[0]; return u ? await (await fetch(u)).text() : null`);
  check(A, 'View after refresh opens the replaced file from IndexedDB', afterRefresh?.includes('MARKER-TWO'), afterRefresh);
  await click(`byText('main a', 'Application overview')`);
  check(A, 'object URLs released when leaving the form', await waitFor(`window.__revoked >= 1`, 2000));
  await ev(`await new Promise((res) => { const q = indexedDB.open('myclubs-files'); q.onsuccess = () => { const t = q.result.transaction('resumes', 'readwrite'); t.objectStore('resumes').delete('demo-org'); t.oncomplete = () => { q.result.close(); res(true); }; }; }); return true`);
  await goto('/clubs/applications/demo-org/apply');
  await toStep('Résumé & professional links');
  check(A, 'missing stored file: asks to reattach instead of pretending', await waitFor(`$('[data-testid=resume-drop]')?.textContent.includes('Reattach your résumé: second-resume.pdf')`, 3000));

  // IndexedDB blocked: no crash, honest warning, text drafts still saved, retry and remove.
  await ev(`Object.defineProperty(window, 'indexedDB', { configurable: true, get: () => ({ open() { const r = {}; setTimeout(() => r.onerror && r.onerror(), 0); return r; } }) }); return true`);
  await setFile('offline-resume.pdf', `'%PDF-1.4 OFFLINE'`);
  const memOnly = await waitFor(`$('[data-testid=resume-memory-only]')`, 8000);
  check(
    A,
    "IndexedDB failure: warns the file won't survive a refresh",
    memOnly && (await ev(`const t = $('[data-testid=resume-memory-only]').textContent; return t.includes("can't store files") && t.includes('gone after a refresh') && $('[data-testid=resume-attached]')?.textContent.includes('this visit only')`)),
    memOnly ? await ev(`return 'alert: ' + $('[data-testid=resume-memory-only]').textContent.slice(0, 160) + ' | attached: ' + ($('[data-testid=resume-attached]')?.textContent ?? 'none').slice(0, 120)`) : await ev(`return location.pathname + ' | ' + ($('#step-heading')?.textContent ?? '-') + ' | ' + [...$$('main [role=alert], main [role=status]')].map((e) => e.textContent).join(' / ').slice(0, 300)`),
  );
  check(A, 'IndexedDB failure: no stored résumé is claimed', (await stored('demo-org'))?.form?.resume === undefined);
  await ev(`typeInto($('#f-portfolio'), 'alex.dev'); return true`);
  await waitFor(`$('[data-testid=save-state]').textContent.startsWith('Saved')`, 3000);
  check(A, 'IndexedDB failure: text answers still save', (await stored('demo-org'))?.form?.values?.portfolio === 'https://alex.dev');
  await click(`byText('[data-testid=resume-memory-only] button', 'Try saving again')`);
  check(A, 'retry reports it still failed', await waitFor(`[...$$('main [role=alert]')].some(e => e.textContent.includes("Still couldn't save"))`, 6000));
  await click(`byText('[data-testid=resume-memory-only] button', 'Remove')`);
  check(A, 'remove clears the temporary attachment', await ev(`return !$('[data-testid=resume-attached]') && !$('[data-testid=resume-memory-only]')`));
  await reload();

  // Export: the actual clipboard and .txt contents.
  await goto('/clubs/applications/demo-org/apply');
  await toStep('Organization questions');
  await fill({
    projects: 'Café robot — “line follower”\nSecond line: PID tuning 😀',
    whyTech: 'Build things & learn <together>.',
    techAreas: 'Robotics',
    role: 'Hardware',
    techTeam: 'FIRST Robotics.',
    commitment: '2–4 hours',
  });
  await toStep('Review your answers');
  await ev(`window.__copied = null; Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t) => { window.__copied = t; } } }); return true`);
  await click(`byText('main button', 'Copy answers')`);
  const copied = await ev(`return window.__copied`);
  const labels = ['Full name:', 'UMass email address:', 'What technical projects have you worked on? Describe one you are proud of.', 'How much time could you realistically commit per week?'];
  check(A, 'clipboard: organization, applicant and answers', !!copied && copied.startsWith('Campus Builders Collective (demo): application answers') && copied.includes('Full name: Tab A on demo') && copied.includes('UMass email address: aminuteman@umass.edu'), copied?.slice(0, 200));
  check(A, 'clipboard: special characters and line breaks intact', !!copied && copied.includes('Café robot — “line follower”\nSecond line: PID tuning 😀') && copied.includes('Build things & learn <together>.') && !copied.includes('\r'));
  check(A, 'clipboard: every question once, empty optionals marked, no file contents', !!copied && labels.every((l) => copied.split(l).length === 2) && copied.includes('LinkedIn profile URL: Not provided') && !copied.includes('%PDF'));
  await ev(`window.__blob = null; window.__dl = null; const c = URL.createObjectURL.bind(URL); URL.createObjectURL = (b) => { window.__blob = b; return c(b); }; HTMLAnchorElement.prototype.click = function () { window.__dl = this.getAttribute('download'); }; return true`);
  await click(`byText('main button', 'Download (.txt)')`);
  const dl = await ev(`return window.__blob ? { name: window.__dl, type: window.__blob.type, text: await window.__blob.text() } : null`);
  check(A, 'download: named .txt, UTF-8 text, same content as the clipboard', dl?.name === 'demo-org-application-answers.txt' && dl.type === 'text/plain;charset=utf-8' && dl.text === copied, JSON.stringify({ name: dl?.name, type: dl?.type }));
  await ev(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } }); document.execCommand = () => false; return true`);
  await click(`byText('main button', 'Copy answers')`);
  check(A, 'clipboard blocked: helpful message', await waitFor(`$$('[role=status]').some(e => e.textContent.includes("Couldn't copy") && e.textContent.includes('Download'))`, 2500));
  await goto('/');
  await ev(`localStorage.clear(); return true`);
});

// 23. Applicant profile, reusable résumé, audition form, decisions, migration, calendar dates, Dashboard To Do
await section('23 Application features', async () => {
  const A = 'S Features';
  await viewport(1440);
  await goto('/');
  await ev(`localStorage.clear(); return true`);
  await ev(`await new Promise((r) => { const q = indexedDB.deleteDatabase('myclubs-files'); q.onsuccess = q.onerror = q.onblocked = () => r(true); }); return true`);
  const fill = (map) => ev(`const m = ${JSON.stringify(map)}; for (const [k, v] of Object.entries(m)) typeInto($('#f-' + k), v); return true`);
  const stored = (id) => ev(`return (ls('myclubs:applications') ?? []).find((a) => a.clubId === ${JSON.stringify(id)}) ?? null`);
  const idb = (key) =>
    ev(`return await new Promise((res) => { const q = indexedDB.open('myclubs-files'); q.onupgradeneeded = () => q.result.createObjectStore('resumes'); q.onsuccess = () => { const g = q.result.transaction('resumes').objectStore('resumes').get(${JSON.stringify(key)}); g.onsuccess = () => { res(g.result ? g.result.name : null); q.result.close(); }; }; q.onerror = () => res('error'); })`);
  const setFile = (name, body) =>
    ev(`const dt = new DataTransfer(); dt.items.add(new File([${body}], ${JSON.stringify(name)}, { type: 'application/pdf' })); const i = $('[data-testid=resume-input]'); i.files = dt.files; i.dispatchEvent(new Event('change', { bubbles: true })); return true`);
  const STEP_TITLES = ['Personal information', 'Résumé & professional links', 'Organization questions', 'Review your answers'];
  const toStep = async (title) => {
    await waitFor(`$('#step-heading')`, 3000);
    for (let i = 0; i < 6; i++) {
      const cur = await ev(`return $('#step-heading')?.textContent`);
      if (cur === title) return true;
      const dir = STEP_TITLES.indexOf(cur) < STEP_TITLES.indexOf(title) ? 'Next' : 'Previous';
      await click(`byText('main button', ${JSON.stringify(dir)})`);
      await waitFor(`$('#step-heading')?.textContent !== ${JSON.stringify(cur)}`, 2000);
    }
    return false;
  };

  // An application with saved answers exists before the profile is created.
  await goto('/clubs/applications/demo-org/apply');
  await fill({ fullName: 'Existing Name', major: 'History' });
  await click(`byText('main button', 'Save draft')`);

  // Profile: create, validate, persist.
  await goto('/clubs/applications');
  check(A, 'Applications page offers an optional profile', await ev(`const c = $('[data-testid=profile-card]'); return !!c && c.textContent.includes('Optional') && !!byText('a', 'Create profile', c)`));
  await click(`byText('[data-testid=profile-card] a', 'Create profile')`);
  await waitFor(`location.pathname === '/clubs/applications/profile' && $('main h1')`);
  check(A, 'profile page: title, crumb, privacy note', await ev(`return $('main h1').textContent === 'My applicant profile' && $('nav[aria-label=Breadcrumb]').textContent.includes('My applicant profile') && $('main').textContent.includes('Stored only in this browser. This is not an account')`));
  await fill({ fullName: 'Jordan Lee', email: 'jordan@gmail.com' });
  await click(`byText('main button', 'Save profile')`);
  check(A, 'profile: invalid email rejected with a specific message', await ev(`return $('#f-email-error')?.textContent.includes('UMass email') && $('[role=alert]').textContent.includes('1 field needs attention') && ls('myclubs:profile') === null`));
  await fill({ email: 'jlee@umass.edu', major: 'Economics', minor: 'Mathematics', classYear: '2029', github: 'github.com/jordanlee', portfolio: 'jordan.dev', experience: 'Treasurer of a robotics club.' });
  await click(`byText('main button', 'Save profile')`);
  await reload();
  check(A, 'profile saved and restored after refresh', await ev(`const p = ls('myclubs:profile'); return p.fullName === 'Jordan Lee' && p.github === 'https://github.com/jordanlee' && p.portfolio === 'https://jordan.dev' && $('#f-major').value === 'Economics'`));
  await setFile('default-resume.pdf', `'%PDF-1.4 DEFAULT-MARKER'`);
  await waitFor(`$('[data-testid=resume-attached]')?.textContent.includes('default-resume.pdf')`);
  check(A, 'default résumé saved explicitly (IndexedDB) and listed in the profile', (await idb('__default__')) === 'default-resume.pdf' && (await ev(`return ls('myclubs:profile').resume?.name === 'default-resume.pdf'`)));

  // Prefill a new application; overriding it doesn't change the profile.
  await goto('/clubs/applications/bestbuddies/apply');
  check(A, 'new application prefilled from the profile', await ev(`return $('#f-fullName').value === 'Jordan Lee' && $('#f-email').value === 'jlee@umass.edu' && $('#f-classYear').value === '2029' && !!$('[data-testid=prefilled]')`));
  await fill({ fullName: 'Jordan L.' });
  await waitFor(`$('[data-testid=save-state]').textContent.startsWith('Saved')`, 3000);
  check(A, 'editing a prefilled answer leaves the profile unchanged', (await stored('bestbuddies'))?.form?.values?.fullName === 'Jordan L.' && (await ev(`return ls('myclubs:profile').fullName === 'Jordan Lee'`)));
  // Saved answers are never replaced by the profile; filling only fills blanks.
  await goto('/clubs/applications/demo-org/apply');
  check(A, 'existing application is not prefilled over', await ev(`return $('#f-fullName').value === 'Existing Name' && !$('[data-testid=prefilled]')`));
  await click(`byText('main button', 'Fill empty fields from my profile')`);
  check(A, '"Fill empty fields" fills blanks only', await ev(`return $('#f-fullName').value === 'Existing Name' && $('#f-major').value === 'History' && $('#f-minor').value === 'Mathematics' && $('[data-testid=form-notice]').textContent.includes('Nothing you typed was changed')`));

  // Reuse the default résumé (by reference), then override it for one application.
  await goto('/clubs/applications/bestbuddies/apply');
  await toStep('Résumé & professional links');
  await click(`byText('main button', 'Use my saved résumé')`);
  await waitFor(`$('[data-testid=resume-attached]')`);
  check(A, 'saved résumé reused without copying the file', await ev(`return $('[data-testid=resume-attached]').textContent.includes('your saved résumé')`) && (await stored('bestbuddies'))?.form?.resume?.source === 'default' && (await idb('bestbuddies')) === null);
  await ev(`window.__opened = []; window.open = (u) => { window.__opened.push(u); return { opener: {} }; }; return true`);
  await click(`byText('[data-testid=resume-attached] button', 'View')`);
  check(A, 'viewing the reused résumé opens the default file', (await ev(`const u = window.__opened[0]; return u ? await (await fetch(u)).text() : ''`)).includes('DEFAULT-MARKER'));
  await setFile('bb-only.pdf', `'%PDF-1.4 BB-ONLY'`);
  await waitFor(`$('[data-testid=resume-attached]')?.textContent.includes('bb-only.pdf')`);
  check(A, 'a different PDF for one application leaves the default intact', (await idb('bestbuddies')) === 'bb-only.pdf' && (await idb('__default__')) === 'default-resume.pdf' && !(await stored('bestbuddies'))?.form?.resume?.source);

  // Audition template details on the official profile.
  await goto('/clubs/discover/comedyleague');
  check(A, 'audition club: schedule shown as not listed (nothing invented)', await ev(`return $('main aside').textContent.includes('Auditions: Audition schedule not listed')`));

  // Structured decision (self-reported).
  await click(`byText('main article > header button', 'Apply')`);
  await waitFor(`location.pathname === '/clubs/applications/comedyleague/apply'`);
  await goto('/clubs/applications/comedyleague');
  await ev(`typeInto($('main form select'), 'decision'); return true`);
  await waitFor(`[...$$('main select')].some((s) => [...s.options].some((o) => o.value === 'waitlisted'))`);
  await ev(`const s = [...$$('main select')].find((x) => [...x.options].some((o) => o.value === 'waitlisted')); typeInto(s, 'waitlisted'); typeInto($('main input[placeholder^="e.g. Invited"]'), 'Callback next week'); return true`);
  await click(`byText('main button', 'Save tracker')`);
  check(A, 'decision saved as a structured outcome with a note', await ev(`const a = ls('myclubs:applications').find((x) => x.clubId === 'comedyleague'); return a.status === 'decision' && a.decision === 'waitlisted' && a.decisionNote === 'Callback next week' && $('main').textContent.includes('Decision: Waitlisted (self-reported)')`));
  await goto('/clubs/applications');
  check(A, 'My Applications shows the outcome as self-reported', await ev(`const c = cards().find((x) => x.textContent.includes('Comedy League')); return c.textContent.includes('Waitlisted (self-reported) — Callback next week')`));

  // Migration of data saved by earlier versions.
  await ev(`const n = new Date().toISOString(); const list = ls('myclubs:applications'); list.push({ clubId: 'umoc', status: 'decision', reminder: '2026-11-18', decisionNote: 'Got in!', createdAt: n, updatedAt: n }, { clubId: 'chessclub', status: 'interested', reminder: 'not-a-date', createdAt: n, updatedAt: n }); localStorage.setItem('myclubs:applications', JSON.stringify(list)); return true`);
  await reload();
  check(A, 'old free-text decision kept as the note (outcome "Other")', await ev(`const c = cards().find((x) => x.textContent.includes('Outing Club')); return c.textContent.includes('Decision: Other (self-reported)') && c.textContent.includes('Other (self-reported) — Got in!')`));
  check(A, 'old single reminder becomes a date; bad dates dropped safely', await ev(`const c = cards().find((x) => x.textContent.includes('Outing Club')); const chess = cards().find((x) => x.textContent.includes('Chess Club')); return c.textContent.includes('Reminder · Wed, Nov 18, 2026') && !!chess && !chess.textContent.includes('Next date')`));

  // Calendar: add, view (agenda, week, month), open, edit, delete.
  await goto('/clubs/applications/comedyleague');
  await ev(`typeInto($('[data-testid=date-kind]'), 'audition'); typeInto($('[data-testid=date-date]'), '2026-11-18'); typeInto($('[data-testid=date-time]'), '18:30'); typeInto($('[data-testid=date-note]'), 'Bring a 1-minute piece'); return true`);
  await click(`byText('main button', 'Add date')`);
  check(A, 'date added and labeled as entered by you', await ev(`const l = $('ul[aria-label="Your application dates"]'); return !!l && l.textContent.includes('Audition') && l.textContent.includes('18:30') && l.textContent.includes('(you entered this)')`));
  await goto('/clubs/campus-life');
  await click(`byText('main [aria-label="Calendar view"] button', 'Agenda')`);
  const agendaItem = `$$('main section[aria-labelledby^="day-"]').find((s) => s.querySelector('h3').textContent.includes('November 18'))`;
  check(A, 'agenda shows the audition once, at its time', await ev(`const s = ${agendaItem}; if (!s) return false; const b = $$('button', s).filter((x) => x.textContent.trim() === 'Audition: Comedy League'); return b.length === 1 && s.textContent.includes('6:30 PM')`));
  check(A, 'agenda shows the migrated reminder as an all-day item', await ev(`const s = ${agendaItem}; return !!s && s.textContent.includes('Reminder: Outing Club') && s.textContent.includes('All day')`));
  check(A, 'application dates have their own filter tile', await ev(`return $$('main button[aria-pressed]').some((b) => b.textContent.includes('Application dates'))`));
  await click(`$$('main button').find((b) => b.textContent.trim() === 'Audition: Comedy League')`);
  check(A, 'details: entered by you, not a booking, links to the application', await ev(`const d = $('dialog[open]'); return !!d && d.textContent.includes('You entered this date yourself') && d.textContent.includes('does not book') && !!byText('a', 'Open application', d)`));
  await click(`byText('dialog[open] a', 'Open application')`);
  check(A, 'calendar item opens the application', await waitFor(`location.pathname === '/clubs/applications/comedyleague'`));
  await goto('/clubs/campus-life');
  await click(`byText('main [aria-label="Calendar view"] button', 'Week')`);
  await click(`$('main button[aria-label="Next week"]')`);
  check(A, 'week view shows the audition', await ev(`return $$('main button').some((b) => (b.getAttribute('aria-label') ?? '').startsWith('Audition: Comedy League'))`));
  await click(`byText('main [aria-label="Calendar view"] button', 'Month')`);
  check(A, 'month view shows application dates (all-day reminder first in its cell)', await ev(`return $$('main button').some((b) => (b.getAttribute('aria-label') ?? '').startsWith('Reminder: Outing Club') && b.textContent.includes('All day'))`));
  check(A, 'application dates never count as conflicts', await ev(`return !$$('main button').some((b) => (b.getAttribute('aria-label') ?? '').startsWith('Audition: Comedy League') && b.getAttribute('aria-label').includes('Schedule conflict'))`));

  // Dashboard To Do.
  await goto('/');
  check(A, 'To Do lists application tasks, labeled as MyClubs (not Canvas)', await ev(`const t = $('[data-testid=todo-applications]'); return !!t && t.textContent.includes('Audition: Comedy League') && t.textContent.includes('Reminder: Outing Club') && t.textContent.includes('From MyClubs — not Canvas assignments.')`));
  check(A, 'To Do keeps the academic demo items', await ev(`return $$('aside[aria-label="To Do and upcoming"] > ul li').length > 0`));
  check(A, 'To Do shows unfinished drafts', await ev(`return $('[data-testid=todo-applications]').textContent.includes('Finish application draft:')`));
  await click(`byText('[data-testid=todo-applications] a', 'Audition: Comedy League')`);
  check(A, 'To Do item opens the application', await waitFor(`location.pathname === '/clubs/applications/comedyleague'`));

  // Edit and delete update the calendar immediately.
  await click(`byText('main button', 'Edit Audition')`);
  await ev(`typeInto($('[data-testid=date-time]'), '19:00'); return true`);
  await click(`byText('main button', 'Save date')`);
  await goto('/clubs/campus-life');
  await click(`byText('main [aria-label="Calendar view"] button', 'Agenda')`);
  check(A, 'edited date updates the calendar', await ev(`const s = ${agendaItem}; return !!s && s.textContent.includes('7:00 PM') && !s.textContent.includes('6:30 PM')`));
  await goto('/clubs/applications/comedyleague');
  await click(`byText('main button', 'Delete Audition')`);
  await goto('/clubs/campus-life');
  await click(`byText('main [aria-label="Calendar view"] button', 'Agenda')`);
  check(A, 'deleted date leaves the calendar', await ev(`const s = ${agendaItem}; return !!s && !s.textContent.includes('Audition: Comedy League')`));

  // Delete the profile: profile and default résumé go; applications keep their answers.
  await goto('/clubs/applications/profile');
  await click(`byText('main button', 'Delete profile')`);
  for (let i = 0; i < 20 && (await idb('__default__')) !== null; i++) await sleep(100);
  check(A, 'delete profile removes it and the default résumé', (await ev(`return ls('myclubs:profile')`)) === null && (await idb('__default__')) === null);
  check(A, 'applications keep their own answers after profile deletion', (await stored('bestbuddies'))?.form?.values?.fullName === 'Jordan L.');

  for (const p of ['/clubs/applications/profile', '/clubs/applications/comedyleague', '/clubs/campus-life', '/']) {
    await viewport(375, 812);
    await goto(p);
    check(A, `no horizontal scroll at 375px: ${p}`, await ev(`return document.documentElement.scrollWidth <= 375`));
  }
  await viewport(1440);
  await goto('/');
  await ev(`localStorage.clear(); return true`);
});

// 24. Accessibility: automated audit (names, ids/ARIA refs, headings, contrast, images) + keyboard, focus, dialogs, motion
await section('24 Accessibility', async () => {
  const A = 'U A11y';
  await viewport(1440);
  await goto('/');
  await ev(`localStorage.clear(); return true`);
  const AUDIT = `
    const issues = [];
    const ids = new Map();
    for (const el of document.querySelectorAll('[id]')) ids.set(el.id, (ids.get(el.id) ?? 0) + 1);
    for (const [id, n] of ids) if (n > 1) issues.push('duplicate id #' + id);
    for (const el of document.querySelectorAll('[aria-labelledby], [aria-describedby], [aria-controls]'))
      for (const attr of ['aria-labelledby', 'aria-describedby', 'aria-controls'])
        for (const ref of (el.getAttribute(attr) ?? '').split(/\\s+/).filter(Boolean)) if (!document.getElementById(ref)) issues.push(attr + ' -> missing #' + ref);
    const hs = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter((h) => h.getClientRects().length || h.classList.contains('sr-only'));
    if (hs.filter((h) => h.tagName === 'H1').length !== 1) issues.push('h1 count ' + hs.filter((h) => h.tagName === 'H1').length);
    let prev = 0;
    for (const h of hs) { const lvl = +h.tagName[1]; if (prev && lvl > prev + 1) issues.push('heading skip h' + prev + '->h' + lvl + ' ' + h.textContent.trim().slice(0, 30)); prev = lvl; }
    for (const img of document.querySelectorAll('img')) if (!img.hasAttribute('alt')) issues.push('img without alt');
    for (const svg of document.querySelectorAll('svg')) if (!svg.closest('[aria-hidden=true]') && !svg.getAttribute('aria-label') && !svg.querySelector('title')) issues.push('unlabelled svg');
    const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const parse = (s) => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; };
    const bgOf = (el) => { let rgb = [255, 255, 255]; const stack = []; for (let e = el; e; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.backgroundImage !== 'none' && !cs.backgroundImage.includes('gradient')) return null; const c = parse(cs.backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; } } for (const c of stack.reverse()) rgb = rgb.map((v, i) => Math.round(c.rgb[i] * c.a + v * (1 - c.a))); return rgb; };
    const seen = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n; let checked = 0;
    while ((n = walker.nextNode())) {
      const el = n.parentElement; if (!el || !n.textContent.trim() || seen.has(el)) continue; seen.add(el);
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || el.closest('[aria-hidden=true], .sr-only, [hidden], dialog:not([open])')) continue;
      let op = 1; for (let e = el; e; e = e.parentElement) op *= +getComputedStyle(e).opacity; if (op < 1) continue;
      const fg = parse(cs.color); const bg = bgOf(el); if (!fg || !bg) continue;
      const f = fg.rgb.map((v, i) => Math.round(v * fg.a + bg[i] * (1 - fg.a)));
      const L1 = lum(f), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(cs.fontSize); const large = size >= 24 || (+cs.fontWeight >= 700 && size >= 18.66);
      checked++;
      if (ratio < (large ? 3 : 4.5)) issues.push('contrast ' + ratio.toFixed(2) + ' "' + n.textContent.trim().slice(0, 30) + '"');
    }
    return { checked, issues: [...new Set(issues)] };`;
  const unnamed = async () => {
    await send('Accessibility.enable');
    const { result } = await send('Accessibility.getFullAXTree');
    const roles = ['button', 'link', 'textbox', 'combobox', 'checkbox', 'radio', 'listbox', 'menuitem', 'tab', 'switch', 'searchbox', 'spinbutton'];
    return result.nodes.filter((x) => !x.ignored && roles.includes(x.role?.value) && !(x.name?.value ?? '').trim()).map((x) => x.role.value);
  };
  const audit = async (label) => {
    const r = await ev(AUDIT);
    const u = await unnamed();
    check(A, `audit clean: ${label} (${r.checked} text nodes)`, r.checked > 10 && r.issues.length === 0 && u.length === 0, [...r.issues, ...u.map((x) => 'unnamed ' + x)].slice(0, 6).join(' | '));
  };

  await goto('/clubs/discover/comedyleague');
  await click(`byText('main article > header button', 'Apply')`);
  for (const p of ['/', '/clubs/discover', '/clubs/discover/comedyleague', '/clubs/fit', '/clubs/following', '/clubs/events', '/clubs/campus-life', '/clubs/applications', '/clubs/applications/profile', '/clubs/applications/comedyleague', '/clubs/applications/demo-org/apply', '/clubs/applications/demo-org/apply?view=review']) {
    await goto(p);
    await audit(p);
  }

  // Validation errors: announced, linked to their fields, focus moves to the first problem.
  await goto('/clubs/applications/demo-org/apply');
  await click(`byText('main button', 'Next')`);
  check(A, 'errors: summary is an alert, focus on first invalid field, fields linked to messages', await ev(`const f = $('#f-fullName'); return !!$('main [role=alert]') && document.activeElement === f && f.getAttribute('aria-invalid') === 'true' && f.getAttribute('aria-describedby').includes('f-fullName-error')`));
  await audit('apply form with validation errors');

  // Keyboard: Tab order follows the form and every stop shows a focus indicator.
  await goto('/clubs/applications/demo-org/apply');
  await ev(`$('#f-fullName').focus(); return true`);
  const order = [];
  for (let i = 0; i < 7; i++) {
    order.push(await ev(`const e = document.activeElement; const cs = getComputedStyle(e); return (e.id || e.textContent.trim().slice(0, 12)) + (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? '' : ' [no outline]')`));
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  }
  check(A, 'keyboard: Tab order follows the form, focus always visible', JSON.stringify(order.slice(1)) === JSON.stringify(['f-email', 'f-major', 'f-classYear', 'f-minor', 'Save draft', 'Next']), order.join(' > '));

  // Dialog: focus moves in, Escape closes, focus returns to the item that opened it.
  await goto('/clubs/campus-life');
  await click(`byText('main [aria-label="Calendar view"] button', 'Agenda')`);
  await ev(`const b = $$('main section[aria-labelledby^="day-"] li button')[0]; b.focus(); b.click(); return true`);
  await waitFor(`$('dialog[open]')`);
  check(A, 'dialog: focus moves inside and it is labelled', await ev(`const d = $('dialog[open]'); return d.contains(document.activeElement) && !!document.getElementById(d.getAttribute('aria-labelledby'))`));
  await audit('calendar with details dialog open');
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await waitFor(`!$('dialog[open]')`);
  check(A, 'dialog: Escape closes and focus returns to the opener', await ev(`return !$('dialog[open]') && document.activeElement?.closest('section[aria-labelledby^="day-"]') !== null`));

  // Reduced motion is respected.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await goto('/clubs/discover');
  check(A, 'prefers-reduced-motion turns transitions off', await ev(`return parseFloat(getComputedStyle($('main .btn')).transitionDuration) < 0.001`));
  await send('Emulation.setEmulatedMedia', { features: [] });

  // Mobile layout and drawer.
  await viewport(375, 812);
  for (const p of ['/clubs/discover', '/clubs/applications/demo-org/apply']) {
    await goto(p);
    await audit(`375px ${p}`);
  }
  await viewport(1440);
  await goto('/');
  await ev(`localStorage.clear(); return true`);
});

// 11. Overflow / responsive
const overflow = [];
await section('11 Responsive', async () => {
  const routes = ['/', '/clubs/discover', '/clubs/fit', '/clubs/discover/vietnamesestudentassociation', '/clubs/following', '/clubs/events', '/clubs/events/ev-career-fair', '/clubs/campus-life', '/calendar'];
  for (const w of [320, 375, 414, 768, 1024, 1280, 1440]) {
    await viewport(w);
    for (const r of routes) {
      await goto(r);
      const res = await ev(`
        const W = ${w};
        const clipped = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { if (getComputedStyle(p).overflowX !== 'visible') return true; } return false; };
        const off = $$('body *').filter(el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.right > W + 1 && !clipped(el); })
          .slice(0, 4).map(el => el.tagName.toLowerCase() + '[' + String(el.className).slice(0, 50) + '] "' + el.textContent.trim().slice(0, 30) + '" right=' + Math.round(el.getBoundingClientRect().right));
        return { sw: document.documentElement.scrollWidth, W, off };`);
      if (res.sw > res.W || res.off.length) overflow.push({ w, r, ...res });
    }
  }
  check('11 Responsive', 'no horizontal page overflow (7 widths × 8 routes)', overflow.length === 0, JSON.stringify(overflow.slice(0, 3)));
  // Campus Life week view on phone stays inside its scroller
  await viewport(375);
  await goto('/clubs/campus-life');
  await click(`byText('main button', 'Week')`);
  check('11 Responsive', 'week view on 375px scrolls internally', (await ev(`return document.documentElement.scrollWidth`)) <= 375);
  await goto('/clubs/discover/vietnamesestudentassociation'); await shot('qa-profile-375');
  await viewport(1440); await goto('/clubs/discover/vietnamesestudentassociation'); await shot('qa-profile-1440');
});

ws.close();
chrome.kill();

const failed = results.filter((r) => !r.pass);
const byArea = {};
for (const r of results) { byArea[r.area] ??= { pass: 0, fail: 0 }; byArea[r.area][r.pass ? 'pass' : 'fail']++; }
console.log('AREA SUMMARY', JSON.stringify(byArea));
console.log(`TOTAL ${results.length - failed.length}/${results.length} passed`);
for (const f of failed) console.log('FAIL', f.area, '|', f.name, '|', f.detail);
console.log('CONSOLE ISSUES', consoleIssues.size);
for (const c of consoleIssues) console.log(' -', c);
if (overflow.length) console.log('OVERFLOW', JSON.stringify(overflow, null, 1).slice(0, 3000));
process.exit(failed.length ? 1 : 0);
