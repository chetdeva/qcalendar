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
const queued = () => h.db.query<{ kind: string; to_email: string }>('select kind, to_email from calendar.email_outbox order by id');

test('a teacher creates a group class: owner is the teacher, participants are cleaned, invitations are queued per student', async () => {
  const t = await h.person('teacher', { name: 'Tess Teacher' });
  const [a, b, c] = [await h.person('student'), await h.person('student'), await h.person('student')];
  const ev = await mk(t, [a, b, c], { meet: true, participants: [
    { email: a.email.toUpperCase(), name: ' Ann ' }, { email: b.email }, { email: c.email }, { email: a.email }, // duplicate of a, different case
  ] });
  assert.equal(ev.ownerId, t.id);
  assert.equal(ev.ownerName, 'Tess Teacher');
  assert.equal(ev.ownerEmail, t.email);
  assert.equal(ev.category, 'tutoring');
  assert.equal(ev.participantCount, 3);
  assert.deepEqual(ev.participants.map((p: any) => p.email).sort(), [a.email, b.email, c.email].sort());
  assert.equal(ev.participants.find((p: any) => p.email === a.email).name, 'Ann');
  assert.ok(ev.participants.every((p: any) => p.status === 'invited'));
  assert.match(ev.meetingUrl, /^https:\/\/meet\.example\.test\/sync-[\w-]{12}$/);
  assert.equal(new Set((await queued()).map((m) => m.to_email)).size, 3);
  assert.ok((await queued()).every((m) => m.kind === 'invite'));
});

test('each student gets their own invitation file, listing only themselves', async () => {
  const t = await h.person('teacher', { name: 'Tess Teacher' });
  const [a, b] = [await h.person('student'), await h.person('student')];
  await mk(t, [a, b], { description: 'Chapter 4' });
  await h.outbox();
  assert.equal(h.mailer.sent.length, 2);
  for (const m of h.mailer.sent) {
    const ics = m.ics.content.replace(/\r\n /g, '');
    const other = m.to === a.email ? b.email : a.email;
    assert.ok(ics.includes(`mailto:${m.to}`));
    assert.ok(!ics.includes(other) && !m.text.includes(other), 'no other student leaks');
    assert.equal(m.ics.method, 'REQUEST');
    assert.ok(ics.includes(`ORGANIZER;CN=Tess Teacher:mailto:${t.email}`));
    assert.match(m.subject, /^Invitation: Algebra/);
    assert.equal(m.replyTo, t.email);
  }
});

test('meeting links: https only, generated on request, never for http or script URLs', async () => {
  const t = await h.person('teacher');
  const good = await t.call('POST', '/v1/events', { title: 'x', ...slot(9), meetingUrl: 'https://zoom.example.test/j/123' });
  assert.equal((await json(good)).meetingUrl, 'https://zoom.example.test/j/123');
  for (const url of ['http://zoom.example.test/j/1', 'javascript:alert(1)', 'ftp://x.test/y', 'not a url']) {
    assert.equal((await t.call('POST', '/v1/events', { title: 'x', ...slot(11), meetingUrl: url })).status, 400, url);
  }
  assert.equal((await json(await t.call('POST', '/v1/events', { title: 'x', ...slot(12) }))).meetingUrl, null);
});

test('request validation', async () => {
  const t = await h.person('teacher');
  const post = (b: object) => t.call('POST', '/v1/events', b);
  assert.equal((await post({ ...slot(10) })).status, 400, 'title required');
  assert.equal((await post({ title: '   ', ...slot(10) })).status, 400);
  assert.equal((await post({ title: 'x', start: 'tomorrow', durationMinutes: 60 })).status, 400);
  assert.equal((await post({ title: 'x', start: '2030-01-07T10:00:00Z' })).status, 400, 'end or duration required');
  assert.equal((await post({ title: 'x', start: '2030-01-07T10:00:00Z', end: '2030-01-07T09:00:00Z' })).status, 400, 'end before start');
  assert.equal((await post({ title: 'x', ...slot(10), category: 'party' })).status, 400);
  assert.equal((await post({ title: 'x', ...slot(10), timezone: 'Mars/Base' })).status, 400);
  assert.equal((await post({ title: 'x', ...slot(10), participants: [{ email: 'nope' }] })).status, 400);
  assert.equal((await post({ title: 'x', ...slot(10), participants: [{ email: 'a@b.test', role: 'admin' }] })).status, 400, 'unknown participant keys');
  const many = Array.from({ length: 51 }, (_, i) => ({ email: `s${i}@example.test` }));
  assert.equal((await post({ title: 'x', ...slot(10), participants: many })).status, 400, 'at most 50');
  assert.equal((await t.call('POST', '/v1/events', undefined)).status, 400, 'no body');
});

