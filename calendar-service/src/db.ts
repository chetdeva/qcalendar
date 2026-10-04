import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type DB = DatabaseSync;

export const CATEGORIES = ['tutoring', 'office_hours', 'personal'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface EventRow {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_utc: string;
  end_utc: string;
  timezone: string;
  attendees: string;
  external_ref: string | null;
  meet: number;
  meet_url: string | null;
  category: Category;
  status: 'confirmed' | 'cancelled';
  google_event_id: string | null;
  sync_status: 'pending' | 'synced' | 'error';
  sync_error: string | null;
  created_at: string;
  updated_at: string;
}

export function openDb(path: string): DB {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      location TEXT,
      start_utc TEXT NOT NULL,
      end_utc TEXT NOT NULL,
      timezone TEXT NOT NULL,
      attendees TEXT NOT NULL DEFAULT '[]',
      external_ref TEXT,
      meet INTEGER NOT NULL DEFAULT 0,
      meet_url TEXT,
      category TEXT NOT NULL DEFAULT 'tutoring',
      status TEXT NOT NULL DEFAULT 'confirmed',
      google_event_id TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      sync_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_time ON events (start_utc, end_utc);
    CREATE INDEX IF NOT EXISTS events_ref ON events (external_ref);
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS webhook_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_at INTEGER NOT NULL,
      done INTEGER NOT NULL DEFAULT 0
    );
  `);
  const cols = db.prepare('PRAGMA table_info(events)').all() as { name: string }[];
  if (!cols.some((c) => c.name === 'category')) {
    db.exec(`ALTER TABLE events ADD COLUMN category TEXT NOT NULL DEFAULT 'tutoring'`);
  }
  return db;
}

export function kvGet<T>(db: DB, key: string): T | undefined {
  const row = db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? (JSON.parse(row.value) as T) : undefined;
}

export function kvSet(db: DB, key: string, value: unknown): void {
  db.prepare('INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    JSON.stringify(value),
  );
}

export function getEvent(db: DB, id: string): EventRow | undefined {
  return db.prepare('SELECT * FROM events WHERE id = ?').get(id) as EventRow | undefined;
}
