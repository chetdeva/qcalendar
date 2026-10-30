import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
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
const app = createApp({
  db, gateways: { fake: fake.gateway }, defaultGateway: 'fake', returnUrl: 'https://accounts.example.test/billing',
  authenticator: createAuthenticator({ apiKey: KEY, getKey: async () => publicKey, issuer: ISS }),
  users: { grade: async () => 6 },
});
const jwt = (sub: string, role: string) => new SignJWT({ email: `${sub.slice(0, 4)}@example.test`, app_metadata: { role, status: 'active' } })
  .setProtectedHeader({ alg: 'ES256', kid: 'k1' }).setSubject(sub).setIssuer(ISS).setAudience('authenticated').setIssuedAt().setExpirationTime('1h').sign(privateKey);
const call = async (token: string, path: string, body: unknown) =>
  app.request(path, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

before(async () => { await migrate(db); });
after(() => db.close());

describe('admin balances', () => {
  it('an admin (or the service) sees spendable credits for several people; students cannot', async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    const now = new Date();
    const d = fake.deliver({ type: 'payment_succeeded', eventId: 'e1', userId: a, customerRef: `cus_${a}`, subscriptionRef: `sub_${a}`, planKey: 'middle', interval: 'month', periodStart: now, periodEnd: addMonths(now, 1), amountCents: 35000, currency: 'usd' });
    assert.equal((await app.request('/v1/webhooks/fake', { method: 'POST', body: d.rawBody, headers: d.headers })).status, 200);

    const admin = await jwt(randomUUID(), 'admin');
    const r = (await (await call(admin, '/v1/admin/balances', { userIds: [a, b] })).json()) as { balances: Record<string, { remaining: number }> };
    assert.equal(r.balances[a]!.remaining, 15);
    assert.equal(r.balances[b]!.remaining, 0);
    assert.equal((await call(KEY, '/v1/admin/balances', { userIds: [a] })).status, 200);
    assert.equal((await call(await jwt(a, 'student'), '/v1/admin/balances', { userIds: [a] })).status, 403);
    assert.equal((await call(admin, '/v1/admin/balances', { userIds: [] })).status, 400);
  });
});

