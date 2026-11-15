// Before/after screenshots of the real app for the UI polish review (signed out, read-only).
//
//   node ui-review/shoot.mjs <before|after> [baseUrl]
//
// Also reports horizontal overflow and console errors per page, at 375, 768, 1440 and 1920 px.
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LABEL = process.argv[2] ?? 'after';
const BASE = process.argv[3] ?? 'http://localhost:5173';
const OUT = fileURLToPath(new URL(`./${LABEL}/`, import.meta.url));
mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9377;

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, '--hide-scrollbars', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'myclubs-uireview-'))}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 60; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    if (targets.some((t) => t.type === 'page')) break;
  } catch {}
  await sleep(200);
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const consoleErrors = [];
let current = '';
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(`${current}: ${m.params.exceptionDetails.text}`);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(`${current}: ${m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 200)}`);
});
const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const ev = async (expr) => (await call('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true }))?.result?.value;
await call('Page.enable');
await call('Runtime.enable');

const PAGES = [
  ['home', '/', `document.querySelector('main h1')`],
  ['dashboard', '/dashboard', `document.querySelector('main h1')`],
  ['explore', '/clubs/discover', `document.querySelectorAll('main article').length > 20`],
  ['club-profile', '/clubs/discover/chessclub', `document.querySelector('main h1')?.textContent.includes('Chess')`],
  ['find-my-fit', '/clubs/fit', `document.querySelector('#group-fits')`],
  ['events', '/clubs/events', `document.querySelectorAll('main article').length > 3`],
  ['campus-life', '/clubs/campus-life', `document.querySelector('main h1')`],
  ['applications', '/clubs/applications', `document.querySelector('[data-testid=profile-card]')`],
  ['clubfund', '/clubs/clubfund', `document.querySelectorAll('[data-testid=cf-campaign]').length === 6`],
  ['clubfund-campaign', '/clubs/clubfund/campaigns/demo-club-equipment', `document.querySelector('[data-testid=cf-campaign-recipient]')`],
  ['clubfund-wallet', '/clubs/clubfund/settings', `document.querySelector('main h1')`],
  ['event-detail', '/clubs/events/ev-hack-workshop', `document.querySelector('[data-testid=cf-event-entry]')`],
  ['following', '/clubs/following', `document.querySelector('main h1')`],
  ['application-detail', '/clubs/applications/demo-org', `document.querySelector('main h1')`],
  ['apply-form', '/clubs/applications/demo-org/apply', `document.querySelector('#step-heading')`],
  ['applicant-profile', '/clubs/applications/profile', `document.querySelector('main h1')`],
  ['not-found', '/this-page-does-not-exist', `document.querySelector('main h1')`],
];
const SIZES = [
  ['desktop-1440', 1440, 900, 1, false],
  ['mobile-375', 375, 812, 2, true],
  ['tablet-768', 768, 1024, 1, false],
  ['laptop-1024', 1024, 768, 1, false],
  ['desktop-1920', 1920, 1080, 1, false],
];
// Full screenshots for the two sizes people compare; the other two are checked for overflow only.
const SHOOT = new Set(['desktop-1440', 'mobile-375']);

const overflow = [];
for (const [size, width, height, scale, mobile] of SIZES) {
  await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
  for (const [name, path, ready] of PAGES) {
    current = `${size} ${name}`;
    await call('Page.navigate', { url: BASE + path });
    for (let t = 0; t < 150; t++) {
      await sleep(200);
      if (await ev(`return document.readyState === 'complete' && !!(${ready})`)) break;
    }
    await ev(`await document.fonts.ready; return true`);
    await sleep(700);
    const m = await ev(`return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }`);
    if (m.sw > m.cw + 1) overflow.push(`${current}: page is ${m.sw}px wide in a ${m.cw}px viewport`);
    if (SHOOT.has(size)) {
      const { data } = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      writeFileSync(join(OUT, `${name}--${size}.png`), Buffer.from(data, 'base64'));
    }
    console.log('checked', current);
  }
}
const report = { label: LABEL, base: BASE, horizontalOverflow: overflow, consoleErrors };
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
ws.close();
chrome.kill();
process.exit(0);
