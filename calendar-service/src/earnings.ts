import type { Ctx } from './events.ts';

/**
 * Tells billing-service about every student seat in a tutoring or trial class that has ended and not been reported yet (the
 * teacher earns one credit each). Seats of declined invitations do not count. Safe to run any time and as often as you like:
 * a seat is marked only after billing has it, and billing ignores a seat it already has. Stops at the first failure and tries again later.
 */
export async function recordEarnings(ctx: Ctx, now = new Date(), batch = 200): Promise<number> {
  if (!ctx.billing) return 0;
  const rows = await ctx.db.query<{ id: string; event_id: string; owner_id: string; end_at: Date | string; user_id: string | null; email: string }>(
    `select p.id, p.event_id, e.owner_id, e.end_at, p.user_id, p.email
       from calendar.event_participants p join calendar.events e on e.id = p.event_id
      where p.earned_at is null and e.status = 'confirmed' and e.category in ('tutoring', 'trial') and e.end_at <= $1 and p.status <> 'declined'
      order by e.end_at limit $2`,
    [now, batch],
  );
  let done = 0;
  for (const r of rows) {
    await ctx.billing.earn(r.owner_id, `${r.event_id}:${r.user_id ?? r.email}`, new Date(r.end_at).toISOString());
    await ctx.db.query('update calendar.event_participants set earned_at = now() where id = $1', [r.id]);
    done++;
  }
  return done;
}
