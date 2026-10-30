import type { Actor } from './auth.ts';
import type { Ctx } from './events.ts';
import { HttpError } from './errors.ts';

export function requireAdmin(actor: Actor) {
  if (actor.kind !== 'service' && actor.role !== 'admin') throw new HttpError(403, 'forbidden', 'Admins only');
}

export interface Summary {
  /** Teachers: distinct students in their classes from 30 days ago on. Students: always 0. */
  students: number;
  upcoming: number;
  nextAt: string | null;
}

/** What the admin portal's Teachers and Students tables show for a page of people (one query, not one per row). */
export async function adminSummary(ctx: Ctx, actor: Actor, input: { userIds: string[]; role: 'teacher' | 'student' }): Promise<Record<string, Summary>> {
  requireAdmin(actor);
  const out: Record<string, Summary> = Object.fromEntries(input.userIds.map((id) => [id, { students: 0, upcoming: 0, nextAt: null }]));
  const teacher = input.role === 'teacher';
  // A student's classes are the ones they are in (and have not declined); a teacher's are the ones they own.
  const rows = await ctx.db.query<{ id: string; upcoming: number; next_at: Date | string | null; students: number }>(
    teacher
      ? `select e.owner_id as id,
                count(*) filter (where e.start_at > now())::int as upcoming,
                min(e.start_at) filter (where e.start_at > now()) as next_at,
                (select count(distinct p.user_id) from calendar.events e2 join calendar.event_participants p on p.event_id = e2.id
                  where e2.owner_id = e.owner_id and e2.status = 'confirmed' and e2.end_at > now() - interval '30 days' and p.user_id is not null)::int as students
           from calendar.events e where e.status = 'confirmed' and e.owner_id = any($1::uuid[]) group by e.owner_id`
      : `select p.user_id as id, count(*) filter (where e.start_at > now())::int as upcoming, min(e.start_at) filter (where e.start_at > now()) as next_at, 0 as students
           from calendar.events e join calendar.event_participants p on p.event_id = e.id
          where e.status = 'confirmed' and p.status <> 'declined' and p.user_id = any($1::uuid[]) group by p.user_id`,
    [input.userIds],
  );
  for (const r of rows) out[r.id] = { students: r.students, upcoming: r.upcoming, nextAt: r.next_at ? new Date(r.next_at).toISOString() : null };
  return out;
}
