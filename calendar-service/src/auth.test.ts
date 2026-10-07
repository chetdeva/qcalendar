import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { API_KEY, createHarness, foreignKey, json, signToken, slot } from '../tests/harness.ts';

let h: Awaited<ReturnType<typeof createHarness>>;
before(async () => { h = await createHarness(); });
after(() => h.close());

const get = (headers: Record<string, string> = {}) => h.app.request('/v1/events', { headers });

test('no token, junk token, wrong scheme', async () => {
  assert.equal((await get()).status, 401);
  assert.equal((await get({ authorization: 'Bearer nonsense' })).status, 401);
  assert.equal((await get({ authorization: `Basic ${API_KEY}` })).status, 401);
  assert.equal((await h.app.request('/health')).status, 200);
});

test('expired, foreign-key, wrong-issuer and wrong-audience tokens are refused', async () => {
  const id = randomUUID();
  const bad = [
    await signToken(id, { role: 'admin', exp: '-1h' }),
    await signToken(id, { role: 'admin', key: foreignKey }),
    await signToken(id, { role: 'admin', iss: 'https://evil.test/auth/v1' }),
    await signToken(id, { role: 'admin', aud: 'service_role' }),
  ];
  for (const t of bad) assert.equal((await get({ authorization: `Bearer ${t}` })).status, 401);
});

test('a valid token works; the service API key works', async () => {
  const t = await h.person('teacher');
  assert.equal((await t.call('GET', '/v1/events')).status, 200);
  assert.equal((await h.service('GET', '/v1/events')).status, 200);
});

test('a role in user_metadata is ignored, and an unknown or missing role is a student', async () => {
  await h.reset();
  const sneaky = await signToken(randomUUID(), { role: 'student', email: 's@example.test', userMeta: { role: 'admin' } });
  assert.equal((await h.withToken(sneaky)('POST', '/v1/events', { title: 'x', ...slot(10) })).status, 403, 'still a student');
  const noRole = await signToken(randomUUID(), { role: undefined, email: 'n@example.test' });
  assert.equal((await h.withToken(noRole)('POST', '/v1/events', { title: 'x', ...slot(10) })).status, 403);
  const owner = await signToken(randomUUID(), { role: 'owner', email: 'o@example.test' });
  assert.equal((await h.withToken(owner)('POST', '/v1/events', { title: 'x', ...slot(10) })).status, 403);
});

test('a disabled account is refused even with a valid token', async () => {
  const t = await signToken(randomUUID(), { role: 'teacher', status: 'disabled', email: 't@example.test' });
  const res = await get({ authorization: `Bearer ${t}` });
  assert.equal(res.status, 403);
  assert.equal((await json(res)).error.code, 'account_disabled');
});

test('the API key is compared safely: near-misses and prefixes fail', async () => {
  for (const k of [API_KEY.slice(0, -1), API_KEY + 'x', API_KEY.toUpperCase(), '']) {
    assert.equal((await get({ authorization: `Bearer ${k}` })).status, 401, JSON.stringify(k.slice(0, 5)));
  }
});