const asAdmin = async () => { const t = await jwt(randomUUID(), 'admin'); return (method: string, path: string, body?: unknown) =>
  app.request(path, { method, headers: { authorization: `Bearer ${t}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); };
const j = async (r: Response) => (await r.json()) as any;

describe('admin credits', () => {
  it('adds and removes a student\'s credits with a mandatory reason, once per request, never below zero; the history says who and why', async () => {
    const [id, admin] = [randomUUID(), await asAdmin()];
    const adjust = (body: Record<string, unknown>) => admin('POST', '/v1/admin/credits/adjust', { userId: id, kind: 'student', requestId: randomUUID(), ...body });
    const balance = async () => (await j(await admin('POST', '/v1/admin/balances', { userIds: [id] }))).balances[id].remaining;

    assert.equal((await adjust({ delta: 5, reason: 'Make-up for a cancelled week' })).status, 200);
    assert.equal(await balance(), 5);
    const rid = randomUUID();
    assert.equal((await j(await adjust({ delta: 3, reason: 'Goodwill', requestId: rid }))).applied, true);
    assert.equal((await j(await adjust({ delta: 3, reason: 'Goodwill', requestId: rid }))).applied, false); // the same request again
    assert.equal(await balance(), 8);

    assert.equal((await adjust({ delta: -2, reason: 'Entered by mistake' })).status, 200);
    assert.equal(await balance(), 6);
    assert.equal((await adjust({ delta: -7, reason: 'Too many' })).status, 409);
    assert.equal((await j(await adjust({ delta: -7, reason: 'Too many' }))).error.code, 'insufficient_credits');
    assert.equal(await balance(), 6);
    assert.equal((await adjust({ delta: 1, reason: 'ab' })).status, 400); // a reason is required
    assert.equal((await adjust({ delta: 0, reason: 'Nothing' })).status, 400);

    const { entries } = await j(await admin('GET', `/v1/admin/credits/${id}/ledger?kind=student`));
    assert.deepEqual(entries.map((e: any) => [e.delta, e.note]), [[-2, 'Entered by mistake'], [3, 'Goodwill'], [5, 'Make-up for a cancelled week']]);
    assert.match(entries[0].by, /@example.test$/); // the admin's email is kept with the row
  });

  it('removing credits takes from the blocks that expire soonest', async () => {
    const [id, admin] = [randomUUID(), await asAdmin()];
    const post = (b: Record<string, unknown>) => admin('POST', '/v1/admin/credits/adjust', { userId: id, kind: 'student', requestId: randomUUID(), ...b });
    await post({ delta: 2, reason: 'Short block', days: 5 });
    await post({ delta: 4, reason: 'Long block', days: 60 });
    assert.equal((await post({ delta: -3, reason: 'Correction' })).status, 200); // 2 from the short block, 1 from the long one
    const rows = await db.query<{ delta: number; days: number }>(
      `select l.delta, round(extract(epoch from (g.period_end - now())) / 86400)::int as days from billing.credit_ledger l join billing.credit_grants g on g.id = l.grant_id where l.user_id = $1 and l.delta < 0 order by l.id`, [id]);
    assert.deepEqual(rows.map((r) => [r.delta, r.days]), [[-2, 5], [-1, 60]]);
  });

  it('only admins and the service may touch credits, rates and payouts', async () => {
    const s = await jwt(randomUUID(), 'student');
    const id = randomUUID();
    const calls: [string, string, unknown][] = [
      ['POST', '/v1/admin/credits/adjust', { userId: id, kind: 'student', delta: 1, reason: 'abc', requestId: randomUUID() }],
      ['GET', `/v1/admin/credits/${id}/ledger?kind=student`, undefined],
      ['GET', `/v1/admin/teachers/${id}/payout`, undefined],
      ['PUT', `/v1/admin/teachers/${id}/rate`, { rateCents: 100, currency: 'INR' }],
      ['POST', `/v1/admin/teachers/${id}/payouts`, { reference: 'x' }],
    ];
    for (const [m, p, b] of calls) {
      assert.equal((await app.request(p, { method: m, headers: { authorization: `Bearer ${s}`, 'content-type': 'application/json' }, body: b === undefined ? undefined : JSON.stringify(b) })).status, 403, `${m} ${p}`);
    }
    assert.equal((await call(await jwt(randomUUID(), 'admin'), '/v1/service/earnings', { teacherId: id, ref: 'e:s', earnedAt: new Date().toISOString() })).status, 403); // service key only
  });
});

describe('teacher earnings and payouts', () => {
  it('a teacher earns a credit per student seat (once), an admin can correct it, and settling records a payout at the current rate', async () => {
    const [t, admin] = [randomUUID(), await asAdmin()];
    const earn = (ref: string) => call(KEY, '/v1/service/earnings', { teacherId: t, ref, earnedAt: new Date().toISOString() });
    assert.equal((await j(await earn('ev1:s1'))).recorded, true);
    assert.equal((await j(await earn('ev1:s1'))).recorded, false); // reported twice, counted once
    await earn('ev1:s2'); await earn('ev2:s1');
    const owed = async () => (await j(await admin('GET', `/v1/admin/teachers/${t}/payout`)));
    assert.equal((await owed()).unsettledCredits, 3);
    assert.equal((await owed()).amountCents, null); // no rate yet

    assert.equal((await admin('POST', `/v1/admin/teachers/${t}/payouts`, { reference: 'UTR1' })).status, 409);
    assert.equal((await j(await admin('POST', `/v1/admin/teachers/${t}/payouts`, { reference: 'UTR1' }))).error.code, 'rate_required');
    assert.equal((await admin('PUT', `/v1/admin/teachers/${t}/rate`, { rateCents: 25000, currency: 'inr' })).status, 200);
    assert.deepEqual((await owed()).rate, { rateCents: 25000, currency: 'INR' });

    const fix = (delta: number, reason: string) => admin('POST', '/v1/admin/credits/adjust', { userId: t, kind: 'teacher', delta, reason, requestId: randomUUID() });
    assert.equal((await fix(2, 'Covered a missed class')).status, 200);
    assert.equal((await fix(-9, 'Too many')).status, 409); // cannot go below what is owed
    assert.equal((await owed()).unsettledCredits, 5);
    const bal = (await j(await admin('POST', '/v1/admin/balances', { userIds: [t] }))).balances[t];
    assert.deepEqual([bal.unsettled, bal.lastPayoutAt], [5, null]);

    const paid = await j(await admin('POST', `/v1/admin/teachers/${t}/payouts`, { reference: 'UTR-8841', notes: 'October' }));
    assert.deepEqual([paid.credits, paid.amountCents, paid.currency], [5, 125000, 'INR']);
    assert.equal((await admin('POST', `/v1/admin/teachers/${t}/payouts`, { reference: 'again' })).status, 409); // nothing left to settle
    await admin('PUT', `/v1/admin/teachers/${t}/rate`, { rateCents: 99999, currency: 'INR' }); // a later rate change does not touch history
    const after = await owed();
    assert.equal(after.unsettledCredits, 0);
    assert.deepEqual([after.payouts[0].credits, after.payouts[0].rateCents, after.payouts[0].reference, after.payouts[0].notes], [5, 25000, 'UTR-8841', 'October']);
    const settledBal = (await j(await admin('POST', '/v1/admin/balances', { userIds: [t] }))).balances[t];
    assert.equal(settledBal.unsettled, 0);
    assert.ok(settledBal.lastPayoutAt);

    await earn('ev3:s1'); // new work after the payout is owed afresh
    assert.equal((await owed()).unsettledCredits, 1);
    const { entries } = await j(await admin('GET', `/v1/admin/credits/${t}/ledger?kind=teacher`));
    assert.equal(entries.length, 5); // four seats and the correction (the refused deduction left no row)
    assert.deepEqual([entries[0].kind, entries[0].settled], ['class taught', false]);
  });
});
