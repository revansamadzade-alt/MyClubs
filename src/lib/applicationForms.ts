// Configurable application questionnaires. Each organization gets a template chosen from its category (or set
// explicitly on its verified application info). All of these are SAMPLE questions for preparing an application;
// only `application.questions` (quoted from an official application) are presented as the organization's own.
import type { ApplicantProfile, ApplicationForm, Category, Club } from '../types';

export type FieldKind = 'text' | 'email' | 'url' | 'select' | 'textarea' | 'file';

export interface FieldDef {
  id: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  max?: number;
  help?: string;
  placeholder?: string;
  options?: string[];
  urlKind?: 'github' | 'linkedin';
  autoComplete?: string;
  /** Quoted from the organization's official application. */
  official?: boolean;
}

export interface FormStep {
  id: 'personal' | 'professional' | 'questions';
  title: string;
  fields: FieldDef[];
}

export type TemplateId = 'tech' | 'business' | 'creative' | 'audition' | 'media' | 'service' | 'sports' | 'general';

export interface ApplicationFormDef {
  template: TemplateId;
  templateLabel: string;
  steps: FormStep[];
}

const question = (id: string, label: string, max = 800, required = true): FieldDef => ({ id, label, kind: 'textarea', max, required });
const short = (id: string, label: string, required = false, help?: string): FieldDef => ({ id, label, kind: 'text', max: 200, required, help });
const choice = (id: string, label: string, options: string[]): FieldDef => ({ id, label, kind: 'select', options, required: true });

const resume = (help: string): FieldDef => ({ id: 'resume', label: 'Résumé (PDF)', kind: 'file', help });
const GITHUB: FieldDef = {
  id: 'github',
  label: 'GitHub profile URL',
  kind: 'url',
  urlKind: 'github',
  max: 200,
  placeholder: 'https://github.com/your-username',
  help: 'Encouraged, not required.',
};
const LINKEDIN: FieldDef = { id: 'linkedin', label: 'LinkedIn profile URL', kind: 'url', urlKind: 'linkedin', max: 200, placeholder: 'https://www.linkedin.com/in/your-name' };
const portfolio = (label: string, help?: string): FieldDef => ({ id: 'portfolio', label, kind: 'url', max: 200, placeholder: 'https://', help });
const WEBSITE: FieldDef = { id: 'website', label: 'Personal website URL', kind: 'url', max: 200, placeholder: 'https://' };

/** Class years for the current academic year (a new class year starts each July). */
function classYears(now = new Date()): string[] {
  const first = now.getFullYear() + (now.getMonth() >= 6 ? 1 : 0);
  return [0, 1, 2, 3].map((i) => String(first + i)).concat('Graduate student', 'Other');
}

const PERSONAL: FieldDef[] = [
  { id: 'fullName', label: 'Full name', kind: 'text', required: true, max: 100, autoComplete: 'name' },
  { id: 'email', label: 'UMass email address', kind: 'email', required: true, max: 120, autoComplete: 'email', placeholder: 'jdoe@umass.edu' },
  { id: 'major', label: 'Major or academic program', kind: 'text', required: true, max: 100 },
  { id: 'classYear', label: 'Class year', kind: 'select', required: true, options: classYears() },
  { id: 'minor', label: 'Secondary major or minor', kind: 'text', max: 100 },
];

const COMMITMENT = choice('commitment', 'How much time could you realistically commit per week?', [
  'Less than 2 hours',
  '2–4 hours',
  '4–6 hours',
  'More than 6 hours',
  'Not sure yet',
]);
const ANYTHING_ELSE = question('anythingElse', 'Is there anything else you would like the organization to know?', 600, false);

