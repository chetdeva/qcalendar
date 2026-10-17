import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, json, signToken } from '../tests/harness.ts';

let h: ReturnType<typeof createHarness>;
beforeEach(() => { h = createHarness(); });

test('authentication: no token, a bad token and a disabled account are refused; health is open', async () => {
  assert.equal((await h.app.request('/v1/dashboard')).status, 401);
  assert.equal((await h.withToken('nonsense')('GET', '/v1/dashboard')).status, 401);
  assert.equal((await h.withToken(await signToken('u1', { role: 'student', status: 'disabled' }))('GET', '/v1/dashboard')).status, 403);
  assert.equal((await h.app.request('/health')).status, 200);
});

test('a student gets the student dashboard with their own first name; a teacher gets the teacher one', async () => {
  const s = await h.person('student', 'Mia Student');
  const sd = await json(await s.call('GET', '/v1/dashboard'));
  assert.equal(sd.view, 'student');
  assert.equal(sd.student.welcome.name, 'Mia');
  assert.equal(sd.student.sessions.length, 3);
  assert.equal(sd.student.mentors.length, 3);
  assert.equal(sd.student.assignments.length, 2);
  assert.equal(sd.student.feedback.length, 5);
  const t = await h.person('teacher', 'Tess Teacher');
  const td = await json(await t.call('GET', '/v1/dashboard'));
  assert.equal(td.view, 'teacher');
  assert.equal(td.teacher.welcome.name, 'Coach Tess');
  assert.equal(td.teacher.metrics.length, 4);
  assert.equal(td.teacher.schedule.sessions.length, 3);
  assert.equal(td.teacher.grading.queue.length, 2);
  assert.equal(td.teacher.directory.students.length, 3);
});

test('a person with no saved name is greeted by the start of their email', async () => {
  const id = crypto.randomUUID();
  const call = h.withToken(await signToken(id, { role: 'student', email: 'sam.lee@example.test' }));
  assert.equal((await json(await call('GET', '/v1/dashboard'))).student.welcome.name, 'sam.lee');
});

test('who may see which dashboard: students never see the teacher one, teachers never the student one, admins both', async () => {
  const [s, t, a] = [await h.person('student'), await h.person('teacher'), await h.person('admin')];
  assert.equal((await s.call('GET', '/v1/dashboard?view=teacher')).status, 403);
  assert.equal((await t.call('GET', '/v1/dashboard?view=student')).status, 403);
  assert.equal((await a.call('GET', '/v1/dashboard?view=teacher')).status, 200);
  assert.equal((await json(await a.call('GET', '/v1/dashboard'))).view, 'student');
  assert.equal((await s.call('GET', '/v1/dashboard?view=nonsense')).status, 400);
  for (const [path, who] of [['/v1/students', s], ['/v1/mentors', t]] as const) assert.equal((await who.call('GET', path)).status, 403);
  assert.equal((await s.call('POST', '/v1/assignments', {})).status, 403);
  assert.equal((await s.call('POST', '/v1/submissions/sub-maya/publish', { score: 90, tags: [], note: 'x' })).status, 403);
});

test('mentor search and quick filters', async () => {
  const s = await h.person('student');
  const names = async (qs: string) => (await json(await s.call('GET', `/v1/mentors${qs}`))).mentors.map((m: any) => m.name);
  assert.equal((await names('')).length, 3);
  assert.deepEqual(await names('?filter=olympiad'), ['Coach Elena Rostova']);
  assert.deepEqual(await names('?filter=middle'), ['Coach Pprincy Sugandhh', 'Coach Marcus Vance']);
  assert.deepEqual(await names('?q=fractions'), ['Coach Marcus Vance']);
  assert.deepEqual(await names('?q=GEOMETRY&filter=whiteboard'), ['Coach Pprincy Sugandhh']);
  assert.deepEqual(await names('?q=zzz'), []);
  assert.equal((await s.call('GET', '/v1/mentors?filter=bogus')).status, 400);
});

test('student directory search and grade filter', async () => {
  const t = await h.person('teacher');
  const names = async (qs: string) => (await json(await t.call('GET', `/v1/students${qs}`))).students.map((m: any) => m.name);
  assert.equal((await names('')).length, 3);
  assert.deepEqual(await names('?q=ethan'), ['Ethan Cole']);
  assert.deepEqual(await names('?grade=8'), ['Maya Jenkins']);
  assert.deepEqual(await names('?grade=5&q=liam'), ['Liam Davis']);
  assert.deepEqual(await names('?grade=9'), []);
  assert.equal((await t.call('GET', '/v1/students?grade=12')).status, 400);
});

