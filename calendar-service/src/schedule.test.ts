import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createHarness, json, slot, type Person } from '../tests/harness.ts';

let h: Awaited<ReturnType<typeof createHarness>>;
before(async () => { h = await createHarness(); });
after(() => h.close());
beforeEach(() => h.reset());

const DAY = 'from=2030-01-07T00:00:00Z&to=2030-01-08T00:00:00Z';
const slots = async (who: Person['call'], q: string) => {
  const res = await who('GET', `/v1/availability?${q}`);
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  return (await json(res)) as { slots: { start: string; end: string }[]; timezone: string; teacherId: string };
};

test('a teacher\'s default week: Monday to Friday, 9 to 17, in half-hour steps', async () => {
  const t = await h.person('teacher');
  const a = await slots(t.call, `${DAY}&duration=60`);
  assert.equal(a.slots.length, 15);
  assert.equal(a.slots[0].start, '2030-01-07T09:00:00.000Z');
  assert.equal(a.slots.at(-1)!.end, '2030-01-07T17:00:00.000Z');
  assert.equal(a.teacherId, t.id);
  assert.equal((await slots(t.call, 'from=2030-01-05T00:00:00Z&to=2030-01-07T00:00:00Z&duration=60')).slots.length, 0, 'the weekend is closed');
});

test('a student sees when a teacher is free, minus booked classes, and learns nothing else', async () => {
  const t = await h.person('teacher'); const s = await h.person('student'); const other = await h.person('student');
  await t.call('POST', '/v1/events', { title: 'Confidential: Liam\'s therapy session', ...slot(10), participants: [{ email: other.email }] });
  const res = await s.call('GET', `/v1/availability?teacherId=${t.id}&${DAY}&duration=60`);
  const body = await json(res);
  assert.deepEqual(Object.keys(body).sort(), ['durationMinutes', 'slots', 'teacherId', 'timezone']);
  assert.ok(!JSON.stringify(body).includes('Confidential') && !JSON.stringify(body).includes(other.email));
  const starts = body.slots.map((x: any) => x.start.slice(11, 16));
  assert.ok(!starts.includes('10:00') && !starts.includes('09:30') && !starts.includes('10:30'), 'overlapping starts are gone');
  assert.ok(starts.includes('09:00') && starts.includes('11:00'), 'adjacent starts remain');
  assert.equal(body.slots.length, 15 - 3);
});

test('each teacher\'s availability is independent, and cancelling frees the time', async () => {
  const [a, b] = [await h.person('teacher'), await h.person('teacher')]; const s = await h.person('student');
  const ev = await json(await a.call('POST', '/v1/events', { title: 'x', ...slot(10) }));
  assert.equal((await slots(s.call, `teacherId=${a.id}&${DAY}&duration=60`)).slots.length, 12);
  assert.equal((await slots(s.call, `teacherId=${b.id}&${DAY}&duration=60`)).slots.length, 15, 'the other teacher is untouched');
  await a.call('DELETE', `/v1/events/${ev.id}`);
  assert.equal((await slots(s.call, `teacherId=${a.id}&${DAY}&duration=60`)).slots.length, 15);
});

test('who must say whose calendar they mean', async () => {
  const t = await h.person('teacher'); const s = await h.person('student'); const admin = await h.person('admin');
  assert.equal((await s.call('GET', `/v1/availability?${DAY}`)).status, 400, 'a student has no calendar of their own');
  assert.equal((await slots(t.call, `${DAY}`)).teacherId, t.id, 'a teacher defaults to themselves');
  assert.equal((await slots(admin.call, `teacherId=${t.id}&${DAY}`)).teacherId, t.id);
  assert.equal((await h.service('GET', `/v1/availability?${DAY}`)).status, 400);
  assert.equal((await h.service('GET', `/v1/availability?teacherId=${t.id}&${DAY}`)).status, 200);
});

test('request validation', async () => {
  const t = await h.person('teacher');
  const get = (q: string) => t.call('GET', `/v1/availability?${q}`);
  assert.equal((await get('from=2030-01-08T00:00:00Z&to=2030-01-07T00:00:00Z')).status, 400);
  assert.equal((await get('from=2030-01-01T00:00:00Z&to=2030-06-01T00:00:00Z')).status, 400, 'at most 62 days');
  assert.equal((await get(`${DAY}&duration=1`)).status, 400);
  assert.equal((await get(`${DAY}&duration=999`)).status, 400);
  assert.equal((await get('from=nope&to=nope')).status, 400);
  assert.equal((await get(`${DAY}&teacherId=nope`)).status, 400);
  assert.equal((await slots(t.call, 'from=2020-01-06T00:00:00Z&to=2020-01-07T00:00:00Z')).slots.length, 0, 'the past is never offered');
});

