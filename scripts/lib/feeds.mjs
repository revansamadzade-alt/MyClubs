// Pure helpers for scripts/sync-data.mjs: parse public feeds, normalize times, dedupe, classify.
// No network or file access here, so everything is unit-testable offline.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…' };

export function decodeEntities(s = '') {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

export function stripHtml(html = '') {
  return decodeEntities(html.replace(/<br\s*\/?>|<\/p>|<\/li>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** One- to two-sentence summary: trailing "Website: <url>" removed, cut at a sentence boundary, max ~220 chars. */
export function tidySummary(text = '') {
  let s = text.replace(/\s+/g, ' ').trim().replace(/\s*Website:\s*\S+$/i, '').replace(/\s+https?:\/\/\S+$/i, '');
  if (s.length > 220) s = excerpt(s, 220);
  return /[.!?)…]$/.test(s) || !s ? s : `${s}.`;
}

/** Short excerpt ending on a sentence boundary when possible. */
export function excerpt(text = '', limit = 280) {
  const s = text.replace(/\s+/g, ' ').trim();
  if (s.length <= limit) return s;
  const cut = s.slice(0, limit);
  const i = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return i > limit * 0.4 ? cut.slice(0, i + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
}

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim() : '';
};

/** "2026-11-14T10:30:00.0000000-05:00" → ISO UTC string. */
export function isoFromOffsetDate(s) {
  const d = new Date(s.replace(/(\.\d{3})\d+/, '$1'));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Campus Pulse (Anthology Engage) public RSS → normalized events. */
export function parseCampusPulseRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const description = tag(item, 'description');
    const link = tag(item, 'link');
    const start =
      isoFromOffsetDate(description.match(/class="dt-start[^"]*"\s+datetime="([^"]+)"/)?.[1] ?? '') ?? isoFromOffsetDate(tag(item, 'start'));
    const end =
      isoFromOffsetDate(description.match(/class="dt-end[^"]*"\s+datetime="([^"]+)"/)?.[1] ?? '') ?? isoFromOffsetDate(tag(item, 'end'));
    return {
      cpId: link.match(/\/event\/(\d+)/)?.[1] ?? null,
      title: decodeEntities(tag(item, 'title')),
      link,
      start,
      end,
      location: decodeEntities(tag(item, 'location')) || stripHtml(description.match(/class="p-location[^"]*">([\s\S]*?)<\/span>/)?.[1] ?? ''),
      host: decodeEntities(tag(item, 'host')),
      status: decodeEntities(tag(item, 'status')),
      categories: [...item.matchAll(/<category>([\s\S]*?)<\/category>/g)].map((m) => decodeEntities(m[1].trim())),
      description: stripHtml(description.match(/class="p-description[^"]*">([\s\S]*?)<\/div>/)?.[1] ?? ''),
    };
  });
}

function tzOffsetMinutes(utcMs, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  );
  return (Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - utcMs) / 60000;
}

/** Wall-clock time in `timeZone` → Date (handles DST). */
export function zonedTimeToUtc(y, mo, d, h, mi, s, timeZone) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  const first = guess - tzOffsetMinutes(guess, timeZone) * 60000;
  return new Date(guess - tzOffsetMinutes(first, timeZone) * 60000);
}

function icsDate(value, params) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return { iso: null, allDay: false };
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined) return { iso: zonedTimeToUtc(+y, +mo, +d, 0, 0, 0, 'America/New_York').toISOString(), allDay: true };
  if (z) return { iso: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString(), allDay: false };
  const tz = params.match(/TZID=([^;:]+)/)?.[1] ?? 'America/New_York';
  return { iso: zonedTimeToUtc(+y, +mo, +d, +h, +mi, +s, tz).toISOString(), allDay: false };
}

const icsText = (v) => v.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();

/** iCalendar (RFC 5545) → VEVENTs with UTC ISO times. */
export function parseIcs(text) {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = { categories: [] };
    else if (line === 'END:VEVENT') {
      if (cur) events.push(cur);
      cur = null;
    } else if (cur) {
      const m = line.match(/^([A-Z-]+)((?:;[^:]*)?):(.*)$/);
      if (!m) continue;
      const [, name, params, value] = m;
      if (name === 'UID') cur.uid = value;
      else if (name === 'SUMMARY') cur.summary = icsText(value);
      else if (name === 'DESCRIPTION') cur.description = icsText(value);
      else if (name === 'LOCATION') cur.location = icsText(value);
      else if (name === 'URL') cur.url = value.trim();
      else if (name === 'CATEGORIES') cur.categories.push(...icsText(value).split(',').map((c) => c.trim()));
      else if (name === 'STATUS') cur.status = value.trim();
      else if (name === 'DTSTART') Object.assign(cur, (({ iso, allDay }) => ({ start: iso, allDay }))(icsDate(value, params)));
      else if (name === 'DTEND') cur.end = icsDate(value, params).iso;
    }
  }
  return events;
}

export const normTitle = (s = '') => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Drop `secondary` events that match a `primary` event by normalized title and start time (± tolerance). */
export function dedupeAgainst(primary, secondary, toleranceMin = 30) {
  return secondary.filter(
    (b) =>
      !primary.some(
        (a) => normTitle(a.title) === normTitle(b.title) && Math.abs(new Date(a.start) - new Date(b.start)) <= toleranceMin * 60000,
      ),
  );
}

