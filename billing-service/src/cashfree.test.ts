import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { describe, it, beforeEach } from 'node:test';
import { addMonths, balance, topUpAnnual } from './credits.ts';
import { createPgliteDb, migrate } from './db.ts';
import { createCashfreeGateway } from './gateways/cashfree.ts';
import { applyEvent } from './subscriptions.ts';

const SECRET = 'cf_secret';
const calls: { method: string; url: string; body: any; headers: Record<string, string> }[] = [];
const fakeFetch = (async (url: string, init: RequestInit) => {
  calls.push({ method: init.method!, url: url.replace('https://sandbox.cashfree.com/pg', ''), body: init.body ? JSON.parse(init.body as string) : undefined, headers: init.headers as Record<string, string> });
  return new Response(JSON.stringify(url.endsWith('/subscriptions') ? { subscription_session_id: 'subs_token_abc', subscription_status: 'INITIALIZED' } : {}), { status: 200 });
}) as unknown as typeof fetch;
const gw = createCashfreeGateway({ clientId: 'id', clientSecret: SECRET, env: 'sandbox', currency: 'INR', defaultPhone: '9999999999', fetch: fakeFetch });
const USER = randomUUID();
const SUB = `qt-${USER}-middle-month-abcdef12`;

const signed = (type: string, data: object, { dot = false, event_time = '2030-01-10T12:00:00+05:30' } = {}) => {
  const rawBody = JSON.stringify({ type, event_time, data });
  const ts = '1893456000000';
  return { rawBody, headers: { 'x-webhook-timestamp': ts, 'x-webhook-signature': createHmac('sha256', SECRET).update(`${ts}${dot ? '.' : ''}${rawBody}`).digest('base64') } };
};
const charge = (over: object = {}) => ({ payment_id: 'p1', cf_payment_id: 555, subscription_id: SUB, payment_type: 'CHARGE', payment_amount: 350, payment_currency: 'INR', payment_status: 'SUCCESS', payment_schedule_date: '2030-01-10T00:00:00+05:30', ...over });

beforeEach(() => { calls.length = 0; });

describe('cashfree: requests', () => {
  it('checkout creates a periodic subscription with the buyer in its id, and sends the student to our checkout page', async () => {
    const r = await gw.createCheckout({ userId: USER, email: 'kid@example.test', planKey: 'middle', interval: 'month', amountCents: 35000, successUrl: 'https://accounts.example.test/billing?checkout=success', cancelUrl: 'x' });
    const c = calls[0]!;
    assert.equal(c.url, '/subscriptions');
    assert.equal(c.headers['x-client-id'], 'id');
    assert.equal(c.headers['x-client-secret'], SECRET);
    assert.match(c.body.subscription_id, new RegExp(`^qt-${USER}-middle-month-[0-9a-f]{8}$`));
    assert.deepEqual(c.body.plan_details, { plan_name: 'Quanttoria middle monthly', plan_type: 'PERIODIC', plan_currency: 'INR', plan_amount: 350, plan_max_amount: 700, plan_interval_type: 'MONTH', plan_intervals: 1, plan_max_cycles: 120 });
    assert.ok(Math.abs(Date.parse(c.body.subscription_first_charge_time) - (Date.now() + 24 * 3600_000)) < 60_000); // first charge tomorrow, not next month
    assert.equal(c.body.customer_details.customer_email, 'kid@example.test');
    assert.equal(c.body.subscription_meta.return_url, 'https://accounts.example.test/billing?checkout=success');
    assert.equal(r.url, 'https://accounts.example.test/billing/pay/cashfree?session=subs_token_abc&mode=sandbox');
  });
  it('annual uses a yearly interval; cancel and change-plan go through Manage Subscription', async () => {
    await gw.createCheckout({ userId: USER, email: undefined, planKey: 'high', interval: 'year', amountCents: 384000, successUrl: 'https://a.test/billing', cancelUrl: 'x' });
    assert.equal(calls[0]!.body.plan_details.plan_interval_type, 'YEAR');
    assert.equal(calls[0]!.body.plan_details.plan_amount, 3840);
    calls.length = 0;
    await gw.cancelSubscription({ subscriptionRef: SUB, atPeriodEnd: true });
    await gw.changePlan({ subscriptionRef: SUB, planKey: 'high', interval: 'month', amountCents: 40000 });
    assert.deepEqual(calls.map((c) => [c.method, c.url]), [['POST', `/subscriptions/${SUB}/manage`], ['POST', '/plans'], ['POST', `/subscriptions/${SUB}/manage`]]);
    assert.deepEqual(calls[0]!.body, { subscription_id: SUB, action: 'CANCEL' });
    assert.equal(calls[2]!.body.action, 'CHANGE_PLAN');
    assert.equal(calls[2]!.body.action_details.plan_id, calls[1]!.body.plan_id);
  });
  it('has no billing portal, and says so', async () => {
    await assert.rejects(gw.createPortalSession({ customerRef: 'c', returnUrl: 'r' }), /not available/);
  });
});

