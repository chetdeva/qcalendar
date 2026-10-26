import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, json, type Harness } from '../tests/harness.ts';
import { MemoryMailer } from '../src/mail.ts';
import { processOutbox } from '../src/outbox.ts';

let h: Harness;
beforeEach(async () => { h = await createHarness(); });

// A teacher, a student who shares a class with them, and a stranger of each kind.
async function world() {
  const [t, s, otherT, otherS] = [await h.person('teacher', 'Tess Teacher'), await h.person('student', 'Mia Student'), await h.person('teacher', 'Tom Teacher'), await h.person('student', 'Olly Other')];
  h.classFor(t, [s]);
  h.classFor(otherT, [otherS]);
  return { t, s, otherT, otherS };
}
const task = (studentId: string, over: Record<string, unknown> = {}) => ({ studentId, concept: 'Right Triangles', dueDate: '2030-03-20', xp: 120, prompt: 'Explore the 3-4-5 triangle.', ...over });
const assign = async (t: any, studentId: string, over = {}) => (await json(await t.call('POST', '/v1/assignments', task(studentId, over)))).id as string;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]).toString('base64');
const grade = (over = {}) => ({ score: 96, tags: ['Visual Clarity', 'High Adversity Quotient (AQ)'], note: 'Lovely proof.', ...over });

/** Assigns a task, the student hands in work, and returns ids. */
async function handedIn(w: Awaited<ReturnType<typeof world>>, answer = 'The hypotenuse is 5.') {
  const id = await assign(w.t, w.s.id);
  assert.equal((await w.s.call('POST', `/v1/assignments/${id}/submit`, { answer })).status, 204);
  const sub = (await json(await w.t.call('GET', '/v1/dashboard'))).teacher.grading.queue.find((q: any) => q.assignmentId === id);
  return { id, sub: sub.id as string };
}

test('assigning: only to students you share a class with, with a real due date, and the student then sees it', async () => {
  const { t, s, otherS } = await world();
  assert.equal((await t.call('POST', '/v1/assignments', task(otherS.id))).status, 403); // not their student
  assert.equal((await t.call('POST', '/v1/assignments', task(crypto.randomUUID()))).status, 403);
  for (const bad of [{ studentId: 'nope' }, { concept: '' }, { prompt: '   ' }, { dueDate: 'tomorrow' }, { dueDate: '2030-03-14' }, { xp: -1 }, { xp: 1.5 }, { xp: 5000 }, { extra: 1 }]) {
    assert.equal((await t.call('POST', '/v1/assignments', task(s.id, bad))).status, 400, JSON.stringify(bad));
  }
  const id = await assign(t, s.id, { preset: '5-Question Micro-Quest' });
  const mine = (await json(await s.call('GET', '/v1/dashboard'))).student.assignments;
  assert.equal(mine.length, 1);
  assert.deepEqual([mine[0].id, mine[0].title, mine[0].state, mine[0].status, mine[0].totalSteps, mine[0].due], [id, 'Right Triangles', 'todo', 'Not Started', 5, 'Due Mar 20']);
  assert.equal((await json(await (await h.person('student')).call('GET', '/v1/dashboard'))).student.assignments.length, 0); // nobody else sees it
});

test('progress: a student saves how many steps are done on their own task, within the limit, until it is handed in', async () => {
  const { t, s, otherS } = await world();
  const id = await assign(t, s.id, { preset: 'Spatial Proof Scratchpad' }); // 3 steps
  assert.equal((await s.call('POST', `/v1/assignments/${id}/progress`, { stepsDone: 2 })).status, 204);
  assert.deepEqual((await json(await s.call('GET', `/v1/assignments/${id}`))).state, 'in_progress');
  assert.equal((await json(await s.call('GET', `/v1/assignments/${id}`))).status, 'In Progress (2/3 done)');
  assert.equal((await s.call('POST', `/v1/assignments/${id}/progress`, { stepsDone: 4 })).status, 400); // more than it has
  assert.equal((await s.call('POST', `/v1/assignments/${id}/progress`, { stepsDone: -1 })).status, 400);
  assert.equal((await otherS.call('POST', `/v1/assignments/${id}/progress`, { stepsDone: 1 })).status, 404); // someone else's task looks like no task
  assert.equal((await otherS.call('GET', `/v1/assignments/${id}`)).status, 404);
  assert.equal((await t.call('POST', `/v1/assignments/${id}/progress`, { stepsDone: 1 })).status, 403); // teachers do not do the work
  assert.equal((await s.call('GET', '/v1/assignments/not-a-uuid')).status, 404);
});

