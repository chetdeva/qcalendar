import { randomBytes } from 'node:crypto';
import type { Actor } from './auth.ts';
import { computeSlots, defaultSettings, type Settings } from './availability.ts';
import type { Db, Queryable } from './db.ts';
import { HttpError } from './errors.ts';
import { enqueueMail, type MailKind, type OutboxPayload } from './outbox.ts';
import { enqueueWebhook } from './webhooks.ts';

export interface Ctx {
  db: Db;
  defaultTimezone: string;
  webhooks: boolean;
  meetingBaseUrl: string;
}

export interface ParticipantInput { userId?: string; email: string; name?: string }
export type Category = 'tutoring' | 'office_hours' | 'personal';

interface EventRow {
  id: string; owner_id: string; owner_email: string | null; owner_name: string | null; title: string; description: string | null;
  location: string | null; meeting_url: string | null; start_at: Date | string; end_at: Date | string; timezone: string;
  category: Category; status: 'confirmed' | 'cancelled'; external_ref: string | null; sequence: number;
  created_by: string | null; created_at: Date | string; updated_at: Date | string;
}
interface PRow {
  id: string; event_id: string; user_id: string | null; email: string; name: string | null;
  status: 'invited' | 'accepted' | 'declined'; created_at: Date | string; responded_at: Date | string | null;
}

type Relation = 'manager' | 'owner' | 'participant';
const iso = (d: Date | string) => new Date(d).toISOString();
const canManage = (r: Relation) => r === 'manager' || r === 'owner';
const isStaff = (a: Actor) => a.kind === 'service' || a.role === 'admin';

// ---------- views: what each kind of caller is allowed to see ----------

function participantOut(p: PRow) {
  return { id: p.id, userId: p.user_id, email: p.email, name: p.name, status: p.status, respondedAt: p.responded_at ? iso(p.responded_at) : null };
}

function baseView(e: EventRow) {
  return {
    id: e.id, ownerId: e.owner_id, ownerName: e.owner_name, title: e.title, description: e.description, location: e.location,
    meetingUrl: e.meeting_url,
    start: iso(e.start_at), end: iso(e.end_at), timezone: e.timezone, category: e.category, status: e.status,
    externalRef: e.external_ref, createdAt: iso(e.created_at), updatedAt: iso(e.updated_at),
  };
}

/** Teachers who own the class, and staff, see everyone. A participant sees themselves and a head count, never other students. */
export function viewOf(e: EventRow, parts: PRow[], rel: Relation, mine?: PRow) {
  if (canManage(rel)) {
    return { ...baseView(e), ownerEmail: e.owner_email, participants: parts.map(participantOut), participantCount: parts.length };
  }
  return { ...baseView(e), ownerEmail: e.owner_email, participants: mine ? [participantOut(mine)] : [], participantCount: parts.length, myStatus: mine?.status ?? null };
}

// ---------- small helpers ----------

async function participantsOf(q: Queryable, ids: string[]): Promise<Map<string, PRow[]>> {
  const map = new Map<string, PRow[]>(ids.map((id) => [id, []]));
  if (!ids.length) return map;
  const rows = await q.query<PRow>('select * from calendar.event_participants where event_id = any($1::uuid[]) order by created_at, email', [ids]);
  for (const r of rows) map.get(r.event_id)!.push(r);
  return map;
}

async function findMine(q: Queryable, eventId: string, actor: Actor): Promise<PRow | undefined> {
  if (actor.kind !== 'user') return undefined;
  return (await q.query<PRow>(
    `select * from calendar.event_participants where event_id = $1 and (user_id = $2 or lower(email) = lower($3)) limit 1`,
    [eventId, actor.id, actor.email ?? ''],
  ))[0];
}

/** An invitation sent to an email address belongs to whoever signs in with it: remember which account that is. */
async function linkAccount(q: Queryable, actor: Actor) {
  if (actor.kind === 'user' && actor.email) {
    await q.query(`update calendar.event_participants set user_id = $1 where user_id is null and lower(email) = lower($2)`, [actor.id, actor.email]);
  }
}

async function relationTo(q: Queryable, actor: Actor, e: EventRow): Promise<{ rel: Relation; mine?: PRow } | null> {
  if (isStaff(actor)) return { rel: 'manager' };
  if (actor.kind === 'user' && actor.id === e.owner_id) return { rel: 'owner' };
  const mine = await findMine(q, e.id, actor);
  return mine ? { rel: 'participant', mine } : null;
}

