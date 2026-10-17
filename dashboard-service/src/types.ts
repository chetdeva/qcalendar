// The shapes the dashboards are built from. dashboard-ui keeps a copy in lib/types.ts.
// Phase 1 fills them from src/mock.ts; the database phase fills the same shapes.

export type View = 'student' | 'teacher';
export type Tone = 'sky' | 'sun' | 'mint' | 'rose' | 'violet' | 'slate';

export interface Session {
  id: string;
  badge: string;
  tone: Tone;
  when: string;
  who: string;
  whoNote: string;
  topicLabel: string;
  topic: string;
  blurb: string;
  primary: string;
  /** The one highlighted "next up" card. */
  next?: boolean;
}

export interface Assignment {
  id: string;
  studentId: string;
  title: string;
  description: string;
  due: string;
  dueTone: 'warn' | 'plain';
  doneSteps: number;
  totalSteps: number;
  status: string;
  action: string;
  tone: Tone;
}

export interface Feedback {
  id: string;
  gradedLabel: string;
  score: number;
  grade: string;
  title: string;
  coach: string;
  audio?: string;
  note: string;
  action: string;
}

export interface Mentor {
  id: string;
  name: string;
  initials: string;
  photo?: string;
  headline: string;
  rating: number;
  reviews: number;
  tags: string[];
  quote: string;
  primary: boolean;
  /** Quick-filter ids this mentor matches: middle, olympiad, whiteboard, available. */
  filters: string[];
}

export interface StudentDashboard {
  profile: { name: string; level: string; term: string; grade: string };
  welcome: { name: string; headline: string; blurb: string; streakDays: number; aq: number; points: number };
  nextSession: { liveIn: string; classroomId: string; title: string; mentor: string };
  progress: {
    streak: { label: string; value: string; pct: number };
    weekly: { label: string; value: string; pct: number };
    tenacity: { label: string; value: string; note: string };
  };
  sessions: Session[];
  mentorFilters: { id: string; label: string }[];
  mentors: Mentor[];
  assignments: Assignment[];
  feedback: Feedback[];
}

export interface TeacherMetric { label: string; value: string; note: string; tone: Tone }

export interface TeacherSession {
  id: string;
  student: string;
  initials: string;
  grade: string;
  detail: string;
  time: string;
  startsIn: string;
  kind?: string;
  topic?: string;
  parentNote?: string;
  tools?: string[];
  hero?: boolean;
}

export interface Submission {
  id: string;
  studentId: string;
  student: string;
  initials: string;
  task: string;
  submitted: string;
  status: 'pending' | 'published';
  scratchpad?: { label: string; check: string; attempts: number; elapsedMins: number };
  score: number;
  tags: string[];
  note: string;
  draft: boolean;
}

export interface DirectoryStudent {
  id: string;
  name: string;
  initials: string;
  grade: string;
  gradeNumber: number;
  mastery: number;
  topic: string;
  aq: string;
  aqTone: Tone;
  lastSession: string;
  unit: string;
  unitPct: number;
}

export interface TeacherDashboard {
  profile: { name: string; title: string; status: string };
  welcome: { name: string; blurb: string };
  metrics: TeacherMetric[];
  schedule: { dateLabel: string; sessions: TeacherSession[]; officeHours: { label: string; rsvps: number } };
  builder: {
    presets: string[];
    tools: string[];
    students: { id: string; name: string; grade: string; track: string }[];
    defaults: { studentId: string; concept: string; dueDate: string; xp: number; prompt: string };
  };
  grading: {
    pending: number;
    readyForSync: string;
    availableTags: string[];
    queue: Submission[];
  };
  directory: { students: DirectoryStudent[]; grades: { value: string; label: string }[] };
}
