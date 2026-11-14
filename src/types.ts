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
  /** Official open/closed status, only when the organization states it. */
  availability?: 'open' | 'closed';
  /** Questionnaire template; defaults to one chosen from the organization's category. */
  template?: string;
  /** Questions quoted from the organization's official application, only when verified. */
  questions?: string[];
  /** Official audition times or booking information, only when published. */
  auditionInfo?: string;
  auditionUrl?: string;
  /** Last time `npm run check:membership` found the quoted evidence on the official page (YYYY-MM-DD). */
  lastChecked?: string;
}

export type ApplicationStatus = 'interested' | 'draft' | 'prepared' | 'submitted' | 'decision';

/** Self-reported outcome when status is "decision". */
export type DecisionOutcome = 'pending' | 'accepted' | 'waitlisted' | 'not-accepted' | 'withdrawn' | 'other';

/** Résumé attached to one application. `source: 'default'` points at the student's saved default résumé (no copy). */
export interface ResumeMeta {
  name: string;
  size: number;
  source?: 'default';
  /** false when the browser could not store the file: it exists only until the page is refreshed. */
  stored?: boolean;
}

/** In-app answers to the sample questionnaire. The résumé file itself lives in IndexedDB, keyed by clubId. */
export interface ApplicationForm {
  template: string;
  values: Record<string, string>;
  /** Step to resume on (0-based; equal to the number of steps for the review screen). */
  step: number;
  resume?: ResumeMeta;
  /** Set when the student finishes the demo application. Nothing is sent anywhere. */
  preparedAt?: string;
  /** Increases with every save of the answers; used to detect edits made in another tab. */
  rev?: number;
}

export type ApplicationDateKind = 'reminder' | 'interview' | 'audition';

/** A date the student entered (reminder, or an interview/audition the organization told them about). */
export interface ApplicationDate {
  id: string;
  kind: ApplicationDateKind;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM (24h), optional */
  time?: string;
  note?: string;
}

/** A student's own application tracker entry. Everything here is self-reported; nothing is sent anywhere. */
export interface TrackedApplication {
  clubId: string;
  status: ApplicationStatus;
  /** Application link the student recorded themselves. */
  link?: string;
  /** Legacy single reminder (YYYY-MM-DD); migrated into `dates` when read. */
  reminder?: string;
  /** Reminders, interviews and auditions the student entered. */
  dates?: ApplicationDate[];
  notes?: string;
  decision?: DecisionOutcome;
  decisionNote?: string;
  /** Answers to the in-app sample questionnaire. */
  form?: ApplicationForm;
  createdAt: string;
  updatedAt: string;
}

/** Optional details reused to prefill application forms. Stored only in this browser; not an account. */
export interface ApplicantProfile {
  fullName?: string;
  email?: string;
  major?: string;
  minor?: string;
  classYear?: string;
  github?: string;
  linkedin?: string;
  portfolio?: string;
  experience?: string;
  /** The default résumé saved in IndexedDB (explicitly chosen by the student). */
  resume?: { name: string; size: number };
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
