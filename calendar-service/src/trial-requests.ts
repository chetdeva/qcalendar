import type { Actor } from './auth.ts';
import type { Ctx } from './events.ts';
import { HttpError } from './errors.ts';
import type { Queryable } from './db.ts';

const view = (r: Record<string, any>) => ({ id: r.id, studentId: r.student_id, studentEmail: r.student_email, studentName: r.student_name, note: r.note, status: r.status, createdAt: r.created_at });

const student = (actor: Actor) => {
  if (actor.kind !== 'user' || actor.role !== 'student') throw new HttpError(403, 'forbidden', 'Only students request a free class');
  return actor;
};

/** A new student asks for the free first class. Asking again while a request is open just returns it. */
export async function requestTrial(ctx: Ctx, actor: Actor, note?: string) {
  const s = student(actor);
  await ctx.db.query(
    `insert into calendar.trial_requests (student_id, student_email, student_name, note) values ($1, $2, $3, $4) on conflict (student_id) where status = 'requested' do nothing`,
    [s.id, s.email ?? null, s.name ?? null, note ?? null],
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

/** A tutoring lesson now includes these students: their open requests are done. Runs inside the booking transaction. */
export async function markScheduled(q: Queryable, eventId: string, userIds: (string | null | undefined)[]) {
  const ids = userIds.filter((u): u is string => Boolean(u));
  if (ids.length) await q.query(`update calendar.trial_requests set status = 'scheduled', event_id = $1 where status = 'requested' and student_id = any($2::uuid[])`, [eventId, ids]);
}
