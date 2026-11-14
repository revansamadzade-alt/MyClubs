// Refreshes src/data/generated/campus-data.json from public, unauthenticated UMass sources:
//   - Campus Pulse (Anthology Engage) public events RSS:   https://umassamherst.campuslabs.com/engage/events.rss
//   - UMass Amherst Events Calendar public iCalendar feed: https://events.umass.edu/calendar/1.ics
//   - Campus Pulse public organization/event pages (data embedded in the public HTML) for host organizations
// Run: npm run sync:data   (add --explore to list event hosts without writing)
// Never fails the build: a source that cannot be reached keeps its previous snapshot data and is marked in `sources`.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  classifyCategory,
  classifyEvent,
  dedupeAgainst,
  excerpt,
  initialsFor,
  mergeSource,
  parseCampusPulseRss,
  parseIcs,
  stablePick,
  stripHtml,
  tidySummary,
} from './lib/feeds.mjs';

const CP = 'https://umassamherst.campuslabs.com/engage';
const UMASS_ICS = 'https://events.umass.edu/calendar/1.ics';
const OUT = fileURLToPath(new URL('../src/data/generated/campus-data.json', import.meta.url));
const CURATED = JSON.parse(readFileSync(new URL('./curated-clubs.json', import.meta.url), 'utf8'));
const MAX_CLUBS = 100;
const EVENT_DAYS = 120;
const HOST_DAYS = 60;
const MAX_HOURS = 16;
const PALETTE = ['#1e4f8f', '#5a3a8a', '#335c81', '#00756a', '#2b3a55', '#1d4f91', '#127a7a', '#394b58', '#a3324a', '#7a3e9d', '#b8172b', '#2f6f4f', '#4b5d16', '#6b5b2a', '#995c00', '#0f6b8f', '#8a4b08', '#a03c78', '#881c1c', '#2f6f8f'];
const COVERS = ['solid', 'circuit', 'dots', 'forest', 'waves', 'grid', 'topo'];
const explore = process.argv.includes('--explore');

const now = new Date();
const today = now.toISOString().slice(0, 10);
const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { clubs: [], events: [], sources: [] };
const prevSource = (id) => prev.sources?.find((s) => s.id === id);

async function get(url) {
  let last;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'MyClubs HackUMass prototype (public feed sync)' }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

/** The public page's embedded `window.initialAppState.preFetchedData`. */
function pageData(html) {
  const i = html.indexOf('window.initialAppState');
  if (i < 0) return null;
  const s = html.indexOf('{', i);
  let depth = 0;
  let j = s;
  for (; j < html.length; j++) {
    if (html[j] === '{') depth++;
    else if (html[j] === '}' && --depth === 0) break;
  }
  return JSON.parse(html.slice(s, j + 1)).preFetchedData ?? null;
}

async function pool(items, size, fn) {
  const queue = [...items];
  await Promise.all(Array.from({ length: size }, async () => { while (queue.length) await fn(queue.shift()); }));
}

const hours = (a, b) => (new Date(b) - new Date(a)) / 3600000;
const inWindow = (e, days) => e.start && e.end && new Date(e.end) > now && new Date(e.start) < new Date(now.getTime() + days * 86400000) && hours(e.start, e.end) <= MAX_HOURS && hours(e.start, e.end) > 0;

// 1. Campus Pulse public RSS
let cpItems = [];
let cpError;
try {
  cpItems = parseCampusPulseRss(await get(`${CP}/events.rss`)).filter((i) => i.cpId && !/cancel/i.test(i.status) && inWindow(i, EVENT_DAYS));
} catch (e) {
  cpError = String(e.message ?? e);
}

// 2. Event hosts. Public event pages expose only a numeric host id, and Campus Pulse's robots.txt disallows the
//    /engage/api/ endpoints that would resolve it, so hosts are matched by name and new ones become "event host" entries.
const OFFICE = /\b(center for|office of|department|division of|dean|libraries|campus recreation|recreation & wellbeing|student success|residential life|career|counseling|health services|disability|international programs|student affairs|student engagement|cultural center|stonewall center|women and community|services|advocacy, inclusion)\b|^university of|^umass amherst$/i;
const hostCounts = new Map();
for (const i of cpItems) if (i.host && inWindow(i, HOST_DAYS)) hostCounts.set(i.host, (hostCounts.get(i.host) ?? 0) + 1);