const TEMPLATES: Record<TemplateId, { label: string; professional: FieldDef[]; questions: FieldDef[] }> = {
  tech: {
    label: 'Technology & engineering',
    professional: [resume('Recommended for technical organizations.'), GITHUB, LINKEDIN, portfolio('Personal portfolio URL')],
    questions: [
      short('tools', 'Relevant programming languages or tools', false, 'For example: Python, Java, React, Arduino, Figma.'),
      question('projects', 'What technical projects have you worked on? Describe one you are proud of.', 1000),
      question('whyTech', 'Why do you want to join this technical organization?'),
      short('techAreas', 'Which technical areas interest you most?', true),
      choice('role', 'Would you prefer software development, hardware, design, research, or project management?', [
        'Software development',
        'Hardware',
        'Design',
        'Research',
        'Project management',
        'Not sure yet',
      ]),
      question('techTeam', 'Have you worked on a technical team before? Explain briefly.', 600),
    ],
  },
  business: {
    label: 'Business, finance & consulting',
    professional: [resume('Recommended for business organizations.'), LINKEDIN, WEBSITE],
    questions: [
      question('experience', 'Relevant experience', 600, false),
      short('businessAreas', 'Areas of business interest', true, 'For example: finance, consulting, marketing, entrepreneurship.'),
      question('why', 'Why are you interested in this association?'),
      question('businessInterest', 'What interests you about business, finance, consulting, or entrepreneurship?'),
      question('teamProblem', 'Describe a time you worked on a team or solved a challenging problem.'),
      question('contribute', 'What would you contribute to the organization?', 600),
      question('skills', 'What professional skills would you like to develop?', 600),
    ],
  },
  creative: {
    label: 'Arts, design & creative',
    professional: [portfolio('Portfolio URL', 'Any portfolio link works — no GitHub account needed.'), WEBSITE, resume('Optional.')],
    questions: [
      question('creativeWork', 'What kind of creative work do you enjoy?', 600),
      question('creativeProject', 'Describe a creative project you are proud of.', 1000),
      question('mediums', 'What tools, techniques, or mediums do you use?', 600),
      question('collaborate', 'Why would you like to collaborate with this organization?', 600),
    ],
  },
  audition: {
    label: 'Audition-based performance',
    professional: [
      portfolio('Performance reel or portfolio link', 'A video, recording or page with your work. Optional.'),
      resume('Optional.'),
    ],
    questions: [
      { ...question('performanceExperience', 'Relevant performance experience', 800, false), help: 'Theater, improv, comedy, music: anything counts. "None yet" is fine.' },
      question('auditionInterest', 'What draws you to audition for this group?', 600),
      choice('performRole', 'Preferred performance role', ['Performer', 'Writer', 'Performer and writer', 'Technical or production', 'Not sure yet']),
      short('auditionAvailability', 'When are you generally available for auditions?', true, 'Your general availability. Official audition times come from the organization.'),
      question('prepNotes', 'Additional preparation notes', 600, false),
    ],
  },
  media: {
    label: 'Media, journalism & photography',
    professional: [portfolio('Writing samples, photography or video portfolio URL'), resume('Optional.')],
    questions: [
      question('experience', 'Relevant experience', 600, false),
      question('storytelling', 'What interests you about media or storytelling?', 600),
      question('published', 'Describe something you have created or published.'),
      short('mediaRole', 'What role would you like to explore?', true, 'For example: writer, editor, photographer, producer.'),
      question('deadlines', 'How do you approach deadlines and collaboration?', 600),
    ],
  },
  service: {
    label: 'Community service & leadership',
    professional: [resume('Optional.')],
    questions: [
      short('interestAreas', 'Areas of interest', false),
      question('mission', "What motivates you to participate in this organization's mission?", 600),
      question('meaningful', 'Describe a meaningful team, leadership, or volunteer experience.'),
      question('contributeActivities', 'How would you contribute to its activities?', 600),
      question('impact', 'What kind of community impact would you like to make?', 600),
    ],
  },
  sports: {
    label: 'Sports & recreation',
    professional: [],
    questions: [
      question('activityInterest', 'What interests you about this activity?', 600),
      question('experience', 'Relevant experience, if any', 600, false),
      short('availability', 'When are you usually available?', true, 'For example: weekday evenings, weekends.'),
      question('goals', 'What are your participation goals?', 600),
      choice('practices', 'Would you be able to attend practices or events regularly?', ['Yes', 'Most weeks', 'Occasionally', 'Not sure yet']),
    ],
  },
  general: {
    label: 'General student organization',
    professional: [],
    questions: [
      question('why', 'Why are you interested in this organization?', 600),
      question('activities', 'What activities would you like to participate in?', 600),
      question('community', 'How would you contribute to the community?', 600),
      question('gain', 'What do you hope to gain from joining?', 600),
    ],
  },
};

