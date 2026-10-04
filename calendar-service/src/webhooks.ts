import { createHmac, randomUUID } from 'node:crypto';
import type { DB } from './db.ts';

export function enqueueWebhook(db: DB, type: string, data: unknown): void {
  const payload = JSON.stringify({ id: randomUUID(), type, createdAt: new Date().toISOString(), data });
  db.prepare('INSERT INTO webhook_queue (type, payload, next_at) VALUES (?, ?, ?)').run(type, payload, Date.now());
}

const MAX_ATTEMPTS = 8;

export async function processWebhooks(
  db: DB,
  opts: { url: () => string; secret: string; fetchImpl?: typeof fetch },
): Promise<void> {
  const send = opts.fetchImpl ?? fetch;
  const rows = db
    .prepare('SELECT * FROM webhook_queue WHERE done = 0 AND next_at <= ? ORDER BY id LIMIT 20')
    .all(Date.now()) as { id: number; type: string; payload: string; attempts: number }[];
  const url = opts.url();
  for (const row of rows) {
    if (!url) {
      db.prepare('UPDATE webhook_queue SET done = 1 WHERE id = ?').run(row.id);
      continue;
    }
    let ok = false;
    try {
      const sig = createHmac('sha256', opts.secret).update(row.payload).digest('hex');
      const res = await send(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-calendar-event': row.type, 'x-calendar-signature': `sha256=${sig}` },
        body: row.payload,
        signal: AbortSignal.timeout(10_000),
      });
      ok = res.ok;
    } catch {
      ok = false;
    }
    const attempts = row.attempts + 1;
    if (ok || attempts >= MAX_ATTEMPTS) {
      db.prepare('UPDATE webhook_queue SET done = 1, attempts = ? WHERE id = ?').run(attempts, row.id);
    } else {
      db.prepare('UPDATE webhook_queue SET attempts = ?, next_at = ? WHERE id = ?').run(attempts, Date.now() + 30_000 * 2 ** attempts, row.id);
    }
  }
}