test('who may create, and on whose calendar', async () => {
  const t = await h.person('teacher'); const other = await h.person('teacher'); const s = await h.person('student'); const admin = await h.person('admin');
  assert.equal((await s.call('POST', '/v1/events', { title: 'x', ...slot(10) })).status, 403, 'students cannot create');
  assert.equal((await t.call('POST', '/v1/events', { title: 'x', ...slot(10), ownerId: other.id })).status, 403, 'not on someone else\'s calendar');
  assert.equal((await json(await t.call('POST', '/v1/events', { title: 'x', ...slot(10), ownerId: t.id }))).ownerId, t.id);
  const onBehalf = await admin.call('POST', '/v1/events', { title: 'by admin', ...slot(14), ownerId: other.id, ownerName: 'Olive Other' });
  assert.equal(onBehalf.status, 201);
  assert.equal((await json(onBehalf)).ownerId, other.id);
  assert.equal((await h.service('POST', '/v1/events', { title: 'x', ...slot(16) })).status, 400, 'service key must say whose calendar');
  assert.equal((await h.service('POST', '/v1/events', { title: 'x', ...slot(16), ownerId: t.id })).status, 201);
});

test('privacy: a teacher sees only their own classes; a student only classes they are in, and never other students', async () => {
  const [ta, tb] = [await h.person('teacher'), await h.person('teacher')];
  const [s1, s2, stranger] = [await h.person('student'), await h.person('student'), await h.person('student')];
  const admin = await h.person('admin');
  const classA = await mk(ta, [s1, s2], { title: 'Class A', ...slot(10) });
  const classB = await mk(tb, [s2], { title: 'Class B', ...slot(14) }); // a different hour: a student cannot be in two classes at once
  const titles = async (p: Person) => (await json(await p.call('GET', '/v1/events'))).events.map((e: any) => e.title).sort();

  assert.deepEqual(await titles(ta), ['Class A']);
  assert.deepEqual(await titles(tb), ['Class B']);
  assert.deepEqual(await titles(s1), ['Class A']);
  assert.deepEqual(await titles(s2), ['Class A', 'Class B']);
  assert.deepEqual(await titles(stranger), []);
  assert.deepEqual(await titles(admin), ['Class A', 'Class B']);
  assert.deepEqual(await titles({ call: h.service } as Person), ['Class A', 'Class B']);

  // By id: someone who may not see a class gets exactly the answer for a class that does not exist.
  for (const who of [tb, stranger, s1]) {
    if (who === s1) continue;
    for (const [m, path, body] of [['GET', ''], ['PATCH', '', { title: 'hijack' }], ['DELETE', ''], ['POST', '/participants', { participants: [{ email: 'x@example.test' }] }], ['POST', '/respond', { response: 'accepted' }]] as const) {
      const res = await who.call(m, `/v1/events/${classA.id}${path}`, body);
      assert.equal(res.status, 404, `${who.email} ${m}${path}`);
      assert.equal((await json(res)).error.code, 'not_found');
    }
  }
  assert.equal((await tb.call('GET', `/v1/events/${randomUUID()}`)).status, 404, 'same as a class that truly is missing');

  const mine = await json(await s1.call('GET', `/v1/events/${classA.id}`));
  assert.equal(mine.participantCount, 2);
  assert.deepEqual(mine.participants.map((p: any) => p.email), [s1.email], 'only themselves');
  assert.equal(mine.myStatus, 'invited');
  assert.equal(mine.meetUrl, undefined, 'no deprecated aliases');
  assert.ok(!JSON.stringify(mine).includes(s2.email), 'the other student\'s email is nowhere in the response');
  const inList = (await json(await s1.call('GET', '/v1/events'))).events[0];
  assert.ok(!JSON.stringify(inList).includes(s2.email));

  assert.equal((await json(await ta.call('GET', `/v1/events/${classA.id}`))).participants.length, 2, 'the teacher sees everyone');
  assert.equal(classB.ownerId, tb.id);
});

