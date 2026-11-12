import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { generateKeyPair, SignJWT } from 'jose';
import { createApp } from './app.ts';
import { createAuthenticator } from './auth.ts';
import { addMonths } from './credits.ts';
import { createPgliteDb, migrate } from './db.ts';
import { createFakeGateway } from './gateways/fake.ts';

const ISS = 'https://project.supabase.co/auth/v1';
const KEY = 'k'.repeat(32);
const { publicKey, privateKey } = await generateKeyPair('ES256');
const db = createPgliteDb();
const fake = createFakeGateway();
const grades = new Map<string, number>();
const app = createApp({
  db, gateways: { fake: fake.gateway }, defaultGateway: 'fake', returnUrl: 'https://accounts.example.test/billing',
  authenticator: createAuthenticator({ apiKey: KEY, getKey: async () => publicKey, issuer: ISS }),
  users: { grade: async (id) => grades.get(id) ?? null },
});

const jwt = (sub: string) => new SignJWT({ email: `${sub.slice(0, 4)}@example.test`, app_metadata: { role: 'student', status: 'active' } })
  .setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setSubject(sub).setIssuer(ISS).setAudience('authenticated').setIssuedAt().setExpirationTime('1h').sign(privateKey);
const call = (token: string, method: string, path: string, body?: unknown) =>
  Promise.resolve(app.request(path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }));
const json = async (r: Response) => (await r.json()) as any;
const T0 = new Date();

async function student(grade = 6) {
  const id = randomUUID();
  grades.set(id, grade);
  const token = await jwt(id);
  return { id, me: () => call(token, 'GET', '/v1/billing/me'), as: (m: string, p: string, b?: unknown) => call(token, m, p, b) };
}
const subscribe = (userId: string, interval: 'month' | 'year' = 'month', plan = 'middle') =>
  app.request('/v1/webhooks/fake', {
    method: 'POST',
    ...(() => { const d = fake.deliver({ type: 'payment_succeeded', eventId: `e_${randomUUID()}`, userId, customerRef: `cus_${userId}`, subscriptionRef: `sub_${userId}`, planKey: plan, interval, periodStart: T0, periodEnd: addMonths(T0, interval === 'month' ? 1 : 12), amountCents: 35000, currency: 'usd' }); return { body: d.rawBody, headers: d.headers }; })(),
  });

before(async () => { await migrate(db); });
after(() => db.close());
beforeEach(() => { fake.calls.length = 0; });

describe('auth', () => {
  it('rejects no token, and people on service routes', async () => {
    assert.equal((await app.request('/v1/billing/me')).status, 401);
    const s = await student();
    assert.equal((await s.as('POST', '/v1/service/credits/reserve', { userId: s.id, ref: 'x' })).status, 403);
    assert.equal((await call(KEY, 'GET', '/v1/billing/me')).status, 403); // service key is not a person
  });
});

describe('service: does this student have a plan', () => {
  it('says yes only for a live subscription, and only to the service key', async () => {
    const s = await student();
    const ask = (key: string) => call(key, 'POST', '/v1/service/students/status', { userId: s.id });
    assert.deepEqual(await json(await ask(KEY)), { subscribed: false });
    await subscribe(s.id);
    assert.deepEqual(await json(await ask(KEY)), { subscribed: true });
    assert.equal((await ask(await jwt(s.id))).status, 403);
  });
});

