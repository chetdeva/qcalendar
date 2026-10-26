import { Hono } from 'hono';
import { z } from 'zod';
import type { Actor, Authenticator } from './auth.ts';
import { buildStudent, buildTeacher, listMentors, listStudents, toDetail, GRADES, type Ctx } from './dashboards.ts';
import { HttpError } from './errors.ts';
import { dayOf, letter } from './metrics.ts';
import { enqueueParentSync } from './outbox.ts';
import * as st from './store.ts';
import { LEVELS } from './types.ts';

type Env = { Variables: { actor: Actor; auth: string } };

function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'invalid_request', 'Invalid request', r.error.issues);
  return r.data;
}

const uuid = z.uuid();
const text = (max: number) => z.string().trim().max(max);
const DashboardQuery = z.object({ view: z.enum(['student', 'teacher']).optional() });
const MentorQuery = z.object({ q: text(100).default(''), filter: z.enum(['all', ...LEVELS]).default('all') });
const StudentQuery = z.object({ q: text(100).default(''), grade: z.enum(['all', ...GRADES.map((_, i) => String(i + 1))]).default('all') });
const AssignBody = z.object({
  studentId: uuid, preset: text(100).optional(), concept: text(200).min(1), dueDate: z.iso.date(), xp: z.number().int().min(0).max(1000), prompt: text(1000).min(1),
}).strict();
const GradeBody = z.object({ score: z.number().int().min(0).max(100), tags: z.array(z.enum(st.TAGS as [string, ...string[]])).max(5), note: text(1000) }).strict();
const ProgressBody = z.object({ stepsDone: z.number().int().min(0).max(20) }).strict();
const SubmitBody = z.object({ answer: text(5000).min(1), attachmentId: uuid.nullish() }).strict();
const AttachmentBody = z.object({ contentType: z.enum(['image/png', 'image/jpeg', 'image/webp']), data: z.string().min(1) }).strict();
const ProfileBody = z.object({
  headline: text(120), specialties: z.array(text(40).min(1)).max(8), levels: z.array(z.enum(LEVELS)).max(4), quote: text(400), published: z.boolean(),
}).strict();
const SettingsBody = z.object({ grade: z.enum(GRADES as [string, ...string[]]).nullable() }).strict();

