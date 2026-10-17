import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, json, slot, type Person } from '../tests/harness.ts';

let h: Awaited<ReturnType<typeof createHarness>>;
before(async () => { h = await createHarness(); });
after(() => h.close());
beforeEach(() => h.reset());

const klass = async (t: Person, students: Person[], over: Record<string, unknown> = {}) => {
  const res = await t.call('POST', '/v1/events', { title: 'Algebra', ...slot(10), participants: students.map((s) => ({ email: s.email, userId: s.id })), ...over });
  assert.equal(res.status, 201, JSON.stringify(await res.clone().json()));
  return json(res);
};
const mails = (kind: string) => h.db.query<{ to_email: string; payload: any }>('select to_email, payload from calendar.email_outbox where kind = $1 order by id', [kind]);
const NEW_TIME = slot(15).start; // 15:00 the same day, in the future

test('decline with a note: stored, shown to the teacher and the student only, and the teacher is emailed', async () => {
  const t = await h.person('teacher', { name: 'Tess Teacher' });
  const [a, b] = [await h.person('student', { name: 'Ann' }), await h.person('student')];
  const ev = await klass(t, [a, b]);
  const res = await a.call('POST', `/v1/events/${ev.id}/respond`, { response: 'declined', note: '  I have an exam that day  ' });
  assert.equal(res.status, 200);
  assert.equal((await json(res)).participants[0].note, 'I have an exam that day');
  const seen = (await json(await t.call('GET', `/v1/events/${ev.id}`))).participants.find((p: any) => p.email === a.email);
  assert.deepEqual([seen.status, seen.note], ['declined', 'I have an exam that day']);
  const other = await json(await b.call('GET', `/v1/events/${ev.id}`));
  assert.equal(other.participants.length, 1); // b sees only themself, so never a's note
  assert.equal(other.participants[0].note, null);
  const [mail] = await mails('declined');
  assert.equal(mail.to_email, t.email);
  assert.deepEqual([mail.payload.from.name, mail.payload.note], ['Ann', 'I have an exam that day']);
});

test('a note needs a decline, is capped at 500 characters, and accepting later clears it', async () => {
  const t = await h.person('teacher');
  const a = await h.person('student');
  const ev = await klass(t, [a]);
  assert.equal((await a.call('POST', `/v1/events/${ev.id}/respond`, { response: 'accepted', note: 'hi' })).status, 400);
  assert.equal((await a.call('POST', `/v1/events/${ev.id}/respond`, { response: 'declined', note: 'x'.repeat(501) })).status, 400);
  await a.call('POST', `/v1/events/${ev.id}/respond`, { response: 'declined', note: 'sorry' });
  await a.call('POST', `/v1/events/${ev.id}/respond`, { response: 'declined', note: 'sorry again' });
  assert.equal((await mails('declined')).length, 1); // answering decline twice does not email twice
  const back = await json(await a.call('POST', `/v1/events/${ev.id}/respond`, { response: 'accepted' }));
  assert.equal(back.participants[0].note, null);
});

test('declining without a note is still emailed, and a class without an owner email just skips the email', async () => {
  const t = await h.person('teacher');
  const a = await h.person('student');
  const ev = await klass(t, [a]);
  await a.call('POST', `/v1/events/${ev.id}/respond`, { response: 'declined' });
  assert.equal((await mails('declined'))[0].payload.note, null);
  await h.db.exec('truncate calendar.email_outbox');
  await h.db.query('update calendar.events set owner_email = null where id = $1', [ev.id]);
  await a.call('POST', `/v1/events/${ev.id}/respond`, { response: 'accepted' });
  assert.equal((await a.call('POST', `/v1/events/${ev.id}/respond`, { response: 'declined' })).status, 200);
  assert.equal((await mails('declined')).length, 0);
});

test('time-change request: stored with the same length as the class, visible to the teacher and the student, teacher emailed', async () => {
  const t = await h.person('teacher');
  const a = await h.person('student', { name: 'Ann' });
  const ev = await klass(t, [a], { durationMinutes: 45 });
  const res = await a.call('POST', `/v1/events/${ev.id}/change-requests`, { start: NEW_TIME, note: ' after school? ' });
  assert.equal(res.status, 201);
  const cr = (await json(res)).changeRequest;
  assert.deepEqual([cr.start, cr.end, cr.note, cr.status], ['2030-01-07T15:00:00.000Z', '2030-01-07T15:45:00.000Z', 'after school?', 'pending']);
  for (const p of [t, a]) assert.equal((await json(await p.call('GET', `/v1/events/${ev.id}`))).changeRequest.id, cr.id);
  assert.equal((await json(await a.call('GET', '/v1/events'))).events[0].changeRequest.status, 'pending');
  const [mail] = await mails('change_request');
  assert.equal(mail.to_email, t.email);
  assert.deepEqual([mail.payload.from.name, mail.payload.requested.start], ['Ann', '2030-01-07T15:00:00.000Z']);
});

test('time-change request is refused for group classes, non-invitees, declined or cancelled classes, and bad times', async () => {
  const t = await h.person('teacher');
  const [a, b, stranger] = [await h.person('student'), await h.person('student'), await h.person('student')];
  const group = await klass(t, [a, b]);
  assert.equal((await a.call('POST', `/v1/events/${group.id}/change-requests`, { start: NEW_TIME })).status, 409);
  const solo = await klass(t, [a], slot(12, 60, 8));
  const ask = (p: Person, start = NEW_TIME, id = solo.id) => p.call('POST', `/v1/events/${id}/change-requests`, { start });
  assert.equal((await ask(stranger)).status, 404);
  assert.equal((await ask(t)).status, 404); // the teacher changes the class directly; they are not an invitee
  assert.equal((await ask(a, '2020-01-01T10:00:00Z')).status, 400); // in the past
  assert.equal((await ask(a, solo.start)).status, 400); // no change
  assert.equal((await a.call('POST', `/v1/events/${solo.id}/change-requests`, { start: NEW_TIME, role: 'x' })).status, 400);
  await a.call('POST', `/v1/events/${solo.id}/respond`, { response: 'declined' });
  assert.equal((await ask(a)).status, 409);
  const other = await klass(t, [a], slot(9, 60, 9));
  await t.call('DELETE', `/v1/events/${other.id}`);
  assert.equal((await ask(a, NEW_TIME, other.id)).status, 409);
});