const assignment = (over: Record<string, unknown> = {}) => ({ studentId: 'st-maya', concept: 'GeoGebra Right Triangles', dueDate: '2030-01-07', xp: 120, prompt: 'Explore the 3-4-5 triangle.', ...over });

test('dispatching an assignment is validated, and the student then sees it in their to-do list', async () => {
  const [t, s] = [await h.person('teacher'), await h.person('student')];
  const res = await t.call('POST', '/v1/assignments', assignment());
  assert.equal(res.status, 201);
  const made = await json(res);
  assert.equal(made.due, 'Due Jan 7');
  const todo = (await json(await s.call('GET', '/v1/dashboard'))).student.assignments;
  assert.equal(todo.length, 3);
  assert.equal(todo.at(-1).title, 'GeoGebra Right Triangles');
  for (const bad of [{ studentId: 'nobody' }, { concept: '' }, { dueDate: 'tomorrow' }, { xp: -5 }, { xp: 1.5 }, { prompt: '   ' }, { extra: 1 }]) {
    const r = await t.call('POST', '/v1/assignments', assignment(bad));
    assert.ok([400, 404].includes(r.status), JSON.stringify(bad));
  }
  assert.equal((await json(await s.call('GET', '/v1/dashboard'))).student.assignments.length, 3); // bad ones changed nothing
});

const grade = (over: Record<string, unknown> = {}) => ({ score: 96, tags: ['Visual Clarity'], note: 'Lovely proof.', ...over });

test('publishing a grade removes it from the queue, lowers the pending count and shows in the student feedback', async () => {
  const [t, s] = [await h.person('teacher', 'Tess Teacher'), await h.person('student')];
  const before = (await json(await t.call('GET', '/v1/dashboard'))).teacher.grading;
  assert.equal(before.pending, 5);
  const res = await t.call('POST', '/v1/submissions/sub-maya/publish', grade());
  assert.equal(res.status, 201);
  const fb = await json(res);
  assert.deepEqual([fb.score, fb.grade, fb.coach], [96, 'A', 'Coach Tess Teacher']);
  const after = (await json(await t.call('GET', '/v1/dashboard'))).teacher;
  assert.deepEqual(after.grading.queue.map((q: any) => q.id), ['sub-ethan']);
  assert.equal(after.grading.pending, 4);
  assert.equal(after.metrics[2].value, '4 Submissions');
  const feedback = (await json(await s.call('GET', '/v1/dashboard'))).student.feedback;
  assert.equal(feedback.length, 6);
  assert.equal(feedback[0].title, 'Coordinate Plane Reflections & Rotations');
  assert.equal(feedback[0].note, 'Lovely proof.');
  assert.equal((await t.call('POST', '/v1/submissions/sub-maya/publish', grade())).status, 409); // only once
});

test('grades are validated: score 0 to 100, known tags only, a note length limit, and unknown submissions are 404', async () => {
  const t = await h.person('teacher');
  for (const bad of [{ score: 101 }, { score: -1 }, { score: 9.5 }, { tags: ['Made Up'] }, { note: 'x'.repeat(1001) }, { extra: true }]) {
    assert.equal((await t.call('POST', '/v1/submissions/sub-maya/publish', grade(bad))).status, 400, JSON.stringify(bad));
  }
  assert.equal((await t.call('POST', '/v1/submissions/nope/publish', grade())).status, 404);
  assert.equal((await json(await t.call('GET', '/v1/dashboard'))).teacher.grading.queue.length, 2); // nothing was published
});

test('a draft keeps the teacher’s score, tags and note without publishing', async () => {
  const t = await h.person('teacher');
  assert.equal((await t.call('POST', '/v1/submissions/sub-ethan/draft', grade({ score: 71, tags: [], note: 'Needs another pass' }))).status, 200);
  const q = (await json(await t.call('GET', '/v1/dashboard'))).teacher.grading.queue.find((x: any) => x.id === 'sub-ethan');
  assert.deepEqual([q.score, q.note, q.draft], [71, 'Needs another pass', true]);
});

test('the reset helper puts the sample data back, and does not exist in production', async () => {
  const [t, s] = [await h.person('teacher'), await h.person('student')];
  await t.call('POST', '/v1/assignments', assignment());
  assert.equal((await t.call('POST', '/v1/__reset')).status, 204);
  assert.equal((await json(await s.call('GET', '/v1/dashboard'))).student.assignments.length, 2);
  const prod = createHarness({ production: true });
  assert.equal((await (await prod.person('teacher')).call('POST', '/v1/__reset')).status, 404);
});
