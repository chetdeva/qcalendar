import type { Actor } from './auth.ts';
import type { Ctx } from './events.ts';
import { HttpError } from './errors.ts';
import type { Queryable } from './db.ts';
import { createEvent } from './events.ts';

/** The free trial class is always this long. */
export const TRIAL_MINUTES = 30;

const view = (r: Record<string, any>) => ({
  id: r.id, studentId: r.student_id, studentEmail: r.student_email, studentName: r.student_name, status: r.status, createdAt: r.created_at,
  /** The slot the student picked; null for requests made before students could pick one. */
  start: r.requested_start ? new Date(r.requested_start).toISOString() : null,
  end: r.requested_start ? new Date(new Date(r.requested_start).getTime() + TRIAL_MINUTES * 60_000).toISOString() : null,
});

const student = (actor: Actor) => {
  if (actor.kind !== 'user' || actor.role !== 'student') throw new HttpError(403, 'forbidden', 'Only students request a free trial class');
  return actor;
};

/** A new student asks for the free trial class at a time they picked. Asking again replaces the time. */
export async function requestTrial(ctx: Ctx, actor: Actor, input: { start: string }) {
  const s = student(actor);
  if (new Date(input.start).getTime() <= Date.now()) throw new HttpError(400, 'past_time', 'Pick a time in the future');
  await ctx.db.query(
    `insert into calendar.trial_requests (student_id, student_email, student_name, requested_start, duration_minutes) values ($1, $2, $3, $4, $5)
     on conflict (student_id) where status = 'requested' do update set requested_start = excluded.requested_start, duration_minutes = excluded.duration_minutes`,
    [s.id, s.email ?? null, s.name ?? null, input.start, TRIAL_MINUTES],
  );
  return (await myRequest(ctx, actor))!;
}

/** The student's open request, if any. */
export async function myRequest(ctx: Ctx, actor: Actor) {
  const [r] = await ctx.db.query(`select * from calendar.trial_requests where student_id = $1 and status = 'requested'`, [student(actor).id]);
  return r ? view(r) : null;
}

export async function cancelMyRequest(ctx: Ctx, actor: Actor) {
  await ctx.db.query(`update calendar.trial_requests set status = 'cancelled' where student_id = $1 and status = 'requested'`, [student(actor).id]);
}

/** Open requests, oldest first, for the teachers who will schedule them. */
export async function openRequests(ctx: Ctx, actor: Actor) {
  if (actor.kind === 'user' && actor.role === 'student') throw new HttpError(403, 'forbidden', 'Not allowed');
  return (await ctx.db.query(`select * from calendar.trial_requests where status = 'requested' order by created_at`)).map(view);
}

/**
 * A teacher accepts the time the student picked: the free class is created on the teacher's calendar with the student
 * in it (invitation, free-class reservation and marking the request scheduled all happen inside createEvent).
 */
export async function confirmRequest(ctx: Ctx, actor: Actor, id: string) {
  if (actor.kind !== 'user' || actor.role !== 'teacher') throw new HttpError(403, 'forbidden', 'Only a teacher can confirm a free class. Admins choose a teacher with Change time.');
  const [r] = await ctx.db.query(`select * from calendar.trial_requests where id = $1`, [id]);
  if (!r) throw new HttpError(404, 'not_found', 'Request not found');
  if (r.status !== 'requested') throw new HttpError(409, 'request_closed', 'This request is no longer open');
  if (!r.requested_start) throw new HttpError(409, 'time_required', 'This request has no time. Use Change time to schedule it.');
  if (!r.student_email) throw new HttpError(422, 'student_email_missing', 'This student has no email on record. Use Change time to schedule it.');
  const start = new Date(r.requested_start);
  if (start.getTime() <= Date.now()) throw new HttpError(409, 'request_in_past', 'The requested time has passed. Use Change time to pick another.');
  return createEvent(ctx, actor, {
    title: 'Free trial class', start: start.toISOString(), durationMinutes: TRIAL_MINUTES, meet: true, category: 'trial',
    participants: [{ userId: r.student_id, email: r.student_email, name: r.student_name ?? undefined }],
  });
}

/** A tutoring lesson now includes these students: their open requests are done. Runs inside the booking transaction. */
export async function markScheduled(q: Queryable, eventId: string, userIds: (string | null | undefined)[]) {
  const ids = userIds.filter((u): u is string => Boolean(u));
  if (ids.length) await q.query(`update calendar.trial_requests set status = 'scheduled', event_id = $1 where status = 'requested' and student_id = any($2::uuid[])`, [eventId, ids]);
}