test('students cannot change a class they are in', async () => {
  const t = await h.person('teacher'); const s = await h.person('student');
  const ev = await mk(t, [s]);
  assert.equal((await s.call('PATCH', `/v1/events/${ev.id}`, { title: 'mine now' })).status, 403);
  assert.equal((await s.call('DELETE', `/v1/events/${ev.id}`)).status, 403);
  assert.equal((await s.call('POST', `/v1/events/${ev.id}/participants`, { participants: [{ email: 'friend@example.test' }] })).status, 403);
  assert.equal((await s.call('DELETE', `/v1/events/${ev.id}/participants/${ev.participants[0].id}`)).status, 403);
  assert.equal((await json(await t.call('GET', `/v1/events/${ev.id}`))).title, 'Algebra');
});

test('an invitation sent to an email belongs to whoever signs in with it, and is linked to their account', async () => {
  const t = await h.person('teacher');
  await t.call('POST', '/v1/events', { title: 'For a new student', ...slot(10), participants: [{ email: 'New.Kid@Example.test' }] });
  const stranger = await h.person('student', { email: 'someone.else@example.test' });
  assert.deepEqual((await json(await stranger.call('GET', '/v1/events'))).events, []);

  const kid = await h.person('student', { email: 'new.kid@example.test' }); // signs up later, any letter case
  const events = (await json(await kid.call('GET', '/v1/events'))).events;
  assert.equal(events.length, 1);
  assert.equal(events[0].myStatus, 'invited');
  const [row] = await h.db.query<{ user_id: string }>(`select user_id from calendar.event_participants where lower(email) = 'new.kid@example.test'`);
  assert.equal(row.user_id, kid.id, 'the account is remembered');
});

test('conflicts: same teacher cannot be double-booked; adjacent, other teachers, cancelled classes and force are fine', async () => {
  const [t, other] = [await h.person('teacher'), await h.person('teacher')];
  const first = await mk(t, [], { ...slot(10) });
  const clash = await t.call('POST', '/v1/events', { title: 'Overlap', start: '2030-01-07T10:30:00Z', durationMinutes: 60 });
  assert.equal(clash.status, 409);
  const body = await json(clash);
  assert.equal(body.error.code, 'conflict');
  assert.equal(body.error.details[0].id, first.id);

  assert.equal((await t.call('POST', '/v1/events', { title: 'Right after', ...slot(11) })).status, 201, 'end == start is not an overlap');
  assert.equal((await t.call('POST', '/v1/events', { title: 'Right before', ...slot(9) })).status, 201);
  assert.equal((await other.call('POST', '/v1/events', { title: 'Other teacher', ...slot(10) })).status, 201, 'other calendars are independent');
  assert.equal((await t.call('POST', '/v1/events', { title: 'On purpose', start: '2030-01-07T10:15:00Z', durationMinutes: 30, force: true })).status, 201);

  await t.call('DELETE', `/v1/events/${first.id}`);
  const again = await t.call('POST', '/v1/events', { title: 'Replaces it', start: '2030-01-07T10:00:00Z', durationMinutes: 30 });
  assert.equal(again.status, 409, 'the forced class from above still occupies 10:15 to 10:45');
  assert.equal((await t.call('POST', '/v1/events', { title: 'Squeezed in', start: '2030-01-07T10:00:00Z', durationMinutes: 15 })).status, 201, 'ending exactly when the forced class starts is fine');
  assert.equal((await t.call('POST', '/v1/events', { title: 'Free now', start: '2030-01-07T13:00:00Z', durationMinutes: 60 })).status, 201);
});

