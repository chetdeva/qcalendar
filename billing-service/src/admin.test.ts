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
