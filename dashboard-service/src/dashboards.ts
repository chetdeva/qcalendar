import type { FileStore } from './files.ts';
import type { Actor } from './auth.ts';
import type { Db } from './db.ts';
import * as m from './metrics.ts';
import * as st from './store.ts';
import type { AssignmentRow } from './store.ts';
import type { CalEvent, Sources } from './sources.ts';
import { LEVELS } from './types.ts';
import type { Assignment, DirectoryStudent, Feedback, Level, Mentor, Session, StudentDashboard, Submission, TeacherDashboard, TeacherSession, Tone } from './types.ts';

export interface Ctx { db: Db; sources: Sources; now: () => Date; dashboardUrl: string; files?: FileStore } // no files = uploads stay in the database

export const MENTOR_FILTERS = [
  { id: 'all', label: 'All Mentors' },
  { id: 'elementary', label: 'Elementary (1–5)' },
  { id: 'middle', label: 'Middle School (6–8)' },
  { id: 'high', label: 'High School (9–10)' },
  { id: 'olympiad', label: 'Olympiad / Competitions' },
];
export const GRADES = Array.from({ length: 10 }, (_, i) => `Grade ${i + 1}`);
const TOOLS = ['GeoGebra Dynamic Right Triangles Sandbox', 'Coordinate Plane Scratchpad', 'Fraction Number-Line Hop'];
const DAYS = 86_400_000;

const first = (name: string | undefined, email: string | undefined) => name?.trim().split(/\s+/)[0] || email?.split('@')[0] || 'there';
const initials = (name: string) => name.replace(/^Coach\s+/, '').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
const settle = <T>(p: Promise<T>, fallback: T) => p.catch((e) => { console.error('source failed:', (e as Error).message); return fallback; });

const clock = (iso: string, tz: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
const range = (e: CalEvent) => `${clock(e.start, e.timezone)} – ${clock(e.end, e.timezone)}`;
const minutes = (e: CalEvent) => Math.round((Date.parse(e.end) - Date.parse(e.start)) / 60_000);

function when(e: CalEvent, now: Date) {
  const tz = e.timezone;
  const day = m.dayOf(new Date(e.start), tz);
  const label = day === m.dayOf(now, tz) ? 'Today' : day === m.dayOf(new Date(now.getTime() + DAYS), tz) ? 'Tomorrow' : new Date(e.start).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: tz });
  return `${label}, ${range(e)} (${minutes(e)}m)`;
}

const CATEGORY = { tutoring: 'Private tutoring', office_hours: 'Office hours', personal: 'Personal' } as const;

export function toAssignment(r: AssignmentRow, now: Date): Assignment {
  const state = r.sub_status === 'graded' ? 'graded' : r.sub_id ? 'submitted' : r.steps_done > 0 ? 'in_progress' : 'todo';
  const due = m.dueLabel(r.due_date, now);
  return {
    id: r.id, title: r.title, description: r.prompt, due: due.label, dueTone: due.tone, doneSteps: r.steps_done, totalSteps: r.steps_total, state,
    status: { todo: 'Not Started', in_progress: `In Progress (${r.steps_done}/${r.steps_total} done)`, submitted: 'Handed in, waiting for feedback', graded: 'Graded' }[state],
    action: { todo: 'Start Task', in_progress: 'Continue Task', submitted: 'View Submission', graded: 'View Feedback' }[state],
    tone: ({ todo: 'rose', in_progress: 'sky', submitted: 'sun', graded: 'mint' } as Record<string, Tone>)[state],
  };
}

