import { HttpError } from './errors.ts';
import type { Db, Queryable } from './db.ts';
import type { Level, MentorProfile } from './types.ts';
import { dayOf } from './metrics.ts';

// All SQL lives here. Every function takes the person's id explicitly and filters by it, never by anything from the request.

export const TAGS = ['Visual Clarity', 'Spatial Insight', 'High Adversity Quotient (AQ)', 'Clear Reasoning', 'Great Persistence'];
export const PRESETS: Record<string, number> = { '5-Question Micro-Quest': 5, 'Spatial Proof Scratchpad': 3, 'Olympiad Drill': 8 };

export interface AssignmentRow {
  id: string; teacher_id: string; student_id: string; title: string; preset: string | null; prompt: string; due_date: string; xp: number;
  steps_total: number; steps_done: number; created_at: Date;
  sub_id: string | null; sub_status: 'pending' | 'graded' | null; score: number | null; tags: string[] | null; note: string | null; graded_at: Date | null; submitted_at: Date | null;
  answer: string | null; attachment_id: string | null; draft_score: number | null; draft_tags: string[] | null; draft_note: string | null;
}

const JOINED = `select a.id, a.teacher_id, a.student_id, a.title, a.preset, a.prompt, a.due_date::text as due_date, a.xp, a.steps_total, a.steps_done, a.created_at,
  s.id as sub_id, s.status as sub_status, s.score, s.tags, s.note, s.graded_at, s.submitted_at, s.answer, s.attachment_id, s.draft_score, s.draft_tags, s.draft_note
  from dashboard.assignments a left join dashboard.submissions s on s.assignment_id = a.id`;

export const assignmentsOfStudent = (q: Queryable, studentId: string) => q.query<AssignmentRow>(`${JOINED} where a.student_id = $1 order by a.created_at desc, a.id`, [studentId]);
export async function assignmentOf(q: Queryable, id: string): Promise<AssignmentRow | null> {
  return (await q.query<AssignmentRow>(`${JOINED} where a.id = $1`, [id]))[0] ?? null;
}
export const assignmentsOfTeacher = (q: Queryable, teacherId: string, studentIds: string[]) =>
  q.query<AssignmentRow>(`${JOINED} where a.teacher_id = $1 and a.student_id = any($2::uuid[]) order by a.created_at desc, a.id`, [teacherId, studentIds]);
export const pendingForTeacher = (q: Queryable, teacherId: string) =>
  q.query<AssignmentRow>(`${JOINED} where a.teacher_id = $1 and s.status = 'pending' order by s.submitted_at, a.id`, [teacherId]);
export const gradedSince = (q: Queryable, teacherId: string, since: Date) =>
  q.query<AssignmentRow>(`${JOINED} where a.teacher_id = $1 and s.status = 'graded' and s.graded_at >= $2 order by s.graded_at desc`, [teacherId, since.toISOString()]);
export const assignedSince = (q: Queryable, teacherId: string, since: Date) =>
  q.query<AssignmentRow>(`${JOINED} where a.teacher_id = $1 and a.created_at >= $2`, [teacherId, since.toISOString()]);