describe('payment history', () => {
  it('lists each charge with its amount, newest first; a failed renewal shows without an amount; a replayed webhook adds nothing', async () => {
    const s = await student();
    assert.deepEqual((await json(await s.me())).payments, []);
    const d = fake.deliver({ type: 'payment_succeeded', eventId: 'pay_1', userId: s.id, customerRef: `cus_${s.id}`, subscriptionRef: `sub_${s.id}`, planKey: 'middle', interval: 'month', periodStart: T0, periodEnd: addMonths(T0, 1), amountCents: 35000, currency: 'usd' });
    for (let i = 0; i < 2; i++) assert.equal((await app.request('/v1/webhooks/fake', { method: 'POST', body: d.rawBody, headers: d.headers })).status, 200);
    const f = fake.deliver({ type: 'payment_failed', eventId: 'fail_1', subscriptionRef: `sub_${s.id}` });
    await app.request('/v1/webhooks/fake', { method: 'POST', body: f.rawBody, headers: f.headers });
    const { payments } = await json(await s.me());
    assert.equal(payments.length, 2);
    assert.deepEqual(payments.map((p: any) => p.status), ['failed', 'succeeded']);
    assert.deepEqual({ ...payments[1], at: undefined }, { id: payments[1].id, hasInvoice: false, status: 'succeeded', amountCents: 35000, currency: 'usd', planKey: 'middle', interval: 'month', at: undefined });
    assert.equal(payments[0].amountCents, null);
  });
  it("opens a payment's invoice for its owner only", async () => {
    const [s, other] = [await student(), await student()];
    const d = fake.deliver({ type: 'payment_succeeded', eventId: 'pay_inv', userId: s.id, customerRef: `cus_${s.id}`, subscriptionRef: `sub_${s.id}`, planKey: 'middle', interval: 'month', periodStart: T0, periodEnd: addMonths(T0, 1), amountCents: 35000, currency: 'usd', invoiceRef: 'inv_42' });
    await app.request('/v1/webhooks/fake', { method: 'POST', body: d.rawBody, headers: d.headers });
    const [p] = (await json(await s.me())).payments;
    assert.equal(p.hasInvoice, true);
    assert.deepEqual(await json(await s.as('GET', `/v1/billing/payments/${p.id}/invoice`)), { url: 'https://pay.example.test/invoice/inv_42' });
    assert.equal((await other.as('GET', `/v1/billing/payments/${p.id}/invoice`)).status, 404);
    assert.equal((await s.as('GET', '/v1/billing/payments/not-an-id/invoice')).status, 404);
  });
  it('follows a payment from checkout to paid: one row that moves forward, never backward', async () => {
    const s = await student();
    const send = async (e: Parameters<typeof fake.deliver>[0]) => { const d = fake.deliver(e); return json(await app.request('/v1/webhooks/fake', { method: 'POST', body: d.rawBody, headers: d.headers })); };
    const ref = `sub_${s.id}`;
    const status = async () => (await json(await s.me())).payments.map((p: any) => p.status);
    assert.equal((await s.as('POST', '/v1/billing/checkout', { interval: 'month' })).status, 200);
    assert.deepEqual(await status(), ['started']);
    const row = (await json(await s.me())).payments[0];
    assert.deepEqual([row.currency, row.planKey, row.interval, typeof row.amountCents], ['usd', 'middle', 'month', 'number']);
    await send({ type: 'payment_progress', eventId: 'p1', subscriptionRef: ref, step: 'authenticated' });
    assert.deepEqual(await status(), ['authenticated']);
    await send({ type: 'payment_progress', eventId: 'p2', subscriptionRef: ref, step: 'activated' });
    await send({ type: 'payment_progress', eventId: 'p3', subscriptionRef: ref, step: 'authenticated' }); // late and out of order
    assert.deepEqual(await status(), ['activated']);
    await send({ type: 'payment_succeeded', eventId: 'p4', userId: s.id, customerRef: ref, subscriptionRef: ref, planKey: 'middle', interval: 'month', periodStart: T0, periodEnd: addMonths(T0, 1), amountCents: 35000, currency: 'usd' });
    const done = (await json(await s.me())).payments;
    assert.deepEqual(done.map((p: any) => [p.status, p.amountCents]), [['succeeded', 35000]]);
    // a renewal has no open row, so it adds one
    await send({ type: 'payment_succeeded', eventId: 'p5', userId: s.id, customerRef: ref, subscriptionRef: ref, planKey: 'middle', interval: 'month', periodStart: addMonths(T0, 1), periodEnd: addMonths(T0, 2), amountCents: 35000, currency: 'usd' });
    assert.deepEqual(await status(), ['succeeded', 'succeeded']);
  });
  it('a checkout that fails or is abandoned ends as failed or cancelled, and a new checkout closes the old attempt', async () => {
    const s = await student();
    const ref = `sub_${s.id}`;
    const status = async () => (await json(await s.me())).payments.map((p: any) => p.status);
    await s.as('POST', '/v1/billing/checkout', { interval: 'month' });
    const f = fake.deliver({ type: 'payment_failed', eventId: 'f1', subscriptionRef: ref });
    assert.equal((await app.request('/v1/webhooks/fake', { method: 'POST', body: f.rawBody, headers: f.headers })).status, 200);
    assert.deepEqual(await status(), ['failed']);
    const t = await student();
    await t.as('POST', '/v1/billing/checkout', { interval: 'month' });
    await t.as('POST', '/v1/billing/checkout', { interval: 'year' });
    assert.deepEqual((await json(await t.me())).payments.map((p: any) => p.status), ['started', 'cancelled']);
  });
  it('a declined attempt ends the open checkout; the retry that succeeds is a new row; a repeat or an unrelated invoice changes nothing', async () => {
    const s = await student();
    const status = async () => (await json(await s.me())).payments.map((p: any) => p.status);
    const send = async (e: Parameters<typeof fake.deliver>[0]) => { const d = fake.deliver(e); return json(await app.request('/v1/webhooks/fake', { method: 'POST', body: d.rawBody, headers: d.headers })); };
    await s.as('POST', '/v1/billing/checkout', { interval: 'month' });
    assert.equal((await send({ type: 'payment_attempt_failed', eventId: 'a1', invoiceRef: `inv_${s.id}` })).result, 'applied');
    assert.deepEqual(await status(), ['failed']);
    assert.equal((await send({ type: 'payment_attempt_failed', eventId: 'a1', invoiceRef: `inv_${s.id}` })).result, 'duplicate');
    assert.equal((await send({ type: 'payment_attempt_failed', eventId: 'a2', invoiceRef: `inv_${s.id}` })).result, 'ignored'); // nothing open
    const ref = `sub_${s.id}`;
    await send({ type: 'payment_succeeded', eventId: 'a3', userId: s.id, customerRef: ref, subscriptionRef: ref, planKey: 'middle', interval: 'month', periodStart: T0, periodEnd: addMonths(T0, 1), amountCents: 35000, currency: 'usd' });
    assert.deepEqual(await status(), ['succeeded', 'failed']);
  });
  it('closing the payment window cancels a checkout that has not started paying, and leaves one that has', async () => {
    const s = await student(), t = await student();
    await s.as('POST', '/v1/billing/checkout', { interval: 'month' });
    assert.equal((await s.as('POST', '/v1/billing/checkout/abandon')).status, 204);
    assert.deepEqual((await json(await s.me())).payments.map((p: any) => p.status), ['cancelled']);
    await t.as('POST', '/v1/billing/checkout', { interval: 'month' });
    const d = fake.deliver({ type: 'payment_progress', eventId: `g_${t.id}`, subscriptionRef: `sub_${t.id}`, step: 'authenticated' });
    await app.request('/v1/webhooks/fake', { method: 'POST', body: d.rawBody, headers: d.headers });
    await t.as('POST', '/v1/billing/checkout/abandon');
    assert.deepEqual((await json(await t.me())).payments.map((p: any) => p.status), ['authenticated']);
  });
  it("shows only the student's own payments", async () => {
    const a = await student(), b = await student();
    await subscribe(a.id);
    assert.equal((await json(await a.me())).payments.length, 1);
    assert.equal((await json(await b.me())).payments.length, 0);
  });
});

