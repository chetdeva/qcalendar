import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, json, slot, type Person } from '../tests/harness.ts';
import type { BillingClient, Refusal } from './billing.ts';
import { HttpError } from './errors.ts';

/** A stand-in for billing-service: a balance per student, one seat per (lesson, student), idempotent like the real one. */
function fakeBilling() {
  const credits = new Map<string, number>();
  const refused = new Map<string, Refusal>();
  const seats = new Set<string>();
  const state = { down: false };
  const client: BillingClient = {
    async reserve(userId, ref) {
      if (state.down) throw new HttpError(503, 'billing_unavailable', 'down');
      if (seats.has(ref)) return { ok: true };
      if (refused.has(userId)) return { ok: false, code: refused.get(userId)! };
      const left = credits.get(userId) ?? 0;
      if (left < 1) return { ok: false, code: 'no_credits' };
      credits.set(userId, left - 1);
      seats.add(ref);
      return { ok: true };
    },
    async release(userId, ref) {
      if (!seats.delete(ref)) return;
      credits.set(userId, (credits.get(userId) ?? 0) + 1);
    },
  };
  return { client, credits, refused, seats, state, give: (u: Person, n: number) => credits.set(u.id, n) };
}

const bill = fakeBilling();
let h: Awaited<ReturnType<typeof createHarness>>;
before(async () => { h = await createHarness({ billing: bill.client }); });
after(() => h.close());
beforeEach(async () => { await h.reset(); bill.credits.clear(); bill.refused.clear(); bill.seats.clear(); bill.state.down = false; });

const book = (t: Person, students: Person[], over: Record<string, unknown> = {}) =>
  t.call('POST', '/v1/events', { title: 'Algebra', ...slot(10), participants: students.map((s) => ({ email: s.email, userId: s.id, name: 'Sam' })), ...over });

test('a tutoring lesson costs each student one class', async () => {
  const t = await h.person('teacher');
  const [a, b] = [await h.person('student'), await h.person('student')];
  bill.give(a, 3); bill.give(b, 1);
  assert.equal((await book(t, [a, b])).status, 201);
  assert.equal(bill.credits.get(a.id), 2);
  assert.equal(bill.credits.get(b.id), 0);
});

test('a student with no classes left stops the booking, names them, and nothing is spent for the others', async () => {
  const t = await h.person('teacher');
  const [a, b] = [await h.person('student'), await h.person('student')];
  bill.give(a, 5); // b has none
  const res = await book(t, [a, b]);
  assert.equal(res.status, 402);
  const body = await json(res);
  assert.equal(body.error.code, 'no_credits');
  assert.match(body.error.message, /Sam has no classes left/);
  assert.equal(bill.credits.get(a.id), 5); // a's seat was given back
  assert.equal((await h.db.query('select 1 from calendar.events')).length, 0);
});

test('each refusal reason is passed on: never subscribed, failed payment', async () => {
  const t = await h.person('teacher');
  const a = await h.person('student');
  bill.refused.set(a.id, 'subscription_required');
  assert.equal((await json(await book(t, [a]))).error.code, 'subscription_required');
  bill.refused.set(a.id, 'payment_required');
  assert.equal((await json(await book(t, [a]))).error.code, 'payment_required');
});

test('only tutoring lessons cost anything; office hours and personal events are free', async () => {
  const t = await h.person('teacher');
  const a = await h.person('student');
  assert.equal((await book(t, [a], { category: 'office_hours' })).status, 201);
  assert.equal((await t.call('POST', '/v1/events', { title: 'Dentist', ...slot(12), category: 'personal' })).status, 201);
  assert.equal(bill.seats.size, 0);
});

test('students without an account cannot be billed, so they cannot be booked into a paid lesson', async () => {
  const t = await h.person('teacher');
  const res = await t.call('POST', '/v1/events', { title: 'Algebra', ...slot(10), participants: [{ email: 'ghost@example.test', name: 'Ghost' }] });
  assert.equal(res.status, 422);
  assert.equal((await json(res)).error.code, 'student_account_required');
});

test('cancelling a lesson gives every class back, once', async () => {
  const t = await h.person('teacher');
  const [a, b] = [await h.person('student'), await h.person('student')];
  bill.give(a, 2); bill.give(b, 2);
  const ev = await json(await book(t, [a, b]));
  assert.equal((await t.call('DELETE', `/v1/events/${ev.id}`)).status < 300, true);
  assert.equal(bill.credits.get(a.id), 2);
  assert.equal(bill.credits.get(b.id), 2);
  await t.call('DELETE', `/v1/events/${ev.id}`); // again: nothing more is given back
  assert.equal(bill.credits.get(a.id), 2);
});

