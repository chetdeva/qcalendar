import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, json, slot } from '../tests/harness.ts';

let h: Awaited<ReturnType<typeof createHarness>>;
before(async () => { h = await createHarness(); });
after(() => h.close());
beforeEach(() => h.reset());

const contactsOf = async (p: { call: (m: string, u: string) => Promise<Response> }) => (await json(await p.call('GET', '/v1/contacts'))).contacts.map((c: any) => c.id);

test('a student reaching out to a mentor makes them contacts of each other, and chat then allows it; nobody else gains anything', async () => {
  const [s, t, other] = [await h.person('student'), await h.person('teacher'), await h.person('student')];
  const policy = (a: typeof s, ids: string[]) => a.call('POST', '/v1/chat-policy', { memberIds: ids });
  assert.equal((await policy(s, [s.id, t.id])).status, 403); // no class, nothing yet
  assert.equal((await s.call('POST', '/v1/chat-links', { teacherId: t.id })).status, 204);
  assert.equal((await s.call('POST', '/v1/chat-links', { teacherId: t.id })).status, 204); // again: nothing changes
  assert.deepEqual(await contactsOf(s), [t.id]);
  assert.deepEqual(await contactsOf(t), [s.id]); // the mentor can answer
  assert.equal((await policy(s, [s.id, t.id])).status, 204);
  assert.equal((await policy(t, [t.id, s.id])).status, 204);
  assert.equal((await policy(other, [other.id, t.id])).status, 403); // another student is still not a contact
  assert.deepEqual(await contactsOf(other), []);
});

test('only a student can reach out, and not to themselves', async () => {
  const [s, t] = [await h.person('student'), await h.person('teacher')];
  assert.equal((await t.call('POST', '/v1/chat-links', { teacherId: s.id })).status, 403);
  assert.equal((await s.call('POST', '/v1/chat-links', { teacherId: s.id })).status, 400);
  assert.equal((await s.call('POST', '/v1/chat-links', { teacherId: 'nope' })).status, 400);
});

test('asking a mentor for a class also lets them talk, but a withdrawn request does not', async () => {
  const [s, t] = [await h.person('student'), await h.person('teacher')];
  const asked = await s.call('POST', '/v1/class-requests', { teacher: { id: t.id, email: t.email, name: 'Ms Rao' }, start: slot(10).start });
  assert.equal(asked.status, 201);
  assert.deepEqual(await contactsOf(s), [t.id]);
  assert.deepEqual(await contactsOf(t), [s.id]);
  assert.equal((await s.call('DELETE', `/v1/class-requests/${(await json(asked)).id}`)).status, 204);
  assert.deepEqual(await contactsOf(s), []);
});
