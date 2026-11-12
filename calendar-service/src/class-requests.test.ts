import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, json, slot, type Person } from '../tests/harness.ts';
import type { BillingClient } from './billing.ts';

/** A stand-in for billing: which students have a plan, and how many classes each has left. */
const plans = new Set<string>();
const credits = new Map<string, number>();
const billing: BillingClient = {
  async earn() {},
  async subscribed(u) { return plans.has(u); },
  async reserve(u) {
    const n = credits.get(u) ?? 0;
    if (n < 1) return { ok: false, code: 'no_credits' };
    credits.set(u, n - 1);
    return { ok: true };
  },
  async release() {},
};
let h: Awaited<ReturnType<typeof createHarness>>;
before(async () => { h = await createHarness({ billing }); });
after(() => h.close());
beforeEach(async () => { await h.reset(); plans.clear(); credits.clear(); });

const ask = (s: Person, t: Person, over: Record<string, unknown> = {}) =>
  s.call('POST', '/v1/class-requests', { teacher: { id: t.id, email: t.email, name: 'Ms Rao' }, start: slot(10).start, ...over });
const subscribed = (s: Person, n = 2) => { plans.add(s.id); credits.set(s.id, n); };

test('a student with a plan asks a mentor; only that mentor sees it, and is emailed', async () => {
  const [s, t, other] = [await h.person('student'), await h.person('teacher'), await h.person('teacher')];
  subscribed(s);
  const r = await ask(s, t, { note: 'Fractions please' });
  assert.equal(r.status, 201);
  assert.equal((await json(await t.call('GET', '/v1/class-requests'))).requests.length, 1);
  assert.equal((await json(await other.call('GET', '/v1/class-requests'))).requests.length, 0);
  const mine = (await json(await s.call('GET', '/v1/class-requests/mine'))).requests;
  assert.deepEqual(mine.map((x: any) => [x.status, x.teacher.id]), [['requested', t.id]]);
  const mails = await h.db.query<{ kind: string; to_email: string }>('select kind, to_email from calendar.email_outbox');
  assert.deepEqual(mails.map((m) => [m.kind, m.to_email]), [['class_request', t.email]]);
});

test('without a plan the request is refused; asking again replaces the time instead of adding one', async () => {
  const [s, t] = [await h.person('student'), await h.person('teacher')];
  const refused = await ask(s, t);
  assert.equal(refused.status, 402);
  assert.equal((await json(refused)).error.code, 'subscription_required');
  subscribed(s);
  await ask(s, t);
  await ask(s, t, { start: slot(15).start });
  const open = (await json(await t.call('GET', '/v1/class-requests'))).requests;
  assert.equal(open.length, 1);
  assert.equal(open[0].start, slot(15).start.replace('Z', '.000Z'));
});

test('only students ask, never for a past time or for themselves', async () => {
  const [s, t] = [await h.person('student'), await h.person('teacher')];
  subscribed(s);
  assert.equal((await ask(t, t)).status, 403);
  assert.equal((await ask(s, t, { start: '2020-01-01T10:00:00Z' })).status, 400);
  assert.equal((await ask(s, { id: s.id, email: s.email } as Person)).status, 400);
});

test('the mentor approves: a class with a meeting link is created, the student is invited and charged, the request is done', async () => {
  const [s, t] = [await h.person('student'), await h.person('teacher')];
  subscribed(s, 2);
  const id = (await json(await ask(s, t))).id;
  const ok = await t.call('POST', `/v1/class-requests/${id}/approve`);
  assert.equal(ok.status, 201);
  const ev = await json(ok);
  assert.equal(ev.category, 'tutoring');
  assert.ok(ev.meetingUrl, 'a meeting link');
  assert.deepEqual(ev.participants.map((p: any) => p.email), [s.email]);
  assert.equal(credits.get(s.id), 1);
  assert.equal((await json(await t.call('GET', '/v1/class-requests'))).requests.length, 0);
  assert.equal((await json(await s.call('GET', '/v1/class-requests/mine'))).requests.length, 0);
  assert.equal((await t.call('POST', `/v1/class-requests/${id}/approve`)).status, 409); // already answered
});

test('approval fails clearly when the student has no classes left, and the request stays open', async () => {
  const [s, t] = [await h.person('student'), await h.person('teacher')];
  subscribed(s, 0);
  const id = (await json(await ask(s, t))).id;
  assert.notEqual((await t.call('POST', `/v1/class-requests/${id}/approve`)).status, 201);
  assert.equal((await json(await t.call('GET', '/v1/class-requests'))).requests.length, 1);
});

test('the mentor declines with a note: the student is told, and sees it for a week', async () => {
  const [s, t] = [await h.person('student'), await h.person('teacher')];
  subscribed(s);
  const id = (await json(await ask(s, t))).id;
  assert.equal((await t.call('POST', `/v1/class-requests/${id}/decline`, { note: 'Fully booked that day' })).status, 200);
  const mine = (await json(await s.call('GET', '/v1/class-requests/mine'))).requests;
  assert.deepEqual(mine.map((x: any) => [x.status, x.declineNote]), [['declined', 'Fully booked that day']]);
  const mails = await h.db.query<{ kind: string; to_email: string }>(`select kind, to_email from calendar.email_outbox where kind = 'class_request_declined'`);
  assert.deepEqual(mails.map((m) => m.to_email), [s.email]);
  assert.equal((await json(await t.call('GET', '/v1/class-requests'))).requests.length, 0);
});

test("nobody else can answer: another mentor, the student, or a repeat", async () => {
  const [s, t, other] = [await h.person('student'), await h.person('teacher'), await h.person('teacher')];
  subscribed(s);
  const id = (await json(await ask(s, t))).id;
  assert.equal((await other.call('POST', `/v1/class-requests/${id}/approve`)).status, 404);
  assert.equal((await other.call('POST', `/v1/class-requests/${id}/decline`)).status, 404);
  assert.equal((await s.call('POST', `/v1/class-requests/${id}/approve`)).status, 403);
});

test('the student can cancel their open request; it leaves the mentor\'s list', async () => {
  const [s, t] = [await h.person('student'), await h.person('teacher')];
  subscribed(s);
  const id = (await json(await ask(s, t))).id;
  assert.equal((await s.call('DELETE', `/v1/class-requests/${id}`)).status, 204);
  assert.equal((await json(await t.call('GET', '/v1/class-requests'))).requests.length, 0);
  assert.equal((await s.call('DELETE', `/v1/class-requests/${id}`)).status, 404);
});

test('a class the mentor books for that student by hand also closes the request', async () => {
  const [s, t] = [await h.person('student'), await h.person('teacher')];
  subscribed(s);
  await ask(s, t);
  const made = await t.call('POST', '/v1/events', { title: 'Algebra', ...slot(12), participants: [{ email: s.email, userId: s.id, name: 'Sam' }] });
  assert.equal(made.status, 201);
  assert.equal((await json(await t.call('GET', '/v1/class-requests'))).requests.length, 0);
});