describe('billing/me and checkout', () => {
  it('shows the price for the grade band and a free trial before anything is bought', async () => {
    const s = await student(9);
    const me = await json(await s.me());
    assert.equal(me.trialAvailable, true);
    assert.deepEqual(me.plan, { key: 'high', monthlyCents: 40000, annualCents: 384000, creditsPerMonth: 15 });
    assert.equal(me.credits.remaining, 0);
    assert.deepEqual(me.bands.map((b: any) => [b.label, b.monthlyCents, b.annualCents, b.yours]), [['Grades 1-5', 30000, 288000, false], ['Grades 6-8', 35000, 336000, false], ['Grades 9-10', 40000, 384000, true]]);
  });
  it('nudges a new student to take the free class or subscribe; after the free class only to subscribe', async () => {
    const s = await student(4);
    const me = async () => json(await s.me());
    assert.deepEqual([(await me()).trial, (await me()).prompts], ['available', ['book_trial', 'subscribe']]);
    const hour = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
    const reserveTrial = (ref: string, endsAt?: string) => s.as('POST', '/v1/service/credits/reserve', { userId: s.id, ref, endsAt, trial: true });
    assert.equal((await reserveTrial('l1', hour(2))).status, 403); // that route is for services, not people
    const r = await app.request('/v1/service/credits/reserve', { method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ userId: s.id, ref: 'l1', endsAt: hour(2), trial: true }) });
    assert.equal(r.status, 200);
    assert.deepEqual([(await me()).trial, (await me()).prompts], ['booked', ['trial_booked']]);
    await db.query(`update billing.trials set lesson_end = now() - interval '1 hour' where user_id = $1`, [s.id]);
    assert.deepEqual([(await me()).trial, (await me()).prompts], ['done', ['subscribe']]);
    await subscribe(s.id);
    assert.deepEqual((await me()).prompts, []);
  });
  it('checkout charges the band price, from the server-side grade, not from the request', async () => {
    const s = await student(2);
    const r = await s.as('POST', '/v1/billing/checkout', { interval: 'year', amountCents: 1, planKey: 'high' });
    assert.equal(r.status, 400); // strict body: nothing price-related is accepted from the client
    const ok = await json(await s.as('POST', '/v1/billing/checkout', { interval: 'year' }));
    assert.match(ok.url, /plan=elementary&interval=year/);
    assert.equal((fake.calls[0]!.args as any).amountCents, 288000);
  });
  it('needs a grade, and refuses a second subscription', async () => {
    const s = await student();
    grades.delete(s.id);
    assert.equal((await s.as('POST', '/v1/billing/checkout', { interval: 'month' })).status, 409);
    grades.set(s.id, 6);
    await subscribe(s.id);
    const again = await s.as('POST', '/v1/billing/checkout', { interval: 'month' });
    assert.equal((await json(again)).error.code, 'already_subscribed');
  });
});

