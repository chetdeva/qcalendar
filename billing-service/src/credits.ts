import type { Db, Queryable } from './db.ts';

/** UTC calendar-month arithmetic that clamps the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  const day = d.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + n);
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
}

export type Reservation =
  | { ok: true; source: 'trial' | 'credit' }
  | { ok: false; code: 'subscription_required' | 'payment_required' | 'no_credits' };

const lock = (q: Queryable, userId: string) => q.query('select pg_advisory_xact_lock(hashtext($1))', [userId]);

/** Adds a block of credits. A second call for the same (subscription, period_start) does nothing. */
export async function grantCredits(
  q: Queryable,
  g: { userId: string; subscriptionId: string; start: Date; end: Date; credits: number; source: 'payment' | 'annual_topup' | 'admin' },
): Promise<boolean> {
  const [row] = await q.query<{ id: string }>(
    `insert into billing.credit_grants (user_id, subscription_id, period_start, period_end, credits, source)
     values ($1, $2, $3, $4, $5, $6) on conflict (subscription_id, period_start) do nothing returning id`,
    [g.userId, g.subscriptionId, g.start, g.end, g.credits, g.source],
  );
  if (!row) return false;
  await q.query(
    `insert into billing.credit_ledger (user_id, grant_id, delta, reason, idempotency_key) values ($1, $2, $3, 'grant', $4)`,
    [g.userId, row.id, g.credits, `grant:${row.id}`],
  );
  return true;
}

/** Credits that can be spent right now, soonest-to-expire first. */
async function spendable(q: Queryable, userId: string, now: Date) {
  const [g] = await q.query<{ id: string }>(
    `select g.id from billing.credit_grants g join billing.credit_ledger l on l.grant_id = g.id
     where g.user_id = $1 and g.period_start <= $2 and g.period_end > $2
     group by g.id, g.period_end having sum(l.delta) > 0 order by g.period_end limit 1`,
    [userId, now],
  );
  return g;
}

async function refState(q: Queryable, userId: string, ref: string) {
  const [c] = await q.query<{ uses: number; refunds: number }>(
    `select (count(*) filter (where reason = 'use'))::int as uses, (count(*) filter (where reason = 'refund'))::int as refunds
     from billing.credit_ledger where user_id = $1 and ref = $2`,
    [userId, ref],
  );
  const trial = (await q.query('select 1 from billing.trials where user_id = $1 and event_id = $2', [userId, ref])).length > 0;
  return { ...c!, trial };
}

/**
 * Pays for one lesson (ref = a stable id for lesson + student). Idempotent: asking again for a lesson that is already
 * paid for succeeds without spending twice. Someone who never subscribed can only book the free trial class (`trial`: the
 * lesson is a Trial session), once; any other lesson needs a subscription.
 */
export function reserve(db: Db, userId: string, ref: string, now = new Date(), endsAt?: Date, trial = false): Promise<Reservation> {
  return db.tx(async (q) => {
    await lock(q, userId);
    const st = await refState(q, userId, ref);
    if (st.trial) return { ok: true, source: 'trial' };
    if (st.uses > st.refunds) return { ok: true, source: 'credit' };

    const [sub] = await q.query<{ status: string }>('select status from billing.subscriptions where user_id = $1 order by created_at desc limit 1', [userId]);
    if (!sub) {
      if (!trial) return { ok: false, code: 'subscription_required' };
      const [t] = await q.query('insert into billing.trials (user_id, event_id, lesson_end) values ($1, $2, $3) on conflict do nothing returning user_id', [userId, ref, endsAt ?? null]);
      return t ? { ok: true, source: 'trial' } : { ok: false, code: 'subscription_required' };
    }
    if (sub.status === 'past_due') return { ok: false, code: 'payment_required' };
    const g = await spendable(q, userId, now);
    if (!g) return { ok: false, code: 'no_credits' };
    await q.query(
      `insert into billing.credit_ledger (user_id, grant_id, delta, reason, ref, idempotency_key) values ($1, $2, -1, 'use', $3, $4)`,
      [userId, g.id, ref, `use:${ref}:${st.uses + 1}`],
    );
    return { ok: true, source: 'credit' };
  });
}