async function loadEvent(q: Queryable, id: string, lock = false): Promise<EventRow> {
  const e = (await q.query<EventRow>(`select * from calendar.events where id = $1 ${lock ? 'for update' : ''}`, [id]))[0];
  if (!e) throw new HttpError(404, 'not_found', 'Event not found');
  return e;
}

/** Someone who may not see an event gets exactly the answer they would get if it did not exist. */
async function loadVisible(q: Queryable, actor: Actor, id: string, lock = false) {
  const e = await loadEvent(q, id, lock);
  const r = await relationTo(q, actor, e);
  if (!r) throw new HttpError(404, 'not_found', 'Event not found');
  return { e, ...r };
}

async function loadManaged(q: Queryable, actor: Actor, id: string) {
  const v = await loadVisible(q, actor, id, true);
  if (!canManage(v.rel)) throw new HttpError(403, 'forbidden', 'Only the teacher who owns this class can change it');
  return v;
}

const lockOwner = (q: Queryable, ownerId: string) => q.query('select pg_advisory_xact_lock(hashtext($1))', [ownerId]);

async function ownerConflicts(q: Queryable, ownerId: string, start: string, end: string, excludeId?: string) {
  return q.query<EventRow>(
    `select * from calendar.events where owner_id = $1 and status = 'confirmed' and start_at < $3::timestamptz and end_at > $2::timestamptz
       and ($4::uuid is null or id <> $4::uuid) order by start_at`,
    [ownerId, start, end, excludeId ?? null],
  );
}

/** Which of these people are already booked into another class at that time? Only their emails come back, never the other class. */
async function busyParticipants(q: Queryable, people: { email: string; userId?: string | null }[], start: string, end: string, excludeId?: string) {
  const emails = people.map((p) => p.email.toLowerCase());
  const ids = people.map((p) => p.userId).filter((x): x is string => Boolean(x));
  if (!emails.length) return [];
  const rows = await q.query<{ email: string }>(
    `select distinct lower(p.email) as email from calendar.event_participants p join calendar.events e on e.id = p.event_id
      where e.status = 'confirmed' and p.status <> 'declined' and e.start_at < $2::timestamptz and e.end_at > $1::timestamptz
        and ($3::uuid is null or e.id <> $3::uuid) and (lower(p.email) = any($4::text[]) or p.user_id = any($5::uuid[])) order by 1`,
    [start, end, excludeId ?? null, emails, ids],
  );
  return rows.map((r) => r.email);
}

async function checkConflicts(q: Queryable, e: { ownerId: string; start: string; end: string; excludeId?: string }, people: { email: string; userId?: string | null }[], force: boolean) {
  if (force) return;
  const clashes = await ownerConflicts(q, e.ownerId, e.start, e.end, e.excludeId);
  if (clashes.length) {
    throw new HttpError(409, 'conflict', 'Time overlaps existing events', clashes.map((c) => baseView(c)));
  }
  const busy = await busyParticipants(q, people, e.start, e.end, e.excludeId);
  if (busy.length) throw new HttpError(409, 'participant_conflict', 'Some students are already booked into another class at this time', busy);
}

function normalize(list: ParticipantInput[] | undefined): ParticipantInput[] {
  const seen = new Map<string, ParticipantInput>();
  for (const p of list ?? []) {
    const email = p.email.trim().toLowerCase();
    if (!seen.has(email)) seen.set(email, { email, userId: p.userId, name: p.name?.trim() || undefined });
  }
  return [...seen.values()];
}

function resolveTimes(start: string, end: string | undefined, durationMinutes: number | undefined) {
  const s = Date.parse(start);
  const e = end ? Date.parse(end) : s + (durationMinutes ?? 0) * 60_000;
  if (!(e > s)) throw new HttpError(400, 'invalid_request', 'end must be after start');
  return { start: new Date(s).toISOString(), end: new Date(e).toISOString() };
}

const newMeetingUrl = (base: string) => `${base.replace(/\/$/, '')}/sync-${randomBytes(9).toString('base64url')}`;

