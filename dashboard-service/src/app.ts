import { Hono } from 'hono';
import { z } from 'zod';
import type { Actor, Authenticator } from './auth.ts';
import { HttpError } from './errors.ts';
import type { MockStore } from './mock.ts';

type Env = { Variables: { actor: Actor } };

function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'invalid_request', 'Invalid request', r.error.issues);
  return r.data;
}

const DashboardQuery = z.object({ view: z.enum(['student', 'teacher']).optional() });
const MentorQuery = z.object({ q: z.string().max(100).default(''), filter: z.enum(['all', 'middle', 'olympiad', 'whiteboard', 'available']).default('all') });
const StudentQuery = z.object({ q: z.string().max(100).default(''), grade: z.enum(['all', '5', '6', '7', '8', '9']).default('all') });
const AssignBody = z.object({
  studentId: z.string().min(1).max(50),
  preset: z.string().trim().max(100).optional(),
  concept: z.string().trim().min(1).max(200),
  dueDate: z.iso.date(),
  xp: z.number().int().min(0).max(1000),
  prompt: z.string().trim().min(1).max(1000),
}).strict();

export interface AppDeps { store: MockStore; authenticator: Authenticator; production: boolean }

export function createApp({ store, authenticator, production }: AppDeps) {
  const app = new Hono<Env>();
  const PublishBody = z.object({
    score: z.number().int().min(0).max(100),
    tags: z.array(z.enum(store.tags as [string, ...string[]])).max(5),
    note: z.string().trim().max(1000),
  }).strict();

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status as 400);
    console.error(err);
    return c.json({ error: { code: 'internal', message: 'Internal error' } }, 500);
  });

  app.get('/health', (c) => c.json({ ok: true }));

  app.use('/v1/*', async (c, next) => {
    c.set('actor', await authenticator.authenticate(c.req.header('authorization')));
    await next();
  });

  const body = async (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => null);
  const teacherOnly = (a: Actor) => {
    if (a.role !== 'teacher' && a.role !== 'admin') throw new HttpError(403, 'forbidden', 'Only teachers can do that');
  };
  const studentOnly = (a: Actor) => {
    if (a.role !== 'student' && a.role !== 'admin') throw new HttpError(403, 'forbidden', 'Only students can see that');
  };

  // A student gets the student dashboard, a teacher the teacher one; an admin can look at either.
  app.get('/v1/dashboard', (c) => {
    const a = c.get('actor');
    const { view } = parse(DashboardQuery, c.req.query());
    const want = view ?? (a.role === 'teacher' ? 'teacher' : 'student');
    if (want === 'teacher') { teacherOnly(a); return c.json({ view: 'teacher', teacher: store.teacher(a.name, a.email) }); }
    studentOnly(a);
    return c.json({ view: 'student', student: store.student(a.name, a.email) });
  });

  app.get('/v1/mentors', (c) => {
    studentOnly(c.get('actor'));
    const q = parse(MentorQuery, c.req.query());
    return c.json({ mentors: store.mentors(q.q, q.filter) });
  });

  app.get('/v1/students', (c) => {
    teacherOnly(c.get('actor'));
    const q = parse(StudentQuery, c.req.query());
    return c.json({ students: store.students(q.q, q.grade) });
  });

  app.post('/v1/assignments', async (c) => {
    teacherOnly(c.get('actor'));
    return c.json(store.assign(parse(AssignBody, await body(c))), 201);
  });

  app.post('/v1/submissions/:id/draft', async (c) => {
    teacherOnly(c.get('actor'));
    return c.json(store.saveDraft(c.req.param('id'), parse(PublishBody, await body(c))));
  });

  app.post('/v1/submissions/:id/publish', async (c) => {
    const a = c.get('actor');
    teacherOnly(a);
    return c.json(store.publish(c.req.param('id'), parse(PublishBody, await body(c)), a.name ? `Coach ${a.name}` : 'Your coach'), 201);
  });

  // Test helper: put the sample data back as it was. Never available in production.
  if (!production) app.post('/v1/__reset', (c) => (store.reset(), c.body(null, 204)));

  return app;
}
