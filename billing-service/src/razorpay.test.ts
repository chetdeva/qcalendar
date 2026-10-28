import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { describe, it, beforeEach } from 'node:test';
import { balance } from './credits.ts';
import { createPgliteDb, migrate } from './db.ts';
import { createRazorpayGateway } from './gateways/razorpay.ts';
import { applyEvent } from './subscriptions.ts';

const SECRET = 'whsec_test';
const calls: { method: string; url: string; body: any; auth: string }[] = [];
const fakeFetch = (async (url: string, init: RequestInit) => {
  calls.push({ method: init.method!, url: url.replace('https://api.razorpay.com/v1', ''), body: init.body ? JSON.parse(init.body as string) : undefined, auth: (init.headers as Record<string, string>).authorization! });
  return new Response(JSON.stringify(url.endsWith('/plans') ? { id: 'plan_abc' } : url.endsWith('/subscriptions') ? { id: 'sub_abc', short_url: 'https://rzp.io/i/xyz' } : {}), { status: 200 });
}) as unknown as typeof fetch;
const gw = createRazorpayGateway({ keyId: 'rzp_test_id', keySecret: 'sec', webhookSecret: SECRET, currency: 'INR', fetch: fakeFetch });
const USER = randomUUID();
const START = Date.UTC(2030, 0, 10) / 1000;

const signed = (event: string, sub: object, payment?: object, eventId = 'evt_1') => {
  const rawBody = JSON.stringify({ event, created_at: START, payload: { subscription: { entity: sub }, ...(payment ? { payment: { entity: payment } } : {}) } });
  return { rawBody, headers: { 'x-razorpay-signature': createHmac('sha256', SECRET).update(rawBody).digest('hex'), 'x-razorpay-event-id': eventId } };
};
const subEntity = (over: object = {}) => ({ id: 'sub_abc', status: 'active', current_start: START, current_end: START + 30 * 86400, notes: { user_id: USER, plan_key: 'middle', interval: 'month' }, ...over });
const paid = { id: 'pay_1', amount: 35000, currency: 'INR' };

beforeEach(() => { calls.length = 0; });

describe('razorpay: requests', () => {
  it('checkout creates a plan and a subscription carrying the buyer in its notes, and returns the hosted page', async () => {
    const r = await gw.createCheckout({ userId: USER, email: 'kid@example.test', planKey: 'middle', interval: 'month', amountCents: 35000, successUrl: 'x', cancelUrl: 'x' });
    assert.deepEqual(calls.map((c) => [c.method, c.url]), [['POST', '/plans'], ['POST', '/subscriptions']]);
    assert.equal(calls[0]!.auth, `Basic ${Buffer.from('rzp_test_id:sec').toString('base64')}`);
    assert.deepEqual(calls[0]!.body, { period: 'monthly', interval: 1, item: { name: 'Quanttoria middle monthly', amount: 35000, currency: 'INR' } });
    assert.equal(calls[1]!.body.plan_id, 'plan_abc');
    assert.deepEqual(calls[1]!.body.notes, { user_id: USER, plan_key: 'middle', interval: 'month', email: 'kid@example.test' });
    assert.equal(r.url, 'https://rzp.io/i/xyz');
  });
  it('annual is a yearly plan; cancel can wait for the cycle end; a plan change takes effect at the cycle end', async () => {
    await gw.createCheckout({ userId: USER, email: undefined, planKey: 'high', interval: 'year', amountCents: 384000, successUrl: 'x', cancelUrl: 'x' });
    assert.equal(calls[0]!.body.period, 'yearly');
    calls.length = 0;
    await gw.cancelSubscription({ subscriptionRef: 'sub_abc', atPeriodEnd: true });
    await gw.cancelSubscription({ subscriptionRef: 'sub_abc', atPeriodEnd: false });
    await gw.changePlan({ subscriptionRef: 'sub_abc', planKey: 'high', interval: 'month', amountCents: 40000 });
    assert.deepEqual(calls.map((c) => [c.method, c.url]), [['POST', '/subscriptions/sub_abc/cancel'], ['POST', '/subscriptions/sub_abc/cancel'], ['POST', '/plans'], ['PATCH', '/subscriptions/sub_abc']]);
    assert.deepEqual([calls[0]!.body, calls[1]!.body], [{ cancel_at_cycle_end: 1 }, { cancel_at_cycle_end: 0 }]);
    assert.deepEqual(calls[3]!.body, { plan_id: 'plan_abc', schedule_change_at: 'cycle_end' });
  });
  it('has no billing portal, and says so', async () => {
    await assert.rejects(gw.createPortalSession({ customerRef: 'c', returnUrl: 'r' }), /not available/);
  });
});

describe('razorpay: webhooks', () => {
  it('rejects a missing, wrong or tampered signature', () => {
    const w = signed('subscription.charged', subEntity(), paid);
    assert.throws(() => gw.parseWebhook({ rawBody: w.rawBody, headers: {} }), /signature/);
    assert.throws(() => gw.parseWebhook({ rawBody: w.rawBody + ' ', headers: w.headers }), /signature/);
    assert.ok(gw.parseWebhook(w));
  });
  it('subscription.charged becomes payment_succeeded, with buyer, plan and period from the subscription', () => {
    assert.deepEqual(gw.parseWebhook(signed('subscription.charged', subEntity(), paid)), {
      type: 'payment_succeeded', gateway: 'razorpay', eventId: 'evt_1', userId: USER, customerRef: 'sub_abc', subscriptionRef: 'sub_abc', planKey: 'middle', interval: 'month',
      periodStart: new Date(START * 1000), periodEnd: new Date((START + 30 * 86400) * 1000), amountCents: 35000, currency: 'inr',
    });
  });
  it('failures and cancellations map to our events; foreign subscriptions and other events are ignored', () => {
    assert.equal(gw.parseWebhook(signed('subscription.pending', subEntity()))!.type, 'payment_failed');
    assert.equal(gw.parseWebhook(signed('subscription.halted', subEntity()))!.type, 'payment_failed');
    for (const e of ['subscription.cancelled', 'subscription.completed', 'subscription.expired']) assert.equal(gw.parseWebhook(signed(e, subEntity()))!.type, 'subscription_canceled');
    assert.equal(gw.parseWebhook(signed('subscription.charged', subEntity({ notes: [] }), paid)), null);
    assert.equal(gw.parseWebhook(signed('subscription.activated', subEntity())), null);
  });
  it('a charge delivered twice grants 15 classes once', async () => {
    const db = createPgliteDb();
    await migrate(db);
    const now = new Date();
    const user = randomUUID();
    const start = Math.floor(now.getTime() / 1000) - 60;
    const w = signed('subscription.charged', subEntity({ notes: { user_id: user, plan_key: 'middle', interval: 'month' }, current_start: start, current_end: start + 30 * 86400 }), paid);
    assert.equal(await applyEvent(db, gw.parseWebhook(w)!), 'applied');
    assert.equal(await applyEvent(db, gw.parseWebhook(w)!), 'duplicate');
    assert.equal((await balance(db, user, now)).remaining, 15);
    await db.close();
  });
});
