// Shapes returned by dashboard-service (a copy of its src/types.ts plus the task page type; keep them in step).

export type View = 'student' | 'teacher';
export type Tone = 'sky' | 'sun' | 'mint' | 'rose' | 'violet' | 'slate';
export type Level = 'elementary' | 'middle' | 'high' | 'olympiad';
export const LEVELS: Level[] = ['elementary', 'middle', 'high', 'olympiad'];

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
  /** The class's meeting link, when it has one: the Join button opens it. */
  meetingUrl: string | null;
  /** The one highlighted "next up" card. */
  next?: boolean;
}

export type AssignmentState = 'todo' | 'in_progress' | 'submitted' | 'graded';

export interface Assignment {
  id: string;
  title: string;
  description: string;
  due: string;
  dueTone: 'warn' | 'plain';
  doneSteps: number;
  totalSteps: number;
  state: AssignmentState;
  status: string;
  action: string;
  tone: Tone;
}

export interface Feedback {
  id: string;
  assignmentId: string;
  gradedLabel: string;
  score: number;
  grade: string;
  title: string;
  coach: string;
  note: string;
  tags: string[];
}

export interface Mentor {
  id: string;
  name: string;
  initials: string;
  headline: string;
  specialties: string[];
  quote: string;
  levels: Level[];
  primary: boolean;
}

export interface StudentDashboard {
  profile: { name: string; level: string; term: string; grade: string };
  welcome: { name: string; headline: string; blurb: string; streakDays: number; aq: number | null; points: number };
  nextSession: { liveIn: string; classroomId: string; title: string; mentor: string; meetingUrl: string | null } | null;
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
  notes?: string;
  meetingUrl?: string | null;
  hero?: boolean;
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string;
  student: string;
  initials: string;
  task: string;
  submitted: string;
  status: 'pending' | 'graded';
  answer: string;
  attachmentId: string | null;
  score: number | null;
  tags: string[];
  note: string;
  draft: boolean;
}

export interface DirectoryStudent {
  id: string;
  name: string;
  initials: string;
  grade: string;
  gradeNumber: number | null;
  mastery: number | null;
  topic: string;
  aq: string;
  aqTone: Tone;
  lastSession: string;
  unit: string;
  unitPct: number;
}

export interface MentorProfile { headline: string; specialties: string[]; levels: Level[]; quote: string; published: boolean }

export interface TeacherDashboard {
  profile: { name: string; title: string; status: string };
  welcome: { name: string; blurb: string };
  metrics: TeacherMetric[];
  schedule: { dateLabel: string; sessions: TeacherSession[]; officeHours: { label: string; rsvps: number } | null };
  builder: {
    presets: string[];
    tools: string[];
    students: { id: string; name: string; grade: string; track: string }[];
    defaults: { studentId: string; concept: string; dueDate: string; xp: number; prompt: string };
  };
  grading: { pending: number; readyForSync: string; availableTags: string[]; queue: Submission[] };
  directory: { students: DirectoryStudent[]; grades: { value: string; label: string }[] };
  mentorProfile: MentorProfile;
}

/** One task with everything the student's Assignments page shows (dashboard-service: AssignmentDetail). */
export interface AssignmentDetail extends Assignment {
  prompt: string;
  dueDate: string;
  answer: string | null;
  attachmentId: string | null;
  score: number | null;
  grade: string | null;
  tags: string[];
  note: string;
  gradedLabel: string | null;
  coach: string;
}