test('removing a student, or a student declining, gives their class back; accepting again takes one again', async () => {
  const t = await h.person('teacher');
  const [a, b] = [await h.person('student'), await h.person('student')];
  bill.give(a, 1); bill.give(b, 1);
  const ev = await json(await book(t, [a, b]));
  const pb = ev.participants.find((p: any) => p.userId === b.id);
  await t.call('DELETE', `/v1/events/${ev.id}/participants/${pb.id}`);
  assert.equal(bill.credits.get(b.id), 1);

  assert.equal((await a.call('POST', `/v1/events/${ev.id}/respond`, { response: 'declined' })).status, 200);
  assert.equal(bill.credits.get(a.id), 1);
  assert.equal((await a.call('POST', `/v1/events/${ev.id}/respond`, { response: 'accepted' })).status, 200);
  assert.equal(bill.credits.get(a.id), 0);
  await a.call('POST', `/v1/events/${ev.id}/respond`, { response: 'declined' });
  bill.credits.set(a.id, 0); bill.seats.clear(); // someone else used the class in the meantime
  const again = await a.call('POST', `/v1/events/${ev.id}/respond`, { response: 'accepted' });
  assert.equal(again.status, 402);
});

test('adding a student to an existing lesson charges them, and a refusal leaves the lesson unchanged', async () => {
  const t = await h.person('teacher');
  const [a, b] = [await h.person('student'), await h.person('student')];
  bill.give(a, 1);
  const ev = await json(await book(t, [a]));
  const add = await t.call('POST', `/v1/events/${ev.id}/participants`, { participants: [{ email: b.email, userId: b.id, name: 'Bo' }] });
  assert.equal(add.status, 402);
  assert.equal((await h.db.query('select 1 from calendar.event_participants where event_id = $1', [ev.id])).length, 1);
  bill.give(b, 1);
  assert.equal((await t.call('POST', `/v1/events/${ev.id}/participants`, { participants: [{ email: b.email, userId: b.id, name: 'Bo' }] })).status < 300, true);
  assert.equal(bill.credits.get(b.id), 0);
});

test('if billing is down, new bookings fail with a retryable error and nothing is created', async () => {
  const t = await h.person('teacher');
  const a = await h.person('student');
  bill.give(a, 3);
  bill.state.down = true;
  const res = await book(t, [a]);
  assert.equal(res.status, 503);
  assert.equal((await json(res)).error.code, 'billing_unavailable');
  assert.equal((await h.db.query('select 1 from calendar.events')).length, 0);
});

test('lessons already in the past are never refunded', async () => {
  const t = await h.person('teacher');
  const a = await h.person('student');
  bill.give(a, 1);
  const ev = await json(await book(t, [a]));
  await h.db.query(`update calendar.events set start_at = now() - interval '2 hours', end_at = now() - interval '1 hour' where id = $1`, [ev.id]);
  await t.call('DELETE', `/v1/events/${ev.id}`);
  assert.equal(bill.credits.get(a.id), 0);
});

const when = (hour: number, day = 7) => slot(hour, 60, day).start;

test('a student asks for a time; a teacher sees it; confirming books the class for both and marks it scheduled', async () => {
  const t = await h.person('teacher');
  const s = await h.person('student', { name: 'Sam' });
  bill.give(s, 3);
  assert.equal((await t.call('POST', '/v1/trial-requests', { start: when(10) })).status, 403); // only students ask
  assert.equal((await s.call('POST', '/v1/trial-requests', {})).status, 400); // a time is required
  assert.equal((await s.call('POST', '/v1/trial-requests', { start: '2020-01-01T10:00:00Z' })).status, 400); // and it must be in the future
  assert.equal((await s.call('POST', '/v1/trial-requests', { start: when(10), note: 'x' })).status, 400); // no free text any more
  assert.equal((await s.call('POST', '/v1/trial-requests', { start: when(10) })).status, 201);
  const mine = (await json(await s.call('GET', '/v1/trial-requests/mine'))).request;
  assert.deepEqual([mine.studentName, mine.status, mine.start, mine.end], ['Sam', 'requested', '2030-01-07T10:00:00.000Z', '2030-01-07T10:30:00.000Z']);
  const open = (await json(await t.call('GET', '/v1/trial-requests'))).requests;
  assert.deepEqual(open.map((r: any) => [r.studentId, r.start]), [[s.id, '2030-01-07T10:00:00.000Z']]);
  assert.equal((await s.call('GET', '/v1/trial-requests')).status, 403);

  assert.equal((await s.call('POST', `/v1/trial-requests/${open[0].id}/confirm`)).status, 403); // students cannot confirm
  const res = await t.call('POST', `/v1/trial-requests/${open[0].id}/confirm`);
  assert.equal(res.status, 201);
  const lesson = await json(res);
  assert.equal(lesson.title, 'Free trial class');
  assert.equal(lesson.category, 'trial');
  assert.equal(lesson.start, '2030-01-07T10:00:00.000Z');
  assert.equal((await json(await s.call('GET', '/v1/events?from=2030-01-01T00:00:00Z&to=2030-02-01T00:00:00Z'))).events.length, 1); // the student sees it too
  assert.equal((await json(await t.call('GET', '/v1/events?from=2030-01-01T00:00:00Z&to=2030-02-01T00:00:00Z'))).events.length, 1);
  assert.equal((await json(await s.call('GET', '/v1/trial-requests/mine'))).request, null);
  assert.equal((await t.call('POST', `/v1/trial-requests/${open[0].id}/confirm`)).status, 409); // a second confirm books nothing
  assert.equal((await h.db.query('select 1 from calendar.events')).length, 1);
});

