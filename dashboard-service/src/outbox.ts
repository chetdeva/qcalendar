import type { Db, Queryable } from './db.ts';
import { renderParentSync, type Mailer, type ParentSync } from './mail.ts';

export async function enqueueParentSync(q: Queryable, p: ParentSync) {
  await q.query('insert into dashboard.mail_outbox (kind, to_email, payload) values ($1, $2, $3)', ['parent_sync', p.guardianEmail, JSON.stringify(p)]);
}

const MAX_ATTEMPTS = 8;

/** Sends due emails. Rows are leased for two minutes while being sent, so a crash cannot lose them and two workers never send one twice. */
export async function processOutbox(db: Db, mailer: Mailer, batch = 20) {
  const rows = await db.query<{ id: string; payload: ParentSync; attempts: number }>(
    `update dashboard.mail_outbox set next_at = now() + interval '2 minutes'
      where id in (select id from dashboard.mail_outbox where status = 'pending' and next_at <= now() order by id limit $1 for update skip locked)
      returning id, payload, attempts`, [batch]);
  let sent = 0;
  for (const row of rows.sort((a, b) => Number(a.id) - Number(b.id))) {
    try {
      await mailer.send(renderParentSync(row.payload));
      await db.query(`update dashboard.mail_outbox set status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = null where id = $1`, [row.id]);
      sent++;
    } catch (e) {
      const attempts = row.attempts + 1;
      await db.query(
        `update dashboard.mail_outbox set attempts = $2, status = $3, last_error = $4, next_at = now() + ($5 || ' seconds')::interval where id = $1`,
        [row.id, attempts, attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', String((e as Error).message).slice(0, 300), String(30 * 2 ** attempts)]);
    }
  }
  return { sent, attempted: rows.length };
}