if (explore) {
  for (const [host, n] of [...hostCounts].sort((a, b) => b[1] - a[1])) console.log(`${OFFICE.test(host) ? 'office ' : 'student'} | ${n} | ${host}`);
  process.exit(0);
}

// 3. Curated clubs: refresh from their public organization pages
const orgById = new Map();
let orgFailures = 0;
await pool(CURATED, 4, async (c) => {
  try {
    const org = pageData(await get(`${CP}/organization/${c.id}`))?.organization;
    if (org?.websiteKey) orgById.set(org.websiteKey, org);
  } catch {
    orgFailures++;
  }
});

const LINKS = [['externalWebsite', 'Website'], ['instagramUrl', 'Instagram'], ['facebookUrl', 'Facebook'], ['youtubeUrl', 'YouTube'], ['linkedInUrl', 'LinkedIn'], ['twitterUrl', 'X (Twitter)'], ['googleCalendarUrl', 'Google Calendar']];
const normUrl = (u) => {
  const s = (u ?? '').trim();
  if (!s) return '';
  return /^https?:\/\//i.test(s) ? s : s.includes('.') ? `https://${s}` : '';
};

function toClub(org, curated, previous) {
  const id = org.websiteKey;
  const summaryText = stripHtml(org.summary);
  const desc = stripHtml(org.description);
  const summary = tidySummary(summaryText.length >= 20 && !/^n\/?a$/i.test(summaryText) ? summaryText : desc);
  return {
    id,
    name: org.name.trim(),
    initials: curated?.initials ?? previous?.initials ?? initialsFor(org.name),
    category: curated?.category ?? previous?.category ?? classifyCategory(org.name, summaryText, desc),
    tags: curated?.tags ?? previous?.tags ?? [],
    summary,
    about: excerpt(desc.length > summary.length ? desc : summary, 480),
    meetings: curated?.meetings ?? [],
    ...(curated?.scheduleNote ? { scheduleNote: curated.scheduleNote } : {}),
    ...(curated?.location ? { location: curated.location } : {}),
    color: curated?.color ?? previous?.color ?? stablePick(PALETTE, id),
    cover: curated?.cover ?? previous?.cover ?? stablePick(COVERS, id),
    links: LINKS.map(([k, label]) => ({ label, url: normUrl(org.socialMedia?.[k]) })).filter((l) => l.url),
    sourceUrl: `${CP}/organization/${id}`,
    verifiedOn: today,
  };
}

const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Directory entry for an organization known only as a host in the public events feed. Nothing beyond the feed is claimed. */
function hostClub(name, previous) {
  const id = `host-${slug(name)}`;
  const titles = cpItems.filter((i) => i.host === name).map((i) => i.title).join(' ');
  return {
    id,
    name,
    initials: previous?.initials ?? initialsFor(name),
    category: previous?.category ?? classifyCategory(name, titles),
    tags: ['Event host'],
    summary: 'Hosts public events listed on Campus Pulse.',
    about:
      "This organization appears as an event host in Campus Pulse's public events feed. Its full profile (description, contacts, meeting times) isn't part of the public feeds, so MyClubs doesn't show one. Open Campus Pulse for details.",
    meetings: [],
    color: previous?.color ?? stablePick(PALETTE, id),
    cover: previous?.cover ?? stablePick(COVERS, id),
    links: [{ label: 'Find on Campus Pulse', url: `${CP}/organizations?query=${encodeURIComponent(name)}` }],
    sourceUrl: cpItems.find((i) => i.host === name)?.link ?? previous?.sourceUrl ?? `${CP}/organizations`,
    sourceKind: 'event-host',
    verifiedOn: cpItems.some((i) => i.host === name) ? today : (previous?.verifiedOn ?? today),
  };
}

