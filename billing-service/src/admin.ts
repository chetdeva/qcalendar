import type { Db, Queryable } from './db.ts';
import { HttpError } from './errors.ts';

const lock = (q: Queryable, key: string) => q.query('select pg_advisory_xact_lock(hashtext($1))', [key]);

export interface Adjustment { userId: string; kind: 'student' | 'teacher'; delta: number; reason: string; requestId: string; days?: number; actorEmail?: string }

/**
 * Adds or removes credits by hand. `reason` is required and kept with the row, as is who did it. Asking again with the same
 * requestId changes nothing. Students: an addition is a new block that expires after `days` (no rollover, like every block);
 * a deduction takes from the blocks that expire soonest and cannot take more than they hold. Teachers: a row in their earnings.
 */
export function adjustCredits(db: Db, a: Adjustment, now = new Date()): Promise<{ applied: boolean }> {
  return db.tx(async (q) => {
    await lock(q, a.userId);
    const key = `admin:${a.requestId}`;
    if (a.kind === 'teacher') {
      const [unsettled] = await q.query<{ n: number }>('select coalesce(sum(credits), 0)::int as n from billing.teacher_earnings where teacher_id = $1 and payout_id is null', [a.userId]);
      const added = await q.query(
        `insert into billing.teacher_earnings (teacher_id, ref, credits, kind, note, actor_email) values ($1, $2, $3, 'admin', $4, $5) on conflict (ref) do nothing returning id`,
        [a.userId, key, a.delta, a.reason, a.actorEmail ?? null],
      );
      if (added.length === 0) return { applied: false };
      if (unsettled!.n + a.delta < 0) throw new HttpError(409, 'insufficient_credits', 'That would take the unsettled credits below zero');
      return { applied: true };
    }

    if ((await q.query('select 1 from billing.credit_ledger where idempotency_key like $1', [`${key}%`])).length) return { applied: false };
    if (a.delta > 0) {
      const end = new Date(now.getTime() + (a.days ?? 30) * 86_400_000);
      const [g] = await q.query<{ id: string }>(
        `insert into billing.credit_grants (user_id, subscription_id, period_start, period_end, credits, source) values ($1, null, $2, $3, $4, 'admin') returning id`,
        [a.userId, now, end, a.delta],
      );
      await q.query(
        `insert into billing.credit_ledger (user_id, grant_id, delta, reason, idempotency_key, note, actor_email) values ($1, $2, $3, 'admin', $4, $5, $6)`,
        [a.userId, g!.id, a.delta, `${key}:0`, a.reason, a.actorEmail ?? null],
      );
      return { applied: true };
    }

    let need = -a.delta;
    const blocks = await q.query<{ id: string; rem: number }>(
      `select g.id, sum(l.delta)::int as rem from billing.credit_grants g join billing.credit_ledger l on l.grant_id = g.id
        where g.user_id = $1 and g.period_start <= $2 and g.period_end > $2 group by g.id, g.period_end having sum(l.delta) > 0 order by g.period_end`,
      [a.userId, now],
    );
    if (blocks.reduce((n, b) => n + b.rem, 0) < need) throw new HttpError(409, 'insufficient_credits', 'This student does not have that many credits to remove');
    let i = 0;
    for (const b of blocks) {
      if (need === 0) break;
      const take = Math.min(b.rem, need);
      await q.query(
        `insert into billing.credit_ledger (user_id, grant_id, delta, reason, idempotency_key, note, actor_email) values ($1, $2, $3, 'admin', $4, $5, $6)`,
        [a.userId, b.id, -take, `${key}:${i++}`, a.reason, a.actorEmail ?? null],
      );
      need -= take;
    }
    return { applied: true };
  });
}

/** Everything that has happened to a person's credits, newest first. */
export async function history(db: Db, userId: string, kind: 'student' | 'teacher', limit: number, offset: number) {
  if (kind === 'teacher') {
    const rows = await db.query<{ id: string; credits: number; kind: string; note: string | null; actor_email: string | null; earned_at: Date; payout_id: string | null }>(
      'select id, credits, kind, note, actor_email, earned_at, payout_id from billing.teacher_earnings where teacher_id = $1 order by earned_at desc, id desc limit $2 offset $3', [userId, limit, offset]);
    return rows.map((r) => ({ id: Number(r.id), delta: r.credits, kind: r.kind === 'class' ? 'class taught' : 'adjustment', note: r.note, by: r.actor_email, at: r.earned_at, settled: r.payout_id !== null }));
  }
  const rows = await db.query<{ id: string; delta: number; reason: string; note: string | null; actor_email: string | null; created_at: Date }>(
    'select id, delta, reason, note, actor_email, created_at from billing.credit_ledger where user_id = $1 order by created_at desc, id desc limit $2 offset $3', [userId, limit, offset]);
  return rows.map((r) => ({ id: Number(r.id), delta: r.delta, kind: r.reason, note: r.note, by: r.actor_email, at: r.created_at }));
}

