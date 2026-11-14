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
  ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'myclubs-qa-'))}`, '--disable-gpu', '--no-first-run', '--no-default-browser-check', 'about:blank'],
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
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
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
const ready = `document.readyState === 'complete' && document.querySelector('main h1, main h2')`;
async function goto(path, call = send) { await call('Page.navigate', { url: BASE + path }); await sleep(150); await waitFor(ready, 4000, call); await sleep(100); }
async function reload() { await send('Page.reload', {}); await sleep(200); await waitFor(ready); await sleep(100); }
async function click(expr, settle = 180, call = send) { await evalIn(call, `const el = ${expr}; if (!el) throw new Error('not found: ' + ${JSON.stringify(expr)}); el.click(); return true`); await sleep(settle); }
const path = () => ev(`return location.pathname + location.search`);
async function viewport(width, height = 900) { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 }); }
async function shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64')); }
async function section(area, fn) { try { await fn(); } catch (e) { check(area, 'section crashed', false, e.message); } }

await viewport(1440);
await goto('/');
await ev(`localStorage.clear(); return true`);

const esc = async () => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }); await sleep(200); };
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
  const search = async (q) => { await ev(`typeInto($('main input[type=search]'), ${JSON.stringify(q)}); return true`); await sleep(150); return ev(`return cardTitles()`); };
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
  await ev(`typeInto($('main input[type=search]'), 'printers'); return true`); await sleep(150);
  n = await ev(`return cardTitles()`);
  check('2 Category', 'category + search combine', JSON.stringify(n) === '["3D Printing Club"]', n);
  await ev(`typeInto($('main input[type=search]'), ''); return true`); await sleep(100);
  await click(chip('Business'));
  n = (await ev(`return cardTitles()`)).sort();
  check('2 Category', 'Business includes curated business clubs', ['180 Degrees Consulting', 'Accounting Association', 'Isenberg Investment Club', 'Isenberg Sustainability Club'].every((x) => n.includes(x)) && (await ev(`return cards().every(c => c.textContent.includes('Business'))`)), n);
  check('2 Category', 'chip counts add up to the directory', await ev(`const chips = $$('[aria-label="Filter by category"] button'); const all = +chips[0].textContent.match(/(\\d+)/)[1]; return chips.slice(1).reduce((s, c) => s + +c.textContent.match(/(\\d+)\\s*$/)[1], 0) === all`));
  await click(chip('All'));
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
  await ev(`typeInto($$('main select')[1], 'name'); return true`); await sleep(300);
  await ev(`typeInto($$('main select')[0], 'following'); return true`); await sleep(300);
  n = await ev(`return cardTitles()`);
  check('3 Sort', 'Show: Following (seeded 2)', JSON.stringify(n) === JSON.stringify(['Chess Club', 'UMass Robotics Club']), n);
  await ev(`typeInto($$('main select')[0], 'not'); return true`); await sleep(300);
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
  await ev(`history.back(); return true`); await sleep(250);
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
  await ev(`typeInto($$('main select')[1], 'verified'); return true`); await sleep(200);
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
  await ev(`typeInto($('main input[type=search]'), 'pizza'); return true`); await sleep(150);
  let r = await ev(`return cardTitles()`);
  check('8 Save', 'event search "pizza"', JSON.stringify(r) === '["Intro to Hackathons Workshop"]', r);
  await ev(`typeInto($('main input[type=search]'), ''); return true`); await sleep(100);
  await click(`byText('[aria-label="Filter by category"] button', 'Gaming')`);
  r = await ev(`return cardTitles()`);
  check('8 Save', 'event category Gaming', JSON.stringify(r) === '["Smash Bros. Fall Tournament"]', r);
  await click(`byText('[aria-label="Filter by category"] button', 'All')`);
  await ev(`typeInto($('main select'), 'week'); return true`); await sleep(150);
  const wk = await ev(`return cardTitles().length`);
  await ev(`typeInto($('main select'), 'two-weeks'); return true`); await sleep(150);
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
  const openDrawer = async () => { await ev(`${burger}.focus(); ${burger}.click(); return true`); await sleep(250); };
  const key = async (k, code, vk) => { await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); await sleep(40); };
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
  await sleep(150);
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
  await sleep(500);
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
  await sleep(200);
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
  check('P Apps', 'filter: open membership (verified)', JSON.stringify(open) === JSON.stringify(['Chess Club', 'Outing Club', 'UMass Gaming and Esports Club']), open);
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
  await waitFor(`location.pathname === '/clubs/applications/comedyleague'`);
  check('P Apps', 'Apply opens the organization in Applications', (await path()) === '/clubs/applications/comedyleague' && (await ev(`const t = $('main').textContent; return $('main h1').textContent.includes('Comedy League') && t.includes('How to apply') && t.includes('Application link not available') && t.includes('never submits')`)));
  check('P Apps', 'Apply saves it as Interested', await ev(`const a = ls('myclubs:applications'); return $('main').textContent.includes('Interested') && a.length === 1 && a[0].clubId === 'comedyleague'`));
  await goto('/clubs/discover/comedyleague');
  await click(`byText('main header button', 'View application')`);
  await waitFor(`location.pathname === '/clubs/applications/comedyleague'`);
  check('P Apps', 'Apply again: View application, no duplicate', (await ev(`return ls('myclubs:applications').length`)) === 1);
  await ev(`typeInto($('main select'), 'draft'); typeInto($('main input[type=url]'), 'not a link'); return true`);
  await click(`byText('main button', 'Save tracker')`);
  check('P Apps', 'invalid link rejected', await ev(`return !!$('[role=alert]') && $('[role=alert]').textContent.includes('https://')`));
  await ev(`typeInto($('main input[type=url]'), 'https://umassamherst.campuslabs.com/engage/organization/comedyleague'); typeInto($('main input[type=date]'), '2026-11-20'); typeInto($('main textarea'), 'Audition piece: 2-minute improv scene.'); return true`);
  await click(`byText('main button', 'Save tracker')`);
  await reload();
  check('P Apps', 'tracker persists after refresh', await ev(`const a = ls('myclubs:applications')[0]; return a.status === 'draft' && a.reminder === '2026-11-20' && a.notes.startsWith('Audition') && $('main').textContent.includes('Draft in progress')`));
  await goto('/clubs/applications');
  check('P Apps', 'card: status, progress, deadline, reminder, link', await ev(`const c = cards()[0]; const t = c.textContent; return t.includes('Draft in progress') && t.includes('Deadline not listed') && t.includes('(you entered this)') && t.includes('Link you saved') && !!c.querySelector('ol[aria-label^="Progress: step 2 of 4"]')`));
  await goto('/clubs/applications/comedyleague');
  await ev(`typeInto($('main select'), 'submitted'); return true`);
  await click(`byText('main button', 'Save tracker')`);
  check('P Apps', 'status update is labeled self-reported', await ev(`return $('main').textContent.includes('Submitted externally (self-reported)')`));

  const tab = await json(`/json/new?${encodeURIComponent(BASE + '/')}`, 'PUT');
  const b = await connect(tab.webSocketDebuggerUrl);
  await goto('/clubs/applications', b.call);
  await goto('/clubs/discover?process=required');
  await click(`byText('button', 'Apply', card('Best Buddies'))`);
  check('P Apps', 'Apply on a Discover card opens that organization', await waitFor(`location.pathname === '/clubs/applications/bestbuddies' && $('main h1')?.textContent.includes('Best Buddies')`));
  check('P Apps', 'tracking in tab A appears in tab B', await waitFor(`$('main').textContent.includes('Best Buddies')`, 4000, b.call));
  b.sock.close();
  await fetch(`http://127.0.0.1:${PORT}/json/close/${tab.id}`).catch(() => {});

  await goto('/clubs/applications');
  await click(`byText('main button', 'Remove')`);
  check('P Apps', 'remove from tracker', (await ev(`return ls('myclubs:applications').length`)) === 1 && (await ev(`return cards().length`)) === 1);

  await click(`byText('main a', 'Open demo application')`);
  await waitFor(`location.pathname === '/clubs/applications/demo-org'`);
  check('P Apps', 'demo clearly labeled and fictional', await ev(`const t = $('main').textContent; return t.includes('Demo only — not sent to the organization.') && t.includes('fictional')`));
  await click(`byText('main button', 'Submit demo application')`);
  check('P Apps', 'demo requires all answers', await ev(`return !!$('[role=alert]') && $('[role=alert]').textContent.includes('all three')`));
  await ev(`const t = $$('main textarea'); typeInto(t[0], 'I love building robots.'); typeInto(t[1], 'Robotics team in high school.'); return true`);
  await click(`byText('main button', 'Save draft')`);
  await reload();
  check('P Apps', 'demo draft persists for editing', await ev(`const t = $$('main textarea'); return t[0].value === 'I love building robots.' && t[1].value.startsWith('Robotics') && $('main').textContent.includes('Draft in progress')`));
  await ev(`typeInto($$('main textarea')[2], 'Build nights and outreach.'); return true`);
  await click(`byText('main button', 'Submit demo application')`);
  check('P Apps', 'demo submit → confirmation, demo-only status', await ev(`const t = $('main').textContent; return t.includes('Demo application submitted') && t.includes('Submitted (demo only)') && t.includes('Not sent to the organization')`));
  await reload();
  check('P Apps', 'demo submission status persists', await ev(`return $('main').textContent.includes('Demo application submitted')`));
  await click(`byText('main button', 'Edit draft')`);
  check('P Apps', 'edit after submit returns to draft', await ev(`return $$('main textarea').length === 3 && ls('myclubs:applications').find(a => a.clubId === 'demo-org').status === 'draft'`));
  await goto('/clubs/applications');
  check('P Apps', 'demo kept separate from real applications', await ev(`return cards().length === 1 && $('#demo-app').closest('section').textContent.includes('Draft in progress')`));
  check('P Apps', 'nav counts: My Clubs & Associations 3, Applications 2', await ev(`const t = $('#clubs-nav').textContent; return /My Clubs & Associations\\s*3/.test(t) && /Applications\\s*2/.test(t)`));

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