test('a second request replaces the open one; declining withdraws it', async () => {
  const t = await h.person('teacher');
  const a = await h.person('student');
  const ev = await klass(t, [a]);
  await a.call('POST', `/v1/events/${ev.id}/change-requests`, { start: NEW_TIME });
  const second = await json(await a.call('POST', `/v1/events/${ev.id}/change-requests`, { start: slot(16).start }));
  assert.equal((await h.db.query("select 1 from calendar.change_requests where status = 'pending'")).length, 1);
  assert.equal(second.changeRequest.start, '2030-01-07T16:00:00.000Z');
  const declined = await json(await a.call('POST', `/v1/events/${ev.id}/respond`, { response: 'declined' }));
  assert.equal(declined.changeRequest.status, 'withdrawn');
});

test('approve moves the class and emails the student; the request is then approved', async () => {
  const t = await h.person('teacher');
  const a = await h.person('student');
  const ev = await klass(t, [a]);
  const cr = (await json(await a.call('POST', `/v1/events/${ev.id}/change-requests`, { start: NEW_TIME }))).changeRequest;
  await h.db.exec('truncate calendar.email_outbox');
  const res = await t.call('POST', `/v1/events/${ev.id}/change-requests/${cr.id}/approve`);
  assert.equal(res.status, 200);
  const after = await json(res);
  assert.equal(after.start, '2030-01-07T15:00:00.000Z');
  assert.equal(after.changeRequest.status, 'approved');
  const sent = await h.db.query<{ kind: string; to_email: string }>('select kind, to_email from calendar.email_outbox');
  assert.deepEqual(sent.map((m) => [m.kind, m.to_email]), [['update', a.email]]);
  assert.equal((await t.call('POST', `/v1/events/${ev.id}/change-requests/${cr.id}/approve`)).status, 409); // already answered
});

test('approve onto a busy time is a 409 and the request stays pending; reject leaves the class alone', async () => {
  const t = await h.person('teacher');
  const [a, b] = [await h.person('student'), await h.person('student')];
  const ev = await klass(t, [a]);
  await klass(t, [b], slot(15)); // the teacher is busy at the requested time
  const cr = (await json(await a.call('POST', `/v1/events/${ev.id}/change-requests`, { start: NEW_TIME }))).changeRequest;
  const clash = await t.call('POST', `/v1/events/${ev.id}/change-requests/${cr.id}/approve`);
  assert.equal(clash.status, 409);
  assert.equal((await json(await t.call('GET', `/v1/events/${ev.id}`))).changeRequest.status, 'pending');
  const rejected = await json(await t.call('POST', `/v1/events/${ev.id}/change-requests/${cr.id}/reject`));
  assert.deepEqual([rejected.start, rejected.changeRequest.status], [ev.start, 'rejected']);
  assert.equal((await json(await a.call('GET', `/v1/events/${ev.id}`))).changeRequest.status, 'rejected');
});

test('only the owning teacher or an admin can answer a request; other people never see it', async () => {
  const [t, otherTeacher, admin] = [await h.person('teacher'), await h.person('teacher'), await h.person('admin')];
  const [a, b] = [await h.person('student'), await h.person('student')];
  const ev = await klass(t, [a]);
  await klass(otherTeacher, [b], slot(9, 60, 9));
  const cr = (await json(await a.call('POST', `/v1/events/${ev.id}/change-requests`, { start: NEW_TIME }))).changeRequest;
  const url = (d: string) => `/v1/events/${ev.id}/change-requests/${cr.id}/${d}`;
  assert.equal((await a.call('POST', url('approve'))).status, 403); // the student cannot approve their own request
  assert.equal((await otherTeacher.call('POST', url('approve'))).status, 404); // cannot even see the class
  assert.equal((await b.call('POST', url('reject'))).status, 404);
  assert.equal((await t.call('POST', `/v1/events/${ev.id}/change-requests/${crypto.randomUUID()}/approve`)).status, 404);
  assert.equal((await admin.call('POST', url('reject'))).status, 200);
});

test('the teacher email reads well, names the student, quotes the note and has no calendar attachment', async () => {
  const t = await h.person('teacher', { name: 'Tess Teacher' });
  const a = await h.person('student', { name: 'Ann' });
  const ev = await klass(t, [a], { title: 'Algebra' });
  await a.call('POST', `/v1/events/${ev.id}/change-requests`, { start: NEW_TIME, note: 'Can we do after school?' });
  await a.call('POST', `/v1/events/${ev.id}/respond`, { response: 'declined', note: 'Exam that day' });
  await h.outbox();
  const toTeacher = h.mailer.sent.filter((m) => m.to === t.email);
  const [ask, no] = toTeacher;
  assert.match(ask.subject, /^Ann asks to move: Algebra/);
  assert.match(ask.text, /Requested time: .*3:00 PM/);
  assert.match(ask.text, /Their note: Can we do after school\?/);
  assert.match(no.subject, /^Ann declined: Algebra/);
  assert.match(no.text, /Their note: Exam that day/);
  assert.ok(toTeacher.every((m) => m.ics === undefined));
});