describe('cashfree: webhooks', () => {
  it('rejects a missing, wrong or tampered signature; accepts both documented signing formats', () => {
    const w = signed('SUBSCRIPTION_PAYMENT_SUCCESS', charge());
    assert.throws(() => gw.parseWebhook({ rawBody: w.rawBody, headers: {} }), /signature/);
    assert.throws(() => gw.parseWebhook({ rawBody: w.rawBody + ' ', headers: w.headers }), /signature/);
    assert.throws(() => gw.parseWebhook({ rawBody: w.rawBody, headers: { ...w.headers, 'x-webhook-timestamp': '1' } }), /signature/);
    assert.ok(gw.parseWebhook(w));
    assert.ok(gw.parseWebhook(signed('SUBSCRIPTION_PAYMENT_SUCCESS', charge(), { dot: true })));
  });
  it('a successful CHARGE becomes payment_succeeded, with the buyer and plan read from the subscription id', () => {
    const e = gw.parseWebhook(signed('SUBSCRIPTION_PAYMENT_SUCCESS', charge()));
    assert.deepEqual(e, {
      type: 'payment_succeeded', gateway: 'cashfree', eventId: 'payment:555', userId: USER, customerRef: SUB, subscriptionRef: SUB, planKey: 'middle', interval: 'month',
      periodStart: new Date('2030-01-10T00:00:00+05:30'), periodEnd: new Date('2030-02-09T18:30:00.000Z'), amountCents: 35000, currency: 'inr',
    });
  });
  it('the mandate authorisation payment is not a month of lessons', () => {
    assert.equal(gw.parseWebhook(signed('SUBSCRIPTION_PAYMENT_SUCCESS', charge({ payment_type: 'AUTH', payment_amount: 1 }))), null);
  });
  it('failures, holds and cancellations map to our events; other statuses and foreign subscriptions are ignored', () => {
    assert.equal(gw.parseWebhook(signed('SUBSCRIPTION_PAYMENT_FAILED', charge({ payment_status: 'FAILED' })))!.type, 'payment_failed');
    const status = (s: string) => gw.parseWebhook(signed('SUBSCRIPTION_STATUS_CHANGED', { subscription_details: { subscription_id: SUB, subscription_status: s } }));
    assert.equal(status('ON_HOLD')!.type, 'payment_failed');
    for (const s of ['CANCELLED', 'CUSTOMER_CANCELLED', 'EXPIRED', 'COMPLETED']) assert.equal(status(s)!.type, 'subscription_canceled');
    assert.equal(status('ACTIVE'), null);
    assert.equal(gw.parseWebhook(signed('SUBSCRIPTION_PAYMENT_SUCCESS', charge({ subscription_id: 'someone-elses-sub' }))), null);
    assert.equal(gw.parseWebhook(signed('SUBSCRIPTION_CARD_EXPIRY_REMINDER', charge())), null);
  });
  it('a charge delivered twice grants 15 classes once; an annual plan cancelled by the student keeps its paid months', async () => {
    const db = createPgliteDb();
    await migrate(db);
    const now = new Date();
    const user = randomUUID();
    const ref = `qt-${user}-middle-year-abcdef12`;
    const w = signed('SUBSCRIPTION_PAYMENT_SUCCESS', charge({ subscription_id: ref, payment_schedule_date: new Date(now.getTime() - 60_000).toISOString() }));
    assert.equal(await applyEvent(db, gw.parseWebhook(w)!), 'applied');
    assert.equal(await applyEvent(db, gw.parseWebhook(w)!), 'duplicate');
    assert.equal((await balance(db, user, now)).remaining, 15);
    await db.query(`update billing.subscriptions set cancel_at_period_end = true`);
    await applyEvent(db, gw.parseWebhook(signed('SUBSCRIPTION_STATUS_CHANGED', { subscription_details: { subscription_id: ref, subscription_status: 'CUSTOMER_CANCELLED' } }))!);
    const later = addMonths(now, 2);
    assert.equal(await topUpAnnual(db, later), 2); // months 2 and 3 are still delivered
    assert.equal((await balance(db, user, later)).remaining, 15);
    await db.close();
  });
});
