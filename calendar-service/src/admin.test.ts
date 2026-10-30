import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, json, slot } from '../tests/harness.ts';

let h: Awaited<ReturnType<typeof createHarness>>;
before(async () => { h = await createHarness(); });
after(() => h.close());
beforeEach(() => h.reset());

test('admin summary: upcoming classes and active students per person, for admins and the service only', async () => {
  const [t1, t2, s1, s2, admin] = [await h.person('teacher'), await h.person('teacher'), await h.person('student'), await h.person('student'), await h.person('admin')];
  const book = (t: typeof t1, hour: number, students: (typeof s1)[]) =>
    t.call('POST', '/v1/events', { title: 'Algebra', ...slot(hour), participants: students.map((s) => ({ email: s.email, userId: s.id })) });
  assert.equal((await book(t1, 10, [s1, s2])).status, 201);
  assert.equal((await book(t1, 12, [s1])).status, 201);

  const teachers = await json(await admin.call('POST', '/v1/admin/summary', { userIds: [t1.id, t2.id], role: 'teacher' }));
  assert.deepEqual([teachers.summary[t1.id].upcoming, teachers.summary[t1.id].students], [2, 2]);
  assert.ok(teachers.summary[t1.id].nextAt);
  assert.deepEqual(teachers.summary[t2.id], { students: 0, upcoming: 0, nextAt: null });

  const students = await json(await admin.call('POST', '/v1/admin/summary', { userIds: [s1.id, s2.id], role: 'student' }));
  assert.deepEqual([students.summary[s1.id].upcoming, students.summary[s2.id].upcoming], [2, 1]);

  assert.equal((await h.service('POST', '/v1/admin/summary', { userIds: [s1.id], role: 'student' })).status, 200);
  assert.equal((await t1.call('POST', '/v1/admin/summary', { userIds: [s1.id], role: 'student' })).status, 403);
  assert.equal((await s1.call('POST', '/v1/admin/summary', { userIds: [s1.id], role: 'student' })).status, 403);
  assert.equal((await admin.call('POST', '/v1/admin/summary', { userIds: [], role: 'student' })).status, 400);
});
