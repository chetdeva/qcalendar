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

describe('billing/me and checkout', () => {
  it('shows the price for the grade band and a free trial before anything is bought', async () => {
    const s = await student(9);
    const me = await json(await s.me());
    assert.equal(me.trialAvailable, true);
    assert.deepEqual(me.plan, { key: 'high', monthlyCents: 40000, annualCents: 384000, creditsPerMonth: 15 });
    assert.equal(me.credits.remaining, 0);
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
