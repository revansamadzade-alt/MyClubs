import type { ApplicationStatus, Club, TrackedApplication } from '../types';
import { CLUB_BY_ID } from '../data/clubs';

export const DEMO_ORG_ID = 'demo-org';

/** Fictional organization for the demo application flow. Not part of the real directory. */
export const DEMO_ORG: Club = {
  id: DEMO_ORG_ID,
  name: 'Campus Builders Collective (demo)',
  initials: 'CB',
  category: 'Engineering',
  tags: ['Demo'],
  summary: 'Fictional organization used to demonstrate the MyClubs application flow.',
  about: 'This organization does not exist. Its application form shows how MyClubs could support selective organizations.',
  meetings: [],
  color: '#5c4db1',
  cover: 'grid',
  links: [],
  sourceUrl: '',
  verifiedOn: '',
};

export const STATUS_META: Record<ApplicationStatus, { label: string; step: number; color: string; soft: string }> = {
  interested: { label: 'Interested', step: 0, color: '#394b58', soft: '#eef1f3' },
  draft: { label: 'Draft in progress', step: 1, color: '#053a7f', soft: '#e8eef7' },
  submitted: { label: 'Submitted externally (self-reported)', step: 2, color: '#0b6e3f', soft: '#e8f5ee' },
  decision: { label: 'Decision received (self-reported)', step: 3, color: '#5a3a8a', soft: '#f1ecf7' },
};

export const STEPS = ['Interested', 'Draft', 'Submitted', 'Decision'];

export function statusLabel(app: TrackedApplication): string {
  if (app.clubId === DEMO_ORG_ID && app.status === 'submitted') return 'Submitted (demo only)';
  return STATUS_META[app.status].label;
}

/** True only when a verified official deadline has passed (it closes at the end of that day, local time). */
export function applicationsClosed(club: Club, now = new Date()): boolean {
  const deadline = club.application?.process === 'required' ? club.application.deadline : undefined;
  if (!deadline) return false;
  const [y, m, d] = deadline.split('-').map(Number);
  return new Date(y, m - 1, d + 1) <= now;
}

export const orgFor =(id: string): Club | undefined => (id === DEMO_ORG_ID ? DEMO_ORG : CLUB_BY_ID[id]);

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