test('handing in: needs an answer, completes the task, works once, and moves it to the teacher\'s grading queue', async () => {
  const { t, s, otherS } = await world();
  const id = await assign(t, s.id);
  assert.equal((await s.call('POST', `/v1/assignments/${id}/submit`, { answer: '   ' })).status, 400);
  assert.equal((await s.call('POST', `/v1/assignments/${id}/submit`, { answer: 'x'.repeat(5001) })).status, 400);
  assert.equal((await otherS.call('POST', `/v1/assignments/${id}/submit`, { answer: 'mine now' })).status, 404);
  assert.equal((await s.call('POST', `/v1/assignments/${id}/submit`, { answer: 'The hypotenuse is 5.' })).status, 204);
  const d = await json(await s.call('GET', `/v1/assignments/${id}`));
  assert.deepEqual([d.state, d.doneSteps, d.totalSteps, d.answer, d.action], ['submitted', 5, 5, 'The hypotenuse is 5.', 'View Submission']);
  assert.equal((await s.call('POST', `/v1/assignments/${id}/submit`, { answer: 'again' })).status, 409);
  assert.equal((await s.call('POST', `/v1/assignments/${id}/progress`, { stepsDone: 1 })).status, 409);
  const q = (await json(await t.call('GET', '/v1/dashboard'))).teacher.grading;
  assert.deepEqual([q.pending, q.queue.length, q.queue[0].student, q.queue[0].answer, q.queue[0].score, q.queue[0].draft], [1, 1, 'Mia Student', 'The hypotenuse is 5.', null, false]);
  const other = (await json(await (await h.person('teacher')).call('GET', '/v1/dashboard'))).teacher.grading.queue;
  assert.equal(other.length, 0); // another teacher's queue is separate
});

test('images: real png, jpeg or webp up to 1.5 MB; the owner and the assigning teacher can see them, nobody else', async () => {
  const { t, s, otherT, otherS } = await world();
  const up = (who: any, contentType: string, data: string) => who.call('POST', '/v1/attachments', { contentType, data });
  const ok = await up(s, 'image/png', PNG);
  assert.equal(ok.status, 201);
  const attId = (await json(ok)).id;
  assert.equal((await up(s, 'image/jpeg', PNG)).status, 400); // says jpeg, is a png
  assert.equal((await up(s, 'image/png', Buffer.from('<script>alert(1)</script>').toString('base64'))).status, 400); // not an image at all
  assert.equal((await up(s, 'image/gif', PNG)).status, 400);
  assert.equal((await up(s, 'image/png', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(1_600_000)]).toString('base64'))).status, 413);
  assert.equal((await up(t, 'image/png', PNG)).status, 403); // teachers do not upload work

  const id = await assign(t, s.id);
  assert.equal((await otherS.call('POST', `/v1/assignments/${id}/submit`, { answer: 'x', attachmentId: attId })).status, 404);
  const mine = await h.person('student'); // someone else's attachment cannot be attached to my own task either
  h.classFor(t, [mine]);
  const id2 = await assign(t, mine.id);
  assert.equal((await mine.call('POST', `/v1/assignments/${id2}/submit`, { answer: 'x', attachmentId: attId })).status, 400);
  assert.equal((await s.call('POST', `/v1/assignments/${id}/submit`, { answer: 'with a picture', attachmentId: attId })).status, 204);

  const view = (who: any) => who.call('GET', `/v1/attachments/${attId}`);
  const own = await view(s);
  assert.equal(own.status, 200);
  assert.equal(own.headers.get('content-type'), 'image/png');
  assert.equal(own.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await view(t)).status, 200); // the teacher who assigned the task
  assert.equal((await view(otherT)).status, 404); // another teacher
  assert.equal((await view(otherS)).status, 404); // another student
  assert.equal((await h.app.request(`/v1/attachments/${attId}`)).status, 401);
  assert.equal((await json(await t.call('GET', '/v1/dashboard'))).teacher.grading.queue[0].attachmentId, attId);
});