const season = (d: Date) => `${['Winter', 'Winter', 'Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Fall', 'Fall', 'Fall', 'Winter'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;

// ---------------------------------------------------------------- student

export async function buildStudent(ctx: Ctx, actor: Actor, auth: string): Promise<StudentDashboard> {
  const now = ctx.now();
  const [events, rows, days, settings, profiles] = await Promise.all([
    settle(ctx.sources.events(auth, new Date(now.getTime() - 30 * DAYS), new Date(now.getTime() + 30 * DAYS)), [] as CalEvent[]),
    st.assignmentsOfStudent(ctx.db, actor.id), st.activityDays(ctx.db, actor.id), st.getSettings(ctx.db, [actor.id]), st.publishedProfiles(ctx.db),
  ]);
  const mine = settings.get(actor.id);

  const upcoming = events.filter((e) => e.status === 'confirmed' && Date.parse(e.end) > now.getTime()).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const past = events.filter((e) => e.status === 'confirmed' && Date.parse(e.end) <= now.getTime()).sort((a, b) => Date.parse(b.start) - Date.parse(a.start));
  const primaryId = upcoming[0]?.ownerId ?? past[0]?.ownerId;

  const graded = rows.filter((r) => r.sub_status === 'graded').sort((a, b) => Number(b.graded_at) - Number(a.graded_at));
  const people = await ctx.sources.people(auth, [...profiles.map((p) => p.user_id), ...graded.map((g) => g.teacher_id)]).catch(() => new Map());
  const coachName = (id: string) => people.get(id)?.name ?? 'Your coach';

  const sessions: Session[] = upcoming.slice(0, 3).map((e, i) => {
    const today = m.dayOf(new Date(e.start), e.timezone) === m.dayOf(now, e.timezone);
    return {
      id: e.id, next: i === 0 || undefined, who: e.ownerName ?? 'Your teacher', whoNote: CATEGORY[e.category], when: when(e, now),
      badge: e.myStatus === 'invited' ? 'Needs your answer' : today ? 'Starting Today' : 'Confirmed', tone: (e.myStatus === 'invited' ? 'sun' : today ? 'sky' : 'slate') as Tone,
      topicLabel: 'Topic focus', topic: e.title, blurb: (e.description ?? '').slice(0, 160), primary: e.meetingUrl ? 'Join Classroom' : 'View Details', meetingUrl: e.meetingUrl,
    };
  });

  // A profile whose person cannot be found (deleted, or users-service is down) is left out rather than shown as a nameless card.
  const mentors: Mentor[] = profiles.filter((p) => people.has(p.user_id)).map((p) => {
    const name = people.get(p.user_id)!.name;
    return { id: p.user_id, name: name.startsWith('Coach') ? name : `Coach ${name}`, initials: initials(name), headline: p.headline, specialties: p.specialties, quote: p.quote, levels: p.levels, primary: p.user_id === primaryId };
  }).sort((a, b) => Number(b.primary) - Number(a.primary));

  const feedback: Feedback[] = graded.map((g) => ({
    id: g.sub_id!, assignmentId: g.id, gradedLabel: m.gradedLabel(g.graded_at!, now), score: g.score!, grade: m.letter(g.score!), title: g.title, coach: coachName(g.teacher_id), note: g.note ?? '', tags: g.tags ?? [],
  }));

  const streakDays = m.streak(days, now);
  const aq = m.aq(graded.map((g) => g.tags ?? []), rows.map((r) => !!r.sub_id));
  const target = mine?.weekly_target ?? 5;
  const doneThisWeek = rows.filter((r) => r.submitted_at && r.submitted_at.getTime() > now.getTime() - 7 * DAYS).length;
  const tr = m.tier(aq);
  const next = upcoming[0];

  return {
    profile: { name: actor.name ?? first(undefined, actor.email), level: 'Student Explorer', term: `Active Term • ${season(now)}`, grade: mine?.grade ?? '' },
    welcome: {
      name: first(actor.name, actor.email), headline: 'Ready for today’s challenge?', streakDays, aq, points: m.points(graded),
      blurb: rows.length === 0 ? 'Your teacher’s tasks will show up here as soon as they are assigned.' : `You’ve handed in ${doneThisWeek} task${doneThisWeek === 1 ? '' : 's'} this week. Keep the momentum going!`,
    },
    nextSession: next ? { liveIn: m.startsIn(new Date(next.start), now), classroomId: `#${next.id.slice(0, 8).toUpperCase()}`, title: next.title, mentor: `With ${next.ownerName ?? 'your teacher'}`, meetingUrl: next.meetingUrl } : null,
    progress: {
      streak: { label: 'Learning Streak', value: streakDays ? `${streakDays} Day${streakDays === 1 ? '' : 's'} Running!` : 'Start your streak today', pct: Math.min(100, Math.round((streakDays / 7) * 100)) },
      weekly: { label: 'Weekly Task Goal', value: `${doneThisWeek} / ${target} Tasks Completed`, pct: Math.min(100, Math.round((doneThisWeek / target) * 100)) },
      tenacity: { label: 'Adaptive Tenacity (AQ)', value: aq === null ? 'Just getting started' : `Tier ${aq >= 80 ? 1 : aq >= 60 ? 2 : 3}: ${tr.label}`, note: aq === null ? 'Hand in your first task to see this.' : `AQ score ${aq}/100` },
    },
    sessions, mentorFilters: MENTOR_FILTERS, mentors,
    assignments: rows.filter((r) => r.sub_status !== 'graded').map((r) => toAssignment(r, now)),
    feedback,
  };
}

export async function listMentors(ctx: Ctx, auth: string, actorId: string, q: string, filter: string): Promise<Mentor[]> {
  const d = await buildStudent(ctx, { id: actorId, email: undefined, name: undefined, role: 'student' }, auth);
  const needle = q.trim().toLowerCase();
  return d.mentors.filter((x) => (filter === 'all' || x.levels.includes(filter as Level)) && (!needle || [x.name, x.headline, x.quote, ...x.specialties].some((t) => t.toLowerCase().includes(needle))));
}

