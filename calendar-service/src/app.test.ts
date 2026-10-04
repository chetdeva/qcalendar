import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import assert from 'node:assert/strict';
import { createApp } from './app.ts';
import { openDb } from './db.ts';
import type { GoogleClient, GoogleEventInput } from './google.ts';
import { computeSlots, defaultSettings, zonedTimeToUtcMs } from './availability.ts';

function setup() {
  const calls: string[] = [];
  const google: GoogleClient = {
    configured: true,
    isConnected: () => true,
    authUrl: () => 'https://example.test/auth',
    handleCallback: async () => {},
    upsertEvent: async (_i: GoogleEventInput, id?: string) => {
      calls.push(id ? 'update' : 'create');
      return { id: id ?? 'g1', meetUrl: 'https://meet.google.com/abc' };
    },
    deleteEvent: async () => { calls.push('delete'); },
    freeBusy: async () => [],
  };
  const app = createApp({ db: openDb(':memory:'), google, apiKey: 'k'.repeat(32), defaultTimezone: 'UTC' });
  const req = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { authorization: `Bearer ${'k'.repeat(32)}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  return { app, req, calls };
}

test('requires api key', async () => {
  const { app } = setup();
  assert.equal((await app.request('/v1/events')).status, 401);
});

test('create, conflict, force, reschedule, cancel', async () => {
  const { req, calls } = setup();
  const body = { title: 'Math', start: '2030-01-07T10:00:00Z', durationMinutes: 60, attendees: ['A@x.com'], meet: true };
  const created = await req('POST', '/v1/events', body);
  assert.equal(created.status, 201);
  const ev = await created.json();
  assert.equal(ev.meetUrl, 'https://meet.google.com/abc');
  assert.deepEqual(ev.attendees, ['a@x.com']);
  assert.equal(ev.syncStatus, 'synced');

  assert.equal((await req('POST', '/v1/events', { ...body, start: '2030-01-07T10:30:00Z' })).status, 409);
  assert.equal((await req('POST', '/v1/events', { ...body, start: '2030-01-07T10:30:00Z', force: true })).status, 201);

  const moved = await req('PATCH', `/v1/events/${ev.id}`, { start: '2030-01-08T10:00:00Z' });
  assert.equal(moved.status, 200);
  assert.equal((await moved.json()).end, '2030-01-08T11:00:00.000Z');

  const del = await req('DELETE', `/v1/events/${ev.id}`);
  assert.equal((await del.json()).status, 'cancelled');
  assert.deepEqual(calls, ['create', 'create', 'update', 'delete']);
});

test('availability excludes booked time', async () => {
  const { req } = setup();
  await req('POST', '/v1/events', { title: 'x', start: '2030-01-07T10:00:00Z', durationMinutes: 60 });
  const res = await req('GET', '/v1/availability?from=2030-01-07T00:00:00Z&to=2030-01-08T00:00:00Z&duration=60');
  const { slots } = await res.json();
  assert.equal(slots.length, 12);
  assert.ok(!slots.some((s: { start: string }) => s.start === '2030-01-07T10:00:00.000Z'));
});

test('events carry a category that defaults to tutoring and can be changed', async () => {
  const { req } = setup();
  const base = { title: 'Hours', start: '2030-01-07T12:00:00Z', durationMinutes: 30 };
  const made = await (await req('POST', '/v1/events', base)).json();
  assert.equal(made.category, 'tutoring');
  const hours = await (await req('POST', '/v1/events', { ...base, start: '2030-01-07T13:00:00Z', category: 'office_hours' })).json();
  assert.equal(hours.category, 'office_hours');
  const patched = await (await req('PATCH', `/v1/events/${made.id}`, { category: 'personal' })).json();
  assert.equal(patched.category, 'personal');
  assert.equal((await req('POST', '/v1/events', { ...base, start: '2030-01-07T14:00:00Z', category: 'nope' })).status, 400);
});

test('opening a database made before categories existed adds the column', () => {
  const dir = mkdtempSync(join('data', 'migrate-'));
  try {
    const path = join(dir, 'old.db');
    const old = new DatabaseSync(path);
    old.exec(`CREATE TABLE events (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, location TEXT,
      start_utc TEXT NOT NULL, end_utc TEXT NOT NULL, timezone TEXT NOT NULL,
      attendees TEXT NOT NULL DEFAULT '[]', external_ref TEXT, meet INTEGER NOT NULL DEFAULT 0, meet_url TEXT,
      status TEXT NOT NULL DEFAULT 'confirmed', google_event_id TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending', sync_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`);
    old.prepare(`INSERT INTO events (id, title, start_utc, end_utc, timezone, created_at, updated_at)
      VALUES ('e1', 'Old lesson', '2030-01-07T10:00:00.000Z', '2030-01-07T11:00:00.000Z', 'UTC', 'x', 'x')`).run();
    old.close();
    const db = openDb(path);
    const rows = db.prepare('SELECT category FROM events').all() as { category: string }[];
    assert.deepEqual(rows.map((r) => r.category), ['tutoring']);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('validation errors return 400', async () => {
  const { req } = setup();
  assert.equal((await req('POST', '/v1/events', { title: 'x', start: 'nope' })).status, 400);
});

test('timezone and DST conversion', () => {
  assert.equal(zonedTimeToUtcMs('2026-03-07', '09:00', 'America/New_York'), Date.UTC(2026, 2, 7, 14));
  assert.equal(zonedTimeToUtcMs('2026-03-08', '09:00', 'America/New_York'), Date.UTC(2026, 2, 8, 13));
});

test('slots respect working hours and buffer', () => {
  const settings = { ...defaultSettings('America/New_York'), slotStepMinutes: 60, bufferMinutes: 30 };
  const nine = zonedTimeToUtcMs('2030-01-07', '09:00', settings.timezone);
  const slots = computeSlots({
    fromMs: nine - 3_600_000, toMs: nine + 86_400_000, nowMs: 0, durationMin: 60, settings,
    busy: [{ start: nine + 3_600_000, end: nine + 7_200_000 }],
  });
  assert.equal(slots.length, 5);
  assert.equal(slots[0].start, nine + 3 * 3_600_000);
});