test('grading: a draft keeps the teacher\'s work, publishing needs a valid grade and happens once, only for the teacher who assigned it', async () => {
  const w = await world();
  const { sub } = await handedIn(w);
  assert.equal((await w.t.call('POST', `/v1/submissions/${sub}/draft`, grade({ score: 71, tags: [], note: 'Needs another pass' }))).status, 204);
  const q = (await json(await w.t.call('GET', '/v1/dashboard'))).teacher.grading;
  assert.deepEqual([q.queue[0].score, q.queue[0].note, q.queue[0].draft, q.readyForSync], [71, 'Needs another pass', true, '1 of 1 drafts ready']);
  for (const bad of [{ score: 101 }, { score: -1 }, { score: 9.5 }, { tags: ['Made Up'] }, { note: 'x'.repeat(1001) }, { extra: true }]) {
    assert.equal((await w.t.call('POST', `/v1/submissions/${sub}/publish`, grade(bad))).status, 400, JSON.stringify(bad));
  }
  assert.equal((await w.s.call('POST', `/v1/submissions/${sub}/publish`, grade())).status, 403); // the student cannot grade themselves
  assert.equal((await w.otherT.call('POST', `/v1/submissions/${sub}/publish`, grade())).status, 404); // not their task
  assert.equal((await w.t.call('POST', `/v1/submissions/${crypto.randomUUID()}/publish`, grade())).status, 404);
  assert.equal((await json(await w.t.call('GET', '/v1/dashboard'))).teacher.grading.queue.length, 1); // nothing was published by the bad attempts
  const ok = await w.t.call('POST', `/v1/submissions/${sub}/publish`, grade());
  assert.equal(ok.status, 201);
  assert.deepEqual((await json(ok)).grade, 'A');
  assert.equal((await w.t.call('POST', `/v1/submissions/${sub}/publish`, grade())).status, 409);
  assert.equal((await w.t.call('POST', `/v1/submissions/${sub}/draft`, grade())).status, 409);
});

test('after grading the student sees feedback, points and a tenacity tier; the teacher\'s queue and metrics update', async () => {
  const w = await world();
  const { id, sub } = await handedIn(w);
  assert.equal((await w.t.call('POST', `/v1/submissions/${sub}/publish`, grade())).status, 201);
  const d = (await json(await w.s.call('GET', '/v1/dashboard'))).student;
  assert.equal(d.assignments.length, 0); // it moved out of "to do"
  assert.deepEqual(d.feedback.map((f: any) => [f.assignmentId, f.score, f.grade, f.coach, f.note, f.gradedLabel]), [[id, 96, 'A', 'Tess Teacher', 'Lovely proof.', 'Graded just now']]);
  assert.deepEqual(d.feedback[0].tags, ['Visual Clarity', 'High Adversity Quotient (AQ)']);
  assert.deepEqual([d.welcome.points, d.welcome.streakDays, d.welcome.aq], [120, 1, 100]); // XP of the task; one active day; tagged AND handed in
  assert.equal(d.progress.tenacity.value, 'Tier 1: High Resilience');
  assert.equal(d.progress.weekly.value, '1 / 5 Tasks Completed');
  const full = await json(await w.s.call('GET', `/v1/assignments/${id}`));
  assert.deepEqual([full.state, full.score, full.grade, full.coach], ['graded', 96, 'A', 'Tess Teacher']);
  const t = (await json(await w.t.call('GET', '/v1/dashboard'))).teacher;
  assert.equal(t.grading.queue.length, 0);
  assert.equal(t.metrics[2].value, '0 Submissions');
  const row = t.directory.students[0];
  assert.deepEqual([row.mastery, row.aq, row.topic, row.unitPct], [96, 'High Resilience', 'Right Triangles', 100]);
});

