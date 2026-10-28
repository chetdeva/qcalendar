import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, beforeEach, describe, it } from 'node:test';
import { addMonths, balance, release, reserve, sweepExpired, topUpAnnual } from './credits.ts';
import { createPgliteDb, migrate, type Db } from './db.ts';
import { createFakeGateway } from './gateways/fake.ts';
import type { Interval, NormalizedEvent } from './gateway.ts';
import { getPlan, planForGrade, priceCents } from './plans.ts';
import { applyEvent, gradeChanged } from './subscriptions.ts';

const db: Db = createPgliteDb();
const fake = createFakeGateway();
const T0 = new Date('2030-01-10T12:00:00Z');
const day = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
let n = 0;

const paid = (userId: string, o: { sub?: string; plan?: string; interval?: Interval; start?: Date; eventId?: string } = {}): Extract<NormalizedEvent, { type: 'payment_succeeded' }> => {
  const interval = o.interval ?? 'month';
  const start = o.start ?? T0;
  return {
    type: 'payment_succeeded', gateway: 'fake', eventId: o.eventId ?? `evt_${++n}`, userId, customerRef: `cus_${userId}`,
    subscriptionRef: o.sub ?? `sub_${userId}`, planKey: o.plan ?? 'g5_7', interval, periodStart: start,
    periodEnd: addMonths(start, interval === 'month' ? 1 : 12), amountCents: 35000, currency: 'usd',
  };
};

before(async () => { await migrate(db); });
beforeEach(async () => {
  await db.exec('truncate billing.credit_ledger, billing.credit_grants, billing.subscriptions, billing.customers, billing.webhook_events, billing.trials restart identity cascade');
  fake.calls.length = 0;
});

describe('pricing', () => {
  it('maps grade to band and prices annual at 12 months less 20%', async () => {
    assert.equal((await planForGrade(db, 1))!.key, 'g1_4');
    assert.equal((await planForGrade(db, 7))!.key, 'g5_7');
    assert.equal((await planForGrade(db, 10))!.key, 'g8_10');
    assert.equal(await planForGrade(db, 11), undefined);
    const price = async (k: string, i: Interval) => priceCents(await getPlan(db, k), i);
    assert.equal(await price('g1_4', 'month'), 30000);
    assert.equal(await price('g1_4', 'year'), 288000);
    assert.equal(await price('g5_7', 'year'), 336000);
    assert.equal(await price('g8_10', 'year'), 384000);
  });
});

describe('trial', () => {
  it('first lesson is free once, then a subscription is required', async () => {
    const u = randomUUID();
    assert.deepEqual(await reserve(db, u, 'lesson-1', T0), { ok: true, source: 'trial' });
    assert.deepEqual(await reserve(db, u, 'lesson-1', T0), { ok: true, source: 'trial' }); // idempotent
    assert.deepEqual(await reserve(db, u, 'lesson-2', T0), { ok: false, code: 'subscription_required' });
  });
  it('cancelling the trial lesson gives the trial back', async () => {
    const u = randomUUID();
    await reserve(db, u, 'lesson-1', T0);
    await release(db, u, 'lesson-1');
    assert.deepEqual(await reserve(db, u, 'lesson-2', T0), { ok: true, source: 'trial' });
  });
});

describe('monthly plan', () => {
  it('payment grants 15 credits; each lesson spends one; no more than 15', async () => {
    const u = randomUUID();
    assert.equal(await applyEvent(db, paid(u)), 'applied');
    assert.equal((await balance(db, u, T0)).remaining, 15);
    for (let i = 0; i < 15; i++) assert.deepEqual(await reserve(db, u, `l${i}`, T0), { ok: true, source: 'credit' });
    assert.deepEqual(await reserve(db, u, 'l15', T0), { ok: false, code: 'no_credits' });
    assert.equal((await balance(db, u, T0)).remaining, 0);
  });
  it('reserving the same lesson twice spends one credit; release is idempotent and refunds once', async () => {
    const u = randomUUID();
    await applyEvent(db, paid(u));
    await reserve(db, u, 'a', T0); await reserve(db, u, 'a', T0);
    assert.equal((await balance(db, u, T0)).remaining, 14);
    await release(db, u, 'a'); await release(db, u, 'a');
    assert.equal((await balance(db, u, T0)).remaining, 15);
    await reserve(db, u, 'a', T0); // the lesson is booked again
    assert.equal((await balance(db, u, T0)).remaining, 14);
  });
  it('a replayed webhook does not grant twice', async () => {
    const u = randomUUID();
    const e = paid(u);
    assert.equal(await applyEvent(db, e), 'applied');
    assert.equal(await applyEvent(db, e), 'duplicate');
    assert.equal((await balance(db, u, T0)).remaining, 15);
  });
  it('credits do not roll over: renewal gives a fresh 15 and the old block expires', async () => {
    const u = randomUUID();
    await applyEvent(db, paid(u));
    await reserve(db, u, 'a', T0);
    const next = addMonths(T0, 1);
    assert.equal((await balance(db, u, next)).remaining, 0); // expired at period end, before renewal lands
    await applyEvent(db, paid(u, { start: next }));
    assert.equal((await balance(db, u, next)).remaining, 15);
    assert.equal(await sweepExpired(db, next), 1);
    assert.equal(await sweepExpired(db, next), 0); // nothing left to write
    assert.equal((await balance(db, u, next)).remaining, 15);
  });
  it('spends the soonest-expiring block first', async () => {
    const u = randomUUID();
    await applyEvent(db, paid(u));
    await db.query(`insert into billing.credit_grants (user_id, subscription_id, period_start, period_end, credits, source)
      select user_id, id, $2, $3, 3, 'admin' from billing.subscriptions where user_id = $1`, [u, day(T0, -1), day(T0, 5)]);
    const [g] = await db.query<{ id: string }>(`select id from billing.credit_grants where source = 'admin'`);
    await db.query(`insert into billing.credit_ledger (user_id, grant_id, delta, reason, idempotency_key) values ($1, $2, 3, 'grant', 'g-admin')`, [u, g!.id]);
    await reserve(db, u, 'x', T0);
    const [row] = await db.query<{ grant_id: string }>(`select grant_id from billing.credit_ledger where reason = 'use'`);
    assert.equal(row!.grant_id, g!.id);
  });
});

