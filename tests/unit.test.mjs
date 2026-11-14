// Logic tests for scheduling, conflicts, semester bounds, data integrity and Find My Fit.
// Run: npm test. Loads the TypeScript sources through Vite (already a dev dependency) with a fixed clock.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

process.env.TZ = process.env.MYCLUBS_TEST_TZ ?? 'America/New_York';
const RealDate = Date;
const NOW = new RealDate(process.env.MYCLUBS_TEST_NOW ?? '2026-11-13T12:00:00').getTime();
const offset = NOW - RealDate.now();
class FixedClockDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(RealDate.now() + offset);
    else super(...args);
  }
  static now() {
    return RealDate.now() + offset;
  }
}
globalThis.Date = FixedClockDate;

const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  configFile: false,
  logLevel: 'silent',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
after(() => server.close());

const load = (p) => server.ssrLoadModule(p);
const S = await load('/src/lib/schedule.ts');
const F = await load('/src/lib/fit.ts');
const D = await load('/src/lib/dates.ts');
const SEM = await load('/src/config/semester.ts');
const { EVENTS } = await load('/src/data/events.ts');
const { VERIFIED_EVENTS } = await load('/src/data/verifiedEvents.ts');
const { CLUBS } = await load('/src/data/clubs.ts');

const from = D.startOfDay(new Date());
const to = D.addDays(from, 14);
const block = (id, start, end, kind = 'event') => ({ id, kind, title: id, subtitle: '', typeLabel: '', start, end, isDeadline: false });
const at = (h, m = 0) => D.withTime(from, `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);

test('overlap window is exact: Chess Club (Thu 6–9 PM) vs COMPSCI 235 Lab (6:30–8 PM) = 90 min', () => {
  const items = S.buildSchedule({ followed: ['chessclub'], saved: [], from, to });
  const thursdayChess = items.find((i) => i.kind === 'meeting' && i.clubId === 'chessclub' && i.start.getDay() === 4);
  assert.ok(thursdayChess, 'a Thursday Chess Club meeting exists in the window');
  const lab = S.findConflicts(items).get(thursdayChess.id)?.find((o) => o.item.title === 'COMPSCI 235 Lab');
  assert.ok(lab, 'overlaps the Thursday lab');
  assert.equal(D.fmtRange(lab.from, lab.to), '6:30 – 8:00 PM');
  assert.equal((lab.to - lab.from) / 60000, 90);
});

test('due-time deadlines never create conflicts', () => {
  const items = S.buildSchedule({ followed: CLUBS.map((c) => c.id), saved: EVENTS.map((e) => e.id), from, to });
  const conflicts = S.findConflicts(items);
  for (const d of items.filter((i) => i.isDeadline)) {
    assert.deepEqual(S.overlapsFor(d, items), [], `${d.title} should never conflict`);
    for (const list of conflicts.values()) assert.ok(!list.some((o) => o.item.id === d.id));
  }
});

test('back-to-back blocks do not conflict; one minute of overlap does', () => {
  assert.deepEqual(S.overlapsFor(block('a', at(16), at(18)), [block('b', at(18), at(19, 30))]), []);
  assert.equal(S.overlapsFor(block('a', at(16), at(18, 1)), [block('b', at(18), at(19, 30))]).length, 1);
});

test('unsaved club events are never counted as conflicts', () => {
  const target = block('t', at(18), at(20));
  assert.deepEqual(S.overlapsFor(target, [block('c', at(19), at(21), 'clubEvent')]), []);
});

test('no duplicates when following every host and saving every event', () => {
  const items = S.buildSchedule({ followed: CLUBS.map((c) => c.id), saved: EVENTS.map((e) => e.id), from, to: D.addDays(from, 120) });
  const ids = items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'all schedule ids unique');
  for (const e of EVENTS.filter((e) => e.start >= from && e.start < D.addDays(from, 120))) {
    const copies = items.filter((i) => i.eventId === e.id);
    assert.equal(copies.length, 1, `${e.title} appears once`);
    assert.equal(copies[0].kind, 'event', 'saved wins over followed-club copy');
  }
});

test('classes and club meetings repeat only inside the semester', () => {
  const after = SEM.semesterEnd();
  const before = D.addDays(SEM.semesterStart(), -7);
  assert.equal(S.classItems(after, D.addDays(after, 14)).length, 0, 'no classes after the semester');
  assert.equal(S.meetingItems(['chessclub'], after, D.addDays(after, 14)).length, 0, 'no meetings after the semester');
  assert.equal(S.classItems(before, D.addDays(before, 7)).length, 0, 'no classes before the semester');
  assert.ok(S.classItems(from, to).length > 0 && S.meetingItems(['chessclub'], from, to).length > 0, 'present inside');
});

test('verified events keep their published dates and sources', () => {
  const fair = VERIFIED_EVENTS.find((e) => e.id === 'cp-12912251');
  assert.equal(fair.start.toISOString(), '2026-11-14T17:00:00.000Z');
  assert.equal(fair.end.toISOString(), '2026-11-14T20:00:00.000Z');
  for (const e of VERIFIED_EVENTS) {
    assert.ok(e.start < e.end, `${e.id} start before end`);
    assert.match(e.verified.url, /^https:\/\/(umassamherst\.campuslabs\.com\/engage\/event\/\d+$|events\.umass\.edu\b)/);
    if (e.clubId) assert.ok(CLUBS.some((c) => c.id === e.clubId), `${e.id} host club exists`);
  }
  assert.ok(EVENTS.filter((e) => !e.verified).every((e) => !e.clubId), 'sample events never link to clubs');
});

test('demo anchor event is next Thursday and overlaps the demo lab', () => {
  const v = EVENTS.find((e) => e.id === 'ev-volleyball-night');
  assert.equal(v.start.getDay(), 4);
  assert.ok(v.start > new Date() && v.start < D.addDays(from, 8));
  const items = S.buildSchedule({ followed: [], saved: [v.id], from, to });
  const o = S.findConflicts(items).get(v.id) ?? [];
  assert.ok(o.some((x) => x.item.title === 'COMPSCI 235 Lab' && (x.to - x.from) / 60000 === 60));
});

test('Find My Fit: deterministic groups with exact overlaps and no invented times', () => {
  const fits = F.findMyFit({ followed: ['chessclub', 'roboticsclub'], saved: ['ev-career-fair', 'ev-acappella'], interests: [] });
  const by = Object.fromEntries(fits.map((f) => [f.club.id, f]));
  assert.equal(fits.length, CLUBS.length);
  assert.equal(by.umassaccountingassociation.status, 'fits');
  assert.equal(by.chessclub.status, 'partial');
  assert.ok(by.chessclub.slots.some((s) => s.overlaps.some((o) => o.item.title === 'COMPSCI 235 Lab')));
  assert.equal(by.roboticsclub.status, 'unknown');
  for (const f of fits) {
    for (const { item } of f.slots) {
      if (item.kind === 'meeting') assert.ok(f.club.meetings.length > 0, `${f.club.name} meeting comes from a listed schedule`);
      else assert.ok(EVENTS.find((e) => e.id === item.eventId)?.verified, `${f.club.name} event is verified`);
    }
    if (f.status === 'unknown') assert.equal(f.slots.length, 0);
  }
});

test('Find My Fit ranking: group order, then interests', () => {
  const order = ['fits', 'partial', 'conflicts', 'unknown'];
  const ranked = F.rankFits(F.findMyFit({ followed: [], saved: [], interests: ['Sports & Recreation'] }));
  const idx = ranked.map((f) => order.indexOf(f.status));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
  const firstFits = ranked.filter((f) => f.status === 'fits');
  const firstNonInterest = firstFits.findIndex((f) => !f.interest);
  assert.ok(firstFits.slice(firstNonInterest === -1 ? firstFits.length : firstNonInterest).every((f) => !f.interest));
});

test('Find My Fit explains every unknown schedule', () => {
  const fits = F.findMyFit({ followed: [], saved: [], interests: [] });
  const reason = (id) => F.unknownReason(fits.find((f) => f.club.id === id));
  assert.match(reason('womenincybersecurity'), /incomplete/);
  assert.match(reason('kpopdanceclub'), /Next listed event/);
  assert.match(reason('roboticsclub'), /no meeting times/);
});
