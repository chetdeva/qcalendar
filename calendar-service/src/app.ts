import { Hono } from 'hono';
import { z } from 'zod';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { CATEGORIES, getEvent, kvGet, kvSet, type DB, type EventRow } from './db.ts';
import { computeSlots, isValidTz, loadSettings, type Settings } from './availability.ts';
import type { GoogleClient } from './google.ts';
import { syncEvent, syncPending, toApi } from './sync.ts';
import { enqueueWebhook } from './webhooks.ts';

export interface AppDeps {
  db: DB;
  google: GoogleClient;
  apiKey: string;
  defaultTimezone?: string;
  webhookUrlFromEnv?: string;
}

class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'invalid_request', 'Invalid request', r.error.issues);
  return r.data;
}

const iso = z.iso.datetime({ offset: true });
const tz = z.string().refine(isValidTz, 'Unknown timezone');
const emails = z.array(z.email().transform((e) => e.toLowerCase())).max(50);

const CreateSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(5000).optional(),
    location: z.string().max(500).optional(),
    start: iso,
    end: iso.optional(),
    durationMinutes: z.number().int().min(5).max(1440).optional(),
    timezone: tz.optional(),
    attendees: emails.default([]),
    meet: z.boolean().default(false),
    externalRef: z.string().max(200).optional(),
    category: z.enum(CATEGORIES).default('tutoring'),
    force: z.boolean().default(false),
  })
  .refine((v) => v.end || v.durationMinutes, { message: 'end or durationMinutes is required' });

const PatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  start: iso.optional(),
  end: iso.optional(),
  durationMinutes: z.number().int().min(5).max(1440).optional(),
  timezone: tz.optional(),
  attendees: emails.optional(),
  meet: z.boolean().optional(),
  category: z.enum(CATEGORIES).optional(),
  force: z.boolean().default(false),
});

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const day = z.array(z.tuple([HHMM, HHMM]).refine(([a, b]) => a < b, 'start must be before end'));
const SettingsPatch = z
  .object({
    timezone: tz,
    workingHours: z.object({ sun: day, mon: day, tue: day, wed: day, thu: day, fri: day, sat: day }),
    bufferMinutes: z.number().int().min(0).max(240),
    slotStepMinutes: z.number().int().min(5).max(240),
    webhookUrl: z.union([z.url(), z.literal('')]),
  })
  .partial();

