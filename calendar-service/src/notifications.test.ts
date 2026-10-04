import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createHarness, json, slot, type Person } from '../tests/harness.ts';
import { processWebhooks } from './webhooks.ts';

let h: Awaited<ReturnType<typeof createHarness>>;
let hw: Awaited<ReturnType<typeof createHarness>>; // webhooks switched on
before(async () => { h = await createHarness(); hw = await createHarness({ webhooks: true }); });
after(async () => { await h.close(); await hw.close(); });
beforeEach(async () => { await h.reset(); await hw.reset(); });

const rows = () => h.db.query<{ status: string; attempts: number; last_error: string | null; to_email: string }>('select status, attempts, last_error, to_email from calendar.email_outbox order by id');
const makeDue = () => h.db.query(`update calendar.email_outbox set next_at = now() where status = 'pending'`);

test('a class with no students sends no email', async () => {
  const t = await h.person('teacher');
  await t.call('POST', '/v1/events', { title: 'Solo prep', ...slot(10) });
  assert.equal((await h.outbox()).attempted, 0);
  assert.equal((await rows()).length, 0);
});

test('emails are retried with backoff after a failure, and not before they are due', async () => {
  const t = await h.person('teacher'); const s = await h.person('student');
  await t.call('POST', '/v1/events', { title: 'Algebra', ...slot(10), participants: [{ email: s.email }] });
  h.mailer.failNext = 1;
  assert.deepEqual(await h.outbox(), { sent: 0, attempted: 1 });
  let [row] = await rows();
  assert.equal(row.status, 'pending'); assert.equal(row.attempts, 1); assert.match(row.last_error ?? '', /smtp unavailable/);
  assert.deepEqual(await h.outbox(), { sent: 0, attempted: 0 }, 'not due yet: the backoff is respected');
  await makeDue();
  assert.deepEqual(await h.outbox(), { sent: 1, attempted: 1 });
  [row] = await rows();
  assert.equal(row.status, 'sent'); assert.equal(row.last_error, null);
  assert.equal(h.mailer.sent.length, 1);
});

test('after eight failed attempts an email is marked failed and never retried again', async () => {
  const t = await h.person('teacher'); const s = await h.person('student');
  await t.call('POST', '/v1/events', { title: 'Algebra', ...slot(10), participants: [{ email: s.email }] });
  h.mailer.failAlways = true;
  for (let i = 0; i < 8; i++) { await h.outbox(); await makeDue(); }
  const [row] = await rows();
  assert.equal(row.status, 'failed'); assert.equal(row.attempts, 8);
  h.mailer.failAlways = false;
  assert.deepEqual(await h.outbox(), { sent: 0, attempted: 0 });
});

test('two workers running at once send each email exactly once', async () => {
  const t = await h.person('teacher'); const students = await Promise.all([1, 2, 3, 4].map(() => h.person('student')));
  await t.call('POST', '/v1/events', { title: 'Big class', ...slot(10), participants: students.map((s) => ({ email: s.email })) });
  await Promise.all([h.outbox(), h.outbox(), h.outbox()]);
  assert.equal(h.mailer.sent.length, 4);
  assert.equal(new Set(h.mailer.sent.map((m) => m.to)).size, 4);
});

test('the email says when, where and how to join, in the class\'s time zone', async () => {
  const t = await h.person('teacher', { name: 'Tess Teacher' }); const s = await h.person('student', { name: 'Sam Student' });
  await t.call('PUT', '/v1/settings', { timezone: 'America/New_York' });
  await t.call('POST', '/v1/events', { title: 'Chemistry', start: '2030-01-07T19:00:00Z', durationMinutes: 90, location: 'Room 4', meetingUrl: 'https://zoom.example.test/j/1', description: 'Bring goggles', participants: [{ email: s.email, name: 'Sam Student' }] });
  await h.outbox();
  const [m] = h.mailer.sent;
  assert.match(m.text, /^Hi Sam Student,/);
  assert.ok(m.text.includes('Tess Teacher invited you to:'));
  assert.ok(m.text.includes('Monday, January 7, 2030, 2:00 PM to 3:30 PM (America/New_York)'), m.text);
  assert.ok(m.text.includes('Join online: https://zoom.example.test/j/1') && m.text.includes('Where: Room 4') && m.text.includes('Bring goggles'));
  assert.ok(m.text.includes('https://calendar.example.test'), 'points to where they can accept or decline');
  assert.ok(m.subject.includes('Chemistry') && m.subject.includes('America/New_York'));
});

