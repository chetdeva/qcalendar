import type { Db, Queryable } from './db.ts';
import { buildIcs } from './ics.ts';
import type { Mailer, MailMessage } from './mail.ts';

export type MailKind = 'invite' | 'update' | 'cancel';

/** Everything needed to write one person's email, frozen when the change happened. */
export interface OutboxPayload {
  event: {
    id: string; title: string; description: string | null; location: string | null; meetingUrl: string | null;
    start: string; end: string; timezone: string; sequence: number; ownerEmail: string | null; ownerName: string | null;
  };
  recipient: { email: string; name: string | null };
}

export async function enqueueMail(q: Queryable, kind: MailKind, payloads: OutboxPayload[]) {
  for (const p of payloads) {
    await q.query('insert into calendar.email_outbox (kind, event_id, to_email, payload) values ($1, $2, $3, $4)', [
      kind, p.event.id, p.recipient.email, JSON.stringify(p),
    ]);
  }
}

const oneLine = (s: string) => s.replace(/[\r\n\u0000-\u001f]+/g, ' ').trim();

function when(startIso: string, endIso: string, timezone: string) {
  const tz = (() => { try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); return timezone; } catch { return 'UTC'; } })();
  const day = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: tz }).format(new Date(startIso));
  const t = (iso: string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(iso));
  return { text: `${day}, ${t(startIso)} to ${t(endIso)} (${tz})`, short: `${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: tz }).format(new Date(startIso))} ${tz}` };
}

export function renderMail(kind: MailKind, p: OutboxPayload, opts: { fromEmail: string; calendarUrl?: string }): MailMessage {
  const { event: e, recipient: r } = p;
  const w = when(e.start, e.end, e.timezone);
  const teacher = e.ownerName || 'Your teacher';
  const verb = kind === 'invite' ? 'invited you to' : kind === 'update' ? 'changed' : 'cancelled';
  const prefix = kind === 'invite' ? 'Invitation' : kind === 'update' ? 'Updated' : 'Cancelled';
  const lines = [
    r.name ? `Hi ${oneLine(r.name)},` : 'Hello,',
    '',
    `${oneLine(teacher)} ${verb}:`,
    '',
    oneLine(e.title),
    `When: ${w.text}`,
    ...(kind !== 'cancel' && e.meetingUrl ? [`Join online: ${e.meetingUrl}`] : []),
    ...(e.location ? [`Where: ${oneLine(e.location)}`] : []),
    ...(kind !== 'cancel' && e.description ? ['', e.description] : []),
    '',
    kind === 'cancel'
      ? 'This class is no longer on your calendar. The attached file removes it from calendar apps that support invitations.'
      : 'Open the attached invitation to add it to your calendar.' + (opts.calendarUrl ? ` To accept or decline, open ${opts.calendarUrl}` : ''),
  ];
  const ics = buildIcs({
    method: kind === 'cancel' ? 'CANCEL' : 'REQUEST',
    uid: `${e.id}@syncschedule`,
    sequence: e.sequence,
    start: new Date(e.start),
    end: new Date(e.end),
    summary: e.title,
    description: [e.description, e.meetingUrl ? `Join online: ${e.meetingUrl}` : null].filter(Boolean).join('\n\n') || null,
    location: e.meetingUrl ?? e.location,
    url: e.meetingUrl,
    organizer: { email: e.ownerEmail ?? opts.fromEmail, name: e.ownerName },
    attendee: { email: r.email, name: r.name },
  });
  return {
    to: r.email,
    replyTo: e.ownerEmail ?? undefined,
    subject: `${prefix}: ${oneLine(e.title)} (${w.short})`,
    text: lines.join('\n'),
    ics: { method: kind === 'cancel' ? 'CANCEL' : 'REQUEST', content: ics },
  };
}

const MAX_ATTEMPTS = 8;

/**
 * Sends due emails. Rows are leased for two minutes while being sent, so a crash cannot lose them and a second
 * worker will not send the same one twice.
 */
export async function processOutbox(db: Db, mailer: Mailer, opts: { fromEmail: string; calendarUrl?: string; batch?: number }) {
  const rows = await db.query<{ id: string; kind: MailKind; payload: OutboxPayload; attempts: number }>(
    `update calendar.email_outbox set next_at = now() + interval '2 minutes'
      where id in (select id from calendar.email_outbox where status = 'pending' and next_at <= now() order by id limit $1 for update skip locked)
      returning id, kind, payload, attempts`,
    [opts.batch ?? 20],
  );
  let sent = 0;
  for (const row of rows.sort((a, b) => Number(a.id) - Number(b.id))) {
    try {
      await mailer.send(renderMail(row.kind, row.payload, opts));
      await db.query(`update calendar.email_outbox set status = 'sent', sent_at = now(), attempts = attempts + 1, last_error = null where id = $1`, [row.id]);
      sent++;
    } catch (e) {
      const attempts = row.attempts + 1;
      const dead = attempts >= MAX_ATTEMPTS;
      await db.query(
        `update calendar.email_outbox set attempts = $2, status = $3, last_error = $4, next_at = now() + ($5 || ' seconds')::interval where id = $1`,
        [row.id, attempts, dead ? 'failed' : 'pending', String((e as Error).message).slice(0, 300), String(30 * 2 ** attempts)],
      );
    }
  }
  return { sent, attempted: rows.length };
}