export interface CreateAssignment { studentId: string; preset?: string; concept: string; dueDate: string; xp: number; prompt: string }
export async function createAssignment(q: Queryable, teacherId: string, i: CreateAssignment, now: Date) {
  const steps = (i.preset && PRESETS[i.preset]) || 5;
  return (await q.query<{ id: string }>(
    `insert into dashboard.assignments (teacher_id, student_id, title, preset, prompt, due_date, xp, steps_total, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
    [teacherId, i.studentId, i.concept, i.preset ?? null, i.prompt, i.dueDate, i.xp, steps, now.toISOString()]))[0].id;
}

export const recordActivity = (q: Queryable, studentId: string, now: Date) =>
  q.query('insert into dashboard.activity_days (student_id, day) values ($1, $2) on conflict do nothing', [studentId, dayOf(now)]);
export const activityDays = async (q: Queryable, studentId: string) => (await q.query<{ day: string }>('select day::text as day from dashboard.activity_days where student_id = $1', [studentId])).map((r) => r.day);

/** Only the student's own, not-yet-handed-in task can change; everything else is a plain 404/409. */
export async function setProgress(db: Db, studentId: string, assignmentId: string, stepsDone: number, now: Date) {
  return db.tx(async (q) => {
    const a = (await q.query<{ steps_total: number; submitted: boolean }>(
      `select a.steps_total, exists (select 1 from dashboard.submissions s where s.assignment_id = a.id) as submitted from dashboard.assignments a where a.id = $1 and a.student_id = $2 for update`, [assignmentId, studentId]))[0];
    if (!a) throw new HttpError(404, 'not_found', 'Task not found');
    if (a.submitted) throw new HttpError(409, 'already_submitted', 'This task has already been handed in');
    if (stepsDone > a.steps_total) throw new HttpError(400, 'invalid_request', `This task has ${a.steps_total} steps`);
    await q.query('update dashboard.assignments set steps_done = $2 where id = $1', [assignmentId, stepsDone]);
    await recordActivity(q, studentId, now);
  });
}

export async function submit(db: Db, studentId: string, assignmentId: string, answer: string, attachmentId: string | null, now: Date) {
  return db.tx(async (q) => {
    const a = (await q.query<{ id: string }>('select id from dashboard.assignments where id = $1 and student_id = $2 for update', [assignmentId, studentId]))[0];
    if (!a) throw new HttpError(404, 'not_found', 'Task not found');
    if (attachmentId) {
      const att = (await q.query('select 1 from dashboard.attachments where id = $1 and owner_id = $2', [attachmentId, studentId]))[0];
      if (!att) throw new HttpError(400, 'invalid_request', 'That attachment is not yours');
    }
    if ((await q.query('select 1 from dashboard.submissions where assignment_id = $1', [assignmentId]))[0]) throw new HttpError(409, 'already_submitted', 'This task has already been handed in');
    await q.query('insert into dashboard.submissions (assignment_id, student_id, answer, attachment_id, submitted_at) values ($1,$2,$3,$4,$5)', [assignmentId, studentId, answer, attachmentId, now.toISOString()]);
    await q.query('update dashboard.assignments set steps_done = steps_total where id = $1', [assignmentId]);
    await recordActivity(q, studentId, now);
  });
}

export async function saveAttachment(q: Queryable, ownerId: string, contentType: string, bytes: Buffer) {
  return (await q.query<{ id: string }>('insert into dashboard.attachments (owner_id, content_type, bytes) values ($1,$2,$3) returning id', [ownerId, contentType, bytes]))[0].id;
}
/** An attachment, only for its owner or the teacher who assigned the task it was handed in for. */
export async function attachmentFor(q: Queryable, id: string, personId: string) {
  return (await q.query<{ content_type: string; bytes: Uint8Array }>(
    `select at.content_type, at.bytes from dashboard.attachments at
      where at.id = $1 and (at.owner_id = $2 or exists (select 1 from dashboard.submissions s join dashboard.assignments a on a.id = s.assignment_id where s.attachment_id = at.id and a.teacher_id = $2))`, [id, personId]))[0] ?? null;
}

export async function submissionOfTeacher(q: Queryable, teacherId: string, submissionId: string): Promise<AssignmentRow> {
  const r = (await q.query<AssignmentRow>(`${JOINED} where s.id = $1 and a.teacher_id = $2`, [submissionId, teacherId]))[0];
  if (!r) throw new HttpError(404, 'not_found', 'Submission not found');
  return r;
}

export interface GradeInput { score: number; tags: string[]; note: string }
export async function saveDraft(db: Db, teacherId: string, submissionId: string, g: GradeInput) {
  return db.tx(async (q) => {
    const r = await submissionOfTeacher(q, teacherId, submissionId);
    if (r.sub_status !== 'pending') throw new HttpError(409, 'already_published', 'This grade is already published');
    await q.query('update dashboard.submissions set draft_score = $2, draft_tags = $3::text[], draft_note = $4 where id = $1', [submissionId, g.score, g.tags, g.note]);
  });
}
/** Publishing happens once. Returns the task so the caller can tell the student's guardian. */
export async function publish(db: Db, teacherId: string, submissionId: string, g: GradeInput, now: Date): Promise<AssignmentRow> {
  return db.tx(async (q) => {
    const r = await submissionOfTeacher(q, teacherId, submissionId);
    if (r.sub_status !== 'pending') throw new HttpError(409, 'already_published', 'This grade is already published');
    await q.query(`update dashboard.submissions set status = 'graded', score = $2, tags = $3::text[], note = $4, graded_at = $5, draft_score = null, draft_tags = null, draft_note = null where id = $1`,
      [submissionId, g.score, g.tags, g.note, now.toISOString()]);
    return submissionOfTeacher(q, teacherId, submissionId);
  });
}
export const setParentSync = (q: Queryable, submissionId: string, result: 'sent' | 'no_guardian' | 'failed') =>
  q.query('update dashboard.submissions set parent_sync = $2 where id = $1', [submissionId, result]);

export async function getSettings(q: Queryable, studentIds: string[]) {
  const rows = await q.query<{ student_id: string; grade: string | null; weekly_target: number }>('select student_id, grade, weekly_target from dashboard.student_settings where student_id = any($1::uuid[])', [studentIds]);
  return new Map(rows.map((r) => [r.student_id, r]));
}
export const setGrade = (q: Queryable, studentId: string, grade: string | null) =>
  q.query('insert into dashboard.student_settings (student_id, grade) values ($1, $2) on conflict (student_id) do update set grade = excluded.grade', [studentId, grade]);

export async function getProfile(q: Queryable, userId: string): Promise<MentorProfile> {
  const r = (await q.query<{ headline: string; specialties: string[]; levels: Level[]; quote: string; published: boolean }>('select headline, specialties, levels, quote, published from dashboard.mentor_profiles where user_id = $1', [userId]))[0];
  return r ?? { headline: '', specialties: [], levels: [], quote: '', published: false };
}
export const saveProfile = (q: Queryable, userId: string, p: MentorProfile) =>
  q.query(`insert into dashboard.mentor_profiles (user_id, headline, specialties, levels, quote, published, updated_at) values ($1,$2,$3::text[],$4::text[],$5,$6, now())
    on conflict (user_id) do update set headline = excluded.headline, specialties = excluded.specialties, levels = excluded.levels, quote = excluded.quote, published = excluded.published, updated_at = now()`,
  [userId, p.headline, p.specialties, p.levels, p.quote, p.published]);
export const publishedProfiles = (q: Queryable) =>
  q.query<{ user_id: string; headline: string; specialties: string[]; levels: Level[]; quote: string }>('select user_id, headline, specialties, levels, quote from dashboard.mentor_profiles where published order by updated_at desc, user_id');

export async function assignedStudentIds(q: Queryable, teacherId: string) {
  return (await q.query<{ student_id: string }>('select distinct student_id from dashboard.assignments where teacher_id = $1', [teacherId])).map((r) => r.student_id);
}
