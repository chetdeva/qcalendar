import { HttpError } from './errors.ts';
import type { Assignment, DirectoryStudent, Feedback, Mentor, Session, StudentDashboard, Submission, TeacherDashboard, TeacherSession } from './types.ts';

// Sample data for the dashboards, taken from the Figma design. Everything lives in memory and resets when the service
// restarts. Phase 2 replaces this file with database queries behind the same functions.

const MENTOR_FILTERS = [
  { id: 'all', label: 'All Mentors' },
  { id: 'middle', label: 'Middle School (6–8)' },
  { id: 'olympiad', label: 'Olympiad / AMC 8' },
  { id: 'whiteboard', label: 'Visual Whiteboard Certified' },
  { id: 'available', label: 'Available This Week' },
];

const MENTORS: Mentor[] = [
  { id: 'm-pprincy', name: 'Coach Pprincy Sugandhh', initials: 'PS', photo: '/images/princy.jpg', headline: 'Lead STEM Specialist • M.Ed.', rating: 4.98, reviews: 142, tags: ['Geometry', 'Spatial Intuition', 'Proofs & Logic'], quote: 'Every shape has a story. We use interactive 3D models and step-by-step color proofs so formulas make intuitive sense.', primary: true, filters: ['middle', 'whiteboard', 'available'] },
  { id: 'm-marcus', name: 'Coach Marcus Vance', initials: 'MV', headline: 'Columbia Univ • Applied Math', rating: 4.95, reviews: 98, tags: ['Visual Fractions', 'Algebraic Slopes', 'Grades 6–9'], quote: 'Mastering equations isn’t about memorizing symbols; it’s about balance scales and intuitive graphs that click immediately.', primary: false, filters: ['middle', 'whiteboard'] },
  { id: 'm-elena', name: 'Coach Elena Rostova', initials: 'ER', headline: 'MIT Alum • AMC 8 Head', rating: 4.97, reviews: 115, tags: ['Competition Prep', 'Number Theory', 'AMC 8 / MathCounts'], quote: 'We take competition-level trick questions and deconstruct them into visual games. High speed, zero fear, pure puzzle solving.', primary: false, filters: ['olympiad', 'available'] },
];

const SESSIONS: Session[] = [
  { id: 's1', badge: 'Starting Today', tone: 'sky', when: 'Today, 4:30 PM – 5:15 PM (45m)', who: 'Coach Pprincy Sugandhh', whoNote: 'Lead Geometry & Spatial Coach', topicLabel: 'Topic focus', topic: 'Pythagorean Theorem & 3D Spatial Proofs', blurb: 'Interactive 3D pyramids and vector projections on whiteboard.', primary: 'Join Classroom (Ready)', next: true },
  { id: 's2', badge: 'Confirmed', tone: 'slate', when: 'Thursday, 5:00 PM – 5:45 PM', who: 'Coach Marcus Vance', whoNote: 'Columbia Univ • Algebra Lead', topicLabel: 'Topic focus', topic: 'Dynamic Slopes & Linear Equations (y = mx + b)', blurb: 'Visualizing rise over run using real-time roller coaster physics simulations.', primary: 'View Materials' },
  { id: 's3', badge: 'Competition Group', tone: 'sun', when: 'Saturday, 11:00 AM – 11:45 AM', who: 'AMC 8 Math Circle', whoNote: 'Quanttoria Olympiad Cohort', topicLabel: 'Topic focus', topic: 'Weekly Olympiad Problem Solving & AMC 8 Prep', blurb: 'Combinatorics, pigeonhole principle, and rapid mental spatial puzzles.', primary: 'Warmup Quiz (3 Qs)' },
];

