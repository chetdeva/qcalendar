import type { Actor } from './auth.ts';
import type { Queryable } from './db.ts';
import { HttpError } from './errors.ts';
import { createEvent, type Ctx } from './events.ts';
import { enqueueClassRequestMail } from './outbox.ts';

/** A mentor's class is this long, unless the request says otherwise. */
export const CLASS_MINUTES = 60;

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);
const view = (r: Record<string, any>) => ({
  id: r.id, status: r.status, createdAt: iso(r.created_at), decidedAt: iso(r.decided_at), note: r.note, declineNote: r.decline_note, eventId: r.event_id,
  student: { id: r.student_id, name: r.student_name, email: r.student_email },
  teacher: { id: r.teacher_id, name: r.teacher_name },
  start: iso(r.requested_start)!, end: new Date(new Date(r.requested_start).getTime() + r.duration_minutes * 60_000).toISOString(), durationMinutes: r.duration_minutes,
});

const asStudent = (a: Actor) => {
  if (a.kind !== 'user' || a.role !== 'student') throw new HttpError(403, 'forbidden', 'Only students request a class from a mentor');
  return a;
};
const asTeacher = (a: Actor) => {
  if (a.kind !== 'user' || a.role !== 'teacher') throw new HttpError(403, 'forbidden', 'Only the mentor can answer a class request');
  return a;
};

/**
 * A student with a plan asks one mentor for a class at a time they picked. Asking the same mentor again replaces the time.
 * The mentor's address comes from the caller's server (it looked the mentor up), never from the browser.
 */
export async function requestClass(ctx: Ctx, actor: Actor, input: { teacher: { id: string; email: string; name?: string | null }; start: string; note?: string }) {
  const s = asStudent(actor);
  if (!s.email) throw new HttpError(422, 'student_email_missing', 'Your account has no email address');
  if (input.teacher.id === s.id) throw new HttpError(400, 'invalid_mentor', 'Choose a mentor');
  if (new Date(input.start).getTime() <= Date.now()) throw new HttpError(400, 'past_time', 'Pick a time in the future');
  if (ctx.billing?.subscribed && !(await ctx.billing.subscribed(s.id))) {
    throw new HttpError(402, 'subscription_required', 'Choose a plan to request a class from a mentor.');
  }
  return ctx.db.tx(async (q) => {
    const [r] = await q.query(
      `insert into calendar.class_requests (student_id, student_email, student_name, teacher_id, teacher_email, teacher_name, requested_start, duration_minutes, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (student_id, teacher_id) where status = 'requested' do update set requested_start = excluded.requested_start, note = excluded.note
       returning *`,
      [s.id, s.email, s.name ?? null, input.teacher.id, input.teacher.email, input.teacher.name ?? null, input.start, CLASS_MINUTES, input.note ?? null],
    );
    const end = new Date(new Date(r.requested_start).getTime() + r.duration_minutes * 60_000).toISOString();
    await enqueueClassRequestMail(q, 'class_request', {
      recipient: { email: r.teacher_email, name: r.teacher_name }, student: { email: r.student_email, name: r.student_name }, teacher: { email: r.teacher_email, name: r.teacher_name },
      start: iso(r.requested_start)!, end, timezone: ctx.defaultTimezone, note: r.note,
    });
    return view(r);
  });
}

/** The student's open requests, and the ones a mentor declined this past week (so they can see the answer). */
export async function myClassRequests(ctx: Ctx, actor: Actor) {
  const s = asStudent(actor);
  return (await ctx.db.query(
    `select * from calendar.class_requests where student_id = $1 and (status = 'requested' or (status = 'declined' and decided_at > now() - interval '7 days')) order by requested_start`,
    [s.id],
  )).map(view);
}

export async function cancelClassRequest(ctx: Ctx, actor: Actor, id: string) {
  const s = asStudent(actor);
  const done = await ctx.db.query(`update calendar.class_requests set status = 'cancelled', decided_at = now() where id = $1 and student_id = $2 and status = 'requested' returning id`, [id, s.id]);
  if (!done.length) throw new HttpError(404, 'not_found', 'No open request found');
}

/** What a mentor has been asked for and has not answered yet (the mentor sees only their own). */
export async function classRequestsForMe(ctx: Ctx, actor: Actor) {
  const t = asTeacher(actor);
  return (await ctx.db.query(`select * from calendar.class_requests where teacher_id = $1 and status = 'requested' and requested_start > now() order by requested_start`, [t.id])).map(view);
}

async function mine(ctx: Ctx, actor: Actor, id: string) {
  const t = asTeacher(actor);
  const [r] = await ctx.db.query(`select * from calendar.class_requests where id = $1 and teacher_id = $2`, [id, t.id]);
  if (!r) throw new HttpError(404, 'not_found', 'Request not found');
  if (r.status !== 'requested') throw new HttpError(409, 'request_closed', 'This request is no longer open');
  return { t, r };
}

/** The mentor says yes: the class is created for both, with a meeting link, and the student is invited (and charged a class credit). */
export async function approveClassRequest(ctx: Ctx, actor: Actor, id: string) {
  const { t, r } = await mine(ctx, actor, id);
  const start = new Date(r.requested_start);
  if (start.getTime() <= Date.now()) throw new HttpError(409, 'request_in_past', 'The requested time has passed. Ask the student to pick another.');
  return createEvent(ctx, t, {
    title: '1:1 class', start: start.toISOString(), durationMinutes: r.duration_minutes, meet: true, category: 'tutoring',
    participants: [{ userId: r.student_id, email: r.student_email, name: r.student_name ?? undefined }],
  });
}

export async function declineClassRequest(ctx: Ctx, actor: Actor, id: string, note?: string) {
  const { r } = await mine(ctx, actor, id);
  return ctx.db.tx(async (q) => {
    const [d] = await q.query(`update calendar.class_requests set status = 'declined', decline_note = $2, decided_at = now() where id = $1 and status = 'requested' returning *`, [id, note ?? null]);
    if (!d) throw new HttpError(409, 'request_closed', 'This request is no longer open');
    const end = new Date(new Date(r.requested_start).getTime() + r.duration_minutes * 60_000).toISOString();
    await enqueueClassRequestMail(q, 'class_request_declined', {
      recipient: { email: r.student_email, name: r.student_name }, student: { email: r.student_email, name: r.student_name }, teacher: { email: r.teacher_email, name: r.teacher_name },
      start: iso(r.requested_start)!, end, timezone: ctx.defaultTimezone, note: note ?? null,
    });
    return view(d);
  });
}

/** A class by this mentor now includes these students: their open requests to that mentor are done. Runs inside the booking transaction. */
export async function markClassScheduled(q: Queryable, eventId: string, teacherId: string, userIds: (string | null | undefined)[]) {
  const ids = userIds.filter((u): u is string => Boolean(u));
  if (ids.length) {
    await q.query(
      `update calendar.class_requests set status = 'scheduled', event_id = $1, decided_at = now() where status = 'requested' and teacher_id = $2 and student_id = any($3::uuid[])`,
      [eventId, teacherId, ids],
    );
  }
}
