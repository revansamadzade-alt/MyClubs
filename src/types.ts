export type CoverVariant = 'solid' | 'circuit' | 'dots' | 'forest' | 'waves' | 'grid' | 'topo';

export type Category =
  | 'Technology'
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

export interface Club {
  id: string;
  name: string;
  initials: string;
  category: Category;
  tags: string[];
  summary: string;
  about: string;
  meetings: Meeting[];
  location: string;
  members: number;
  color: string;
  cover: CoverVariant;
  email: string;
  founded: number;
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
