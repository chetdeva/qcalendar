import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createHarness, json, slot } from '../tests/harness.ts';

// The current calendar-ui still talks to this service with the service API key and the old single-owner request
// shape. These tests pin that compatibility until the UI moves to real logins.
const OWNER = randomUUID();
let h: Awaited<ReturnType<typeof createHarness>>;
before(async () => { h = await createHarness({ defaultOwnerId: OWNER }); });
after(() => h.close());
beforeEach(() => h.reset());

test('the service key acts on the default owner\'s calendar, with the old request shape', async () => {
  const res = await h.service('POST', '/v1/events', { title: 'Old style', ...slot(10), attendees: ['Kid@Example.test', 'kid2@example.test'], meet: true, category: 'office_hours' });
  assert.equal(res.status, 201);
  const ev = await json(res);
  assert.equal(ev.ownerId, OWNER);
  assert.equal(ev.category, 'office_hours');
  assert.deepEqual(ev.attendees, ['kid@example.test', 'kid2@example.test'], 'attendees (deprecated alias of participants)');
  assert.equal(ev.participants.length, 2);
  assert.ok(ev.meetUrl && ev.meetUrl === ev.meetingUrl, 'meetUrl (deprecated alias of meetingUrl)');
});

test('list, get, move, cancel and the overlap prompt all work as before', async () => {
  const a = await json(await h.service('POST', '/v1/events', { title: 'A', ...slot(10) }));
  const clash = await h.service('POST', '/v1/events', { title: 'B', ...slot(10) });
  assert.equal(clash.status, 409);
  assert.equal((await json(clash)).error.code, 'conflict');
  assert.equal((await h.service('POST', '/v1/events', { title: 'B', ...slot(10), force: true })).status, 201);
  assert.equal((await json(await h.service('GET', '/v1/events?from=2030-01-07T00:00:00Z&to=2030-01-08T00:00:00Z'))).events.length, 2);
  assert.equal((await json(await h.service('PATCH', `/v1/events/${a.id}`, { start: '2030-01-07T14:00:00Z', end: '2030-01-07T15:00:00Z' }))).start, '2030-01-07T14:00:00.000Z');
  assert.equal((await json(await h.service('DELETE', `/v1/events/${a.id}`))).status, 'cancelled');
});

test('settings and availability default to the owner, and the service can still name any teacher', async () => {
  assert.equal((await json(await h.service('GET', '/v1/settings'))).teacherId, OWNER);
  assert.equal((await h.service('PUT', '/v1/settings', { bufferMinutes: 10 })).status, 200);
  const res = await h.service('GET', '/v1/availability?from=2030-01-07T00:00:00Z&to=2030-01-08T00:00:00Z&duration=60');
  assert.equal((await json(res)).teacherId, OWNER);
  const other = randomUUID();
  assert.equal((await json(await h.service('GET', `/v1/availability?teacherId=${other}&from=2030-01-07T00:00:00Z&to=2030-01-08T00:00:00Z`))).teacherId, other);
});

test('the Google endpoints are gone (calendar-ui treats that as "not connected")', async () => {
  assert.equal((await h.service('GET', '/v1/google/status')).status, 404);
  assert.equal((await h.service('GET', '/v1/google/connect')).status, 404);
});
