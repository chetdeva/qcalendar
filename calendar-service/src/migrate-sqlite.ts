import { DatabaseSync } from 'node:sqlite';
import type { Db } from './db.ts';

export interface SqliteMigrationOptions {
  sqlitePath: string;
  /** The teacher who owns every migrated class (the old database had a single owner). */
  ownerId: string;
  ownerEmail?: string;
  ownerName?: string;
  /** false (the default) only counts what would change. */
  apply?: boolean;
}

export interface SqliteMigrationResult { total: number; inserted: number; skipped: number; participants: number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Copies classes from the old single-owner SQLite file into Postgres. Safe to run again: classes that are already
 * there (same id) are skipped. Nothing is emailed. Google columns are dropped.
 */
export async function migrateFromSqlite(db: Db, o: SqliteMigrationOptions): Promise<SqliteMigrationResult> {
  if (!UUID.test(o.ownerId)) throw new Error('ownerId must be the teacher\'s user id (a UUID)');
  const sqlite = new DatabaseSync(o.sqlitePath, { readOnly: true });
  try {
    const rows = sqlite.prepare('select * from events order by start_utc').all() as Record<string, any>[];
    const result: SqliteMigrationResult = { total: rows.length, inserted: 0, skipped: 0, participants: 0 };
    for (const r of rows) {
      const exists = (await db.query('select 1 from calendar.events where id = $1', [r.id])).length > 0;
      if (exists) { result.skipped++; continue; }
      let emails: string[] = [];
      try {
        const parsed = JSON.parse(r.attendees ?? '[]');
        if (Array.isArray(parsed)) emails = [...new Set(parsed.filter((e) => typeof e === 'string' && e.includes('@')).map((e: string) => e.trim().toLowerCase()))];
      } catch { /* an unreadable attendee list is treated as empty */ }
      result.inserted++;
      result.participants += emails.length;
      if (!o.apply) continue;
      await db.tx(async (q) => {
        await q.query(
          `insert into calendar.events (id, owner_id, owner_email, owner_name, title, description, location, meeting_url, start_at, end_at, timezone, category, status, external_ref, created_at, updated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [r.id, o.ownerId, o.ownerEmail ?? null, o.ownerName ?? null, r.title, r.description ?? null, r.location ?? null, r.meet_url ?? null,
            r.start_utc, r.end_utc, r.timezone ?? 'UTC', ['tutoring', 'office_hours', 'personal'].includes(r.category) ? r.category : 'tutoring',
            r.status === 'cancelled' ? 'cancelled' : 'confirmed', r.external_ref ?? null, r.created_at ?? new Date().toISOString(), r.updated_at ?? new Date().toISOString()],
        );
        for (const email of emails) await q.query('insert into calendar.event_participants (event_id, email) values ($1, $2)', [r.id, email]);
      });
    }
    return result;
  } finally {
    sqlite.close();
  }
}