// 4. Directory: previous entries are kept (so follows never break), curated clubs refreshed, new hosts added up to the cap
const curatedById = new Map(CURATED.map((c) => [c.id, c]));
const prevById = new Map(prev.clubs.map((c) => [c.id, c]));
const clubs = new Map();
for (const id of new Set([...prevById.keys(), ...curatedById.keys()])) {
  const org = orgById.get(id);
  const previous = prevById.get(id);
  const club = org && org.status === 'Active' ? toClub(org, curatedById.get(id), previous) : previous?.sourceKind === 'event-host' && hostCounts.has(previous.name) ? hostClub(previous.name, previous) : previous;
  if (club) clubs.set(id, club);
}
const byName = (name) => [...clubs.values()].find((c) => slug(c.name) === slug(name));
const candidates = [...hostCounts].filter(([host]) => !OFFICE.test(host) && !byName(host)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
for (const [host] of candidates) {
  if (clubs.size >= MAX_CLUBS) break;
  const club = hostClub(host);
  clubs.set(club.id, club);
}

// 5. Events
const clubForHost = (host) => (host ? byName(host) : undefined);
const cpEvents = cpItems.map((i) => {
  const club = clubForHost(i.host);
  return {
    id: `cp-${i.cpId}`,
    title: i.title,
    start: i.start,
    end: i.end,
    location: i.location || 'Location not listed',
    description: excerpt(i.description || 'No description published.', 420),
    category: club?.category ?? classifyEvent(i.categories, i.title),
    ...(club ? { clubId: club.id } : {}),
    host: club?.name ?? (i.host || 'Campus Pulse'),
    verified: { url: i.link, retrievedOn: today, source: 'Campus Pulse' },
  };
});

let umEvents = [];
let umError;
try {
  umEvents = parseIcs(await get(UMASS_ICS))
    .filter((e) => e.uid && e.summary && !e.allDay && !/cancel/i.test(e.status ?? '') && inWindow(e, EVENT_DAYS))
    .map((e) => ({
      id: `um-${e.uid.match(/(\d+)\s*$/)?.[1] ?? e.uid.replace(/\W+/g, '')}`,
      title: e.summary,
      start: e.start,
      end: e.end,
      location: e.location || 'Location not listed',
      description: excerpt(e.description || 'No description published.', 420),
      category: classifyEvent(e.categories, e.summary),
      host: 'UMass Amherst Events Calendar',
      verified: { url: e.url || 'https://events.umass.edu', retrievedOn: today, source: 'UMass Events Calendar' },
    }));
  umEvents = dedupeAgainst(cpEvents, umEvents);
} catch (e) {
  umError = String(e.message ?? e);
}

const prevEvents = prev.events ?? [];
const events = [
  ...mergeSource({ ok: !cpError, fresh: cpEvents, previous: prevEvents.filter((e) => e.id.startsWith('cp-')), now }),
  ...mergeSource({ ok: !umError, fresh: umEvents, previous: prevEvents.filter((e) => e.id.startsWith('um-')), now }),
]
  .filter((e, i, all) => all.findIndex((x) => x.id === e.id) === i)
  .map((e) => (e.clubId && !clubs.has(e.clubId) ? { ...e, clubId: undefined } : e))
  .sort((a, b) => new Date(a.start) - new Date(b.start));

const source = (id, name, url, error, count) => ({
  id,
  name,
  url,
  ok: !error,
  count,
  updatedAt: error ? (prevSource(id)?.updatedAt ?? null) : now.toISOString(),
  ...(error ? { error } : {}),
});

const data = {
  retrievedAt: now.toISOString(),
  sources: [
    source('campus-pulse-rss', 'Campus Pulse public events RSS', `${CP}/events.rss`, cpError, cpEvents.length),
    source('umass-events-ics', 'UMass Amherst Events Calendar (iCalendar)', UMASS_ICS, umError, umEvents.length),
    source('campus-pulse-orgs', 'Campus Pulse public organization pages', `${CP}/organizations`, orgFailures ? `${orgFailures} page(s) failed; previous data kept for those` : undefined, orgById.size),
  ],
  clubs: [...clubs.values()].sort((a, b) => a.name.localeCompare(b.name)),
  events,
};
writeFileSync(OUT, `${JSON.stringify(data, null, 1)}\n`);
console.log(
  `clubs ${data.clubs.length} (curated ${CURATED.length}) · events ${events.length} (campus pulse ${cpEvents.length}, umass events ${umEvents.length}) · org page failures ${orgFailures}`,
);
for (const s of data.sources) console.log(` ${s.ok ? 'OK ' : 'ERR'} ${s.name}: ${s.count}${s.error ? ` — ${s.error}` : ''}`);
