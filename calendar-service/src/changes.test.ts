import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createHarness, json, slot, type Person } from '../tests/harness.ts';

let h: Awaited<ReturnType<typeof createHarness>>;
before(async () => { h = await createHarness(); });
after(() => h.close());
beforeEach(() => h.reset());

const mk = async (teacher: Person, students: Person[], over: Record<string, unknown> = {}) => {
  const res = await teacher.call('POST', '/v1/events', { title: 'Algebra', ...slot(10), participants: students.map((s) => ({ email: s.email, userId: s.id })), ...over });
  assert.equal(res.status, 201, JSON.stringify(await res.clone().json()));
  return json(res);
};
const mails = async () => { await h.outbox(); const m = [...h.mailer.sent]; h.mailer.sent.length = 0; return m; };
const ics = (m: { ics: { content: string } }) => m.ics.content.replace(/\r\n /g, '');
const seq = (m: { ics: { content: string } }) => Number(/SEQUENCE:(\d+)/.exec(m.ics.content)![1]);

test('rescheduling: new time, everyone must answer again, everyone is emailed with a higher sequence', async () => {
  const t = await h.person('teacher'); const [a, b] = [await h.person('student'), await h.person('student')];
  const ev = await mk(t, [a, b]);
  await a.call('POST', `/v1/events/${ev.id}/respond`, { response: 'accepted' });
  await mails();

  const res = await t.call('PATCH', `/v1/events/${ev.id}`, { start: '2030-01-07T14:00:00Z' });
  assert.equal(res.status, 200);
  const moved = await json(res);
  assert.equal(moved.start, '2030-01-07T14:00:00.000Z');
  assert.equal(moved.end, '2030-01-07T15:00:00.000Z', 'the duration is kept');
  assert.ok(moved.participants.every((p: any) => p.status === 'invited'), 'accepted answers are reset');
  const sent = await mails();
  assert.equal(sent.length, 2);
  assert.ok(sent.every((m) => m.subject.startsWith('Updated:') && m.ics.method === 'REQUEST' && seq(m) === 1));
  assert.ok(sent.every((m) => ics(m).includes('DTSTART:20300107T140000Z') && ics(m).includes(`UID:${ev.id}@syncschedule`)), 'same UID, so calendars update the existing entry');
});

test('changes people must hear about bump the sequence; cosmetic ones do not', async () => {
  const t = await h.person('teacher'); const a = await h.person('student');
  const ev = await mk(t, [a]); await mails();
  const patch = (b: object) => t.call('PATCH', `/v1/events/${ev.id}`, b);

  assert.equal((await patch({ category: 'office_hours' })).status, 200);
  assert.equal((await mails()).length, 0, 'category is internal: no email');
  assert.equal((await patch({})).status, 200);
  assert.equal((await patch({ title: 'Algebra' })).status, 200);
  assert.equal((await mails()).length, 0, 'nothing changed: no email');

  await patch({ description: 'Bring a calculator' });
  let sent = await mails();
  assert.equal(sent.length, 1);
  assert.equal(seq(sent[0]), 1);
  assert.ok(ics(sent[0]).includes('DESCRIPTION:Bring a calculator'));

  await patch({ location: 'Room 4' }); await patch({ title: 'Algebra II' });
  sent = await mails();
  assert.deepEqual(sent.map(seq), [2, 3]);

  const after = await json(await patch({ meet: true }));
  assert.ok(after.meetingUrl.startsWith('https://meet.example.test/'));
  const link = after.meetingUrl;
  assert.equal((await json(await patch({ meet: true }))).meetingUrl, link, 'asking again keeps the same room');
  assert.equal((await json(await patch({ meet: false }))).meetingUrl, null);
  assert.equal((await json(await patch({ meetingUrl: 'https://zoom.example.test/j/9' }))).meetingUrl, 'https://zoom.example.test/j/9');
  assert.equal((await patch({ meetingUrl: 'http://insecure.test' })).status, 400);
  assert.equal((await patch({ title: '' })).status, 400);
  assert.equal((await patch({ start: '2030-01-07T10:00:00Z', end: '2030-01-07T09:00:00Z' })).status, 400);
});

test('moving a class into a clash is refused unless forced; the teacher\'s own class does not clash with itself', async () => {
  const t = await h.person('teacher');
  const a = await mk(t, [], { title: 'A', ...slot(10) });
  const b = await mk(t, [], { title: 'B', ...slot(12) });
  assert.equal((await t.call('PATCH', `/v1/events/${a.id}`, { start: '2030-01-07T10:15:00Z' })).status, 200, 'overlapping its own old time is fine');
  assert.equal((await t.call('PATCH', `/v1/events/${b.id}`, { start: '2030-01-07T10:30:00Z' })).status, 409, 'but not another class');
  assert.equal((await t.call('PATCH', `/v1/events/${b.id}`, { start: '2030-01-07T10:30:00Z', force: true })).status, 200);
});

