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
  | 'Wellness'
  | 'Faith & Spirituality'
  | 'Campus Life';

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
  /** "event-host": known only as a host in the public events feed (no profile text, contacts or schedule). */
  sourceKind?: 'profile' | 'event-host';
  /** Membership process, only when stated in the official listing. Absent means "not listed". */
  application?: ApplicationInfo;
}

export interface ApplicationInfo {
  process: 'open' | 'required';
  /** Quoted from the official listing. */
  evidence: string;
  sourceUrl: string;
  verifiedOn: string;
  /** Official application link, only when the organization publishes one. */
  applyUrl?: string;
  /** Official deadline (YYYY-MM-DD), only when published. */
  deadline?: string;
}

export type ApplicationStatus = 'interested' | 'draft' | 'submitted' | 'decision';

/** A student's own application tracker entry. Everything here is self-reported; nothing is sent anywhere. */
export interface TrackedApplication {
  clubId: string;
  status: ApplicationStatus;
  /** Application link the student recorded themselves. */
  link?: string;
  /** Personal reminder date (YYYY-MM-DD) the student entered — not an official deadline. */
  reminder?: string;
  notes?: string;
  decisionNote?: string;
  /** Demo application answers (demo organization only). */
  demo?: { why: string; experience: string; activities: string; submittedAt?: string };
  createdAt: string;
  updatedAt: string;
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
  verified?: { url: string; retrievedOn: string; source?: string };
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

/** A weekly class meeting in the demo class schedule. `days` are 0 (Sunday) – 6 (Saturday). */
export interface ClassSession {
  id: string;
  courseId: string;
  label: string;
  days: number[];
  start: string;
  end: string;
  location: string;
}

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
