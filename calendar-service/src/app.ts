import { Hono } from 'hono';
import { z } from 'zod';
import type { Actor, Authenticator } from './auth.ts';
import { isValidTz } from './availability.ts';
import { HttpError } from './errors.ts';
import * as svc from './events.ts';

type Env = { Variables: { actor: Actor } };

function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'invalid_request', 'Invalid request', r.error.issues);
  return r.data;
}

const iso = z.iso.datetime({ offset: true });
const tz = z.string().refine(isValidTz, 'Unknown timezone');
const email = z.email().max(254);
const name = z.string().trim().min(1).max(100);
const uuid = z.uuid();
const httpsUrl = z.url().max(500).refine((u) => u.startsWith('https://'), 'Meeting links must use https');
const CATEGORIES = ['tutoring', 'office_hours', 'personal'] as const;

const ParticipantSchema = z.object({ userId: uuid.optional(), email, name: name.optional() }).strict();

const CreateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(5000).optional(),
    location: z.string().max(500).optional(),
    meetingUrl: httpsUrl.optional(),
    meet: z.boolean().optional(),
    start: iso,
    end: iso.optional(),
    durationMinutes: z.number().int().min(5).max(1440).optional(),
    timezone: tz.optional(),
    category: z.enum(CATEGORIES).optional(),
    externalRef: z.string().max(200).optional(),
    ownerId: uuid.optional(),
    ownerEmail: email.optional(),
    ownerName: name.optional(),
    participants: z.array(ParticipantSchema).max(50).optional(),
    attendees: z.array(email).max(50).optional(), // legacy: emails only
    force: z.boolean().optional(),
  })
  .refine((v) => v.end || v.durationMinutes, { message: 'end or durationMinutes is required' })
  .refine((v) => (v.participants?.length ?? 0) + (v.attendees?.length ?? 0) <= 50, { message: 'At most 50 participants' });

const PatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  meetingUrl: httpsUrl.nullable().optional(),
  meet: z.boolean().optional(),
  start: iso.optional(),
  end: iso.optional(),
  durationMinutes: z.number().int().min(5).max(1440).optional(),
  timezone: tz.optional(),
  category: z.enum(CATEGORIES).optional(),
  force: z.boolean().optional(),
});

const AddParticipants = z.object({ participants: z.array(ParticipantSchema).min(1).max(50), force: z.boolean().optional() });
const RespondBody = z.object({ response: z.enum(['accepted', 'declined']) }).strict();

const ListQuery = z.object({
  from: iso.optional(), to: iso.optional(), ownerId: uuid.optional(), participant: email.optional(),
  externalRef: z.string().max(200).optional(), includeCancelled: z.enum(['true', 'false']).optional(),
});
const AvailabilityQuery = z.object({ teacherId: uuid.optional(), from: iso, to: iso, duration: z.coerce.number().int().min(5).max(480).default(60) });
const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const day = z.array(z.tuple([HHMM, HHMM]).refine(([a, b]) => a < b, 'start must be before end'));
const SettingsPatch = z
  .object({
    timezone: tz,
    workingHours: z.object({ sun: day, mon: day, tue: day, wed: day, thu: day, fri: day, sat: day }),
    bufferMinutes: z.number().int().min(0).max(240),
    slotStepMinutes: z.number().int().min(5).max(240),
  })
  .partial();
const TeacherQuery = z.object({ teacherId: uuid.optional() });

const id = (raw: string) => {
  const r = uuid.safeParse(raw);
  if (!r.success) throw new HttpError(400, 'invalid_request', 'Invalid id');
  return r.data;
};

export function createApp(deps: { ctx: svc.Ctx; authenticator: Authenticator }) {
  const { ctx, authenticator } = deps;
  const app = new Hono<Env>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status as 400);
    }
    console.error(err);
    return c.json({ error: { code: 'internal', message: 'Internal error' } }, 500);
  });

  app.get('/health', (c) => c.json({ ok: true }));

  app.use('/v1/*', async (c, next) => {
    c.set('actor', await authenticator.authenticate(c.req.header('authorization')));
    await next();
  });

  const body = async (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => null);

  app.post('/v1/events', async (c) => {
    const b = parse(CreateSchema, await body(c));
    const { attendees, ...rest } = b;
    const participants = [...(rest.participants ?? []), ...(attendees ?? []).map((e) => ({ email: e }))];
    return c.json(await svc.createEvent(ctx, c.get('actor'), { ...rest, participants }), 201);
  });

  app.get('/v1/events', async (c) => {
    const q = parse(ListQuery, c.req.query());
    return c.json({ events: await svc.listEvents(ctx, c.get('actor'), { ...q, includeCancelled: q.includeCancelled === 'true' }) });
  });

  app.get('/v1/events/:id', async (c) => c.json(await svc.getEvent(ctx, c.get('actor'), id(c.req.param('id')))));

  app.patch('/v1/events/:id', async (c) => {
    const b = parse(PatchSchema, await body(c));
    return c.json(await svc.patchEvent(ctx, c.get('actor'), id(c.req.param('id')), b));
  });

  app.delete('/v1/events/:id', async (c) => c.json(await svc.cancelEvent(ctx, c.get('actor'), id(c.req.param('id')))));

  app.post('/v1/events/:id/participants', async (c) => {
    const b = parse(AddParticipants, await body(c));
    return c.json(await svc.addParticipants(ctx, c.get('actor'), id(c.req.param('id')), b.participants, b.force), 201);
  });

  app.delete('/v1/events/:id/participants/:pid', async (c) =>
    c.json(await svc.removeParticipant(ctx, c.get('actor'), id(c.req.param('id')), id(c.req.param('pid')))),
  );

  app.post('/v1/events/:id/respond', async (c) => {
    const b = parse(RespondBody, await body(c));
    return c.json(await svc.respond(ctx, c.get('actor'), id(c.req.param('id')), b.response));
  });

  app.get('/v1/availability', async (c) => {
    const q = parse(AvailabilityQuery, c.req.query());
    const from = Date.parse(q.from); const to = Date.parse(q.to);
    if (to <= from || to - from > 62 * 86_400_000) throw new HttpError(400, 'invalid_request', 'to must be after from, within 62 days');
    const teacherId = svc.resolveTeacher(ctx, c.get('actor'), q.teacherId, { allowStudents: true });
    return c.json(await svc.availability(ctx, teacherId, { from: q.from, to: q.to, durationMinutes: q.duration }));
  });

  app.get('/v1/settings', async (c) => {
    const { teacherId } = parse(TeacherQuery, c.req.query());
    const t = svc.resolveTeacher(ctx, c.get('actor'), teacherId, { allowStudents: false });
    return c.json({ teacherId: t, ...(await svc.getSettings(ctx.db, t, ctx.defaultTimezone)) });
  });

  app.put('/v1/settings', async (c) => {
    const { teacherId } = parse(TeacherQuery, c.req.query());
    const patch = parse(SettingsPatch, await body(c));
    const t = svc.resolveTeacher(ctx, c.get('actor'), teacherId, { allowStudents: false });
    return c.json({ teacherId: t, ...(await svc.putSettings(ctx, t, patch)) });
  });

  return app;
}
