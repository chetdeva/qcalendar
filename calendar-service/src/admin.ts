import type { Actor } from './auth.ts';
import type { Ctx } from './events.ts';
import { HttpError } from './errors.ts';

export function requireAdmin(actor: Actor) {
  if (actor.kind !== 'service' && actor.role !== 'admin') throw new HttpError(403, 'forbidden', 'Admins only');
}

export interface Summary {
  /** Teachers: students assigned to them plus those in their classes from 30 days ago on (each counted once). Students: 0. */
  students: number;
  /** Students: the assigned teacher. */
  teacher: { id: string; name: string | null; email: string } | null;
  upcoming: number;
  nextAt: string | null;
}

/** What the admin portal's Teachers and Students tables show for a page of people (a few queries, not one per row). */
export async function adminSummary(ctx: Ctx, actor: Actor, input: { userIds: string[]; role: 'teacher' | 'student' }): Promise<Record<string, Summary>> {
  requireAdmin(actor);
  const out: Record<string, Summary> = Object.fromEntries(input.userIds.map((id) => [id, { students: 0, teacher: null, upcoming: 0, nextAt: null }]));
  const teacher = input.role === 'teacher';
  const ids = [input.userIds];

  // A student's classes are the ones they are in (and have not declined); a teacher's are the ones they own.
  const classes = await ctx.db.query<{ id: string; upcoming: number; next_at: Date | string | null }>(
    teacher
      ? `select e.owner_id as id, count(*) filter (where e.start_at > now())::int as upcoming, min(e.start_at) filter (where e.start_at > now()) as next_at
           from calendar.events e where e.status = 'confirmed' and e.owner_id = any($1::uuid[]) group by e.owner_id`
      : `select p.user_id as id, count(*) filter (where e.start_at > now())::int as upcoming, min(e.start_at) filter (where e.start_at > now()) as next_at
           from calendar.events e join calendar.event_participants p on p.event_id = e.id
          where e.status = 'confirmed' and p.status <> 'declined' and p.user_id = any($1::uuid[]) group by p.user_id`,
    ids,
  );
  for (const r of classes) Object.assign(out[r.id]!, { upcoming: r.upcoming, nextAt: r.next_at ? new Date(r.next_at).toISOString() : null });

  if (teacher) {
    // Active students: assigned to them, or in one of their classes since 30 days ago (each student counted once).
    const pairs = await ctx.db.query<{ teacher_id: string; student_id: string }>(
      `select e.owner_id as teacher_id, p.user_id as student_id from calendar.events e join calendar.event_participants p on p.event_id = e.id
        where e.status = 'confirmed' and e.owner_id = any($1::uuid[]) and e.end_at > now() - interval '30 days' and p.user_id is not null
       union
       select teacher_id, student_id from calendar.student_teacher where ended_at is null and teacher_id = any($1::uuid[])`,
      ids,
    );
    const seen = new Map<string, Set<string>>();
    for (const r of pairs) seen.set(r.teacher_id, (seen.get(r.teacher_id) ?? new Set()).add(r.student_id));
    for (const [id, set] of seen) out[id]!.students = set.size;
  } else {
    const rows = await ctx.db.query<{ student_id: string; teacher_id: string; teacher_name: string | null; teacher_email: string }>(
      'select student_id, teacher_id, teacher_name, teacher_email from calendar.student_teacher where ended_at is null and student_id = any($1::uuid[])', ids);
    for (const r of rows) out[r.student_id]!.teacher = { id: r.teacher_id, name: r.teacher_name, email: r.teacher_email };
  }
  return out;
}