const MAYA = 'st-maya';
const STUDENTS: DirectoryStudent[] = [
  { id: MAYA, name: 'Maya Jenkins', initials: 'MJ', grade: 'Grade 8 Honors', gradeNumber: 8, mastery: 98, topic: '3D Geometry', aq: 'High Resilience', aqTone: 'sun', lastSession: '2 days ago', unit: 'Unit 4 Progress', unitPct: 88 },
  { id: 'st-ethan', name: 'Ethan Cole', initials: 'EC', grade: 'Grade 7', gradeNumber: 7, mastery: 85, topic: 'Equations & Ratios', aq: 'Growing Steadily', aqTone: 'rose', lastSession: 'Yesterday', unit: 'Unit 3 Progress', unitPct: 64 },
  { id: 'st-liam', name: 'Liam Davis', initials: 'LD', grade: 'Grade 5 Explorer', gradeNumber: 5, mastery: 92, topic: 'Visual Fractions', aq: 'Building Confidence', aqTone: 'sky', lastSession: '3 days ago', unit: 'Unit 2 Progress', unitPct: 76 },
];

const TAGS = ['Visual Clarity', 'Spatial Insight', 'High Adversity Quotient (AQ)', 'Clear Reasoning', 'Great Persistence'];
const PRESETS = ['5-Question Micro-Quest', 'Spatial Proof Scratchpad', 'Olympiad Drill'];
const TOOLS = ['GeoGebra Dynamic Right Triangles Sandbox', 'Coordinate Plane Scratchpad', 'Fraction Number-Line Hop'];

const firstName = (name: string | undefined, email: string | undefined) => (name?.trim().split(/\s+/)[0] || email?.split('@')[0] || 'there');
const dueLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export interface PublishInput { score: number; tags: string[]; note: string }
export interface AssignInput { studentId: string; preset?: string; concept: string; dueDate: string; xp: number; prompt: string }