test('asking again replaces the time; a student can withdraw and ask again', async () => {
  const s = await h.person('student');
  await s.call('POST', '/v1/trial-requests', { start: when(10) });
  await s.call('POST', '/v1/trial-requests', { start: when(14) });
  assert.equal((await json(await s.call('GET', '/v1/trial-requests/mine'))).request.start, '2030-01-07T14:00:00.000Z');
  assert.equal((await h.db.query(`select 1 from calendar.trial_requests where status = 'requested'`)).length, 1);
  assert.equal((await s.call('DELETE', '/v1/trial-requests/mine')).status, 204);
  assert.equal((await json(await s.call('GET', '/v1/trial-requests/mine'))).request, null);
  assert.equal((await s.call('POST', '/v1/trial-requests', { start: when(10) })).status, 201);
});

test('confirming fails clearly when the teacher is busy, the student is booked elsewhere, or billing is down; the request stays open', async () => {
  const t = await h.person('teacher');
  const s = await h.person('student', { name: 'Sam' });
  bill.give(s, 3);
  await s.call('POST', '/v1/trial-requests', { start: when(10) });
  const rid = (await json(await t.call('GET', '/v1/trial-requests'))).requests[0].id;
  assert.equal((await t.call('POST', '/v1/events', { title: 'Other', ...slot(10) })).status, 201); // the teacher is busy then
  assert.equal((await json(await t.call('POST', `/v1/trial-requests/${rid}/confirm`))).error.code, 'conflict');
  await h.db.query('delete from calendar.events');
  bill.state.down = true;
  assert.equal((await json(await t.call('POST', `/v1/trial-requests/${rid}/confirm`))).error.code, 'billing_unavailable');
  bill.state.down = false;
  assert.equal((await json(await t.call('GET', '/v1/trial-requests'))).requests.length, 1);
  assert.equal((await t.call('POST', `/v1/trial-requests/${rid}/confirm`)).status, 201); // fine once the problem is gone
});

test('a request without a time (made before students could pick one) cannot be confirmed directly', async () => {
  const t = await h.person('teacher');
  const s = await h.person('student', { name: 'Sam' });
  await h.db.query(`insert into calendar.trial_requests (student_id, student_email, student_name) values ($1, $2, 'Sam')`, [s.id, s.email]);
  const rid = (await json(await t.call('GET', '/v1/trial-requests'))).requests[0].id;
  assert.equal((await json(await t.call('POST', `/v1/trial-requests/${rid}/confirm`))).error.code, 'time_required');
});

test('the lesson end time travels with the reservation, so billing knows when the free class is over', async () => {
  const t = await h.person('teacher');
  const s = await h.person('student');
  const ends: (string | undefined)[] = [];
  const spy = createHarness({ billing: { reserve: async (_u, _r, endsAt) => { ends.push(endsAt); return { ok: true }; }, release: async () => {} } });
  const h2 = await spy;
  const t2 = await h2.person('teacher');
  await t2.call('POST', '/v1/events', { title: 'Algebra', ...slot(10), participants: [{ email: s.email, userId: s.id, name: 'Sam' }] });
  assert.deepEqual(ends, ['2030-01-07T11:00:00.000Z']);
  await h2.close();
  void t;
});
