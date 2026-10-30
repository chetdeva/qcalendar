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
  assert.deepEqual(teachers.summary[t2.id], { students: 0, teacher: null, upcoming: 0, nextAt: null });

  const students = await json(await admin.call('POST', '/v1/admin/summary', { userIds: [s1.id, s2.id], role: 'student' }));
  assert.deepEqual([students.summary[s1.id].upcoming, students.summary[s2.id].upcoming], [2, 1]);

  assert.equal((await h.service('POST', '/v1/admin/summary', { userIds: [s1.id], role: 'student' })).status, 200);
  assert.equal((await t1.call('POST', '/v1/admin/summary', { userIds: [s1.id], role: 'student' })).status, 403);
  assert.equal((await s1.call('POST', '/v1/admin/summary', { userIds: [s1.id], role: 'student' })).status, 403);
  assert.equal((await admin.call('POST', '/v1/admin/summary', { userIds: [], role: 'student' })).status, 400);
});

const who = (p: { email: string }, name: string) => ({ email: p.email, name });

test('assigning a teacher: recorded, history kept, student and both teachers told, repeat does nothing, contacts follow', async () => {
  const [t1, t2, s, admin] = [await h.person('teacher'), await h.person('teacher'), await h.person('student'), await h.person('admin')];
  const put = (body: unknown, as = admin) => as.call('PUT', `/v1/admin/students/${s.id}/teacher`, body);

  const first = await json(await put({ teacherId: t1.id, student: who(s, 'Sam'), teacher: who(t1, 'Tess'), note: 'Strong in algebra' }));
  assert.equal(first.changed, true);
  assert.equal(first.current.teacher.id, t1.id);
  let mails = await h.db.query<{ kind: string; to_email: string }>('select kind, to_email from calendar.email_outbox order by id');
  assert.deepEqual(mails.map((m) => [m.kind, m.to_email]), [['teacher_assigned', s.email], ['teacher_assigned', t1.email]]);

  assert.equal((await json(await put({ teacherId: t1.id, student: who(s, 'Sam'), teacher: who(t1, 'Tess') }))).changed, false); // same again: nothing new
  assert.equal((await h.db.query('select 1 from calendar.email_outbox')).length, 2);

  // contacts (the chat rule) include the assigned pair before any class exists
  assert.deepEqual((await json(await s.call('GET', '/v1/contacts'))).contacts, [{ id: t1.id }]);
  assert.deepEqual((await json(await t1.call('GET', '/v1/contacts'))).contacts, [{ id: s.id }]);
  const sum = await json(await admin.call('POST', '/v1/admin/summary', { userIds: [t1.id], role: 'teacher' }));
  assert.equal(sum.summary[t1.id].students, 1);
  const stu = await json(await admin.call('POST', '/v1/admin/summary', { userIds: [s.id], role: 'student' }));
  assert.equal(stu.summary[s.id].teacher.name, 'Tess');

  // moving to the other teacher closes the first assignment and tells all three
  await h.outbox();
  await put({ teacherId: t2.id, student: who(s, 'Sam'), teacher: who(t2, 'Tom') });
  mails = await h.db.query('select kind, to_email from calendar.email_outbox where status = \'pending\' order by id');
  assert.deepEqual(mails.map((m) => m.to_email).sort(), [s.email, t1.email, t2.email].sort());
  const toOld = h.mailer.sent.length;
  await h.outbox();
  assert.match(h.mailer.sent.slice(toOld).find((m) => m.to === t1.email)!.subject, /no longer your student/);
  assert.match(h.mailer.sent.slice(toOld).find((m) => m.to === s.email)!.subject, /Your teacher is Tom/);
  assert.deepEqual((await json(await s.call('GET', '/v1/contacts'))).contacts, [{ id: t2.id }]);

  // unassigning
  await put({ teacherId: null, student: who(s, 'Sam'), note: 'Left the program' });
  const history = (await json(await admin.call('GET', `/v1/admin/students/${s.id}/assignments`))).assignments;
  assert.deepEqual(history.map((a: { teacher: { id: string }; endedAt: string | null }) => [a.teacher.id, a.endedAt !== null]), [[t2.id, true], [t1.id, true]]);
  assert.equal(history[0].endedNote, 'Left the program');
  assert.deepEqual((await json(await s.call('GET', '/v1/contacts'))).contacts, []);
});

test('assigning is for admins only, and validates the request', async () => {
  const [t, s, admin] = [await h.person('teacher'), await h.person('student'), await h.person('admin')];
  const body = { teacherId: t.id, student: who(s, 'Sam'), teacher: who(t, 'Tess') };
  for (const p of [t, s]) assert.equal((await p.call('PUT', `/v1/admin/students/${s.id}/teacher`, body)).status, 403);
  assert.equal((await t.call('GET', `/v1/admin/students/${s.id}/assignments`)).status, 403);
  assert.equal((await admin.call('PUT', `/v1/admin/students/${s.id}/teacher`, { teacherId: t.id, student: who(s, 'Sam') })).status, 400); // teacher details missing
  assert.equal((await admin.call('PUT', `/v1/admin/students/${s.id}/teacher`, { teacherId: null, student: who(s, 'Sam'), teacher: who(t, 'Tess') })).status, 400);
  assert.equal((await admin.call('PUT', `/v1/admin/students/not-a-uuid/teacher`, body)).status, 400);
});

test('an admin scheduling for a teacher is stopped outside that teacher\'s working hours unless they force it; teachers and personal events are not checked', async () => {
  const [t, s, admin] = [await h.person('teacher'), await h.person('student'), await h.person('admin')];
  const create = (as: typeof admin, over: Record<string, unknown>) =>
    as.call('POST', '/v1/events', { title: 'Algebra', ownerId: t.id, ownerEmail: t.email, participants: [{ email: s.email, userId: s.id }], ...over });

  assert.equal((await create(admin, slot(10))).status, 201); // Monday 10:00 UTC, inside the default 09:00-17:00
  const late = await create(admin, slot(20));
  assert.equal(late.status, 409);
  const body = await json(late);
  assert.equal(body.error.code, 'outside_availability');
  assert.deepEqual(body.error.details.workingHours.mon, [['09:00', '17:00']]);
  assert.equal((await create(admin, { ...slot(16, 90), title: 'Runs past 17:00' })).status, 409); // must fit entirely inside
  assert.equal((await create(admin, { ...slot(20), force: true })).status, 201);
  assert.equal((await create(admin, { ...slot(21), category: 'personal', participants: [] })).status, 201);
  assert.equal((await create(admin, slot(10, 60, 12))).status, 409); // Saturday: no hours at all

  assert.equal((await t.call('POST', '/v1/events', { title: 'Own late class', ...slot(22), participants: [] })).status, 201); // a teacher books their own time as they like

  // the teacher's own hours and zone decide: 08:00-12:00 in New York is 13:00-17:00 UTC
  assert.equal((await t.call('PUT', '/v1/settings', { timezone: 'America/New_York', workingHours: { mon: [['08:00', '12:00']], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] } })).status, 200);
  assert.equal((await create(admin, { ...slot(14), participants: [] })).status, 201);
  assert.equal((await create(admin, { ...slot(18), participants: [] })).status, 409);
});
