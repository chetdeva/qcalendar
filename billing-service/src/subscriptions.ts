import { grantCredits, addMonths } from './credits.ts';
import type { Db, Queryable } from './db.ts';
import type { NormalizedEvent, PaymentGateway } from './gateway.ts';
import { getPlan, planForGrade, priceCents } from './plans.ts';

export type Applied = 'applied' | 'duplicate' | 'ignored';

const OPEN = ['started', 'authenticated', 'activated'];

/** The one place gateway events change our books. Replays are harmless: each event id is processed once. */
export function applyEvent(db: Db, e: NormalizedEvent): Promise<Applied> {
  return db.tx(async (q) => {
    const fresh = await q.query('insert into billing.webhook_events (gateway, event_id) values ($1, $2) on conflict do nothing returning event_id', [e.gateway, e.eventId]);
    if (!fresh.length) return 'duplicate';

    if (e.type === 'payment_attempt_failed') {
      // Only an attempt still open (checkout) ends here. A failed renewal is reported, and recorded, by the subscription events.
      const ended = e.subscriptionRef
        ? await q.query(`update billing.payments set status = 'failed', updated_at = now() where gateway = $1 and gateway_ref = $2 and status = any($3::text[]) returning id`, [e.gateway, e.subscriptionRef, OPEN])
        : [];
      return ended.length ? 'applied' : 'ignored';
    }

    if (e.type === 'payment_progress') {
      // Only forward: a late "authenticated" must not undo "activated".
      const from = e.step === 'authenticated' ? ['started'] : ['started', 'authenticated'];
      const moved = await q.query(
        `update billing.payments set status = $3, updated_at = now() where gateway = $1 and gateway_ref = $2 and status = any($4::text[]) returning id`,
        [e.gateway, e.subscriptionRef, e.step, from],
      );
      return moved.length ? 'applied' : 'ignored';
    }

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
      // The first payment finishes the row checkout opened; a renewal has none open and adds its own.
      const settled = await q.query(
        `update billing.payments set status = 'succeeded', subscription_id = $3, event_id = $4, amount_cents = $5, currency = $6, plan_key = $7, interval = $8, updated_at = now()
         where id = (select id from billing.payments where gateway = $1 and gateway_ref = $2 and status = any($9::text[]) order by created_at desc limit 1) returning id`,
        [e.gateway, e.subscriptionRef, id, e.eventId, e.amountCents, e.currency, plan.key, e.interval, OPEN],
      );
      if (!settled.length) {
        await q.query(
          `insert into billing.payments (user_id, subscription_id, gateway, gateway_ref, event_id, status, amount_cents, currency, plan_key, interval) values ($1, $2, $3, $4, $5, 'succeeded', $6, $7, $8, $9)`,
          [e.userId, id, e.gateway, e.subscriptionRef, e.eventId, e.amountCents, e.currency, plan.key, e.interval],
        );
      }
      // Monthly: this payment buys this period. Annual: it buys the first month; topUpAnnual adds the rest.
      const end = e.interval === 'month' ? e.periodEnd : addMonths(e.periodStart, 1);
      await grantCredits(q, { userId: e.userId, subscriptionId: id, start: e.periodStart, end: end < e.periodEnd ? end : e.periodEnd, credits: plan.credits_per_month, source: 'payment' });
      return 'applied';
    }

    const status = e.type === 'payment_failed' ? 'past_due' : 'canceled';
    const rows = await q.query<{ id: string; user_id: string; plan_key: string; interval: string }>(
      `update billing.subscriptions set status = $3 where gateway = $1 and gateway_ref = $2 and status <> 'canceled' returning id, user_id, plan_key, interval`,
      [e.gateway, e.subscriptionRef, status],
    );
    // The payment ends too: the checkout row that was still open, or (a renewal) a new row for the failed attempt.
    const ended = await q.query(
      `update billing.payments set status = $3, updated_at = now() where gateway = $1 and gateway_ref = $2 and status = any($4::text[]) returning id`,
      [e.gateway, e.subscriptionRef, e.type === 'payment_failed' ? 'failed' : 'cancelled', OPEN],
    );
    if (e.type === 'payment_failed' && !ended.length) {
      for (const r of rows) {
        await q.query(
          `insert into billing.payments (user_id, subscription_id, gateway, gateway_ref, event_id, status, plan_key, interval) values ($1, $2, $3, $4, $5, 'failed', $6, $7)`,
          [r.user_id, r.id, e.gateway, e.subscriptionRef, e.eventId, r.plan_key, r.interval],
        );
      }
    }
    return rows.length || ended.length ? 'applied' : 'ignored';
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
