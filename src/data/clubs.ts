import type { Category, Club } from '../types';
import data from './generated/campus-data.json';

export const CATEGORIES: Category[] = [
  'Technology',
  'Engineering',
  'Business',
  'Academic',
  'Arts & Music',
  'Sports & Recreation',
  'Cultural',
  'Service',
  'Career',
  'Gaming',
  'Media',
  'Wellness',
  'Faith & Spirituality',
  'Campus Life',
];

/**
 * UMass Amherst student organizations from public Campus Pulse sources, refreshed by `npm run sync:data`
 * (scripts/sync-data.mjs). Curated clubs (scripts/curated-clubs.json) carry hand-verified schedules; entries with
 * sourceKind "event-host" are known only as hosts in the public events feed and claim nothing beyond that.
 */
export const CLUBS: Club[] = data.clubs as Club[];

export const CLUB_BY_ID: Record<string, Club | undefined> = Object.fromEntries(CLUBS.map((c) => [c.id, c]));

/** Campus Pulse page and events page for a club; event-host entries only have a directory search link. */
export function campusPulseLinks(club: Club): { page: string; events: string | null } {
  if (club.sourceKind === 'event-host') return { page: club.links[0]?.url ?? club.sourceUrl, events: null };
  return { page: club.sourceUrl, events: `${club.sourceUrl}/events` };
}
