import type { ApplicationStatus, Club, DecisionOutcome, TrackedApplication } from '../types';
import { CLUB_BY_ID } from '../data/clubs';

export const DEMO_ORG_ID = 'demo-org';

/** Fictional organization for the demo application flow. Not part of the real directory. */
export const DEMO_ORG: Club = {
  id: DEMO_ORG_ID,
  name: 'Campus Builders Collective (demo)',
  initials: 'CB',
  category: 'Engineering',
  tags: ['Demo'],
  summary: 'Fictional engineering and software club used to demonstrate the full MyClubs application journey.',
  about: 'This organization does not exist. Its application form shows how MyClubs could support selective organizations.',
  meetings: [],
  color: '#5c4db1',
  cover: 'grid',
  links: [],
  sourceUrl: '',
  verifiedOn: '',
  application: { process: 'required', evidence: '', sourceUrl: '', verifiedOn: '' },
};

export const isDemoOrg = (club: Club) => club.id === DEMO_ORG_ID;

export const STATUS_META: Record<ApplicationStatus, { label: string; step: number; color: string; soft: string }> = {
  interested: { label: 'Interested', step: 0, color: '#394b58', soft: '#eef1f3' },
  draft: { label: 'Draft in progress', step: 1, color: '#053a7f', soft: '#e8eef7' },
  prepared: { label: 'Answers prepared — not submitted', step: 2, color: '#8a5300', soft: '#fff4e5' },
  submitted: { label: 'Submitted externally (self-reported)', step: 3, color: '#0b6e3f', soft: '#e8f5ee' },
  decision: { label: 'Decision received (self-reported)', step: 4, color: '#5a3a8a', soft: '#f1ecf7' },
};

export const STEPS = ['Interested', 'Draft', 'Prepared', 'Submitted', 'Decision'];

export const DECISION_LABEL: Record<DecisionOutcome, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  waitlisted: 'Waitlisted',
  'not-accepted': 'Not accepted',
  withdrawn: 'Withdrawn',
  other: 'Other',
};

export function statusLabel(app: TrackedApplication): string {
  if (app.status === 'prepared' && app.clubId === DEMO_ORG_ID) return 'Prepared (demo) — not submitted';
  if (app.status === 'decision' && app.decision) return `Decision: ${DECISION_LABEL[app.decision]} (self-reported)`;
  return STATUS_META[app.status].label;
}

/** Editing answers moves an application back to draft, but never overrides a self-reported submission or decision. */
export const draftStatus = (cur?: ApplicationStatus): ApplicationStatus => (cur === 'submitted' || cur === 'decision' ? cur : 'draft');
export const preparedStatus = (cur?: ApplicationStatus): ApplicationStatus => (cur === 'submitted' || cur === 'decision' ? cur : 'prepared');

/** True when the organization officially states applications are closed, or a verified deadline has passed (end of that day). */
export function applicationsClosed(club: Club, now = new Date()): boolean {
  const a = club.application;
  if (a?.process !== 'required') return false;
  if (a.availability === 'closed') return true;
  if (!a.deadline) return false;
  const [y, m, d] = a.deadline.split('-').map(Number);
  return new Date(y, m - 1, d + 1) <= now;
}

export type ApplyAction = 'apply' | 'view' | 'track-closed';

/**
 * What the Apply control offers: start an application, view a tracked one, or, when the organization's verified
 * information says applications are closed, still let the student save it to My Applications (no form, no
 * official link). Nothing for organizations whose application requirement isn't verified.
 */
export function applyActionFor(club: Club, tracked: boolean, now = new Date()): ApplyAction | null {
  if (club.application?.process !== 'required') return null;
  if (tracked) return 'view';
  return applicationsClosed(club, now) ? 'track-closed' : 'apply';
}

export const orgFor = (id: string): Club | undefined => (id === DEMO_ORG_ID ? DEMO_ORG : CLUB_BY_ID[id]);

export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return (u.protocol === 'https:' || u.protocol === 'http:') && u.hostname.includes('.');
  } catch {
    return false;
  }
}

/** "YYYY-MM-DD" → local date label, e.g. "Fri, Nov 20, 2026". */
export function fmtDay(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/** ISO timestamp → "Nov 14, 3:05 PM". */
export const fmtStamp = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