describe('webhook to credits to lessons', () => {
  it('a signed payment webhook grants 15 credits that calendar-service can reserve and release', async () => {
    const s = await student();
    assert.equal((await subscribe(s.id)).status, 200);
    assert.equal((await json(await s.me())).credits.remaining, 15);
    const rsv = await call(KEY, 'POST', '/v1/service/credits/reserve', { userId: s.id, ref: 'ev1:' + s.id });
    assert.deepEqual(await json(rsv), { ok: true, source: 'credit' });
    assert.equal((await json(await s.me())).credits.remaining, 14);
    assert.equal((await call(KEY, 'POST', '/v1/service/credits/release', { userId: s.id, ref: 'ev1:' + s.id })).status, 204);
    assert.equal((await json(await s.me())).credits.remaining, 15);
  });
  it('rejects a webhook with a bad signature and an unknown gateway', async () => {
    assert.equal((await app.request('/v1/webhooks/fake', { method: 'POST', body: '{}' })).status, 400);
    assert.equal((await app.request('/v1/webhooks/nope', { method: 'POST', body: '{}' })).status, 404);
  });
  it('a student with no credits gets 402 with a reason', async () => {
    const s = await student();
    await call(KEY, 'POST', '/v1/service/credits/reserve', { userId: s.id, ref: 'trial' }); // uses the free trial
    const r = await call(KEY, 'POST', '/v1/service/credits/reserve', { userId: s.id, ref: 'second' });
    assert.equal(r.status, 402);
    assert.equal((await json(r)).error.code, 'subscription_required');
  });
  it('a grade change schedules the new price and tells the gateway', async () => {
    const s = await student(6);
    await subscribe(s.id);
    const r = await call(KEY, 'POST', '/v1/service/grade-changed', { userId: s.id, grade: 9 });
    assert.deepEqual(await json(r), { pendingPlan: 'high' });
    const me = await json(await s.me());
    assert.equal(me.subscription.planKey, 'middle');
    assert.equal(me.subscription.pendingPlan.key, 'high');
    assert.equal(me.subscription.pendingPlan.cents, 40000);
  });
  it('cancel asks the gateway to stop at period end', async () => {
    const s = await student();
    await subscribe(s.id);
    assert.equal((await s.as('POST', '/v1/billing/cancel')).status, 204);
    assert.deepEqual(fake.calls.at(-1), { method: 'cancelSubscription', args: { subscriptionRef: `sub_${s.id}`, atPeriodEnd: true } });
    assert.equal((await json(await s.me())).subscription.cancelAtPeriodEnd, true);
  });
});
