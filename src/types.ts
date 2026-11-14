export type CoverVariant = 'solid' | 'circuit' | 'dots' | 'forest' | 'waves' | 'grid' | 'topo';

export type Category =
  | 'Technology'
  | 'Engineering'
  | 'Business'
  | 'Academic'
  | 'Arts & Music'
  | 'Sports & Recreation'
  | 'Cultural'
  | 'Service'
  | 'Career'
  | 'Gaming'
  | 'Media'
  | 'Wellness';

/** A weekly recurring club meeting. `dow` is 0 (Sunday) – 6 (Saturday); times are 24h "HH:MM". */
export interface Meeting {
  dow: number;
  start: string;
  end: string;
  label?: string;
}

export interface ClubLink {
  label: string;
  url: string;
}

export interface Club {
  id: string;
  name: string;
  initials: string;
  category: Category;
  tags: string[];
  summary: string;
  about: string;
  /** Only schedules stated on the official listing with day, start and end time. */
  meetings: Meeting[];
  /** Schedule information as listed, including incomplete schedules that are not put on the calendar. */
  scheduleNote?: string;
  location?: string;
  color: string;
  cover: CoverVariant;
  links: ClubLink[];
  sourceUrl: string;
  verifiedOn: string;
}

export interface CampusEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  location: string;
  description: string;
  category: Category;
  clubId?: string;
  host: string;
  /** Present only for real events from an official public listing. Absent means demo/sample data. */
  verified?: { url: string; retrievedOn: string };
}

export interface Course {
  id: string;
  name: string;
  code: string;
  short: string;
  term: string;
  color: string;
  cover: CoverVariant;
  badges: { announcements?: number; assignments?: number; discussions?: number };
}

export type AcademicKind = 'assignment' | 'quiz' | 'exam' | 'session' | 'discussion';

export interface AcademicItem {
  id: string;
  title: string;
  courseId: string;
  kind: AcademicKind;
  /** Due date for deadlines, or start time for sessions/exams. */
  start: Date;
  /** Present only for items that occupy a block of time (exams, review sessions). */
  end?: Date;
  points?: number;
  location?: string;
}

export interface Review {
  id: string;
  clubId: string;
  rating: number;
  text: string;
  author: string;
  createdAt: string;
}