const RULES = [
  ['Faith & Spirituality', /christ|fellowship|ministr|church|catholic|hillel|jewish|sikh|hindu|buddhis|prayer|bible|faith|spiritual|interfaith|\bcru\b|basic\b/i],
  ['Gaming', /gaming|esports?|video game|anime|smash bros|super smash|board game|tabletop|pok[eé]mon/i],
  ['Technology', /comput|software|coding|hack|cyber|\bdata\b|\bai\b|artificial intelligence|developer|robot|programming|machine learning|tech\b/i],
  ['Engineering', /engineer|rocket|formula|3d print|makers?\b|aerospace|electrical|mechanical/i],
  ['Business', /business|financ|invest|consult|accounting|entrepreneur|marketing|real estate|isenberg|economics|trading/i],
  ['Media', /radio|newspaper|journal|magazine|\btv\b|podcast|photograph|collegian|broadcast/i],
  ['Service', /volunteer|charit|fundrais|habitat|circle k|unicef|relief|cancer|marathon|girl up|food recovery|buddies|service/i],
  ['Arts & Music', /a ?cappella|music|band\b|choir|chorus|orchestra|dance|theat|\barts?\b|comedy|improv|drama|sing|poetry|film|instrument/i],
  ['Sports & Recreation', /sport|frisbee|ultimate|soccer|rugby|\bski\b|climb|outing|hiking|martial|wushu|fencing|tennis|volleyball|basketball|running|cycling|sailing|equestrian|chess|altitude|pickleball|hockey|lacrosse/i],
  ['Wellness', /wellness|mental health|mindful|yoga|active minds|wellbeing/i],
  ['Career', /pre-?(law|med|health|dental|optometry|vet|pharm)|professional|career|medical association|nursing|alumni association/i],
  ['Cultural', /cultur|heritage|african|asian|latin|black|caribbean|chinese|korean|japanese|vietnamese|indian|haitian|filipino|muslim|arab|bengali|gujarati|cantonese|tibet|thai|international|students? association|queer|lgbt|women of color/i],
  ['Academic', /society|honor|science|math|physics|chemistry|biology|history|philosoph|political|law\b|psycholog|nutrition|academic|debate|model un/i],
];

/** Deterministic MyClubs display category (a display choice, not an official Campus Pulse field). */
export function classifyCategory(...texts) {
  const s = texts.filter(Boolean).join(' ');
  return RULES.find(([, re]) => re.test(s))?.[0] ?? 'Campus Life';
}

const EVENT_RULES = [
  ['Academic', /lecture|talk|reading|seminar|workshop|academic|research|conference|panel|class/i],
  ['Arts & Music', /perform|concert|music|theat|film|exhibit|\barts?\b|dance|comedy/i],
  ['Sports & Recreation', /athletic|sport|recreation|fitness|outdoor/i],
  ['Service', /fundrais|service|volunteer|donation/i],
  ['Career', /career|network|professional|job|internship/i],
  ['Cultural', /cultur|heritage|international|diversity/i],
  ['Wellness', /wellness|health|mental|wellbeing/i],
  ['Faith & Spirituality', /spiritual|religio|faith|prayer|worship/i],
  ['Gaming', /\bgames?\b|gaming/i],
];

export function classifyEvent(categories = [], title = '') {
  const s = `${categories.join(' ')} ${title}`;
  return EVENT_RULES.find(([, re]) => re.test(s))?.[0] ?? 'Campus Life';
}

const STOP = new Set(['umass', 'the', 'of', 'and', 'at', 'amherst', 'university', 'massachusetts', 'for', 'a', '&', 'club', 'in']);
export function initialsFor(name) {
  const words = name.replace(/[^A-Za-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w.toLowerCase()));
  if (!words.length) return name.slice(0, 2).toUpperCase();
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}

export function stablePick(list, key) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

/**
 * Next snapshot's events for one source: fresh items when the source succeeded (plus already-ended items from the
 * previous snapshot so saved/past events keep resolving), or the previous items unchanged when it failed.
 */
export function mergeSource({ ok, fresh, previous, now }) {
  if (!ok) return previous;
  const ids = new Set(fresh.map((e) => e.id));
  const history = previous.filter((e) => !ids.has(e.id) && new Date(e.end) <= now);
  return [...fresh, ...history];
}

/** Lower-case text with HTML removed, typographic quotes/dashes normalized and whitespace collapsed. */
export function normalizeText(s = '') {
  return stripHtml(s)
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”‟]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Re-check of a hand-verified membership statement against the organization's current public page text.
 * 'confirmed' when the quoted evidence still appears; 'changed' when the page no longer contains it (needs a person to
 * review; the verified information is never rewritten automatically); 'unavailable' when there is no page text.
 */
export function checkMembershipEvidence(pageText, evidence) {
  // Compare wording only: spacing and punctuation differences ("welcome(including", a final "!" vs ".") don't count.
  const words = (s) => ` ${normalizeText(s).replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const page = words(pageText);
  if (!page.trim()) return 'unavailable';
  return page.includes(words(evidence)) ? 'confirmed' : 'changed';
}

const MEMBERSHIP_WORDING = /\b(auditions?|try-?outs?|apply|application|interview|selective|recruit(ment|ing)?|become a member|open to (all|any|every)|everyone is welcome|all are welcome|no experience (is )?(necessary|needed|required)|join (at )?any ?time)\b/i;

/** Sentences that mention how to join — leads for a person to verify, never applied automatically. */
export function membershipLeads(pageText) {
  return stripHtml(pageText)
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15 && MEMBERSHIP_WORDING.test(s));
}