const AvailabilityQuery = z.object({
  from: iso,
  to: iso,
  duration: z.coerce.number().int().min(5).max(480).default(60),
});

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function createApp(deps: AppDeps) {
  const { db, google } = deps;
  const app = new Hono();

  const getSettings = (): Settings => loadSettings(db, deps.defaultTimezone);
  const webhookUrl = () => getSettings().webhookUrl || deps.webhookUrlFromEnv || '';
  const emit = (type: string, ev: EventRow) => {
    if (webhookUrl()) enqueueWebhook(db, type, toApi(ev));
  };
  const nowIso = () => new Date().toISOString();

  function findConflicts(startIso: string, endIso: string, excludeId?: string): EventRow[] {
    return db
      .prepare(`SELECT * FROM events WHERE status = 'confirmed' AND start_utc < ? AND end_utc > ? AND id != ?`)
      .all(endIso, startIso, excludeId ?? '') as EventRow[];
  }

  function resolveTimes(start: string, end: string | undefined, durationMinutes: number | undefined) {
    const startMs = Date.parse(start);
    const endMs = end ? Date.parse(end) : startMs + durationMinutes! * 60_000;
    if (endMs <= startMs) throw new HttpError(400, 'invalid_request', 'end must be after start');
    return { startIso: new Date(startMs).toISOString(), endIso: new Date(endMs).toISOString() };
  }

  function requireEvent(id: string): EventRow {
    const ev = getEvent(db, id);
    if (!ev) throw new HttpError(404, 'not_found', 'Event not found');
    return ev;
  }

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status as 400);
    }
    console.error(err);
    return c.json({ error: { code: 'internal', message: 'Internal error' } }, 500);
  });

  app.get('/health', (c) => c.json({ ok: true }));
  app.get('/', (c) =>
    c.json({
      service: 'mini-calendar',
      note: 'JSON API. Send "Authorization: Bearer <API_KEY>" to /v1/* endpoints.',
      endpoints: ['GET /health', 'POST|GET /v1/events', 'GET|PATCH|DELETE /v1/events/:id', 'GET /v1/availability', 'GET|PUT /v1/settings', 'GET /v1/google/status'],
    }),
  );

  app.get('/v1/google/callback', async (c) => {
    const state = c.req.query('state');
    const saved = kvGet<{ state: string; exp: number }>(db, 'oauth_state');
    if (!state || !saved || saved.exp < Date.now() || !safeEqual(state, saved.state)) {
      return c.text('Invalid or expired state. Start the connection again.', 400);
    }
    const code = c.req.query('code');
    if (!code) return c.text(`Google denied access: ${c.req.query('error') ?? 'unknown'}`, 400);
    kvSet(db, 'oauth_state', { state: '', exp: 0 });
    await google.handleCallback(code);
    void syncPending(db, google);
    return c.html('<h1>Google Calendar connected</h1><p>You can close this tab.</p>');
  });

  app.use('/v1/*', async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token || !safeEqual(token, deps.apiKey)) {
      throw new HttpError(401, 'unauthorized', 'Missing or invalid API key');
    }
    await next();
  });

  app.post('/v1/events', async (c) => {
    const body = parse(CreateSchema, await c.req.json().catch(() => null));
    const { startIso, endIso } = resolveTimes(body.start, body.end, body.durationMinutes);
    if (!body.force) {
      const conflicts = findConflicts(startIso, endIso);
      if (conflicts.length) throw new HttpError(409, 'conflict', 'Time overlaps existing events', conflicts.map(toApi));
    }
    const id = randomUUID();
    const now = nowIso();
    db.prepare(
      `INSERT INTO events (id, title, description, location, start_utc, end_utc, timezone, attendees, external_ref, meet, category, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, body.title, body.description ?? null, body.location ?? null, startIso, endIso,
      body.timezone ?? getSettings().timezone, JSON.stringify([...new Set(body.attendees)]),
      body.externalRef ?? null, body.meet ? 1 : 0, body.category, now, now,
    );
    await syncEvent(db, google, id);
    const ev = requireEvent(id);
    emit('event.created', ev);
    return c.json(toApi(ev), 201);
  });

  app.get('/v1/events', (c) => {
    const q = c.req.query();
    const where: string[] = [];
    const args: string[] = [];
    if (q.from) { where.push('end_utc > ?'); args.push(new Date(parse(iso, q.from)).toISOString()); }
    if (q.to) { where.push('start_utc < ?'); args.push(new Date(parse(iso, q.to)).toISOString()); }
    if (q.externalRef) { where.push('external_ref = ?'); args.push(q.externalRef); }
    if (q.attendee) { where.push('attendees LIKE ?'); args.push(`%"${q.attendee.toLowerCase().replaceAll(/[%_"]/g, '')}"%`); }
    if (q.includeCancelled !== 'true') where.push(`status = 'confirmed'`);
    const rows = db
      .prepare(`SELECT * FROM events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY start_utc LIMIT 500`)
      .all(...args) as EventRow[];
    return c.json({ events: rows.map(toApi) });
  });

  app.get('/v1/events/:id', (c) => c.json(toApi(requireEvent(c.req.param('id')))));

  app.patch('/v1/events/:id', async (c) => {
    const prev = requireEvent(c.req.param('id'));
    if (prev.status === 'cancelled') throw new HttpError(409, 'cancelled', 'Event is cancelled');
    const body = parse(PatchSchema, await c.req.json().catch(() => null));

    let { start_utc: startIso, end_utc: endIso } = prev;
    const timeChanged = body.start !== undefined || body.end !== undefined || body.durationMinutes !== undefined;
    if (timeChanged) {
      const start = body.start ?? prev.start_utc;
      const keepDuration = Date.parse(prev.end_utc) - Date.parse(prev.start_utc);
      const end = body.end ?? (body.durationMinutes ? undefined : new Date(Date.parse(start) + keepDuration).toISOString());
      ({ startIso, endIso } = resolveTimes(start, end, body.durationMinutes));
      if (!body.force) {
        const conflicts = findConflicts(startIso, endIso, prev.id);
        if (conflicts.length) throw new HttpError(409, 'conflict', 'Time overlaps existing events', conflicts.map(toApi));
      }
    }
    db.prepare(
      `UPDATE events SET title = ?, description = ?, location = ?, start_utc = ?, end_utc = ?, timezone = ?,
         attendees = ?, meet = ?, category = ?, sync_status = 'pending', updated_at = ? WHERE id = ?`,
    ).run(
      body.title ?? prev.title,
      body.description !== undefined ? body.description : prev.description,
      body.location !== undefined ? body.location : prev.location,
      startIso, endIso, body.timezone ?? prev.timezone,
      body.attendees ? JSON.stringify([...new Set(body.attendees)]) : prev.attendees,
      body.meet !== undefined ? (body.meet ? 1 : 0) : prev.meet,
      body.category ?? prev.category,
      nowIso(), prev.id,
    );
    await syncEvent(db, google, prev.id);
    const ev = requireEvent(prev.id);
    emit('event.updated', ev);
    return c.json(toApi(ev));
  });

  app.delete('/v1/events/:id', async (c) => {
    const prev = requireEvent(c.req.param('id'));
    if (prev.status === 'cancelled') return c.json(toApi(prev));
    db.prepare(`UPDATE events SET status = 'cancelled', sync_status = 'pending', updated_at = ? WHERE id = ?`).run(nowIso(), prev.id);
    await syncEvent(db, google, prev.id);
    const ev = requireEvent(prev.id);
    emit('event.cancelled', ev);
    return c.json(toApi(ev));
  });

  app.get('/v1/availability', async (c) => {
    const q = parse(AvailabilityQuery, c.req.query());
    const fromMs = Date.parse(q.from);
    const toMs = Date.parse(q.to);
    if (toMs <= fromMs || toMs - fromMs > 62 * 86_400_000) {
      throw new HttpError(400, 'invalid_request', 'to must be after from, within 62 days');
    }
    const settings = getSettings();
    const pad = settings.bufferMinutes * 60_000;
    const fromPad = new Date(fromMs - pad).toISOString();
    const toPad = new Date(toMs + pad).toISOString();
    const busy = findConflicts(fromPad, toPad).map((e) => ({ start: Date.parse(e.start_utc), end: Date.parse(e.end_utc) }));
    const warnings: string[] = [];
    if (google.isConnected()) {
      try {
        busy.push(...(await google.freeBusy(fromPad, toPad)));
      } catch (err) {
        warnings.push(`Google free/busy unavailable: ${(err as Error).message}`);
      }
    } else {
      warnings.push('Google Calendar not connected; only bookings made through this service block slots');
    }
    const slots = computeSlots({ fromMs, toMs, nowMs: Date.now(), durationMin: q.duration, settings, busy });
    return c.json({
      timezone: settings.timezone,
      durationMinutes: q.duration,
      slots: slots.map((s) => ({ start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString() })),
      warnings,
    });
  });

  app.get('/v1/settings', (c) => c.json(getSettings()));
  app.put('/v1/settings', async (c) => {
    const patch = parse(SettingsPatch, await c.req.json().catch(() => null));
    const next = { ...getSettings(), ...patch };
    kvSet(db, 'settings', next);
    return c.json(next);
  });

  app.get('/v1/google/status', (c) => {
    const pending = db.prepare(`SELECT COUNT(*) AS n FROM events WHERE sync_status != 'synced'`).get() as { n: number };
    return c.json({ configured: google.configured, connected: google.isConnected(), unsyncedEvents: pending.n });
  });
  app.get('/v1/google/connect', (c) => {
    if (!google.configured) throw new HttpError(400, 'not_configured', 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
    const state = randomBytes(24).toString('hex');
    kvSet(db, 'oauth_state', { state, exp: Date.now() + 10 * 60_000 });
    return c.json({ url: google.authUrl(state) });
  });
  app.post('/v1/google/sync', async (c) => {
    if (!google.isConnected()) throw new HttpError(409, 'not_connected', 'Google is not connected');
    return c.json(await syncPending(db, google));
  });

  return app;
}