/** The in-memory sample world. One instance per service (and per test), so tests never share state. */
export function createMockStore() {
  let assignments: Assignment[] = [];
  let feedback: Feedback[] = [];
  let submissions: Submission[] = [];
  let seq = 0;

  const reset = () => {
    seq = 0;
    assignments = [
      { id: 'a1', studentId: MAYA, title: 'Pythagoras Real-World Triangles', description: '5 real-world distance problems. Pythagorean theorem on architectural blueprints.', due: 'Due Tomorrow', dueTone: 'warn', doneSteps: 3, totalSteps: 5, status: 'In Progress (3/5 done)', action: 'Continue Whiteboard', tone: 'sky' },
      { id: 'a2', studentId: MAYA, title: 'Dynamic Slope Mountain Challenge', description: 'Interactive slope quest: calculate ski slope incline angles using rate of change.', due: 'Due Oct 28', dueTone: 'plain', doneSteps: 0, totalSteps: 5, status: 'Not Started', action: 'Start Task', tone: 'rose' },
    ];
    feedback = [
      { id: 'f1', gradedLabel: 'Graded Yesterday', score: 98, grade: 'A+', title: 'Coordinate Plane Reflections & Rotations', coach: 'Coach Pprincy Sugandhh', audio: '42s', note: 'Brilliant spatial deduction on Question 4! Your step-by-step visual proof was crystal clear. Keep pushing on the 3D perspective!', action: 'View Graded Whiteboard & Notes' },
      { id: 'f2', gradedLabel: 'Graded 3 days ago', score: 92, grade: 'A', title: 'Linear Inequalities & Shading', coach: 'Coach Marcus Vance', note: 'Great tenacity working through the negative sign inversion! Reviewed your scratchpad steps — your boundary line deductions are spot on.', action: 'Review Scratchpad Annotations' },
      { id: 'f3', gradedLabel: 'Graded last week', score: 95, grade: 'A', title: 'Angle Relationships in Parallel Lines', coach: 'Coach Pprincy Sugandhh', note: 'Your colour-coded angle pairs made the proof easy to follow. Try naming each theorem as you use it next time.', action: 'Review Scratchpad Annotations' },
      { id: 'f4', gradedLabel: 'Graded last week', score: 90, grade: 'A-', title: 'Area of Composite Shapes', coach: 'Coach Marcus Vance', note: 'Smart decomposition into rectangles and triangles. Watch the units on the last step.', action: 'Review Scratchpad Annotations' },
      { id: 'f5', gradedLabel: 'Graded 2 weeks ago', score: 94, grade: 'A', title: 'Intro to Slope as Rate of Change', coach: 'Coach Pprincy Sugandhh', note: 'You connected rise over run to the roller coaster picture without any hints. That is real understanding.', action: 'Review Scratchpad Annotations' },
    ];
    submissions = [
      { id: 'sub-maya', studentId: MAYA, student: 'Maya Jenkins', initials: 'MJ', task: 'Coordinate Plane Reflections & Rotations', submitted: 'Submitted Today, 2:15 PM', status: 'pending', scratchpad: { label: 'Scratchpad Question #4 Proof', check: 'Vector Check: Matched', attempts: 1, elapsedMins: 14 }, score: 98, tags: ['Visual Clarity', 'Spatial Insight', 'High Adversity Quotient (AQ)'], note: 'Brilliant spatial deduction on Question 4, Maya! Your step-by-step 180-degree rotation around the origin was crystal clear. Let’s review hypotenuse radicals during our 4:30 session.', draft: false },
      { id: 'sub-ethan', studentId: 'st-ethan', student: 'Ethan Cole', initials: 'EC', task: 'Module 4: Fraction Division & Number Line Hop', submitted: 'Submitted 35 min ago', status: 'pending', score: 0, tags: [], note: '', draft: false },
    ];
  };
  reset();

  const pendingTotal = () => 3 + submissions.filter((s) => s.status === 'pending').length; // 3 more waiting beyond the two shown

  function student(name: string | undefined, email: string | undefined): StudentDashboard {
    const first = firstName(name, email);
    return {
      profile: { name: name?.trim() || first, level: 'Student Explorer', term: 'Active Term • Fall 2025', grade: 'Grade 8 — Pre-Algebra & Geo' },
      welcome: { name: first, headline: 'Ready to master geometry today?', blurb: 'You’ve solved 14 visual challenges this week. Your spatial reasoning streak is at an all-time high!', streakDays: 7, aq: 88, points: 1420 },
      nextSession: { liveIn: 'Live in 25 mins', classroomId: '#GEO-804', title: '1:1 Geometry Mentorship', mentor: 'With Coach Pprincy Sugandhh' },
      progress: {
        streak: { label: 'Spatial Proofs Streak', value: '7 Days Running!', pct: 70 },
        weekly: { label: 'Weekly Geometry Goal', value: '18 / 20 Proofs Mastered', pct: 90 },
        tenacity: { label: 'Adaptive Tenacity (AQ)', value: 'Tier 1: High Resilience', note: 'Zero hints used on 3D angles!' },
      },
      sessions: SESSIONS,
      mentorFilters: MENTOR_FILTERS,
      mentors: MENTORS,
      assignments: assignments.filter((a) => a.studentId === MAYA),
      feedback,
    };
  }

  const today = (): TeacherSession[] => [
    { id: 'ts1', student: 'Maya Jenkins', initials: 'MJ', grade: 'Grade 8', detail: 'Advanced Spatial Geometry Cohort', time: '4:30 PM – 5:15 PM (45m)', startsIn: 'Starts in 18 min', kind: '1-on-1 Studio', topic: 'Pythagorean Theorem & Spatial Proofs in 3D', parentNote: 'Parent Note (Mrs. Jenkins): “Maya struggled with radical simplification on the hypotenuse root yesterday. Could we verify the geometric square area method visually?”', tools: ['Kit Ready'], hero: true },
    { id: 'ts2', student: 'Ethan Cole', initials: 'EC', grade: 'Grade 7', detail: 'Pre-Algebra: Variables & Scale Balance Equations', time: '5:45 PM – 6:30 PM', startsIn: 'In 1 hr 35 mins' },
    { id: 'ts3', student: 'Sophia Rodriguez', initials: 'SR', grade: 'Grade 9 Honors', detail: 'Quadratic Factoring & Completing the Square Proofs', time: '7:00 PM – 7:45 PM', startsIn: 'Tonight' },
  ];

  function teacher(name: string | undefined, email: string | undefined): TeacherDashboard {
    const first = firstName(name, email);
    const pending = submissions.filter((s) => s.status === 'pending');
    return {
      profile: { name: name?.trim() || first, title: 'Lead Math Specialist • K-9 Honors', status: 'Live Session Standby' },
      welcome: { name: `Coach ${first}`, blurb: 'Your digital math laboratory is primed. 4 live cohorts scheduled today.' },
      metrics: [
        { label: 'Today’s Classes', value: '4 Sessions', note: 'Next at 4:30 PM', tone: 'sky' },
        { label: 'Active Learners', value: '18 Students', note: 'Grades 5 – 9 Honors', tone: 'sky' },
        { label: 'Pending Grading', value: `${pendingTotal()} Submissions`, note: '2 urgent (Due today)', tone: 'rose' },
        { label: 'Student AQ Growth', value: '+34.8%', note: 'Avg Resilience Metric', tone: 'mint' },
      ],
      schedule: { dateLabel: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }), sessions: today(), officeHours: { label: '8:00 PM: Async Office Hours & Parent Q&A Chat Window', rsvps: 2 } },
      builder: {
        presets: PRESETS,
        tools: TOOLS,
        students: STUDENTS.map((s) => ({ id: s.id, name: s.name, grade: s.grade.replace(/ (Honors|Explorer)$/, ''), track: s.topic })),
        defaults: { studentId: MAYA, concept: TOOLS[0], dueDate: inDays(2), xp: 120, prompt: 'Explore the 3–4–5 triangle on the sandbox grid. Notice what happens when you rotate the hypotenuse square!' },
      },
      grading: { pending: pendingTotal(), readyForSync: `${Math.min(2, pending.length)} of ${pendingTotal()} ready for parent sync`, availableTags: TAGS, queue: submissions.filter((s) => s.status === 'pending') },
      directory: { students: STUDENTS, grades: [{ value: 'all', label: 'All Grades (5–9)' }, ...[5, 6, 7, 8, 9].map((g) => ({ value: String(g), label: `Grade ${g}` }))] },
    };
  }

  function mentors(q: string, filter: string): Mentor[] {
    const needle = q.trim().toLowerCase();
    return MENTORS.filter((m) => (filter === 'all' || m.filters.includes(filter))
      && (!needle || [m.name, m.headline, m.quote, ...m.tags].some((t) => t.toLowerCase().includes(needle))));
  }

  function students(q: string, grade: string): DirectoryStudent[] {
    const needle = q.trim().toLowerCase();
    return STUDENTS.filter((s) => (grade === 'all' || s.gradeNumber === Number(grade)) && (!needle || s.name.toLowerCase().includes(needle)));
  }

  function assign(input: AssignInput): Assignment {
    const target = STUDENTS.find((s) => s.id === input.studentId);
    if (!target) throw new HttpError(404, 'not_found', 'Student not found');
    const a: Assignment = {
      id: `a-new-${++seq}`, studentId: target.id, title: input.concept, description: input.prompt, due: `Due ${dueLabel(input.dueDate)}`, dueTone: 'plain',
      doneSteps: 0, totalSteps: 5, status: 'Not Started', action: 'Start Task', tone: 'violet',
    };
    assignments = [...assignments, a];
    return a;
  }

  function find(id: string) {
    const s = submissions.find((x) => x.id === id);
    if (!s) throw new HttpError(404, 'not_found', 'Submission not found');
    if (s.status !== 'pending') throw new HttpError(409, 'already_published', 'This grade is already published');
    return s;
  }

  function saveDraft(id: string, input: PublishInput) {
    const s = find(id);
    Object.assign(s, { score: input.score, tags: input.tags, note: input.note, draft: true });
    return s;
  }

  function publish(id: string, input: PublishInput, coach: string): Feedback {
    const s = find(id);
    Object.assign(s, { score: input.score, tags: input.tags, note: input.note, status: 'published', draft: false });
    const f: Feedback = {
      id: `f-new-${++seq}`, gradedLabel: 'Graded just now', score: input.score, grade: input.score >= 97 ? 'A+' : input.score >= 93 ? 'A' : input.score >= 90 ? 'A-' : input.score >= 80 ? 'B' : 'C',
      title: s.task, coach, note: input.note, action: 'View Graded Whiteboard & Notes',
    };
    if (s.studentId === MAYA) feedback = [f, ...feedback];
    return f;
  }

  return { reset, student, teacher, mentors, students, assign, saveDraft, publish, tags: TAGS };
}

export type MockStore = ReturnType<typeof createMockStore>;
