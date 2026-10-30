import { grantCredits, addMonths } from './credits.ts';
import type { Db, Queryable } from './db.ts';
import type { NormalizedEvent, PaymentGateway } from './gateway.ts';
import { getPlan, planForGrade, priceCents } from './plans.ts';

export type Applied = 'applied' | 'duplicate' | 'ignored';

/** The one place gateway events change our books. Replays are harmless: each event id is processed once. */
export function applyEvent(db: Db, e: NormalizedEvent): Promise<Applied> {
  return db.tx(async (q) => {
    const fresh = await q.query('insert into billing.webhook_events (gateway, event_id) values ($1, $2) on conflict do nothing returning event_id', [e.gateway, e.eventId]);
    if (!fresh.length) return 'duplicate';

    if (e.type === 'payment_succeeded') {
      await q.query(
        `insert into billing.customers (user_id, gateway, gateway_ref) values ($1, $2, $3)
         on conflict (user_id, gateway) do update set gateway_ref = excluded.gateway_ref`,
        [e.userId, e.gateway, e.customerRef],
      );
      const [existing] = await q.query<{ id: string; next_plan_key: string | null }>('select id, next_plan_key from billing.subscriptions where gateway = $1 and gateway_ref = $2', [e.gateway, e.subscriptionRef]);
      let id: string;
      if (existing) {
        id = existing.id;
        // A grade change that was waiting for this renewal takes effect now; otherwise the gateway's plan stands.
        await q.query(
          `update billing.subscriptions set status = 'active', plan_key = $2, next_plan_key = null, interval = $3, current_period_start = $4, current_period_end = $5 where id = $1`,
          [id, existing.next_plan_key ?? e.planKey, e.interval, e.periodStart, e.periodEnd],
        );
      } else {
        [{ id }] = await q.query<{ id: string }>(
          `insert into billing.subscriptions (user_id, plan_key, interval, status, gateway, gateway_ref, current_period_start, current_period_end)
           values ($1, $2, $3, 'active', $4, $5, $6, $7) returning id`,
          [e.userId, e.planKey, e.interval, e.gateway, e.subscriptionRef, e.periodStart, e.periodEnd],
        ) as [{ id: string }];
      }
      const plan = await getPlan(q, existing?.next_plan_key ?? e.planKey);
      // Monthly: this payment buys this period. Annual: it buys the first month; topUpAnnual adds the rest.
      const end = e.interval === 'month' ? e.periodEnd : addMonths(e.periodStart, 1);
      await grantCredits(q, { userId: e.userId, subscriptionId: id, start: e.periodStart, end: end < e.periodEnd ? end : e.periodEnd, credits: plan.credits_per_month, source: 'payment' });
      return 'applied';
    }

    const status = e.type === 'payment_failed' ? 'past_due' : 'canceled';
    const rows = await q.query(
      `update billing.subscriptions set status = $3 where gateway = $1 and gateway_ref = $2 and status <> 'canceled' returning id`,
      [e.gateway, e.subscriptionRef, status],
    );
    return rows.length ? 'applied' : 'ignored';
  });
}

/**
 * A student's grade changed. If it lands in another price band, the new price starts at the next renewal (never
 * mid-period) and the gateway is told. Moving back to the current band cancels the pending change.
 */
export async function gradeChanged(db: Db, gateway: PaymentGateway, userId: string, grade: number): Promise<{ pendingPlan: string | null }> {
  const target = await planForGrade(db, grade);
  if (!target) throw new Error(`no plan for grade ${grade}`);
  const [sub] = await db.query<{ id: string; plan_key: string; next_plan_key: string | null; interval: 'month' | 'year'; gateway: string; gateway_ref: string }>(
    `select id, plan_key, next_plan_key, interval, gateway, gateway_ref from billing.subscriptions where user_id = $1 and status in ('active', 'past_due')`,
    [userId],
  );
  if (!sub) return { pendingPlan: null };
  const next = target.key === sub.plan_key ? null : target.key;
  if (next === sub.next_plan_key) return { pendingPlan: next };
  await db.query('update billing.subscriptions set next_plan_key = $2 where id = $1', [sub.id, next]);
  const charge = await getPlan(db as Queryable, next ?? sub.plan_key);
  await gateway.changePlan({ subscriptionRef: sub.gateway_ref, planKey: charge.key, interval: sub.interval, amountCents: priceCents(charge, sub.interval) });
  return { pendingPlan: next };
}
