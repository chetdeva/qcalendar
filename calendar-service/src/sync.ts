import { getEvent, type DB, type EventRow } from './db.ts';
import type { GoogleClient } from './google.ts';

export function toApi(e: EventRow) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    location: e.location,
    start: e.start_utc,
    end: e.end_utc,
    timezone: e.timezone,
    attendees: JSON.parse(e.attendees) as string[],
    externalRef: e.external_ref,
    meet: Boolean(e.meet),
    meetUrl: e.meet_url,
    category: e.category,
    status: e.status,
    syncStatus: e.sync_status,
    syncError: e.sync_error,
    googleEventId: e.google_event_id,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
  };
}

const inflight = new Set<string>();

/** Pushes one event to Google. Never throws; failures are recorded on the row. */
export async function syncEvent(db: DB, google: GoogleClient, id: string): Promise<void> {
  const ev = getEvent(db, id);
  if (!ev || ev.sync_status === 'synced' || inflight.has(id)) return;
  if (!google.isConnected()) {
    if (ev.status === 'cancelled' && !ev.google_event_id) markSynced(db, id);
    return;
  }
  inflight.add(id);
  try {
    if (ev.status === 'cancelled') {
      if (ev.google_event_id) await google.deleteEvent(ev.google_event_id);
      markSynced(db, id);
    } else {
      const r = await google.upsertEvent(
        {
          title: ev.title,
          description: ev.description,
          location: ev.location,
          startIso: ev.start_utc,
          endIso: ev.end_utc,
          timezone: ev.timezone,
          attendees: JSON.parse(ev.attendees),
          requestMeet: Boolean(ev.meet) && !ev.meet_url,
        },
        ev.google_event_id ?? undefined,
      );
      db.prepare(
        `UPDATE events SET google_event_id = ?, meet_url = COALESCE(?, meet_url), sync_status = 'synced', sync_error = NULL WHERE id = ?`,
      ).run(r.id, r.meetUrl ?? null, id);
    }
  } catch (err) {
    db.prepare(`UPDATE events SET sync_status = 'error', sync_error = ? WHERE id = ?`).run(String((err as Error).message).slice(0, 500), id);
  } finally {
    inflight.delete(id);
  }
}

function markSynced(db: DB, id: string) {
  db.prepare(`UPDATE events SET sync_status = 'synced', sync_error = NULL WHERE id = ?`).run(id);
}

export async function syncPending(db: DB, google: GoogleClient): Promise<{ synced: number; failed: number }> {
  const rows = db.prepare(`SELECT id FROM events WHERE sync_status != 'synced' ORDER BY created_at`).all() as { id: string }[];
  let synced = 0;
  let failed = 0;
  for (const { id } of rows) {
    db.prepare(`UPDATE events SET sync_status = 'pending' WHERE id = ? AND sync_status = 'error'`).run(id);
    await syncEvent(db, google, id);
    const after = getEvent(db, id);
    if (after?.sync_status === 'synced') synced++;
    else if (after?.sync_status === 'error') failed++;
  }
  return { synced, failed };
}
