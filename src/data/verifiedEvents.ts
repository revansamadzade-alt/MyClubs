import type { CampusEvent } from '../types';
import data from './generated/campus-data.json';

type RawEvent = Omit<CampusEvent, 'start' | 'end'> & { start: string; end: string };

/**
 * Real public events from the Campus Pulse RSS feed and the UMass Amherst Events Calendar iCalendar feed, as of the
 * last `npm run sync:data`. Times are stored in UTC and shown in local time. Saving an event never RSVPs or registers.
 */
export const VERIFIED_EVENTS: CampusEvent[] = (data.events as RawEvent[]).map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) }));