describe('failed payment and cancellation', () => {
  it('past_due blocks new lessons; the next successful payment restores them', async () => {
    const u = randomUUID();
    await applyEvent(db, paid(u));
    await applyEvent(db, { type: 'payment_failed', gateway: 'fake', eventId: 'f1', subscriptionRef: `sub_${u}` });
    assert.deepEqual(await reserve(db, u, 'a', T0), { ok: false, code: 'payment_required' });
    await applyEvent(db, paid(u, { start: addMonths(T0, 1) }));
    assert.deepEqual(await reserve(db, u, 'a', addMonths(T0, 1)), { ok: true, source: 'credit' });
  });
  it('a cancelled subscription keeps its paid-for credits until they expire', async () => {
    const u = randomUUID();
    await applyEvent(db, paid(u));
    await applyEvent(db, { type: 'subscription_canceled', gateway: 'fake', eventId: 'c1', subscriptionRef: `sub_${u}` });
    assert.deepEqual(await reserve(db, u, 'a', T0), { ok: true, source: 'credit' });
    assert.deepEqual(await reserve(db, u, 'b', addMonths(T0, 2)), { ok: false, code: 'no_credits' });
  });
  it('a subscriber who never used the trial still pays with credits, not the free trial', async () => {
    const u = randomUUID();
    await applyEvent(db, paid(u));
    assert.deepEqual(await reserve(db, u, 'a', T0), { ok: true, source: 'credit' });
  });
});

describe('annual plan', () => {
  it('one payment, 15 credits per month via the daily top-up, caught up if a day is missed', async () => {
    const u = randomUUID();
    await applyEvent(db, paid(u, { interval: 'year' }));
    assert.equal((await balance(db, u, T0)).remaining, 15); // month 1 from the payment
    for (let i = 0; i < 6; i++) await reserve(db, u, `m1-${i}`, T0);
    assert.equal(await topUpAnnual(db, T0), 0); // month 1 already there
    const m3 = addMonths(T0, 2); // two renewals' worth of days passed with the job down
    assert.equal(await topUpAnnual(db, m3), 2);
    assert.equal(await topUpAnnual(db, m3), 0); // safe to repeat
    assert.equal((await balance(db, u, m3)).remaining, 15); // month 1 expired, 6 unused do not roll over
  });
});

describe('grade changes', () => {
  it('moving into a higher band changes the price at the next renewal, not before', async () => {
    const u = randomUUID();
    await applyEvent(db, paid(u, { plan: 'g5_7' }));
    assert.deepEqual(await gradeChanged(db, fake.gateway, u, 8), { pendingPlan: 'g8_10' });
    assert.deepEqual(fake.calls.map((c) => c.method), ['changePlan']);
    assert.equal((fake.calls[0]!.args as any).amountCents, 40000);
    const [mid] = await db.query<{ plan_key: string; next_plan_key: string }>('select plan_key, next_plan_key from billing.subscriptions');
    assert.deepEqual(mid, { plan_key: 'g5_7', next_plan_key: 'g8_10' });
    await applyEvent(db, paid(u, { plan: 'g8_10', start: addMonths(T0, 1) }));
    const [after] = await db.query<{ plan_key: string; next_plan_key: string | null }>('select plan_key, next_plan_key from billing.subscriptions');
    assert.deepEqual(after, { plan_key: 'g8_10', next_plan_key: null });
  });
  it('moving back before renewal cancels the pending change; same band is a no-op', async () => {
    const u = randomUUID();
    await applyEvent(db, paid(u, { plan: 'g5_7' }));
    await gradeChanged(db, fake.gateway, u, 8);
    assert.deepEqual(await gradeChanged(db, fake.gateway, u, 6), { pendingPlan: null });
    assert.equal(fake.calls.length, 2);
    assert.deepEqual(await gradeChanged(db, fake.gateway, u, 6), { pendingPlan: null });
    assert.equal(fake.calls.length, 2);
  });
  it('without a subscription there is nothing to change', async () => {
    assert.deepEqual(await gradeChanged(db, fake.gateway, randomUUID(), 9), { pendingPlan: null });
  });
});

describe('gateway contract (fake)', () => {
  it('rejects a bad signature and ignores unknown events', () => {
    assert.throws(() => fake.gateway.parseWebhook({ rawBody: '{}', headers: {} }), /signature/);
    assert.equal(fake.gateway.parseWebhook({ rawBody: '{}', headers: { 'x-fake-signature': 'fake-secret' } }), null);
  });
  it('round-trips a payment_succeeded event with real Dates', () => {
    const e = paid(randomUUID());
    const { gateway: _g, ...body } = e;
    const parsed = fake.gateway.parseWebhook(fake.deliver(body)) as typeof e;
    assert.equal(parsed.type, 'payment_succeeded');
    assert.ok(parsed.periodStart instanceof Date && parsed.periodEnd instanceof Date);
  });
});