/** Gives the credit (or the trial) back for a lesson that was cancelled or dropped. Idempotent. */
export function release(db: Db, userId: string, ref: string): Promise<void> {
  return db.tx(async (q) => {
    await lock(q, userId);
    const st = await refState(q, userId, ref);
    if (st.trial) {
      await q.query('delete from billing.trials where user_id = $1 and event_id = $2', [userId, ref]);
      return;
    }
    if (st.uses <= st.refunds) return;
    const [last] = await q.query<{ grant_id: string }>(
      `select grant_id from billing.credit_ledger where user_id = $1 and ref = $2 and reason = 'use' order by id desc limit 1`,
      [userId, ref],
    );
    await q.query(
      `insert into billing.credit_ledger (user_id, grant_id, delta, reason, ref, idempotency_key) values ($1, $2, 1, 'refund', $3, $4)`,
      [userId, last!.grant_id, ref, `refund:${ref}:${st.refunds + 1}`],
    );
  });
}

/** Unexpired credits and when the soonest block runs out. */
export async function balance(q: Queryable, userId: string, now = new Date()) {
  const rows = await q.query<{ rem: number; period_end: Date }>(
    `select sum(l.delta)::int as rem, g.period_end from billing.credit_grants g join billing.credit_ledger l on l.grant_id = g.id
     where g.user_id = $1 and g.period_start <= $2 and g.period_end > $2 group by g.id, g.period_end having sum(l.delta) > 0 order by g.period_end`,
    [userId, now],
  );
  return { remaining: rows.reduce((n, r) => n + r.rem, 0), expiresAt: rows[0]?.period_end ?? null };
}

/** Writes an expiry row for every block whose period ended with credits unused (the books show where they went). */
export async function sweepExpired(db: Db, now = new Date()): Promise<number> {
  const rows = await db.query<{ id: string; user_id: string; rem: number }>(
    `select g.id, g.user_id, sum(l.delta)::int as rem from billing.credit_grants g join billing.credit_ledger l on l.grant_id = g.id
     where g.period_end <= $1 group by g.id, g.user_id having sum(l.delta) > 0`,
    [now],
  );
  for (const r of rows) {
    await db.query(
      `insert into billing.credit_ledger (user_id, grant_id, delta, reason, idempotency_key) values ($1, $2, $3, 'expiry', $4) on conflict do nothing`,
      [r.user_id, r.id, -r.rem, `expiry:${r.id}`],
    );
  }
  return rows.length;
}

/**
 * Annual plans pay once but still get 15 credits per month: run daily. Creates every month's block that has started
 * and not yet been granted (so a missed day is caught up). Safe to run repeatedly.
 */
export async function topUpAnnual(db: Db, now = new Date()): Promise<number> {
  const subs = await db.query<{ id: string; user_id: string; plan_key: string; current_period_start: Date; current_period_end: Date }>(
    `select s.id, s.user_id, s.plan_key, s.current_period_start, s.current_period_end from billing.subscriptions s
     where s.interval = 'year' and (s.status = 'active' or (s.status = 'canceled' and s.cancel_at_period_end)) and s.current_period_end > $1`,
    [now],
  );
  let made = 0;
  for (const s of subs) {
    const [plan] = await db.query<{ credits_per_month: number }>('select credits_per_month from billing.plans where key = $1', [s.plan_key]);
    for (let k = 0; ; k++) {
      const start = addMonths(s.current_period_start, k);
      if (start > now || start >= s.current_period_end) break;
      const end = addMonths(s.current_period_start, k + 1);
      if (await db.tx((q) => grantCredits(q, { userId: s.user_id, subscriptionId: s.id, start, end: end < s.current_period_end ? end : s.current_period_end, credits: plan!.credits_per_month, source: 'annual_topup' }))) made++;
    }
  }
  return made;
}
