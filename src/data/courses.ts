import type { AcademicItem, ClassSession, Course } from '../types';
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
  {
    id: 'math235',
    name: 'Linear Algebra for Computing',
    code: 'MATH 235 (100236) FA26',
    short: 'MATH 235',
    term: 'Fall 2026',
    color: '#7b3f99',
    cover: 'topo',
    badges: { announcements: 1, assignments: 0 },
  },
  {
    id: 'cics110',
    name: 'Ethics in Computing Seminar',
    code: 'CICS 110 (100110) FA26',
    short: 'CICS 110',
    term: 'Fall 2026',
    color: '#4b5d16',
    cover: 'forest',
    badges: { assignments: 0, discussions: 1 },
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

/** DEMO class schedule for the fictional courses (weekly). Used by the calendar and Find My Fit. */
export const CLASS_SCHEDULE: ClassSession[] = [
  { id: 'cls-cs210-lec', courseId: 'cs210', label: 'Lecture', days: [2, 4], start: '11:30', end: '12:45', location: 'Integrative Learning Center, S140' },
  { id: 'cls-cs245-lec', courseId: 'cs245', label: 'Lecture', days: [2, 4], start: '14:30', end: '15:45', location: 'Hasbrouck Lab, Room 20' },
  { id: 'cls-cics195-sem', courseId: 'cics195', label: 'Seminar', days: [3], start: '16:00', end: '17:15', location: 'Computer Science Building, Room 142' },
  { id: 'cls-cs235-lab', courseId: 'cs235', label: 'Lab', days: [4], start: '18:30', end: '20:00', location: 'Lederle Graduate Research Center, A112' },
  { id: 'cls-env105-dis', courseId: 'env105', label: 'Discussion', days: [5], start: '10:10', end: '11:00', location: 'Morrill Science Center, Room 222' },
];

export const ACADEMIC_KIND_LABEL: Record<AcademicItem['kind'], string> = {
  assignment: 'Assignment',
  quiz: 'Quiz',
  exam: 'Exam',
  session: 'Session',
  discussion: 'Discussion',
};