test('a class title cannot inject email headers', async () => {
  const t = await h.person('teacher'); const s = await h.person('student');
  await t.call('POST', '/v1/events', { title: 'Hi\r\nBcc: evil@example.test', ...slot(10), participants: [{ email: s.email }] });
  await h.outbox();
  assert.ok(!/[\r\n]/.test(h.mailer.sent[0].subject));
});

test('webhooks: every change is queued with the full class, and nothing is queued when they are off', async () => {
  const t = await hw.person('teacher'); const s = await hw.person('student');
  const ev = await json(await t.call('POST', '/v1/events', { title: 'Algebra', ...slot(10), participants: [{ email: s.email }] }));
  await t.call('PATCH', `/v1/events/${ev.id}`, { title: 'Algebra II' });
  await s.call('POST', `/v1/events/${ev.id}/respond`, { response: 'accepted' });
  await t.call('POST', `/v1/events/${ev.id}/participants`, { participants: [{ email: 'new@example.test' }] });
  await t.call('DELETE', `/v1/events/${ev.id}/participants/${ev.participants[0].id}`);
  await t.call('DELETE', `/v1/events/${ev.id}`);
  const q = await hw.db.query<{ type: string; payload: string }>('select type, payload from calendar.webhook_queue order by id');
  assert.deepEqual(q.map((r) => r.type), ['event.created', 'event.updated', 'event.responded', 'event.updated', 'event.updated', 'event.cancelled']);
  const created = JSON.parse(q[0].payload);
  assert.equal(created.data.ownerId, t.id);
  assert.equal(created.data.participants[0].email, s.email, 'integrations get the full roster');
  assert.deepEqual(JSON.parse(q[2].payload).data.responder, { email: s.email, status: 'accepted' });

  const t2 = await h.person('teacher');
  await t2.call('POST', '/v1/events', { title: 'x', ...slot(10) });
  assert.equal((await h.db.query('select 1 from calendar.webhook_queue')).length, 0);
});

test('webhooks are signed, retried with backoff, and given up on after eight attempts', async () => {
  const t = await hw.person('teacher');
  await t.call('POST', '/v1/events', { title: 'x', ...slot(10) });
  const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
  let ok = false;
  const fetchImpl = (async (url: string, init: any) => { calls.push({ url, headers: init.headers, body: init.body }); return { ok } as Response; }) as unknown as typeof fetch;
  const run = () => processWebhooks(hw.db, { url: 'https://hooks.example.test/in', secret: 's3cret', fetchImpl });
  const state = async () => (await hw.db.query<{ done: boolean; attempts: number }>('select done, attempts from calendar.webhook_queue'))[0];

  await run();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers['x-calendar-event'], 'event.created');
  assert.equal(calls[0].headers['x-calendar-signature'], `sha256=${createHmac('sha256', 's3cret').update(calls[0].body).digest('hex')}`);
  assert.deepEqual(await state(), { done: false, attempts: 1 });
  await run();
  assert.equal(calls.length, 1, 'backoff: not retried immediately');

  ok = true;
  await hw.db.query('update calendar.webhook_queue set next_at = now()');
  await run();
  assert.deepEqual(await state(), { done: true, attempts: 2 });

  await hw.reset();
  await t.call('POST', '/v1/events', { title: 'y', ...slot(10) });
  ok = false; calls.length = 0;
  for (let i = 0; i < 10; i++) { await hw.db.query('update calendar.webhook_queue set next_at = now()'); await run(); }
  assert.equal(calls.length, 8);
  assert.deepEqual(await state(), { done: true, attempts: 8 });
});