test('a student cannot be booked into two classes at once, but nothing about the other class is revealed', async () => {
  const [ta, tb] = [await h.person('teacher'), await h.person('teacher')];
  const [busy, free] = [await h.person('student'), await h.person('student')];
  await mk(ta, [busy], { title: 'Secret other class', ...slot(10) });
  const res = await tb.call('POST', '/v1/events', { title: 'Mine', ...slot(10), participants: [{ email: busy.email }, { email: free.email }] });
  assert.equal(res.status, 409);
  const body = await json(res);
  assert.equal(body.error.code, 'participant_conflict');
  assert.deepEqual(body.error.details, [busy.email.toLowerCase()]);
  assert.ok(!JSON.stringify(body).includes('Secret other class'));
  assert.equal((await tb.call('POST', '/v1/events', { title: 'Mine', ...slot(10), participants: [{ email: busy.email }], force: true })).status, 201);
  assert.equal((await tb.call('POST', '/v1/events', { title: 'Other time', ...slot(14), participants: [{ email: busy.email }] })).status, 201);
});

test('a student who declined is not counted as busy', async () => {
  const [ta, tb] = [await h.person('teacher'), await h.person('teacher')];
  const s = await h.person('student');
  const ev = await mk(ta, [s], { ...slot(10) });
  assert.equal((await s.call('POST', `/v1/events/${ev.id}/respond`, { response: 'declined' })).status, 200);
  assert.equal((await tb.call('POST', '/v1/events', { title: 'Free for them', ...slot(10), participants: [{ email: s.email }] })).status, 201);
});

test('five simultaneous overlapping bookings for one teacher: exactly one wins', async () => {
  const t = await h.person('teacher');
  const results = await Promise.all(Array.from({ length: 5 }, (_, i) => t.call('POST', '/v1/events', { title: `Race ${i}`, start: `2030-01-07T10:${String(i * 5).padStart(2, '0')}:00Z`, durationMinutes: 60 })));
  const codes = results.map((r) => r.status).sort();
  assert.deepEqual(codes, [201, 409, 409, 409, 409]);
  assert.equal((await h.db.query('select 1 from calendar.events')).length, 1);
});

test('listing filters: time window, externalRef, includeCancelled, and staff filters', async () => {
  const [t, o] = [await h.person('teacher'), await h.person('teacher')];
  const admin = await h.person('admin');
  const s = await h.person('student');
  const mon = await mk(t, [s], { title: 'Mon', ...slot(10, 60, 7), externalRef: 'session-1' });
  await mk(t, [], { title: 'Tue', ...slot(10, 60, 8) });
  await mk(o, [], { title: 'Other', ...slot(10, 60, 7) });
  const names = async (p: Person, q = '') => (await json(await p.call('GET', `/v1/events${q}`))).events.map((e: any) => e.title).sort();

  assert.deepEqual(await names(t, '?from=2030-01-08T00:00:00Z'), ['Tue']);
  assert.deepEqual(await names(t, '?to=2030-01-08T00:00:00Z'), ['Mon']);
  assert.deepEqual(await names(t, '?externalRef=session-1'), ['Mon']);
  assert.deepEqual(await names(admin, `?ownerId=${o.id}`), ['Other']);
  assert.deepEqual(await names(admin, `?participant=${s.email}`), ['Mon']);
  assert.deepEqual(await names(t, `?ownerId=${o.id}`), ['Mon', 'Tue'], 'a teacher cannot widen their view with ownerId');
  await t.call('DELETE', `/v1/events/${mon.id}`);
  assert.deepEqual(await names(t), ['Tue']);
  assert.deepEqual(await names(t, '?includeCancelled=true'), ['Mon', 'Tue']);
  assert.equal((await t.call('GET', '/v1/events?from=yesterday')).status, 400);
});