/** One credit earned for a student's seat in a class the teacher taught. Called by calendar-service; asking again is harmless. */
export async function recordEarning(db: Db, e: { teacherId: string; ref: string; earnedAt: Date }): Promise<boolean> {
  const r = await db.query('insert into billing.teacher_earnings (teacher_id, ref, credits, kind, earned_at) values ($1, $2, 1, \'class\', $3) on conflict (ref) do nothing returning id', [e.teacherId, `class:${e.ref}`, e.earnedAt]);
  return r.length > 0;
}

/** Credits owed, the rate, what that comes to, and past payouts. */
export async function payoutSummary(db: Db, teacherId: string) {
  const [owed] = await db.query<{ n: number }>('select coalesce(sum(credits), 0)::int as n from billing.teacher_earnings where teacher_id = $1 and payout_id is null', [teacherId]);
  const [rate] = await db.query<{ rate_cents: number; currency: string }>('select rate_cents, currency from billing.teacher_rates where teacher_id = $1', [teacherId]);
  const payouts = await db.query<{ id: string; credits: number; rate_cents: number; currency: string; amount_cents: string; reference: string; notes: string | null; paid_at: Date; paid_by: string | null }>(
    'select * from billing.payouts where teacher_id = $1 order by paid_at desc', [teacherId]);
  return {
    unsettledCredits: owed!.n,
    rate: rate ? { rateCents: rate.rate_cents, currency: rate.currency } : null,
    amountCents: rate ? owed!.n * rate.rate_cents : null,
    payouts: payouts.map((p) => ({ id: p.id, credits: p.credits, rateCents: p.rate_cents, currency: p.currency, amountCents: Number(p.amount_cents), reference: p.reference, notes: p.notes, paidAt: p.paid_at, paidBy: p.paid_by })),
  };
}

export async function setRate(db: Db, teacherId: string, r: { rateCents: number; currency: string; by?: string }) {
  await db.query(
    `insert into billing.teacher_rates (teacher_id, rate_cents, currency, updated_by) values ($1, $2, $3, $4)
     on conflict (teacher_id) do update set rate_cents = excluded.rate_cents, currency = excluded.currency, updated_by = excluded.updated_by, updated_at = now()`,
    [teacherId, r.rateCents, r.currency.toUpperCase(), r.by ?? null],
  );
}

/**
 * Settles everything owed to a teacher in one go: records a payout with the rate as it is now and marks each earning with it.
 * This only records that the money was paid (the reference is the admin's bank/transfer reference); nothing is moved.
 */
export function settle(db: Db, teacherId: string, p: { reference: string; notes?: string; by?: string }) {
  return db.tx(async (q) => {
    await lock(q, `payout:${teacherId}`);
    const [owed] = await q.query<{ n: number }>('select coalesce(sum(credits), 0)::int as n from billing.teacher_earnings where teacher_id = $1 and payout_id is null', [teacherId]);
    if (owed!.n <= 0) throw new HttpError(409, 'nothing_to_settle', 'There are no unsettled credits to pay out');
    const [rate] = await q.query<{ rate_cents: number; currency: string }>('select rate_cents, currency from billing.teacher_rates where teacher_id = $1', [teacherId]);
    if (!rate) throw new HttpError(409, 'rate_required', 'Set this teacher\'s rate per credit first');
    const [row] = await q.query<{ id: string; paid_at: Date }>(
      `insert into billing.payouts (teacher_id, credits, rate_cents, currency, amount_cents, reference, notes, paid_by) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, paid_at`,
      [teacherId, owed!.n, rate.rate_cents, rate.currency, owed!.n * rate.rate_cents, p.reference, p.notes ?? null, p.by ?? null],
    );
    await q.query('update billing.teacher_earnings set payout_id = $2 where teacher_id = $1 and payout_id is null', [teacherId, row!.id]);
    return { id: row!.id, credits: owed!.n, rateCents: rate.rate_cents, currency: rate.currency, amountCents: owed!.n * rate.rate_cents, reference: p.reference, paidAt: row!.paid_at };
  });
}