test('a student already in another class cannot be moved into a clash', async () => {
  const [ta, tb] = [await h.person('teacher'), await h.person('teacher')]; const s = await h.person('student');
  await mk(ta, [s], { title: 'Theirs', ...slot(10) });
  const mine = await mk(tb, [s], { title: 'Mine', ...slot(14) });
  const res = await tb.call('PATCH', `/v1/events/${mine.id}`, { start: '2030-01-07T10:00:00Z' });
  assert.equal(res.status, 409);
  assert.equal((await json(res)).error.code, 'participant_conflict');
});

test('who may change a class: its teacher and staff; not other teachers or participants', async () => {
  const [t, other] = [await h.person('teacher'), await h.person('teacher')]; const admin = await h.person('admin'); const s = await h.person('student');
  const ev = await mk(t, [s]);
  assert.equal((await other.call('PATCH', `/v1/events/${ev.id}`, { title: 'x' })).status, 404);
  assert.equal((await s.call('PATCH', `/v1/events/${ev.id}`, { title: 'x' })).status, 403);
  assert.equal((await admin.call('PATCH', `/v1/events/${ev.id}`, { title: 'By admin' })).status, 200);
  assert.equal((await h.service('PATCH', `/v1/events/${ev.id}`, { title: 'By service' })).status, 200);
  assert.equal((await json(await t.call('GET', `/v1/events/${ev.id}`))).title, 'By service');
  assert.equal((await t.call('PATCH', `/v1/events/not-a-uuid`, { title: 'x' })).status, 400);
});

test('cancelling: students are emailed a CANCEL for the same entry, once; it frees the time', async () => {
  const t = await h.person('teacher'); const [a, b] = [await h.person('student'), await h.person('student')];
  const ev = await mk(t, [a, b]); await mails();
  const res = await t.call('DELETE', `/v1/events/${ev.id}`);
  assert.equal(res.status, 200);
  assert.equal((await json(res)).status, 'cancelled');
  const sent = await mails();
  assert.equal(sent.length, 2);
  for (const m of sent) {
    assert.equal(m.ics.method, 'CANCEL');
    assert.ok(ics(m).includes('STATUS:CANCELLED') && ics(m).includes(`UID:${ev.id}@syncschedule`));
    assert.equal(seq(m), 1);
    assert.match(m.subject, /^Cancelled: Algebra/);
    assert.ok(!m.text.includes('Join online'), 'no meeting link in a cancellation');
  }
  assert.equal((await t.call('DELETE', `/v1/events/${ev.id}`)).status, 200, 'idempotent');
  assert.equal((await mails()).length, 0, 'no second round of emails');

  assert.equal((await t.call('POST', '/v1/events', { title: 'Reuse the slot', ...slot(10), participants: [{ email: a.email }] })).status, 201, 'time and students are free again');
  assert.equal((await t.call('PATCH', `/v1/events/${ev.id}`, { title: 'zombie' })).status, 409, 'cannot edit a cancelled class');
  assert.deepEqual((await json(await a.call('GET', '/v1/events'))).events.map((e: any) => e.title), ['Reuse the slot'], 'hidden from the default list');
  assert.equal((await json(await a.call('GET', `/v1/events/${ev.id}`))).status, 'cancelled', 'but still viewable by id');
});

test('adding students: only new people are invited, duplicates ignored, conflicts checked', async () => {
  const [t, ta] = [await h.person('teacher'), await h.person('teacher')]; const [a, b, c] = [await h.person('student'), await h.person('student'), await h.person('student')];
  const ev = await mk(t, [a]); await mails();
  const res = await t.call('POST', `/v1/events/${ev.id}/participants`, { participants: [{ email: a.email.toUpperCase() }, { email: b.email }, { email: b.email }] });
  assert.equal(res.status, 201);
  assert.equal((await json(res)).participantCount, 2);
  const sent = await mails();
  assert.deepEqual(sent.map((m) => m.to), [b.email], 'only the new student gets an invitation');
  assert.equal((await json(await t.call('POST', `/v1/events/${ev.id}/participants`, { participants: [{ email: b.email }] }))).participantCount, 2, 'adding someone already there changes nothing');
  assert.equal((await mails()).length, 0);

  await mk(ta, [c], { title: 'Elsewhere', ...slot(10) });
  const clash = await t.call('POST', `/v1/events/${ev.id}/participants`, { participants: [{ email: c.email }] });
  assert.equal(clash.status, 409);
  assert.equal((await json(clash)).error.code, 'participant_conflict');
  assert.equal((await t.call('POST', `/v1/events/${ev.id}/participants`, { participants: [{ email: c.email }], force: true })).status, 201);
  assert.equal((await t.call('POST', `/v1/events/${ev.id}/participants`, { participants: [] })).status, 400);
});

