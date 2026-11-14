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
  // Resolve the router to its ESM build (its "node" export is CommonJS), so named imports work in component tests.
  ssr: { resolve: { externalConditions: ['module-sync'] } },
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
const AF = await load('/src/lib/applicationForms.ts');
const APPS = await load('/src/lib/applications.ts');
const PL = await load('/src/lib/applicationPlanner.ts');
const STORE = await load('/src/context/StoreContext.tsx');

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

test('Applications closed only after a verified official deadline has passed', async () => {
  const { applicationsClosed } = await load('/src/lib/applications.ts');
  const org = (application) => ({ ...CLUBS[0], application });
  const required = (deadline) => org({ process: 'required', evidence: 'x', sourceUrl: 'x', verifiedOn: '2026-11-01', deadline });
  assert.equal(applicationsClosed(required('2026-11-12')), true, 'yesterday (clock is Nov 13)');
  assert.equal(applicationsClosed(required('2026-11-13')), false, 'open until the end of the deadline day');
  assert.equal(applicationsClosed(required('2026-12-01')), false);
  assert.equal(applicationsClosed(required(undefined)), false, 'no listed deadline is never "closed"');
  assert.equal(applicationsClosed(org({ process: 'open', evidence: 'x', sourceUrl: 'x', verifiedOn: '2026-11-01', deadline: '2026-11-01' })), false);
  assert.equal(applicationsClosed(org(undefined)), false);
  assert.ok(CLUBS.every((c) => !applicationsClosed(c)), 'no real organization publishes a deadline');
});

const byId = (id) => CLUBS.find((c) => c.id === id);
const fieldIds = (form) => form.steps.flatMap((s) => s.fields.map((f) => f.id));

test('application form template follows the organization category, with explicit overrides', () => {
  const as = (category, application) => AF.templateFor({ ...CLUBS[0], category, application });
  assert.equal(as('Technology'), 'tech');
  assert.equal(as('Engineering'), 'tech');
  assert.equal(as('Business'), 'business');
  assert.equal(as('Career'), 'business');
  assert.equal(as('Arts & Music'), 'creative');
  assert.equal(as('Media'), 'media');
  assert.equal(as('Service'), 'service');
  assert.equal(as('Sports & Recreation'), 'sports');
  for (const c of ['Cultural', 'Academic', 'Gaming', 'Campus Life']) assert.equal(as(c), 'general');
  assert.equal(as('Cultural', { process: 'required', template: 'media' }), 'media');
  assert.equal(as('Cultural', { process: 'required', template: 'nonsense' }), 'general');
  assert.equal(AF.templateFor(byId('comedyleague')), 'audition', 'verified audition requirement → audition template');
  assert.equal(AF.templateFor({ ...byId('comedyleague'), application: { process: 'required' } }), 'creative', 'Arts & Music without an override → creative');
  assert.equal(AF.templateFor(byId('bestbuddies')), 'service');
  assert.equal(AF.templateFor(APPS.DEMO_ORG), 'tech');
});

test('forms: technical fields for tech, portfolio (no GitHub) for creative, short forms stay short', () => {
  const form = (category) => AF.buildForm({ ...CLUBS[0], category, application: { process: 'required' } });
  const tech = form('Engineering');
  assert.deepEqual(tech.steps.map((s) => s.id), ['personal', 'professional', 'questions']);
  assert.ok(['resume', 'github', 'linkedin', 'portfolio', 'tools', 'projects'].every((id) => fieldIds(tech).includes(id)));
  assert.equal(tech.steps[1].fields.find((f) => f.id === 'github').required, undefined, 'GitHub is encouraged, never required');
  const creative = form('Arts & Music');
  assert.ok(fieldIds(creative).includes('portfolio') && !fieldIds(creative).includes('github'));
  for (const short of [form('Cultural'), form('Sports & Recreation')]) {
    assert.deepEqual(short.steps.map((s) => s.id), ['personal', 'questions'], 'no résumé or links step');
    assert.ok(!fieldIds(short).some((id) => ['resume', 'linkedin', 'github', 'portfolio'].includes(id)));
  }
  for (const f of [tech, creative, form('Business'), form('Media'), form('Service')]) {
    const ids = fieldIds(f);
    assert.deepEqual(ids.slice(-2), ['commitment', 'anythingElse']);
    assert.equal(new Set(ids).size, ids.length, 'unique field ids');
    assert.ok(f.steps.flatMap((s) => s.fields).every((x) => x.kind === 'file' || x.kind === 'select' || x.max > 0), 'every text answer has a limit');
    assert.ok(!f.steps.flatMap((s) => s.fields).some((x) => x.kind === 'file' && x.required), 'résumé is never mandatory');
  }
  const official = AF.buildForm({ ...CLUBS[0], category: 'Cultural', application: { process: 'required', questions: ['Why us?'] } });
  const q = official.steps.at(-1).fields[0];
  assert.equal(q.label, 'Why us?');
  assert.equal(q.official, true);
});

