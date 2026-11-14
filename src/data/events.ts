import type { CampusEvent } from '../types';
import { fromToday } from '../lib/dates';
import { VERIFIED_EVENTS } from './verifiedEvents';

type Seed = Omit<CampusEvent, 'start' | 'end'> & { day: number; from: string; to: string };

/**
 * SAMPLE DATA. Fictional events generated relative to today so the demo always shows upcoming items.
 * They are not linked to any real organization. Real events live in verifiedEvents.ts.
 */
const SEEDS: Seed[] = [
  {
    id: 'ev-library-workshop',
    title: 'Research Skills Workshop: Finding Sources Fast',
    day: 1, from: '15:00', to: '16:00',
    location: 'W.E.B. Du Bois Library, Floor 2',
    category: 'Academic',
    host: 'Library Learning Commons (sample)',
    description: 'A one-hour, hands-on session on database search, citation managers and evaluating sources. Bring a current research assignment.',
  },
  {
    id: 'ev-dance-workshop',
    title: 'Fusion Dance Beginner Workshop',
    day: 1, from: '20:00', to: '21:30',
    location: 'Totman Gym, Dance Studio',
    category: 'Arts & Music',
    host: 'Sample host (demo data)',
    description: 'Learn a short hip hop combo in 90 minutes. Wear comfortable shoes — no dance experience needed.',
  },
  {
    id: 'ev-hack-workshop',
    title: 'Intro to Hackathons Workshop',
    day: 2, from: '18:00', to: '19:30',
    location: 'Lederle Graduate Research Center, Room A112',
    category: 'Technology',
    host: 'Sample host (demo data)',
    description: 'Never been to a hackathon? Learn how to form a team, scope a project for 24 hours and demo it confidently. Pizza provided.',
  },
  {
    id: 'ev-resume',
    title: 'Resume Review with Industry Mentors',
    day: 2, from: '13:00', to: '15:00',
    location: 'Computer Science Building, Room 151',
    category: 'Career',
    host: 'Sample host (demo data)',
    description: 'Drop in for 15-minute resume reviews with volunteer mentors from local tech companies. Bring a printed or digital copy.',
  },
  {
    id: 'ev-ctf',
    title: 'Capture the Flag Practice Night',
    day: 3, from: '19:00', to: '21:30',
    location: 'Computer Science Building, Room 142',
    category: 'Technology',
    host: 'Sample host (demo data)',
    description: 'Team up and solve beginner-to-advanced security puzzles in a sandboxed environment. Laptops required.',
  },
  {
    id: 'ev-film',
    title: 'Student Short Film Screening',
    day: 3, from: '19:30', to: '21:30',
    location: 'Integrative Learning Center, S240',
    category: 'Arts & Music',
    host: 'Sample host (demo data)',
    description: 'An evening of short films made by students, followed by a Q&A with the filmmakers.',
  },
  {
    id: 'ev-sunrise-hike',
    title: 'Sunrise Hike: Mount Sugarloaf',
    day: 4, from: '06:00', to: '09:30',
    location: 'Meet at Haigis Mall bus stop',
    category: 'Sports & Recreation',
    host: 'Sample host (demo data)',
    description: 'An easy 2-mile hike to catch the sunrise over the Connecticut River valley. Transportation provided; dress in layers.',
  },
  {
    id: 'ev-open-mic',
    title: 'Open Mic Night',
    day: 4, from: '20:00', to: '22:00',
    location: 'Student Union Coffee Shop',
    category: 'Arts & Music',
    host: 'Student Union Programming (sample)',
    description: 'Music, poetry, comedy — sign up at the door for a 5-minute slot or just come to listen.',
  },
  {
    id: 'ev-career-fair',
    title: 'Fall Career & Internship Fair',
    day: 5, from: '11:00', to: '15:00',
    location: 'Campus Center Auditorium',
    category: 'Career',
    host: 'Career Services (sample)',
    description: 'Meet recruiters from dozens of employers hiring for internships and full-time roles. Business casual recommended.',
  },
  {
    id: 'ev-smash',
    title: 'Smash Bros. Fall Tournament',
    day: 5, from: '19:00', to: '23:00',
    location: 'Campus Center, Room 163',
    category: 'Gaming',
    host: 'Sample host (demo data)',
    description: 'Double-elimination bracket with casual setups on the side. Free entry, prizes for the top three.',
  },
  {
    id: 'ev-dataviz',
    title: 'Data Viz Lightning Talks',
    day: 6, from: '18:00', to: '19:30',
    location: 'Integrative Learning Center, S131',
    category: 'Academic',
    host: 'Sample host (demo data)',
    description: 'Five-minute talks from students showing their favorite visualizations — and what they learned making them.',
  },
  {
    id: 'ev-ultimate',
    title: 'Ultimate Frisbee Open Scrimmage',
    day: 6, from: '16:00', to: '18:00',
    location: 'Boyden Fields',
    category: 'Sports & Recreation',
    host: 'Sample host (demo data)',
    description: 'Pickup games for all levels. Great way to try the sport before joining practice.',
  },
  {
    id: 'ev-pitch-night',
    title: 'Startup Pitch Night',
    day: 7, from: '18:00', to: '20:30',
    location: 'Isenberg School of Management, Room 120',
    category: 'Career',
    host: 'Sample host (demo data)',
    description: 'Student teams pitch to a panel of local founders. Audience vote decides the crowd favorite.',
  },
  {
    id: 'ev-journalism',
    title: 'Intro to Student Journalism',
    day: 7, from: '16:00', to: '17:30',
    location: 'Campus Center, Room 904',
    category: 'Media',
    host: 'Sample host (demo data)',
    description: 'Learn how to pitch, report and write your first story for the paper. Editors will be there to answer questions.',
  },
  {
    id: 'ev-acappella',
    title: 'Fall A Cappella Showcase',
    day: 8, from: '19:30', to: '21:30',
    location: 'Bowker Auditorium',
    category: 'Arts & Music',
    host: 'Sample host (demo data)',
    description: 'Campus a cappella groups perform their fall sets. Free admission.',
  },
  {
    id: 'ev-robot-demo',
    title: 'Robot Showcase & Demo Day',
    day: 8, from: '13:00', to: '16:00',
    location: 'Integrative Learning Center Atrium',
    category: 'Technology',
    host: 'Sample host (demo data)',
    description: 'See this season’s competition robots in action and try driving one yourself.',
  },
  {
    id: 'ev-food-fest',
    title: 'Global Food Festival',
    day: 9, from: '17:00', to: '20:00',
    location: 'Student Union Ballroom',
    category: 'Cultural',
    host: 'Sample host (demo data)',
    description: 'Taste dishes from around the world prepared by student cultural organizations. Vegetarian options at every table.',
  },
  {
    id: 'ev-cleanup',
    title: 'Campus Pond Cleanup Day',
    day: 10, from: '09:00', to: '12:00',
    location: 'Campus Pond, north lawn',
    category: 'Service',
    host: 'Sample host (demo data)',
    description: 'Gloves, bags and coffee provided. Counts toward service-learning hours.',
  },
  {
    id: 'ev-debate',
    title: 'Public Debate: AI in the Classroom',
    day: 11, from: '19:00', to: '20:30',
    location: 'Herter Hall, Room 227',
    category: 'Academic',
    host: 'Sample host (demo data)',
    description: 'Two teams debate whether generative AI should be allowed in coursework. Audience Q&A follows.',
  },
  {
    id: 'ev-finals-calm',
    title: 'Finals Stress Reset: Guided Mindfulness',
    day: 12, from: '12:15', to: '13:00',
    location: 'Recreation Center, Studio 2',
    category: 'Wellness',
    host: 'Sample host (demo data)',
    description: 'A short guided session with breathing techniques you can use before exams.',
  },
];

const DEMO_EVENTS: CampusEvent[] = SEEDS.map(({ day, from, to, ...rest }) => ({
  ...rest,
  start: fromToday(day, from),
  end: fromToday(day, to),
}));

/** Verified Campus Pulse events plus clearly separate demo events (demo events never carry `verified`). */
export const EVENTS: CampusEvent[] = [...VERIFIED_EVENTS, ...DEMO_EVENTS].sort((a, b) => a.start.getTime() - b.start.getTime());

export const EVENT_BY_ID: Record<string, CampusEvent | undefined> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