// ---------------------------------------------------------------- teacher

interface Stats { aq: number | null }

export async function buildTeacher(ctx: Ctx, actor: Actor, auth: string): Promise<TeacherDashboard> {
  const now = ctx.now();
  const [events, contacts, assigned, pendingRows, profile] = await Promise.all([
    settle(ctx.sources.events(auth, new Date(now.getTime() - 60 * DAYS), new Date(now.getTime() + 14 * DAYS)), [] as CalEvent[]),
    settle(ctx.sources.contacts(auth), [] as string[]),
    st.assignedStudentIds(ctx.db, actor.id), st.pendingForTeacher(ctx.db, actor.id), st.getProfile(ctx.db, actor.id),
  ]);
  const studentIds = [...new Set([...contacts, ...assigned])];
  const mine = events.filter((e) => e.ownerId === actor.id && e.status === 'confirmed');
  const participantIds = mine.flatMap((e) => e.participants.map((p) => p.userId).filter((x): x is string => !!x));
  const [rows, settings, people] = await Promise.all([
    st.assignmentsOfTeacher(ctx.db, actor.id, studentIds), st.getSettings(ctx.db, studentIds),
    ctx.sources.people(auth, [...studentIds, ...participantIds]).catch(() => new Map()),
  ]);
  const nameOf = (id: string) => people.get(id)?.name ?? 'Student';

  // Per-student numbers.
  const stat = (id: string, from?: Date, to?: Date): { gradedRows: AssignmentRow[]; assignedRows: AssignmentRow[] } => {
    const own = rows.filter((r) => r.student_id === id);
    return {
      gradedRows: own.filter((r) => r.sub_status === 'graded' && (!from || (r.graded_at! >= from && r.graded_at! < to!))).sort((a, b) => Number(b.graded_at) - Number(a.graded_at)),
      assignedRows: own.filter((r) => !from || (r.created_at >= from && r.created_at < to!)),
    };
  };
  const aqOf = (id: string, from?: Date, to?: Date) => { const s = stat(id, from, to); return m.aq(s.gradedRows.map((g) => g.tags ?? []), s.assignedRows.map((r) => !!r.sub_id)); };

  const lastSessionOf = (id: string) => {
    const past = events.filter((e) => e.status === 'confirmed' && Date.parse(e.end) <= now.getTime() && e.participants.some((p) => p.userId === id)).sort((a, b) => Date.parse(b.start) - Date.parse(a.start))[0];
    if (!past) return '—';
    const days = Math.floor((now.getTime() - Date.parse(past.end)) / DAYS);
    return days < 1 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
  };

  const directory: DirectoryStudent[] = studentIds.map((id) => {
    const s = stat(id);
    const aq = aqOf(id);
    const tr = m.tier(aq);
    const recent = rows.filter((r) => r.student_id === id && r.created_at.getTime() > now.getTime() - 30 * DAYS);
    const grade = settings.get(id)?.grade ?? '';
    return {
      id, name: nameOf(id), initials: initials(nameOf(id)), grade, gradeNumber: parseInt(grade.replace(/\D+/g, ''), 10) || null,
      mastery: m.mastery(s.gradedRows.map((g) => g.score!)), topic: rows.find((r) => r.student_id === id)?.title ?? 'No tasks yet', aq: tr.label, aqTone: tr.tone,
      lastSession: lastSessionOf(id), unit: 'Progress (last 30 days)', unitPct: recent.length ? Math.round((recent.filter((r) => r.sub_status === 'graded').length / recent.length) * 100) : 0,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const today = mine.filter((e) => m.dayOf(new Date(e.start), e.timezone) === m.dayOf(now, e.timezone)).sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const nextToday = today.find((e) => Date.parse(e.end) > now.getTime());
  const sessions: TeacherSession[] = today.map((e) => {
    const names = e.participants.map((p) => (p.userId ? nameOf(p.userId) : p.name ?? p.email));
    const one = e.participants.length === 1 ? e.participants[0] : null;
    const gradeText = one?.userId ? settings.get(one.userId)?.grade ?? '' : '';
    const who = names.length === 0 ? 'No students yet' : names.length === 1 ? names[0] : `${names.length} students`;
    return {
      id: e.id, student: who, initials: names.length === 1 ? initials(names[0]) : '👥', grade: gradeText || (names.length > 1 ? 'Group' : ''), detail: e.title,
      time: `${range(e)}${minutes(e) ? ` (${minutes(e)}m)` : ''}`, startsIn: Date.parse(e.end) <= now.getTime() ? 'Finished' : m.startsIn(new Date(e.start), now),
      kind: e.participants.length > 1 ? 'Group class' : '1-on-1 Studio', topic: e.title, notes: e.description ?? undefined, meetingUrl: e.meetingUrl, hero: e === nextToday || undefined,
    };
  });
  // The next class leads; the rest follow in time order.
  sessions.sort((a, b) => Number(!!b.hero) - Number(!!a.hero));

  const week = (from: number, to: number) => [...new Set(rows.map((r) => r.student_id))].map((id) => aqOf(id, new Date(now.getTime() - from * DAYS), new Date(now.getTime() - to * DAYS))).filter((x): x is number => x !== null);
  const change = m.growth(week(30, 0), week(60, 30));

  const queue: Submission[] = pendingRows.map((r) => ({
    id: r.sub_id!, assignmentId: r.id, studentId: r.student_id, student: nameOf(r.student_id), initials: initials(nameOf(r.student_id)), task: r.title,
    submitted: `Submitted ${r.submitted_at!.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })} UTC`,
    status: 'pending', answer: r.answer ?? '', attachmentId: r.attachment_id, attachmentType: r.attachment_type, score: r.draft_score, tags: r.draft_tags ?? [], note: r.draft_note ?? '', draft: r.draft_score !== null,
  }));
  const drafts = queue.filter((s) => s.draft).length;
  const tools = TOOLS;
  const students = directory.map((s) => ({ id: s.id, name: s.name, grade: s.grade || 'Grade not set', track: s.topic }));

  return {
    profile: { name: actor.name ?? first(undefined, actor.email), title: profile.headline || 'Teacher', status: nextToday ? 'Live Session Standby' : 'Planning' },
    welcome: { name: `Coach ${first(actor.name, actor.email)}`, blurb: today.length ? `Your digital math laboratory is primed. ${today.length} live ${today.length === 1 ? 'class' : 'classes'} scheduled today.` : 'No classes scheduled today. A good moment to assign tasks and review work.' },
    metrics: [
      { label: 'Today’s Classes', value: `${today.length} Session${today.length === 1 ? '' : 's'}`, note: nextToday ? `Next at ${clock(nextToday.start, nextToday.timezone)}` : 'Nothing more today', tone: 'sky' },
      { label: 'Active Learners', value: `${studentIds.length} Student${studentIds.length === 1 ? '' : 's'}`, note: 'From your classes', tone: 'sky' },
      { label: 'Pending Grading', value: `${queue.length} Submission${queue.length === 1 ? '' : 's'}`, note: queue.length ? 'Waiting for your review' : 'All caught up', tone: 'rose' },
      { label: 'Student AQ Growth', value: change === null ? '—' : `${change > 0 ? '+' : ''}${change}%`, note: change === null ? 'Needs two months of tasks' : 'Avg Resilience Metric', tone: 'mint' },
    ],
    schedule: { dateLabel: now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }), sessions, officeHours: null },
    builder: { presets: Object.keys(st.PRESETS), tools, students, defaults: { studentId: students[0]?.id ?? '', concept: tools[0], dueDate: new Date(now.getTime() + 2 * DAYS).toISOString().slice(0, 10), xp: 120, prompt: '' } },
    grading: { pending: queue.length, readyForSync: queue.length ? `${drafts} of ${queue.length} drafts ready` : 'Queue is clear', availableTags: st.TAGS, queue },
    directory: { students: directory, grades: [{ value: 'all', label: 'All Grades' }, ...GRADES.map((g, i) => ({ value: String(i + 1), label: g }))] },
    mentorProfile: profile,
  };
}

export async function listStudents(ctx: Ctx, actor: Actor, auth: string, q: string, grade: string): Promise<DirectoryStudent[]> {
  const d = await buildTeacher(ctx, actor, auth);
  const needle = q.trim().toLowerCase();
  return d.directory.students.filter((s) => (grade === 'all' || s.gradeNumber === Number(grade)) && (!needle || s.name.toLowerCase().includes(needle)));
}
export { LEVELS };

/** One task with everything the student's Assignments page shows. */
export interface AssignmentDetail extends Assignment {
  prompt: string;
  dueDate: string;
  answer: string | null;
  attachmentId: string | null;
  attachmentType: string | null;
  score: number | null;
  grade: string | null;
  tags: string[];
  note: string;
  gradedLabel: string | null;
  coach: string;
}
export function toDetail(r: AssignmentRow, now: Date, coach: string): AssignmentDetail {
  return {
    ...toAssignment(r, now), prompt: r.prompt, dueDate: r.due_date, answer: r.answer, attachmentId: r.attachment_id, attachmentType: r.attachment_type, score: r.score, grade: r.score === null ? null : m.letter(r.score),
    tags: r.tags ?? [], note: r.note ?? '', gradedLabel: r.graded_at ? m.gradedLabel(r.graded_at, now) : null, coach,
  };
}