test('form validation: required, email, links, GitHub profile, limits', () => {
  const tech = AF.buildForm(APPS.DEMO_ORG);
  const f = Object.fromEntries(tech.steps.flatMap((s) => s.fields).map((x) => [x.id, x]));
  assert.equal(AF.validateField(f.fullName, '  '), 'Enter your full name.');
  assert.equal(AF.validateField(f.minor, ''), '', 'optional blank is fine');
  assert.match(AF.validateField(f.email, 'not-an-email'), /valid email/);
  assert.match(AF.validateField(f.email, 'alex@gmail.com'), /UMass email/);
  assert.equal(AF.validateField(f.email, 'alex@umass.edu'), '');
  assert.equal(AF.validateField(f.email, 'alex@cs.umass.edu'), '');
  assert.equal(AF.validateField(f.github, 'https://github.com/alex-minuteman'), '');
  assert.equal(AF.validateField(f.github, 'github.com/alex-minuteman/'), '', 'scheme optional');
  assert.match(AF.validateField(f.github, 'https://github.com/alex/robot'), /GitHub profile link/);
  assert.match(AF.validateField(f.github, 'https://gitlab.com/alex'), /GitHub profile link/);
  assert.equal(AF.validateField(f.linkedin, 'linkedin.com/in/alex'), '');
  assert.match(AF.validateField(f.linkedin, 'https://www.linkedin.com/company/umass'), /LinkedIn profile link/);
  assert.match(AF.validateField(f.portfolio, 'not a link'), /full link/);
  assert.equal(AF.validateField(f.portfolio, 'alex.dev/work'), '');
  assert.match(AF.validateField(f.classYear, 'Class of 1990'), /Choose an option/);
  assert.match(AF.validateField(f.projects, 'x'.repeat(1001)), /under 1000 characters/);
  assert.deepEqual(Object.keys(AF.validateStep(tech.steps[0], {})), ['fullName', 'email', 'major', 'classYear']);
  assert.equal(AF.cleanValues(tech, { github: ' github.com/alex ', minor: '  ' }).github, 'https://github.com/alex');
  assert.equal(AF.cleanValues(tech, { minor: '  ' }).minor, undefined);
});

test('saved drafts restore defensively from corrupted or outdated data', () => {
  const tech = AF.buildForm(APPS.DEMO_ORG);
  const r = AF.restoreForm(tech, {
    template: 'tech',
    values: { fullName: 'Alex', projects: 'p'.repeat(5000), unknownOldField: 'x', email: 42, classYear: '1990', role: 'Hardware' },
    step: 99,
    resume: { name: 'cv.pdf', size: 'big' },
    preparedAt: 7,
  });
  assert.deepEqual(Object.keys(r.values).sort(), ['fullName', 'projects', 'role']);
  assert.equal(r.values.projects.length, 1000);
  assert.equal(r.step, tech.steps.length, 'clamped to the review step');
  assert.equal(r.resume, undefined);
  assert.equal(r.preparedAt, undefined);
  for (const junk of [undefined, null, 'garbage', { values: 'x', step: -3 }]) {
    const x = AF.restoreForm(tech, junk);
    assert.deepEqual(x.values, {});
    assert.equal(x.step, 0);
  }
});