const MAX_IMAGE = 1_572_864;
/** The first bytes of a real image of that type: the declared type alone is not trusted. */
const MAGIC: Record<string, (b: Buffer) => boolean> = {
  'image/png': (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

export interface AppDeps { ctx: Ctx; authenticator: Authenticator }

export function createApp({ ctx, authenticator }: AppDeps) {
  const app = new Hono<Env>();
  const { db, sources } = ctx;

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status as 400);
    console.error(err);
    return c.json({ error: { code: 'internal', message: 'Internal error' } }, 500);
  });

  app.get('/health', (c) => c.json({ ok: true }));

  app.use('/v1/*', async (c, next) => {
    const header = c.req.header('authorization');
    c.set('actor', await authenticator.authenticate(header));
    c.set('auth', header ?? '');
    await next();
  });

  const body = async (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => null);
  /** Exactly this role. Admins may look at dashboards but never act as a student or a teacher. */
  const must = (a: Actor, role: 'student' | 'teacher') => {
    if (a.role !== role) throw new HttpError(403, 'forbidden', role === 'teacher' ? 'Only teachers can do that' : 'Only students can do that');
  };
  const idParam = (raw: string) => {
    const r = uuid.safeParse(raw);
    if (!r.success) throw new HttpError(404, 'not_found', 'Not found');
    return r.data;
  };
  const coachName = async (auth: string, id: string) => (await sources.people(auth, [id]).catch(() => new Map())).get(id)?.name ?? 'Your coach';

  // A student gets the student dashboard, a teacher the teacher one; an admin can look at either.
  app.get('/v1/dashboard', async (c) => {
    const a = c.get('actor');
    const { view } = parse(DashboardQuery, c.req.query());
    const want = view ?? (a.role === 'teacher' ? 'teacher' : 'student');
    if (want === 'teacher') {
      if (a.role === 'student') throw new HttpError(403, 'forbidden', 'Only teachers can see that');
      return c.json({ view: 'teacher', teacher: await buildTeacher(ctx, a, c.get('auth')) });
    }
    if (a.role === 'teacher') throw new HttpError(403, 'forbidden', 'Only students can see that');
    return c.json({ view: 'student', student: await buildStudent(ctx, a, c.get('auth')) });
  });

  app.get('/v1/mentors', async (c) => {
    const a = c.get('actor');
    if (a.role === 'teacher') throw new HttpError(403, 'forbidden', 'Only students can see that');
    const q = parse(MentorQuery, c.req.query());
    return c.json({ mentors: await listMentors(ctx, c.get('auth'), a.id, q.q, q.filter) });
  });

  app.get('/v1/students', async (c) => {
    const a = c.get('actor');
    if (a.role === 'student') throw new HttpError(403, 'forbidden', 'Only teachers can see that');
    const q = parse(StudentQuery, c.req.query());
    return c.json({ students: await listStudents(ctx, a, c.get('auth'), q.q, q.grade) });
  });

  // ---- teachers: assign, grade, profile
  async function mustTeach(a: Actor, auth: string, studentId: string) {
    const contacts = await sources.contacts(auth);
    if (!contacts.includes(studentId) && !(await st.assignedStudentIds(db, a.id)).includes(studentId)) throw new HttpError(403, 'not_your_student', 'You can only do that for students you share a class with');
  }

  app.post('/v1/assignments', async (c) => {
    const a = c.get('actor');
    must(a, 'teacher');
    const b = parse(AssignBody, await body(c));
    if (b.dueDate < dayOf(ctx.now())) throw new HttpError(400, 'invalid_request', 'The due date cannot be in the past');
    if (!(await sources.contacts(c.get('auth'))).includes(b.studentId)) throw new HttpError(403, 'not_your_student', 'You can only assign tasks to students you share a class with');
    return c.json({ id: await st.createAssignment(db, a.id, b, ctx.now()) }, 201);
  });

  app.post('/v1/submissions/:id/draft', async (c) => {
    must(c.get('actor'), 'teacher');
    await st.saveDraft(db, c.get('actor').id, idParam(c.req.param('id')), parse(GradeBody, await body(c)));
    return c.body(null, 204);
  });

  app.post('/v1/submissions/:id/publish', async (c) => {
    const a = c.get('actor');
    const auth = c.get('auth');
    must(a, 'teacher');
    const g = parse(GradeBody, await body(c));
    const row = await st.publish(db, a.id, idParam(c.req.param('id')), g, ctx.now());

    // Tell the guardian. The grade is already published whatever happens here.
    let parentSync: 'sent' | 'no_guardian' | 'failed' = 'no_guardian';
    try {
      const guardian = await sources.guardian(row.student_id);
      if (guardian?.guardianEmail) {
        const student = (await sources.people(auth, [row.student_id]).catch(() => new Map())).get(row.student_id);
        await enqueueParentSync(db, {
          studentName: student?.name ?? guardian.name ?? 'your child', guardianEmail: guardian.guardianEmail, teacherName: a.name ?? 'Your teacher', task: row.title,
          score: g.score, grade: letter(g.score), tags: g.tags, note: g.note, dashboardUrl: ctx.dashboardUrl,
        });
        parentSync = 'sent';
      }
    } catch (e) {
      console.error('parent sync failed:', (e as Error).message);
      parentSync = 'failed';
    }
    await st.setParentSync(db, row.sub_id!, parentSync);
    return c.json({ id: row.sub_id, score: g.score, grade: letter(g.score), parentSync }, 201);
  });

  app.get('/v1/me/mentor-profile', async (c) => {
    must(c.get('actor'), 'teacher');
    return c.json(await st.getProfile(db, c.get('actor').id));
  });
  app.put('/v1/me/mentor-profile', async (c) => {
    must(c.get('actor'), 'teacher');
    const p = parse(ProfileBody, await body(c));
    if (p.published && (!p.headline || !p.quote)) throw new HttpError(400, 'invalid_request', 'Add a headline and a quote before publishing your profile');
    await st.saveProfile(db, c.get('actor').id, p);
    return c.json(p);
  });

  app.put('/v1/students/:id/settings', async (c) => {
    const a = c.get('actor');
    must(a, 'teacher');
    const id = idParam(c.req.param('id'));
    const b = parse(SettingsBody, await body(c));
    await mustTeach(a, c.get('auth'), id);
    await st.setGrade(db, id, b.grade);
    return c.body(null, 204);
  });

  // ---- students: tasks, progress, hand-in
  app.get('/v1/assignments', async (c) => {
    const a = c.get('actor');
    must(a, 'student');
    const rows = await st.assignmentsOfStudent(db, a.id);
    const now = ctx.now();
    const coaches = await sources.people(c.get('auth'), rows.map((r) => r.teacher_id)).catch(() => new Map());
    return c.json({ assignments: rows.map((r) => toDetail(r, now, coaches.get(r.teacher_id)?.name ?? 'Your coach')) });
  });

  app.get('/v1/assignments/:id', async (c) => {
    const a = c.get('actor');
    must(a, 'student');
    const r = await st.assignmentOf(db, idParam(c.req.param('id')));
    if (!r || r.student_id !== a.id) throw new HttpError(404, 'not_found', 'Task not found'); // someone else's task looks like no task
    return c.json(toDetail(r, ctx.now(), await coachName(c.get('auth'), r.teacher_id)));
  });

  app.post('/v1/assignments/:id/progress', async (c) => {
    const a = c.get('actor');
    must(a, 'student');
    await st.setProgress(db, a.id, idParam(c.req.param('id')), parse(ProgressBody, await body(c)).stepsDone, ctx.now());
    return c.body(null, 204);
  });

  app.post('/v1/assignments/:id/submit', async (c) => {
    const a = c.get('actor');
    must(a, 'student');
    const b = parse(SubmitBody, await body(c));
    await st.submit(db, a.id, idParam(c.req.param('id')), b.answer, b.attachmentId ?? null, ctx.now());
    return c.body(null, 204);
  });

  app.post('/v1/attachments', async (c) => {
    const a = c.get('actor');
    must(a, 'student');
    if (Number(c.req.header('content-length') ?? 0) > MAX_IMAGE * 1.4 + 1024) throw new HttpError(413, 'too_large', 'Images can be up to 1.5 MB');
    const b = parse(AttachmentBody, await body(c));
    const bytes = Buffer.from(b.data, 'base64');
    if (bytes.length === 0 || bytes.length > MAX_IMAGE) throw new HttpError(413, 'too_large', 'Images can be up to 1.5 MB');
    if (!MAGIC[b.contentType](bytes)) throw new HttpError(400, 'invalid_request', 'That file is not a valid image of that type');
    return c.json({ id: await st.saveAttachment(db, a.id, b.contentType, bytes) }, 201);
  });

  app.get('/v1/attachments/:id', async (c) => {
    const row = await st.attachmentFor(db, idParam(c.req.param('id')), c.get('actor').id);
    if (!row) throw new HttpError(404, 'not_found', 'Not found');
    return new Response(row.bytes as Uint8Array<ArrayBuffer>, { headers: { 'content-type': row.content_type, 'x-content-type-options': 'nosniff', 'cache-control': 'private, max-age=300', 'content-security-policy': "default-src 'none'" } });
  });

  return app;
}
