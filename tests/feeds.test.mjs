// Offline tests for the public-feed sync (scripts/lib/feeds.mjs) and the committed data snapshot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  classifyCategory,
  dedupeAgainst,
  mergeSource,
  parseCampusPulseRss,
  parseIcs,
  tidySummary,
  zonedTimeToUtc,
} from '../scripts/lib/feeds.mjs';

const RSS = `<rss><channel><item>
<title>Fall 2026 Food Fair &amp; Bake Sale</title>
<link>https://umassamherst.campuslabs.com/engage/event/12912251</link>
<description><![CDATA[<div class="h-event vevent"><div class="p-description description"><p>Taste&nbsp;dishes from VSA.</p></div>
<time class="dt-start dtstart" datetime="2026-11-14T12:00:00.0000000-05:00">x</time>
<time class="dt-end dtend" datetime="2026-11-14T15:00:00.0000000-05:00">y</time></div>]]></description>
<category>Cultural</category><category>Food</category>
<start xmlns="events">Sat, 14 Nov 2026 17:00:00 GMT</start>
<location xmlns="events">Hampshire Dining Commons</location>
<status xmlns="events">confirmed</status>
<host xmlns="events">Vietnamese Students Association</host>
</item></channel></rss>`;

test('Campus Pulse RSS item → normalized event (UTC, host, location, categories)', () => {
  const [e] = parseCampusPulseRss(RSS);
  assert.equal(e.cpId, '12912251');
  assert.equal(e.title, 'Fall 2026 Food Fair & Bake Sale');
  assert.equal(e.start, '2026-11-14T17:00:00.000Z');
  assert.equal(e.end, '2026-11-14T20:00:00.000Z');
  assert.equal(e.host, 'Vietnamese Students Association');
  assert.equal(e.location, 'Hampshire Dining Commons');
  assert.deepEqual(e.categories, ['Cultural', 'Food']);
  assert.equal(e.description, 'Taste dishes from VSA.');
});

const ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:tag:localist.com\\,2008:EventInstance_111',
  'DTSTART:20261118T230000Z',
  'DTEND:20261119T003000Z',
  'SUMMARY:Lecture: AI\\, Democracy',
  'DESCRIPTION:Line one\\nline two that is fol',
  ' ded across lines',
  'LOCATION:Campus Center Auditorium',
  'URL;VALUE=URI:https://events.umass.edu/event/ai-democracy',
  'CATEGORIES:Lecture/Talk/Reading',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:tag:localist.com\\,2008:EventInstance_222',
  'DTSTART;TZID=America/New_York:20260701T100000',
  'DTEND;TZID=America/New_York:20260701T110000',
  'SUMMARY:Summer session',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:all-day',
  'DTSTART;VALUE=DATE:20261120',
  'SUMMARY:Exhibit',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

test('iCalendar: unfolding, escapes, UTC, TZID with DST, all-day flag', () => {
  const [a, b, c] = parseIcs(ICS);
  assert.equal(a.summary, 'Lecture: AI, Democracy');
  assert.equal(a.description, 'Line one\nline two that is folded across lines');
  assert.equal(a.start, '2026-11-18T23:00:00.000Z');
  assert.equal(a.url, 'https://events.umass.edu/event/ai-democracy');
  assert.deepEqual(a.categories, ['Lecture/Talk/Reading']);
  assert.equal(b.start, '2026-07-01T14:00:00.000Z', 'EDT is UTC-4');
  assert.equal(c.allDay, true);
});

test('zonedTimeToUtc handles standard and daylight time', () => {
  assert.equal(zonedTimeToUtc(2026, 11, 14, 10, 30, 0, 'America/New_York').toISOString(), '2026-11-14T15:30:00.000Z');
  assert.equal(zonedTimeToUtc(2026, 7, 1, 10, 0, 0, 'America/New_York').toISOString(), '2026-07-01T14:00:00.000Z');
});

test('cross-source dedupe matches title + start within 30 min only', () => {
  const primary = [{ title: 'Carrie: The Musical', start: '2026-11-20T00:00:00Z' }];
  const secondary = [
    { title: 'Carrie — The Musical!', start: '2026-11-20T00:10:00Z' },
    { title: 'Carrie: The Musical', start: '2026-11-21T00:00:00Z' },
  ];
  assert.deepEqual(dedupeAgainst(primary, secondary), [secondary[1]]);
});

test('source failure keeps previous data; success keeps ended history but drops removed upcoming', () => {
  const now = new Date('2026-11-15T12:00:00Z');
  const previous = [
    { id: 'a', end: '2026-11-14T12:00:00Z' },
    { id: 'b', end: '2026-11-20T12:00:00Z' },
  ];
  assert.equal(mergeSource({ ok: false, fresh: [], previous, now }), previous);
  const fresh = [{ id: 'c', end: '2026-11-21T12:00:00Z' }];
  assert.deepEqual(mergeSource({ ok: true, fresh, previous, now }).map((e) => e.id), ['c', 'a']);
});

test('deterministic category rules', () => {
  assert.equal(classifyCategory('Korean Christian Fellowship'), 'Faith & Spirituality');
  assert.equal(classifyCategory('Anime & Manga Club'), 'Gaming');
  assert.equal(classifyCategory('UMass Dance Marathon'), 'Service');
  assert.equal(classifyCategory('Thai Student Association'), 'Cultural');
  assert.equal(classifyCategory('Some New Group'), 'Campus Life');
});

test('summaries are trimmed and never end mid-thought without punctuation', () => {
  assert.equal(tidySummary('Premier Formula One Club at UMass Amherst'), 'Premier Formula One Club at UMass Amherst.');
  assert.equal(tidySummary('Chess for all. Website: https://example.org/chess'), 'Chess for all.');
});

const data = JSON.parse(readFileSync(new URL('../src/data/generated/campus-data.json', import.meta.url), 'utf8'));

test('snapshot integrity: unique ids, valid links, no invented details', () => {
  const clubIds = data.clubs.map((c) => c.id);
  const eventIds = data.events.map((e) => e.id);
  assert.equal(new Set(clubIds).size, clubIds.length);
  assert.equal(new Set(eventIds).size, eventIds.length);
  assert.ok(data.clubs.length >= 50 && data.clubs.length <= 100, `directory size ${data.clubs.length}`);
  for (const e of data.events) {
    assert.ok(new Date(e.start) < new Date(e.end), `${e.id} start before end`);
    assert.match(e.verified.url, /^https:\/\/(umassamherst\.campuslabs\.com\/engage\/event\/\d+|events\.umass\.edu\b)/);
    if (e.clubId) assert.ok(clubIds.includes(e.clubId), `${e.id} links to an existing club`);
  }
  const curated = new Set(JSON.parse(readFileSync(new URL('../scripts/curated-clubs.json', import.meta.url), 'utf8')).map((c) => c.id));
  for (const c of data.clubs) {
    if (!curated.has(c.id)) assert.equal(c.meetings.length, 0, `${c.name}: schedules only come from curated, verified listings`);
    if (c.sourceKind === 'event-host') {
      assert.equal(c.summary, 'Hosts public events listed on Campus Pulse.');
      assert.ok(c.links.every((l) => l.url.startsWith('https://umassamherst.campuslabs.com/engage/')));
    }
  }
  assert.ok(data.sources.every((s) => typeof s.ok === 'boolean' && 'updatedAt' in s));
});