test('exported answers are labeled as not official and include every question', () => {
  const club = byId('comedyleague');
  const form = AF.buildForm(club);
  const text = AF.formatAnswers(club, form, { fullName: 'Alex', auditionInterest: 'Improv' }, 'cv.pdf');
  assert.match(text, /^Comedy League: application answers/);
  assert.match(text, /not an official application and nothing was submitted/);
  assert.match(text, /Full name: Alex/);
  assert.match(text, /What draws you to audition for this group\?\nImprov/);
  assert.match(text, /cv\.pdf \(attach it yourself; the file is not included here\)/);
  assert.match(text, /UMass email address: Not provided/);
});

test('résumé checks: PDF type, size limit, empty and fake PDFs', async () => {
  const pdf = (body, name = 'cv.pdf', type = 'application/pdf') => new File([body], name, { type });
  assert.equal(await AF.checkPdf(pdf('%PDF-1.4 hello')), '');
  assert.match(await AF.checkPdf(pdf('hello', 'cv.docx', 'application/msword')), /isn't a PDF/);
  assert.match(await AF.checkPdf(pdf('')), /empty/);
  assert.match(await AF.checkPdf(pdf(new Uint8Array(AF.MAX_RESUME_BYTES + 1))), /under 5 MB/);
  assert.match(await AF.checkPdf(pdf('just text pretending')), /doesn't look like a valid PDF/);
});

test('status rules: editing returns to draft but never overrides a self-reported submission', () => {
  assert.equal(APPS.draftStatus('interested'), 'draft');
  assert.equal(APPS.draftStatus('prepared'), 'draft');
  assert.equal(APPS.draftStatus('submitted'), 'submitted');
  assert.equal(APPS.preparedStatus('draft'), 'prepared');
  assert.equal(APPS.preparedStatus('decision'), 'decision');
});

const REQ = { process: 'required', evidence: 'Audition required.', sourceUrl: 'https://example.org', verifiedOn: '2026-11-01' };
const fixture = (application, id = 'fixture') => ({ ...CLUBS[0], id, name: 'Fixture Club', application });

test('Apply action fixtures: open, closed by deadline, closed by status, unknown, tracked', () => {
  assert.equal(APPS.applyActionFor(fixture({ ...REQ }), false), 'apply', 'required, no deadline listed: not closed');
  assert.equal(APPS.applyActionFor(fixture({ ...REQ, deadline: '2026-11-20' }), false), 'apply');
  assert.equal(APPS.applyActionFor(fixture({ ...REQ, deadline: '2026-11-10' }), false), 'track-closed');
  assert.equal(APPS.applyActionFor(fixture({ ...REQ, availability: 'closed' }), false), 'track-closed');
  assert.equal(APPS.applyActionFor(fixture({ ...REQ, deadline: '2026-11-10' }), true), 'view', 'already tracked stays reachable');
  assert.equal(APPS.applyActionFor(fixture(undefined), false), null, 'unknown process: no Apply');
  assert.equal(APPS.applyActionFor(fixture({ ...REQ, process: 'open' }), false), null);
});

test('closed application renders a working "save" button, not a disabled dead end (server-rendered fixture)', async () => {
  const ReactNS = await import('react');
  const React = ReactNS.default ?? ReactNS;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { MemoryRouter } = await import('react-router-dom');
  const { ToastProvider } = await load('/src/context/ToastContext.tsx');
  const { ApplyButton } = await load('/src/components/Applications.tsx');
  const render = (application) =>
    renderToStaticMarkup(
      React.createElement(MemoryRouter, null, React.createElement(ToastProvider, null, React.createElement(STORE.StoreProvider, null, React.createElement(ApplyButton, { club: fixture(application) })))),
    );
  const closed = render({ ...REQ, deadline: '2026-11-10' });
  assert.match(closed, /Save — applications closed/);
  assert.doesNotMatch(closed, /disabled/);
  const open = render({ ...REQ });
  assert.match(open, />Apply</);
  assert.doesNotMatch(render(undefined), /<button/, 'unknown process: no Apply control');
});

test('stored applications from earlier versions migrate without losing data', () => {
  const now = '2026-11-01T00:00:00.000Z';
  const [a, b, c] = STORE.cleanApplications([
    { clubId: 'umoc', status: 'decision', reminder: '2026-11-18', decisionNote: 'Got in!', createdAt: now, updatedAt: now },
    { clubId: 'chessclub', status: 'interested', reminder: 'nope', dates: [{ id: 'x', kind: 'party', date: '2026-11-19' }, { id: 'y', kind: 'audition', date: '2026-11-19', time: '18:00' }], createdAt: now, updatedAt: now },
    { clubId: 'bestbuddies', status: 'decision', decision: 'bogus', createdAt: now, updatedAt: now },
    { clubId: 'bad', status: 'unknown', createdAt: now, updatedAt: now },
  ]);
  assert.deepEqual(a.dates, [{ id: 'legacy-reminder', kind: 'reminder', date: '2026-11-18' }]);
  assert.equal('reminder' in a, false);
  assert.equal(a.decision, 'other');
  assert.equal(a.decisionNote, 'Got in!', 'free text kept as the note');
  assert.deepEqual(b.dates.map((d) => d.id), ['y'], 'invalid kinds and dates dropped');
  assert.equal(c.decision, 'other', 'unknown outcome replaced, not crashed');
  assert.equal(STORE.cleanApplications([{ clubId: 'bad', status: 'unknown' }]).length, 0);
});

test('application dates on the calendar: student dates labeled, verified deadline only when present, never conflicts', () => {
  const from = new Date(2026, 10, 15);
  const to = new Date(2026, 10, 29);
  const app = {
    clubId: 'comedyleague',
    status: 'draft',
    createdAt: '',
    updatedAt: '',
    dates: [
      { id: 'a', kind: 'audition', date: '2026-11-18', time: '18:30', note: 'Bring a piece' },
      { id: 'r', kind: 'reminder', date: '2026-11-20' },
      { id: 'old', kind: 'reminder', date: '2026-10-01' },
    ],
  };
  const items = PL.applicationScheduleItems([app, app], from, to);
  assert.deepEqual(items.map((i) => i.id).sort(), ['app:comedyleague:a', 'app:comedyleague:r'], 'in range, no duplicates');
  const aud = items.find((i) => i.id.endsWith(':a'));
  assert.equal(aud.title, 'Audition: Comedy League');
  assert.equal(aud.userEntered, true);
  assert.match(aud.typeLabel, /you entered/);
  assert.equal(aud.start.getHours(), 18);
  const rem = items.find((i) => i.id.endsWith(':r'));
  assert.equal(rem.allDay, true);
  assert.equal(rem.end.getTime() - rem.start.getTime(), 86400000, 'all-day items last until midnight');
  assert.equal(items.some((i) => i.id.startsWith('appdl:')), false, 'no deadline is invented for real clubs');
  const S_items = S.buildSchedule({ followed: [], saved: [], from, to, applications: [app] });
  assert.ok(S_items.some((i) => i.kind === 'application'));
  assert.equal([...S.findConflicts(S_items).keys()].some((id) => id.startsWith('app:')), false, 'application dates never conflict');
  // A verified deadline (fixture) is shown and labeled as official.
  const saved = CLUBS.find((c) => c.id === 'comedyleague').application;
  CLUBS.find((c) => c.id === 'comedyleague').application = { ...saved, deadline: '2026-11-25' };
  try {
    const dl = PL.applicationScheduleItems([{ ...app, dates: [] }], from, to);
    assert.equal(dl.length, 1);
    assert.equal(dl[0].id, 'appdl:comedyleague');
    assert.match(dl[0].typeLabel, /verified/);
    assert.equal(dl[0].userEntered, undefined);
  } finally {
    CLUBS.find((c) => c.id === 'comedyleague').application = saved;
  }
});

test('Dashboard To Do tasks: dated first, drafts and prepared answers next, limited, past dates skipped', () => {
  const now = new Date();
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const day = (n) => ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
  const tasks = PL.applicationTasks(
    [
      { clubId: 'comedyleague', status: 'draft', form: { template: 'audition', values: {}, step: 0 }, createdAt: '', updatedAt: '', dates: [{ id: 'a', kind: 'audition', date: day(5), time: '18:00' }, { id: 'p', kind: 'reminder', date: day(-2) }] },
      { clubId: 'bestbuddies', status: 'prepared', createdAt: '', updatedAt: '', dates: [{ id: 'r', kind: 'reminder', date: day(1) }] },
      { clubId: 'demo-org', status: 'prepared', createdAt: '', updatedAt: '' },
      { clubId: 'umoc', status: 'interested', createdAt: '', updatedAt: '', dates: [{ id: 'far', kind: 'reminder', date: day(60) }] },
    ],
    now,
    10,
  );
  assert.deepEqual(tasks.map((t) => t.title), [
    'Reminder: Best Buddies',
    'Audition: Comedy League',
    'Finish application draft: Comedy League',
    'Apply through the official process: Best Buddies',
    'Review demo application: Campus Builders Collective (demo)',
  ]);
  assert.equal(tasks[2].href, '/clubs/applications/comedyleague/apply');
  assert.equal(PL.applicationTasks([{ clubId: 'comedyleague', status: 'draft', form: { template: 'audition', values: {}, step: 0 }, createdAt: '', updatedAt: '' }], now, 0).length, 0);
});

test('audition template, profile prefill and export details', () => {
  const comedy = CLUBS.find((c) => c.id === 'comedyleague');
  assert.equal(AF.templateFor(comedy), 'audition');
  const form = AF.buildForm(comedy);
  const ids = form.steps.flatMap((s) => s.fields.map((f) => f.id));
  assert.ok(['portfolio', 'resume', 'performanceExperience', 'auditionInterest', 'performRole', 'auditionAvailability', 'prepNotes'].every((id) => ids.includes(id)));
  assert.equal(form.steps.flatMap((s) => s.fields).find((f) => f.id === 'performanceExperience').required, false);
  const profile = { fullName: 'Jordan', email: 'j@umass.edu', classYear: '1999', github: 'https://github.com/j', portfolio: 'https://j.dev', experience: 'Lots', updatedAt: '' };
  const tech = AF.prefillFromProfile(AF.buildForm(APPS.DEMO_ORG), profile);
  assert.deepEqual(tech, { fullName: 'Jordan', email: 'j@umass.edu', github: 'https://github.com/j', portfolio: 'https://j.dev' }, 'only fields the form has; stale class year dropped');
  const business = AF.prefillFromProfile(AF.buildForm({ ...CLUBS[0], category: 'Business', application: { process: 'required' } }), profile);
  assert.equal(business.website, 'https://j.dev', 'portfolio fills the website field when there is no portfolio field');
  assert.equal(business.experience, 'Lots');
  assert.deepEqual(AF.prefillFromProfile(form, null), {});
  const text = AF.formatAnswers(comedy, form, { auditionInterest: 'Line one\r\nLine two\rLine three' }, 'cv.pdf');
  assert.ok(text.includes('Line one\nLine two\nLine three') && !text.includes('\r'));
  assert.match(text, /the file is not included here/);
  for (const f of form.steps.flatMap((s) => s.fields)) assert.equal(text.split(f.label).length, 2, `"${f.label}" appears once`);
});

test('status wording: real organizations "Answers prepared — not submitted", demo keeps demo label, decisions self-reported', () => {
  assert.equal(APPS.statusLabel({ clubId: 'comedyleague', status: 'prepared' }), 'Answers prepared — not submitted');
  assert.equal(APPS.statusLabel({ clubId: 'demo-org', status: 'prepared' }), 'Prepared (demo) — not submitted');
  assert.equal(APPS.statusLabel({ clubId: 'comedyleague', status: 'decision', decision: 'not-accepted' }), 'Decision: Not accepted (self-reported)');
  assert.equal(APPS.statusLabel({ clubId: 'comedyleague', status: 'submitted' }), 'Submitted externally (self-reported)');
});
