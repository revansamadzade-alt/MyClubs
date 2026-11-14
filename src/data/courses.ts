import type { AcademicItem, Course } from '../types';
import { fromToday, nextDow } from '../lib/dates';

/** Fictional demo courses. Section numbers are made up. */
export const COURSES: Course[] = [
  {
    id: 'cs210',
    name: 'Algorithms & Data Structures',
    code: 'COMPSCI 210 (100210) FA26',
    short: 'COMPSCI 210',
    term: 'Fall 2026',
    color: '#2f5b2c',
    cover: 'solid',
    badges: { announcements: 2, assignments: 0 },
  },
  {
    id: 'cs235',
    name: 'Computer Systems Foundations',
    code: 'COMPSCI 235 (100235) FA26',
    short: 'COMPSCI 235',
    term: 'Fall 2026',
    color: '#1e4f8f',
    cover: 'circuit',
    badges: { announcements: 4, assignments: 0 },
  },
  {
    id: 'cs245',
    name: 'Probability for Computing',
    code: 'COMPSCI 245 (100245) FA26',
    short: 'COMPSCI 245',
    term: 'Fall 2026',
    color: '#b5261e',
    cover: 'dots',
    badges: { assignments: 0 },
  },
  {
    id: 'env105',
    name: 'Sustainability & Society',
    code: 'ENVSCI 105 (100105) FA26',
    short: 'ENVSCI 105',
    term: 'Fall 2026',
    color: '#7b3f99',
    cover: 'forest',
    badges: { assignments: 0, discussions: 1 },
  },
  {
    id: 'cics195',
    name: 'Career Design Seminar',
    code: 'CICS 195 (100195) FA26',
    short: 'CICS 195',
    term: 'Fall 2026',
    color: '#0a6fb0',
    cover: 'waves',
    badges: { announcements: 1, assignments: 0, discussions: 2 },
  },
  {
    id: 'lab210',
    name: 'Peer Study Lab — COMPSCI 210',
    code: 'LAB COMPSCI 210 (100211) FA26',
    short: 'Study Lab 210',
    term: 'Fall 2026',
    color: '#2e7d4f',
    cover: 'grid',
    badges: { announcements: 3 },
  },
];

export const COURSE_BY_ID: Record<string, Course | undefined> = Object.fromEntries(COURSES.map((c) => [c.id, c]));

/** Sample academic deadlines and sessions, generated relative to today. */
export const ACADEMIC_ITEMS: AcademicItem[] = [
  { id: 'ac-hw6', title: 'HW 6: Graph Algorithms', courseId: 'cs210', kind: 'assignment', start: fromToday(1, '23:59'), points: 40 },
  { id: 'ac-quiz5', title: 'Quiz 5: Conditional Probability', courseId: 'cs245', kind: 'quiz', start: fromToday(2, '21:00'), points: 10 },
  { id: 'ac-lab7', title: 'Lab 7: Cache Simulator', courseId: 'cs235', kind: 'assignment', start: fromToday(3, '17:00'), points: 25 },
  {
    id: 'ac-review',
    title: 'Exam 2 Review Session',
    courseId: 'cs245',
    kind: 'session',
    start: nextDow(2, '18:30'),
    end: nextDow(2, '20:00'),
    location: 'Integrative Learning Center, S331',
  },
  { id: 'ac-essay', title: 'Reflection Essay: Campus Footprint', courseId: 'env105', kind: 'assignment', start: fromToday(4, '23:59'), points: 20 },
  { id: 'ac-disc', title: 'Discussion: Career Values Inventory', courseId: 'cics195', kind: 'discussion', start: fromToday(5, '12:00'), points: 5 },
  { id: 'ac-milestone', title: 'Project Milestone 2', courseId: 'cs210', kind: 'assignment', start: fromToday(6, '23:59'), points: 50 },
  {
    id: 'ac-midterm',
    title: 'Midterm Exam 2',
    courseId: 'cs235',
    kind: 'exam',
    start: fromToday(8, '19:00'),
    end: fromToday(8, '21:00'),
    location: 'Thompson Hall, Room 104',
  },
  { id: 'ac-ps8', title: 'Problem Set 8', courseId: 'cs245', kind: 'assignment', start: fromToday(9, '23:59'), points: 30 },
  {
    id: 'ac-studylab',
    title: 'Peer Study Lab: Dynamic Programming',
    courseId: 'lab210',
    kind: 'session',
    start: fromToday(10, '16:00'),
    end: fromToday(10, '17:30'),
    location: 'W.E.B. Du Bois Library, Learning Commons',
  },
  { id: 'ac-proposal', title: 'Final Project Proposal', courseId: 'env105', kind: 'assignment', start: fromToday(11, '23:59'), points: 15 },
  { id: 'ac-quiz6', title: 'Quiz 6: Random Variables', courseId: 'cs245', kind: 'quiz', start: fromToday(13, '21:00'), points: 10 },
];

export const ACADEMIC_KIND_LABEL: Record<AcademicItem['kind'], string> = {
  assignment: 'Assignment',
  quiz: 'Quiz',
  exam: 'Exam',
  session: 'Session',
  discussion: 'Discussion',
};