test('streak: counts days the student saved progress or handed in work, and breaks after a missed day', async () => {
  const { t, s } = await world();
  const a = await assign(t, s.id);
  const streak = async () => (await json(await s.call('GET', '/v1/dashboard'))).student.welcome.streakDays;
  assert.equal(await streak(), 0);
  await s.call('POST', `/v1/assignments/${a}/progress`, { stepsDone: 1 });
  assert.equal(await streak(), 1);
  h.clock.now = new Date('2030-03-16T10:00:00Z');
  await s.call('POST', `/v1/assignments/${a}/progress`, { stepsDone: 2 });
  assert.equal(await streak(), 2);
  h.clock.now = new Date('2030-03-17T10:00:00Z'); // still alive: yesterday counts until today ends
  assert.equal(await streak(), 2);
  h.clock.now = new Date('2030-03-19T10:00:00Z'); // two days missed
  assert.equal(await streak(), 0);
});

test('parent sync: the guardian is emailed once the grade is published; no guardian or a failed lookup never blocks the grade', async () => {
  const w = await world();
  h.state.guardians.set(w.s.id, { name: 'Mia Student', guardianEmail: 'parent@example.test' });
  const { sub } = await handedIn(w);
  const res = await w.t.call('POST', `/v1/submissions/${sub}/publish`, grade({ note: 'Great persistence this week.' }));
  assert.equal((await json(res)).parentSync, 'sent');
  assert.equal((await h.db.query("select 1 from dashboard.mail_outbox where status = 'pending' and to_email = 'parent@example.test'")).length, 1);
  const mailer = new MemoryMailer();
  assert.deepEqual(await processOutbox(h.db, mailer), { sent: 1, attempted: 1 });
  const [mail] = mailer.sent;
  assert.equal(mail.to, 'parent@example.test');
  assert.equal(mail.subject, 'Mia Student’s new grade: Right Triangles');
  assert.match(mail.text, /Tess Teacher has graded Mia Student’s task “Right Triangles”/);
  assert.match(mail.text, /Score: 96\/100 \(A\)/);
  assert.match(mail.text, /Strengths: Visual Clarity, High Adversity Quotient \(AQ\)/);
  assert.match(mail.text, /Great persistence this week\./);
  assert.match(mail.text, /https:\/\/dashboard\.example\.test/);
  assert.deepEqual(await processOutbox(h.db, mailer), { sent: 0, attempted: 0 }); // never twice

  // No guardian on file: published, nothing queued, and the teacher is told.
  const none = await world();
  const second = await handedIn(none);
  assert.equal((await json(await none.t.call('POST', `/v1/submissions/${second.sub}/publish`, grade()))).parentSync, 'no_guardian');
  // The lookup fails: still published.
  const down = await world();
  h.state.guardianFails = true;
  const third = await handedIn(down);
  const r3 = await down.t.call('POST', `/v1/submissions/${third.sub}/publish`, grade());
  assert.equal(r3.status, 201);
  assert.equal((await json(r3)).parentSync, 'failed');
  assert.equal((await h.db.query("select 1 from dashboard.mail_outbox where status = 'pending'")).length, 0); // the earlier one was sent; none new
});

test('the outbox retries a failing email with backoff and gives up after eight tries', async () => {
  const w = await world();
  h.state.guardians.set(w.s.id, { name: 'Mia', guardianEmail: 'parent@example.test' });
  const { sub } = await handedIn(w);
  await w.t.call('POST', `/v1/submissions/${sub}/publish`, grade());
  const broken = new MemoryMailer();
  broken.failAlways = true;
  for (let i = 1; i <= 8; i++) {
    await h.db.query("update dashboard.mail_outbox set next_at = now() where status = 'pending'"); // skip the waiting
    await processOutbox(h.db, broken);
    const [row] = await h.db.query<{ status: string; attempts: number }>('select status, attempts from dashboard.mail_outbox');
    assert.deepEqual([row.attempts, row.status], [i, i === 8 ? 'failed' : 'pending']);
  }
  assert.equal(broken.sent.length, 0);
});