function mailPayload(e: EventRow, p: { email: string; name: string | null }, sequence = e.sequence): OutboxPayload {
  return {
    event: {
      id: e.id, title: e.title, description: e.description, location: e.location, meetingUrl: e.meeting_url,
      start: iso(e.start_at), end: iso(e.end_at), timezone: e.timezone, sequence, ownerEmail: e.owner_email, ownerName: e.owner_name,
    },
    recipient: { email: p.email, name: p.name },
  };
}

const notify = (q: Queryable, kind: MailKind, e: EventRow, to: { email: string; name: string | null }[], sequence?: number) =>
  enqueueMail(q, kind, to.map((p) => mailPayload(e, p, sequence)));

async function emit(ctx: Ctx, q: Queryable, type: string, e: EventRow, parts: PRow[], extra?: Record<string, unknown>) {
  if (ctx.webhooks) await enqueueWebhook(q, type, { ...viewOf(e, parts, 'manager'), ...extra });
}

// ---------- events ----------

export interface CreateInput {
  title: string; description?: string; location?: string; meetingUrl?: string; meet?: boolean;
  start: string; end?: string; durationMinutes?: number; timezone?: string; category?: Category; externalRef?: string;
  ownerId?: string; ownerEmail?: string; ownerName?: string; participants?: ParticipantInput[]; force?: boolean;
}

