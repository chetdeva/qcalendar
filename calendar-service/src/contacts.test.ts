import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, json, slot, type Person } from '../tests/harness.ts';

let h: Awaited<ReturnType<typeof createHarness>>;
before(async () => { h = await createHarness(); });
after(() => h.close());
beforeEach(() => h.reset());

const klass = async (t: Person, students: Person[]) => {
  const res = await t.call('POST', '/v1/events', { title: 'Algebra', ...slot(10), participants: students.map((s) => ({ email: s.email, userId: s.id })) });
  assert.equal(res.status, 201);
  return json(res);
};

test('contacts: a teacher and their students, never student to student or strangers', async () => {
  const [t, other] = [await h.person('teacher'), await h.person('teacher')];
  const [a, b, stranger] = [await h.person('student'), await h.person('student'), await h.person('student')];
  await klass(t, [a, b]);
  const ofTeacher = (await (await t.call('GET', '/v1/contacts')).json()).contacts.map((c: any) => c.id).sort();
  assert.deepEqual(ofTeacher, [a.id, b.id].sort());
  assert.deepEqual((await (await a.call('GET', '/v1/contacts')).json()).contacts, [{ id: t.id }]); // not b
  for (const p of [stranger, other]) assert.deepEqual((await (await p.call('GET', '/v1/contacts')).json()).contacts, []);
});

test('contacts: cancelled classes do not count; a student not yet signed in is skipped', async () => {
  const t = await h.person('teacher');
  const [a, ghost] = [await h.person('student'), await h.person('student')];
  const ev = await klass(t, [a]);
  await t.call('POST', `/v1/events/${ev.id}/participants`, { participants: [{ email: 'new@example.test' }] });
  assert.deepEqual((await (await t.call('GET', '/v1/contacts')).json()).contacts, [{ id: a.id }]);
  await t.call('DELETE', `/v1/events/${ev.id}`);
  assert.deepEqual((await (await t.call('GET', '/v1/contacts')).json()).contacts, []);
  assert.deepEqual((await (await ghost.call('GET', '/v1/contacts')).json()).contacts, []);
});

test('chat-policy: 204 only for the caller and one of their contacts', async () => {
  const t = await h.person('teacher');
  const [a, b] = [await h.person('student'), await h.person('student')];
  await klass(t, [a]);
  assert.equal((await a.call('POST', '/v1/chat-policy', { memberIds: [a.id, t.id] })).status, 204);
  assert.equal((await t.call('POST', '/v1/chat-policy', { memberIds: [a.id, t.id] })).status, 204);
  assert.equal((await b.call('POST', '/v1/chat-policy', { memberIds: [b.id, t.id] })).status, 403); // no class together
  assert.equal((await a.call('POST', '/v1/chat-policy', { memberIds: [t.id, b.id] })).status, 403); // caller is not a member
  assert.equal((await a.call('POST', '/v1/chat-policy', { memberIds: [a.id, a.id] })).status, 403); // not a contact of themselves
  assert.equal((await a.call('POST', '/v1/chat-policy', { memberIds: [a.id] })).status, 400);
  assert.equal((await h.service('POST', '/v1/chat-policy', { memberIds: [a.id, t.id] })).status, 403); // the service key has no contacts
});