const CATEGORY_TEMPLATE: Partial<Record<Category, TemplateId>> = {
  Technology: 'tech',
  Engineering: 'tech',
  Business: 'business',
  Career: 'business',
  'Arts & Music': 'creative',
  Media: 'media',
  Service: 'service',
  'Sports & Recreation': 'sports',
};

export function templateFor(club: Club): TemplateId {
  const t = club.application?.template;
  return t && t in TEMPLATES ? (t as TemplateId) : (CATEGORY_TEMPLATE[club.category] ?? 'general');
}

export function buildForm(club: Club): ApplicationFormDef {
  const template = templateFor(club);
  const t = TEMPLATES[template];
  const official: FieldDef[] = (club.application?.questions ?? []).map((label, i) => ({
    id: `official${i + 1}`,
    label,
    kind: 'textarea',
    max: 1500,
    required: true,
    official: true,
  }));
  const steps: FormStep[] = [{ id: 'personal', title: 'Personal information', fields: PERSONAL }];
  if (t.professional.length) steps.push({ id: 'professional', title: 'Résumé & professional links', fields: t.professional });
  steps.push({ id: 'questions', title: 'Organization questions', fields: [...official, ...t.questions, COMMITMENT, ANYTHING_ELSE] });
  return { template, templateLabel: t.label, steps };
}

const REQUIRED_MESSAGE: Record<string, string> = {
  fullName: 'Enter your full name.',
  email: 'Enter your UMass email address.',
  major: 'Enter your major or academic program.',
  classYear: 'Choose your class year.',
};

/** Adds https:// when a link was typed without a scheme ("github.com/me"). */
export const withScheme = (v: string) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`);

/** Returns a friendly error message, or '' when the value is acceptable. */
export function validateField(f: FieldDef, raw: string | undefined): string {
  const v = (raw ?? '').trim();
  if (f.kind === 'file') return '';
  if (!v) return f.required ? (REQUIRED_MESSAGE[f.id] ?? (f.kind === 'select' ? 'Choose an option to continue.' : 'Answer this question to continue.')) : '';
  if (f.max && v.length > f.max) return `Keep this under ${f.max} characters (it's ${v.length} now).`;
  if (f.kind === 'select' && f.options && !f.options.includes(v)) return 'Choose an option to continue.';
  if (f.kind === 'email') {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address, like jdoe@umass.edu.';
    if (!/@([a-z0-9-]+\.)*umass\.edu$/i.test(v)) return 'Use your UMass email address (ending in umass.edu).';
  }
  if (f.kind === 'url') {
    let u: URL;
    try {
      u = new URL(withScheme(v));
    } catch {
      return 'Enter a full link, like https://example.com.';
    }
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return 'Enter a full link, like https://example.com.';
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (f.urlKind === 'github' && (host !== 'github.com' || !/^\/[a-z0-9](?:[a-z0-9-]{0,38})\/?$/i.test(u.pathname)))
      return 'Enter your GitHub profile link, like https://github.com/your-username (not a repository).';
    if (f.urlKind === 'linkedin' && (!/(^|\.)linkedin\.com$/.test(host) || !/^\/in\/[^/]+\/?$/.test(u.pathname)))
      return 'Enter your LinkedIn profile link, like https://www.linkedin.com/in/your-name.';
  }
  return '';
}

export function validateStep(step: FormStep, values: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of step.fields) {
    const e = validateField(f, values[f.id]);
    if (e) errors[f.id] = e;
  }
  return errors;
}

/** Trims answers and adds https:// to links typed without it. */
export function cleanValues(def: ApplicationFormDef, values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of def.steps.flatMap((s) => s.fields)) {
    const v = values[f.id]?.trim();
    if (v) out[f.id] = f.kind === 'url' ? withScheme(v) : v;
  }
  return out;
}