export async function createEvent(ctx: Ctx, actor: Actor, input: CreateInput) {
  let ownerId: string; let ownerEmail: string | null = input.ownerEmail ?? null; let ownerName: string | null = input.ownerName ?? null;
  if (actor.kind === 'service') {
    const id = input.ownerId;
    if (!id) throw new HttpError(400, 'owner_required', 'ownerId is required');
    ownerId = id;
  } else if (actor.role === 'student') {
    throw new HttpError(403, 'forbidden', 'Students cannot create classes');
  } else if (actor.role === 'teacher') {
    if (input.ownerId && input.ownerId !== actor.id) throw new HttpError(403, 'forbidden', 'Teachers can only create classes on their own calendar');
    ownerId = actor.id; ownerEmail = actor.email ?? null; ownerName = actor.name ?? null;
  } else {
    ownerId = input.ownerId ?? actor.id;
    if (ownerId === actor.id) { ownerEmail ??= actor.email ?? null; ownerName ??= actor.name ?? null; }
  }

  const { start, end } = resolveTimes(input.start, input.end, input.durationMinutes);
  const people = normalize(input.participants);
  const meetingUrl = input.meetingUrl ?? (input.meet ? newMeetingUrl(ctx.meetingBaseUrl) : null);
  const timezone = input.timezone ?? (await getSettings(ctx.db, ownerId, ctx.defaultTimezone)).timezone;

  return ctx.db.tx(async (q) => {
    await lockOwner(q, ownerId);
    await checkConflicts(q, { ownerId, start, end }, people, Boolean(input.force));
    const e = (await q.query<EventRow>(
      `insert into calendar.events (owner_id, owner_email, owner_name, title, description, location, meeting_url, start_at, end_at, timezone, category, external_ref, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,
      [ownerId, ownerEmail, ownerName, input.title, input.description ?? null, input.location ?? null, meetingUrl, start, end, timezone, input.category ?? 'tutoring', input.externalRef ?? null, actor.kind === 'user' ? actor.id : null],
    ))[0];
    const parts: PRow[] = [];
    for (const p of people) {
      parts.push((await q.query<PRow>('insert into calendar.event_participants (event_id, user_id, email, name) values ($1,$2,$3,$4) returning *', [e.id, p.userId ?? null, p.email, p.name ?? null]))[0]);
    }
    await notify(q, 'invite', e, parts.map((p) => ({ email: p.email, name: p.name })));
    await emit(ctx, q, 'event.created', e, parts);
    return viewOf(e, parts, 'manager');
  });
}

export interface ListFilters { from?: string; to?: string; ownerId?: string; participant?: string; externalRef?: string; includeCancelled?: boolean }

export async function listEvents(ctx: Ctx, actor: Actor, f: ListFilters) {
  await linkAccount(ctx.db, actor);
  const args: unknown[] = [];
  const where: string[] = [];
  const arg = (v: unknown) => (args.push(v), `$${args.length}`);
  if (actor.kind === 'user' && actor.role !== 'admin') {
    const uid = arg(actor.id); const mail = arg((actor.email ?? '').toLowerCase());
    const mine = `exists (select 1 from calendar.event_participants p where p.event_id = e.id and (p.user_id = ${uid} or lower(p.email) = ${mail}))`;
    where.push(actor.role === 'teacher' ? `(e.owner_id = ${uid} or ${mine})` : mine);
  } else {
    if (f.ownerId) where.push(`e.owner_id = ${arg(f.ownerId)}`);
    if (f.participant) where.push(`exists (select 1 from calendar.event_participants p where p.event_id = e.id and lower(p.email) = ${arg(f.participant.toLowerCase())})`);
  }
  if (f.from) where.push(`e.end_at > ${arg(f.from)}::timestamptz`);
  if (f.to) where.push(`e.start_at < ${arg(f.to)}::timestamptz`);
  if (f.externalRef) where.push(`e.external_ref = ${arg(f.externalRef)}`);
  if (!f.includeCancelled) where.push(`e.status = 'confirmed'`);
  const events = await ctx.db.query<EventRow>(`select e.* from calendar.events e ${where.length ? 'where ' + where.join(' and ') : ''} order by e.start_at, e.id limit 500`, args);
  const parts = await participantsOf(ctx.db, events.map((e) => e.id));
  const out = [];
  for (const e of events) {
    const all = parts.get(e.id)!;
    const staff = isStaff(actor); const owner = actor.kind === 'user' && actor.id === e.owner_id;
    const mine = actor.kind === 'user' ? all.find((p) => p.user_id === actor.id || p.email.toLowerCase() === (actor.email ?? '').toLowerCase()) : undefined;
    out.push(viewOf(e, all, staff ? 'manager' : owner ? 'owner' : 'participant', mine));
  }
  return out;
}

export async function getEvent(ctx: Ctx, actor: Actor, id: string) {
  await linkAccount(ctx.db, actor);
  const { e, rel, mine } = await loadVisible(ctx.db, actor, id);
  return viewOf(e, (await participantsOf(ctx.db, [id])).get(id)!, rel, mine);
}

export interface PatchInput {
  title?: string; description?: string | null; location?: string | null; meetingUrl?: string | null; meet?: boolean;
  start?: string; end?: string; durationMinutes?: number; timezone?: string; category?: Category; force?: boolean;
}

export async function patchEvent(ctx: Ctx, actor: Actor, id: string, input: PatchInput) {
  return ctx.db.tx(async (q) => {
    const { e: prev, rel } = await loadManaged(q, actor, id);
    if (prev.status === 'cancelled') throw new HttpError(409, 'cancelled', 'This class is cancelled');
    const parts = (await participantsOf(q, [id])).get(id)!;

    const timeChanged = input.start !== undefined || input.end !== undefined || input.durationMinutes !== undefined;
    let start = iso(prev.start_at); let end = iso(prev.end_at);
    if (timeChanged) {
      const keep = Date.parse(end) - Date.parse(start);
      const s = input.start ?? start;
      ({ start, end } = resolveTimes(s, input.end ?? (input.durationMinutes ? undefined : new Date(Date.parse(s) + keep).toISOString()), input.durationMinutes));
    }
    const sameTime = start === iso(prev.start_at) && end === iso(prev.end_at);
    if (timeChanged && !sameTime) {
      await lockOwner(q, prev.owner_id);
      await checkConflicts(q, { ownerId: prev.owner_id, start, end, excludeId: id }, parts.map((p) => ({ email: p.email, userId: p.user_id })), Boolean(input.force));
    }

    let meetingUrl = prev.meeting_url;
    if (input.meetingUrl !== undefined) meetingUrl = input.meetingUrl;
    else if (input.meet === true && !meetingUrl) meetingUrl = newMeetingUrl(ctx.meetingBaseUrl);
    else if (input.meet === false) meetingUrl = null;

    const next = {
      title: input.title ?? prev.title,
      description: input.description !== undefined ? input.description : prev.description,
      location: input.location !== undefined ? input.location : prev.location,
      meeting_url: meetingUrl, timezone: input.timezone ?? prev.timezone, category: input.category ?? prev.category,
    };
    const people_visible_change = next.title !== prev.title || next.description !== prev.description || next.location !== prev.location
      || next.meeting_url !== prev.meeting_url || !sameTime;
    const anyChange = people_visible_change || next.timezone !== prev.timezone || next.category !== prev.category;
    if (!anyChange) return viewOf(prev, parts, rel);

    const e = (await q.query<EventRow>(
      `update calendar.events set title=$2, description=$3, location=$4, meeting_url=$5, timezone=$6, category=$7, start_at=$8, end_at=$9,
              sequence = sequence + $10, updated_at = now() where id = $1 returning *`,
      [id, next.title, next.description, next.location, next.meeting_url, next.timezone, next.category, start, end, people_visible_change ? 1 : 0],
    ))[0];
    let current = parts;
    if (!sameTime) {
      // A new time needs a new answer from everyone.
      await q.query(`update calendar.event_participants set status = 'invited', responded_at = null where event_id = $1`, [id]);
      current = (await participantsOf(q, [id])).get(id)!;
    }
    if (people_visible_change) await notify(q, 'update', e, current.map((p) => ({ email: p.email, name: p.name })));
    await emit(ctx, q, 'event.updated', e, current);
    return viewOf(e, current, rel);
  });
}

export async function cancelEvent(ctx: Ctx, actor: Actor, id: string) {
  return ctx.db.tx(async (q) => {
    const { e: prev, rel } = await loadManaged(q, actor, id);
    const parts = (await participantsOf(q, [id])).get(id)!;
    if (prev.status === 'cancelled') return viewOf(prev, parts, rel);
    const e = (await q.query<EventRow>(`update calendar.events set status = 'cancelled', sequence = sequence + 1, updated_at = now() where id = $1 returning *`, [id]))[0];
    await notify(q, 'cancel', e, parts.map((p) => ({ email: p.email, name: p.name })));
    await emit(ctx, q, 'event.cancelled', e, parts);
    return viewOf(e, parts, rel);
  });
}

// ---------- participants ----------

export async function addParticipants(ctx: Ctx, actor: Actor, id: string, input: ParticipantInput[], force = false) {
  const people = normalize(input);
  return ctx.db.tx(async (q) => {
    const { e, rel } = await loadManaged(q, actor, id);
    if (e.status === 'cancelled') throw new HttpError(409, 'cancelled', 'This class is cancelled');
    const existing = (await participantsOf(q, [id])).get(id)!;
    const known = new Set(existing.map((p) => p.email.toLowerCase()));
    const fresh = people.filter((p) => !known.has(p.email));
    if (!force && fresh.length) {
      const busy = await busyParticipants(q, fresh, iso(e.start_at), iso(e.end_at), id);
      if (busy.length) throw new HttpError(409, 'participant_conflict', 'Some students are already booked into another class at this time', busy);
    }
    const added: PRow[] = [];
    for (const p of fresh) {
      added.push((await q.query<PRow>('insert into calendar.event_participants (event_id, user_id, email, name) values ($1,$2,$3,$4) returning *', [id, p.userId ?? null, p.email, p.name ?? null]))[0]);
    }
    if (added.length) {
      await notify(q, 'invite', e, added.map((p) => ({ email: p.email, name: p.name })));
      await emit(ctx, q, 'event.updated', e, [...existing, ...added]);
    }
    return viewOf(e, [...existing, ...added], rel);
  });
}

export async function removeParticipant(ctx: Ctx, actor: Actor, eventId: string, participantId: string) {
  return ctx.db.tx(async (q) => {
    const { e, rel } = await loadManaged(q, actor, eventId);
    const gone = (await q.query<PRow>('delete from calendar.event_participants where id = $1 and event_id = $2 returning *', [participantId, eventId]))[0];
    if (!gone) throw new HttpError(404, 'not_found', 'Participant not found');
    if (e.status === 'confirmed') await notify(q, 'cancel', e, [{ email: gone.email, name: gone.name }], e.sequence + 1);
    const rest = (await participantsOf(q, [eventId])).get(eventId)!;
    await emit(ctx, q, 'event.updated', e, rest);
    return viewOf(e, rest, rel);
  });
}

export async function respond(ctx: Ctx, actor: Actor, id: string, response: 'accepted' | 'declined') {
  if (actor.kind !== 'user') throw new HttpError(403, 'forbidden', 'Only a person can answer an invitation');
  return ctx.db.tx(async (q) => {
    const { e, rel, mine } = await loadVisible(q, actor, id, true);
    if (!mine) throw new HttpError(404, 'not_found', 'Event not found'); // owners and staff are not invitees
    if (e.status === 'cancelled') throw new HttpError(409, 'cancelled', 'This class is cancelled');
    const updated = (await q.query<PRow>(
      `update calendar.event_participants set status = $2, responded_at = now(), user_id = coalesce(user_id, $3) where id = $1 returning *`,
      [mine.id, response, actor.id],
    ))[0];
    const parts = (await participantsOf(q, [id])).get(id)!;
    await emit(ctx, q, 'event.responded', e, parts, { responder: { email: updated.email, status: updated.status } });
    return viewOf(e, parts, rel, updated);
  });
}

// ---------- settings and availability ----------

export async function getSettings(q: Queryable, teacherId: string, defaultTimezone: string): Promise<Settings> {
  const row = (await q.query<{ timezone: string; working_hours: Settings['workingHours']; buffer_minutes: number; slot_step_minutes: number }>(
    'select * from calendar.teacher_settings where user_id = $1', [teacherId]))[0];
  if (!row) return defaultSettings(defaultTimezone);
  return { timezone: row.timezone, workingHours: row.working_hours, bufferMinutes: row.buffer_minutes, slotStepMinutes: row.slot_step_minutes };
}

/** Whose calendar does this request mean? Teachers: their own. Staff and the service key: the one they name. */
export function resolveTeacher(ctx: Ctx, actor: Actor, teacherId: string | undefined, opts: { allowStudents: boolean }): string {
  if (actor.kind === 'service') {
    const id = teacherId;
    if (!id) throw new HttpError(400, 'teacher_required', 'teacherId is required');
    return id;
  }
  if (actor.role === 'student') {
    if (!opts.allowStudents) throw new HttpError(403, 'forbidden', 'Students cannot change calendar settings');
    if (!teacherId) throw new HttpError(400, 'teacher_required', 'teacherId is required');
    return teacherId;
  }
  if (actor.role === 'teacher') {
    if (teacherId && teacherId !== actor.id && !opts.allowStudents) throw new HttpError(403, 'forbidden', 'You can only change your own settings');
    return teacherId ?? actor.id;
  }
  return teacherId ?? actor.id;
}

export async function putSettings(ctx: Ctx, teacherId: string, patch: Partial<Settings>) {
  const next = { ...(await getSettings(ctx.db, teacherId, ctx.defaultTimezone)), ...patch };
  await ctx.db.query(
    `insert into calendar.teacher_settings (user_id, timezone, working_hours, buffer_minutes, slot_step_minutes) values ($1,$2,$3,$4,$5)
     on conflict (user_id) do update set timezone = excluded.timezone, working_hours = excluded.working_hours,
       buffer_minutes = excluded.buffer_minutes, slot_step_minutes = excluded.slot_step_minutes, updated_at = now()`,
    [teacherId, next.timezone, JSON.stringify(next.workingHours), next.bufferMinutes, next.slotStepMinutes],
  );
  return next;
}

/** Free slots only. Anyone signed in may ask when a teacher is free; nobody learns what the teacher is busy with. */
export async function availability(ctx: Ctx, teacherId: string, q: { from: string; to: string; durationMinutes: number }) {
  const settings = await getSettings(ctx.db, teacherId, ctx.defaultTimezone);
  const pad = settings.bufferMinutes * 60_000;
  const fromMs = Date.parse(q.from); const toMs = Date.parse(q.to);
  const busy = (await ctx.db.query<{ start_at: Date | string; end_at: Date | string }>(
    `select start_at, end_at from calendar.events where owner_id = $1 and status = 'confirmed' and start_at < $3::timestamptz and end_at > $2::timestamptz`,
    [teacherId, new Date(fromMs - pad).toISOString(), new Date(toMs + pad).toISOString()],
  )).map((r) => ({ start: new Date(r.start_at).getTime(), end: new Date(r.end_at).getTime() }));
  const slots = computeSlots({ fromMs, toMs, nowMs: Date.now(), durationMin: q.durationMinutes, settings, busy });
  return { teacherId, timezone: settings.timezone, durationMinutes: q.durationMinutes, slots: slots.map((s) => ({ start: new Date(s.start).toISOString(), end: new Date(s.end).toISOString() })) };
}