test('removing a student: they get a cancellation, others are untouched, and the class disappears for them', async () => {
  const t = await h.person('teacher'); const [a, b] = [await h.person('student'), await h.person('student')];
  const ev = await mk(t, [a, b]); await mails();
  const gone = ev.participants.find((p: any) => p.email === a.email);
  const res = await t.call('DELETE', `/v1/events/${ev.id}/participants/${gone.id}`);
  assert.equal(res.status, 200);
  assert.equal((await json(res)).participantCount, 1);
  const sent = await mails();
  assert.deepEqual(sent.map((m) => [m.to, m.ics.method]), [[a.email, 'CANCEL']]);
  assert.ok(seq(sent[0]) >= 1, 'a higher sequence than the invitation they received');
  assert.equal((await a.call('GET', `/v1/events/${ev.id}`)).status, 404);
  assert.equal((await b.call('GET', `/v1/events/${ev.id}`)).status, 200);
  assert.equal((await t.call('DELETE', `/v1/events/${ev.id}/participants/${gone.id}`)).status, 404, 'already removed');
  assert.equal((await t.call('DELETE', `/v1/events/${ev.id}/participants/${randomUUID()}`)).status, 404);
});

test('only the class\'s teacher or staff manage its roster; cancelled classes cannot gain students', async () => {
  const [t, other] = [await h.person('teacher'), await h.person('teacher')]; const s = await h.person('student'); const admin = await h.person('admin');
  const ev = await mk(t, [s]);
  const add = { participants: [{ email: 'x@example.test' }] };
  assert.equal((await other.call('POST', `/v1/events/${ev.id}/participants`, add)).status, 404);
  assert.equal((await s.call('POST', `/v1/events/${ev.id}/participants`, add)).status, 403);
  assert.equal((await admin.call('POST', `/v1/events/${ev.id}/participants`, add)).status, 201);
  await t.call('DELETE', `/v1/events/${ev.id}`);
  assert.equal((await t.call('POST', `/v1/events/${ev.id}/participants`, add)).status, 409);
});

test('students answer invitations; the teacher sees the answers; changing your mind works', async () => {
  const t = await h.person('teacher'); const [a, b] = [await h.person('student'), await h.person('student')];
  const ev = await mk(t, [a, b]);
  const answer = (p: Person, response: string) => p.call('POST', `/v1/events/${ev.id}/respond`, { response });

  const accepted = await json(await answer(a, 'accepted'));
  assert.equal(accepted.myStatus, 'accepted');
  assert.deepEqual(accepted.participants.map((p: any) => p.email), [a.email], 'still only themselves');
  assert.equal((await json(await answer(b, 'declined'))).myStatus, 'declined');
  const view = await json(await t.call('GET', `/v1/events/${ev.id}`));
  assert.deepEqual(Object.fromEntries(view.participants.map((p: any) => [p.email, p.status])), { [a.email]: 'accepted', [b.email]: 'declined' });
  assert.ok(view.participants.find((p: any) => p.email === a.email).respondedAt);
  assert.equal((await json(await answer(b, 'accepted'))).myStatus, 'accepted', 'changed their mind');
});

test('only an invitee can answer; owners, strangers, the service key, bad answers and cancelled classes cannot', async () => {
  const t = await h.person('teacher'); const s = await h.person('student'); const stranger = await h.person('student'); const admin = await h.person('admin');
  const ev = await mk(t, [s]);
  const answer = (c: Person['call'], response: unknown) => c('POST', `/v1/events/${ev.id}/respond`, { response });
  assert.equal((await answer(stranger.call, 'accepted')).status, 404);
  assert.equal((await answer(t.call, 'accepted')).status, 404, 'the teacher is not an invitee');
  assert.equal((await answer(admin.call, 'accepted')).status, 404);
  assert.equal((await answer(h.service, 'accepted')).status, 403);
  assert.equal((await answer(s.call, 'maybe')).status, 400);
  assert.equal((await s.call('POST', `/v1/events/${ev.id}/respond`, { response: 'accepted', status: 'x' })).status, 400, 'no extra keys');
  await t.call('DELETE', `/v1/events/${ev.id}`);
  assert.equal((await answer(s.call, 'accepted')).status, 409);
});
