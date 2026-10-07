import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createPgliteDb, migrate } from './db.ts';
import { migrateFromSqlite } from './migrate-sqlite.ts';

const fresh = async () => { const db = createPgliteDb(); await migrate(db); return db; };

test('migrations apply once and are recorded; running them again does nothing', async () => {
  const db = createPgliteDb();
  assert.deepEqual(await migrate(db), ['0001_calendar']);
  assert.deepEqual(await migrate(db), []);
  assert.deepEqual((await db.query('select name from calendar.schema_migrations')).map((r) => r.name), ['0001_calendar']);
  await db.close();
});

test('every calendar table has row level security switched on', async () => {
  const db = await fresh();
  const rows = await db.query<{ relname: string; relrowsecurity: boolean }>(
    `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'calendar' and c.relkind = 'r' order by 1`);
  assert.deepEqual(rows.map((r) => r.relname), ['email_outbox', 'event_participants', 'events', 'schema_migrations', 'teacher_settings', 'webhook_queue']);
  assert.ok(rows.every((r) => r.relrowsecurity), JSON.stringify(rows));
  await db.close();
});

test('the database itself refuses bad data: end before start, unknown category or status, duplicate students', async () => {
  const db = await fresh();
  const owner = randomUUID();
  const insert = (over: Record<string, string> = {}) => db.query(
    `insert into calendar.events (owner_id, title, start_at, end_at, timezone, category, status) values ($1,$2,$3,$4,'UTC',$5,$6) returning id`,
    [owner, over.title ?? 't', over.start ?? '2030-01-07T10:00:00Z', over.end ?? '2030-01-07T11:00:00Z', over.category ?? 'tutoring', over.status ?? 'confirmed']);
  const code = async (p: Promise<unknown>) => { try { await p; return 'ok'; } catch (e: any) { return e.code; } };
  assert.equal(await code(insert()), 'ok');
  assert.equal(await code(insert({ end: '2030-01-07T09:00:00Z' })), '23514');
  assert.equal(await code(insert({ end: '2030-01-07T10:00:00Z' })), '23514', 'zero length');
  assert.equal(await code(insert({ category: 'party' })), '23514');
  assert.equal(await code(insert({ status: 'maybe' })), '23514');
  assert.equal(await code(insert({ title: '' })), '23514');
  const [{ id }] = await insert({ title: 'with students' }) as { id: string }[];
  const add = (email: string) => db.query('insert into calendar.event_participants (event_id, email) values ($1,$2)', [id, email]);
  assert.equal(await code(add('Kid@Example.test')), 'ok');
  assert.equal(await code(add('kid@example.test')), '23505', 'one row per student, case-insensitively');
  assert.equal(await code(db.query(`insert into calendar.event_participants (event_id, email, status) values ($1,'x@y.test','maybe')`, [id])), '23514');
  await db.query('delete from calendar.events where id = $1', [id]);
  assert.equal((await db.query('select 1 from calendar.event_participants where event_id = $1', [id])).length, 0, 'students go with their class');
  assert.equal(await code(db.query('insert into calendar.teacher_settings (user_id, timezone, working_hours, buffer_minutes) values ($1,$2,$3,999)', [owner, 'UTC', '{}'])), '23514');
  await db.close();
});

// ---------- SQLite -> Postgres ----------

function oldDatabase(dir: string) {
  const path = join(dir, 'old.db');
  const s = new DatabaseSync(path);
  s.exec(`CREATE TABLE events (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, location TEXT, start_utc TEXT NOT NULL, end_utc TEXT NOT NULL,
    timezone TEXT NOT NULL, attendees TEXT NOT NULL DEFAULT '[]', external_ref TEXT, meet INTEGER NOT NULL DEFAULT 0, meet_url TEXT, category TEXT,
    status TEXT NOT NULL DEFAULT 'confirmed', google_event_id TEXT, sync_status TEXT NOT NULL DEFAULT 'pending', sync_error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`);
  const ins = s.prepare(`INSERT INTO events (id,title,description,location,start_utc,end_utc,timezone,attendees,external_ref,meet_url,category,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  ids.forEach((id, i) => ins.run(id, `Class ${i}`, i === 0 ? 'Notes' : null, null, `2030-01-0${7 + i}T10:00:00.000Z`, `2030-01-0${7 + i}T11:00:00.000Z`, 'America/New_York',
    [JSON.stringify(['Kid@Example.test', 'kid2@example.test', 'kid@example.test']), '[]', 'not json'][i], i === 0 ? 'session-9' : null, i === 0 ? 'https://meet.example.test/x' : null,
    [null, 'office_hours', 'weird'][i], ['confirmed', 'cancelled', 'confirmed'][i], '2029-12-01T00:00:00.000Z', '2029-12-02T00:00:00.000Z'));
  s.close();
  return path;
}
const ids = [randomUUID(), randomUUID(), randomUUID()];

test('SQLite to Postgres: a dry run changes nothing; applying copies classes and students once', async () => {
  const dir = mkdtempSync(join('data', 'sqlite-'));
  try {
    const db = await fresh();
    const owner = randomUUID();
    const sqlitePath = oldDatabase(dir);
    const opts = { sqlitePath, ownerId: owner, ownerEmail: 'tess@example.test', ownerName: 'Tess Teacher' };

    assert.deepEqual(await migrateFromSqlite(db, opts), { total: 3, inserted: 3, skipped: 0, participants: 2 });
    assert.equal((await db.query('select 1 from calendar.events')).length, 0, 'dry run writes nothing');

    assert.deepEqual(await migrateFromSqlite(db, { ...opts, apply: true }), { total: 3, inserted: 3, skipped: 0, participants: 2 });
    const events = await db.query('select * from calendar.events order by start_at');
    assert.equal(events.length, 3);
    assert.deepEqual(events.map((e) => e.id), ids, 'ids are kept');
    assert.ok(events.every((e) => e.owner_id === owner && e.owner_email === 'tess@example.test' && e.owner_name === 'Tess Teacher'));
    assert.deepEqual(events.map((e) => e.category), ['tutoring', 'office_hours', 'tutoring'], 'missing or unknown categories become tutoring');
    assert.deepEqual(events.map((e) => e.status), ['confirmed', 'cancelled', 'confirmed']);
    assert.equal(events[0].meeting_url, 'https://meet.example.test/x');
    assert.equal(events[0].external_ref, 'session-9');
    assert.equal(events[0].timezone, 'America/New_York');
    assert.equal(new Date(events[0].created_at).toISOString(), '2029-12-01T00:00:00.000Z', 'creation time is preserved');
    assert.equal(new Date(events[0].start_at).toISOString(), '2030-01-07T10:00:00.000Z');
    const parts = await db.query('select email from calendar.event_participants order by email');
    assert.deepEqual(parts.map((p) => p.email), ['kid2@example.test', 'kid@example.test'], 'lower-cased and de-duplicated');
    assert.equal((await db.query('select 1 from calendar.email_outbox')).length, 0, 'migrated classes send no email');

    assert.deepEqual(await migrateFromSqlite(db, { ...opts, apply: true }), { total: 3, inserted: 0, skipped: 3, participants: 0 }, 'running again is harmless');
    await assert.rejects(() => migrateFromSqlite(db, { ...opts, ownerId: 'not-a-uuid' }), /UUID/);
    await db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