test('settings: a teacher changes their own hours, buffer and time zone; others are unaffected', async () => {
  const [a, b] = [await h.person('teacher'), await h.person('teacher')]; const s = await h.person('student');
  const before = await json(await a.call('GET', '/v1/settings'));
  assert.equal(before.timezone, 'UTC'); assert.deepEqual(before.workingHours.mon, [['09:00', '17:00']]); assert.deepEqual(before.workingHours.sun, []);

  const put = await a.call('PUT', '/v1/settings', { timezone: 'America/New_York', bufferMinutes: 30, workingHours: { ...before.workingHours, mon: [['13:00', '15:00']] } });
  assert.equal(put.status, 200);
  const saved = await json(await a.call('GET', '/v1/settings'));
  assert.equal(saved.bufferMinutes, 30); assert.equal(saved.timezone, 'America/New_York'); assert.equal(saved.slotStepMinutes, 30, 'untouched fields keep their value');

  assert.equal((await json(await b.call('GET', '/v1/settings'))).bufferMinutes, 0, 'another teacher is unaffected');
  const monday = await slots(s.call, `teacherId=${a.id}&${DAY}&duration=60`);
  assert.equal(monday.timezone, 'America/New_York');
  assert.deepEqual(monday.slots.map((x) => x.start.slice(11, 16)), ['18:00', '18:30', '19:00'], '13:00 to 15:00 New York is 18:00 to 20:00 UTC');

  const ev = await json(await a.call('POST', '/v1/events', { title: 'x', ...slot(18) }));
  assert.equal(ev.timezone, 'America/New_York', 'new classes use the teacher\'s time zone');
});

test('settings: a buffer widens what a booked class blocks', async () => {
  const t = await h.person('teacher'); const s = await h.person('student');
  await t.call('PUT', '/v1/settings', { bufferMinutes: 30 });
  await t.call('POST', '/v1/events', { title: 'x', ...slot(12) });
  const starts = (await slots(s.call, `teacherId=${t.id}&${DAY}&duration=60`)).slots.map((x) => x.start.slice(11, 16));
  assert.ok(!starts.includes('11:00') && !starts.includes('13:00'), 'half an hour of padding on each side');
  assert.ok(starts.includes('10:30') && starts.includes('13:30'));
});

test('settings validation and who may change them', async () => {
  const t = await h.person('teacher'); const other = await h.person('teacher'); const s = await h.person('student'); const admin = await h.person('admin');
  const put = (c: Person['call'], b: object, q = '') => c('PUT', `/v1/settings${q}`, b);
  assert.equal((await put(t.call, { timezone: 'Mars/Base' })).status, 400);
  assert.equal((await put(t.call, { bufferMinutes: 500 })).status, 400);
  assert.equal((await put(t.call, { slotStepMinutes: 1 })).status, 400);
  const days = { sun: [], mon: [], tue: [], wed: [], thu: [], fri: [], sat: [] };
  assert.equal((await put(t.call, { workingHours: { ...days, mon: [['9:00', '17:00']] } })).status, 400, 'HH:MM');
  assert.equal((await put(t.call, { workingHours: { ...days, mon: [['17:00', '09:00']] } })).status, 400, 'start before end');
  assert.equal((await put(t.call, { workingHours: { mon: [] } })).status, 400, 'all seven days required');

  assert.equal((await s.call('GET', '/v1/settings')).status, 403);
  assert.equal((await put(s.call, { bufferMinutes: 10 })).status, 403);
  assert.equal((await put(t.call, { bufferMinutes: 10 }, `?teacherId=${other.id}`)).status, 403, 'not another teacher\'s settings');
  assert.equal((await put(admin.call, { bufferMinutes: 15 }, `?teacherId=${other.id}`)).status, 200);
  assert.equal((await json(await other.call('GET', '/v1/settings'))).bufferMinutes, 15);
  assert.equal((await put(h.service, { bufferMinutes: 5 })).status, 400, 'the service key must name a teacher');
  assert.equal((await put(h.service, { bufferMinutes: 5 }, `?teacherId=${other.id}`)).status, 200);
  assert.equal((await t.call('GET', `/v1/settings?teacherId=${randomUUID()}`)).status, 403);
});