/** Restores saved answers defensively: unknown fields, wrong types and stale options from older versions are dropped. */
export function restoreForm(def: ApplicationFormDef, saved: ApplicationForm | undefined) {
  const fields = new Map(def.steps.flatMap((s) => s.fields).map((f) => [f.id, f]));
  const values: Record<string, string> = {};
  const raw: unknown = saved && typeof saved === 'object' ? saved.values : undefined;
  if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw)) {
      const f = fields.get(k);
      if (!f || f.kind === 'file' || typeof v !== 'string') continue;
      if (f.options && !f.options.includes(v)) continue;
      values[k] = f.max ? v.slice(0, f.max) : v;
    }
  }
  const step = Number.isInteger(saved?.step) ? Math.min(Math.max(saved!.step, 0), def.steps.length) : 0;
  const r = saved?.resume;
  const resume = r && typeof r.name === 'string' && typeof r.size === 'number' ? { name: r.name, size: r.size } : undefined;
  const preparedAt = typeof saved?.preparedAt === 'string' ? saved.preparedAt : undefined;
  return { values, step, resume, preparedAt };
}

/** Profile fields used to prefill forms; the same definitions validate the profile itself (all optional there). */
export const PROFILE_FIELDS: FieldDef[] = [
  ...PERSONAL.map((f) => ({ ...f, required: false })),
  { ...GITHUB, help: undefined },
  LINKEDIN,
  portfolio('Personal portfolio or website URL'),
  { ...question('experience', 'Relevant general experience', 800, false), help: 'Reused where a form asks for relevant experience.' },
];

/**
 * Values to prefill a new form from the applicant profile. Only fields this form has are filled; a profile portfolio
 * fills the form's "portfolio" field, or its "website" field when it has no portfolio field.
 */
export function prefillFromProfile(def: ApplicationFormDef, profile: ApplicantProfile | null | undefined): Record<string, string> {
  if (!profile) return {};
  const ids = new Set(def.steps.flatMap((s) => s.fields.map((f) => f.id)));
  const map: Record<string, string | undefined> = {
    fullName: profile.fullName,
    email: profile.email,
    major: profile.major,
    minor: profile.minor,
    classYear: profile.classYear,
    github: profile.github,
    linkedin: profile.linkedin,
    experience: profile.experience,
    [ids.has('portfolio') ? 'portfolio' : 'website']: profile.portfolio,
  };
  const options = new Map(def.steps.flatMap((s) => s.fields.map((f) => [f.id, f.options] as const)));
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(map)) {
    const val = v?.trim();
    if (!val || !ids.has(k)) continue;
    const opts = options.get(k);
    if (opts && !opts.includes(val)) continue;
    out[k] = val;
  }
  return out;
}

/** Plain-text copy of the answers, for pasting into an official application. */
export function formatAnswers(club: Club, def: ApplicationFormDef, values: Record<string, string>, resumeName?: string): string {
  const lines = [
    `${club.name}: application answers`,
    'Prepared in MyClubs with sample application questions. This is not an official application and nothing was submitted.',
    '',
  ];
  for (const s of def.steps) {
    lines.push(s.title.toUpperCase());
    for (const f of s.fields) {
      const v =
        f.kind === 'file'
          ? resumeName
            ? `${resumeName} (attach it yourself; the file is not included here)`
            : 'Not attached'
          : values[f.id]?.replace(/\r\n?/g, '\n').trim() || 'Not provided';
      lines.push(f.kind === 'textarea' ? `${f.label}\n${v}\n` : `${f.label}: ${v}`);
    }
    lines.push('');
  }
  return `${lines.join('\n').trim()}\n`;
}

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export function fmtSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Checks type, size and the PDF signature. Returns a friendly error, or '' when the file is a usable PDF. */
export async function checkPdf(file: File): Promise<string> {
  if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return `“${file.name}” isn't a PDF. Choose a PDF file.`;
  if (file.size === 0) return 'This file is empty. Choose another PDF.';
  if (file.size > MAX_RESUME_BYTES) return `This PDF is ${fmtSize(file.size)}. Choose one under 5 MB.`;
  const head = await file
    .slice(0, 5)
    .text()
    .catch(() => '');
  return head === '%PDF-' ? '' : `“${file.name}” doesn't look like a valid PDF. Try exporting it again.`;
}
