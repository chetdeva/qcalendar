import { createHmac, randomUUID } from 'node:crypto';
import type { Db, Queryable } from './db.ts';

export async function enqueueWebhook(q: Queryable, type: string, data: unknown) {
  const payload = JSON.stringify({ id: randomUUID(), type, createdAt: new Date().toISOString(), data });
  await q.query('insert into calendar.webhook_queue (type, payload) values ($1, $2)', [type, payload]);
}

const MAX_ATTEMPTS = 8;

export async function processWebhooks(db: Db, opts: { url: string; secret: string; fetchImpl?: typeof fetch }) {
  const send = opts.fetchImpl ?? fetch;
  const rows = await db.query<{ id: string; type: string; payload: string; attempts: number }>(
    `update calendar.webhook_queue set next_at = now() + interval '2 minutes'
      where id in (select id from calendar.webhook_queue where not done and next_at <= now() order by id limit 20 for update skip locked)
      returning id, type, payload, attempts`,
  );
  for (const row of rows.sort((a, b) => Number(a.id) - Number(b.id))) {
    let ok = false;
    try {
      const sig = createHmac('sha256', opts.secret).update(row.payload).digest('hex');
      const res = await send(opts.url, {
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
      await db.query('update calendar.webhook_queue set done = true, attempts = $2 where id = $1', [row.id, attempts]);
    } else {
      await db.query(`update calendar.webhook_queue set attempts = $2, next_at = now() + ($3 || ' seconds')::interval where id = $1`, [row.id, attempts, String(30 * 2 ** attempts)]);
    }
  }
}
