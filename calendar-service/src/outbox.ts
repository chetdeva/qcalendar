import type { Db, Queryable } from './db.ts';
import { buildIcs } from './ics.ts';
import type { Mailer, MailMessage } from './mail.ts';

export type MailKind = 'invite' | 'update' | 'cancel' | 'declined' | 'change_request' | 'teacher_assigned' | 'lead' | 'lead_confirmation';

/** Everything needed to write one person's email, frozen when the change happened. */
export interface OutboxPayload {
  event: {
    id: string; title: string; description: string | null; location: string | null; meetingUrl: string | null;
    start: string; end: string; timezone: string; sequence: number; ownerEmail: string | null; ownerName: string | null;
  };
  recipient: { email: string; name: string | null };
  /** For notes to the teacher: who wrote it, what they wrote and, for a time-change request, the time they want. */
  from?: { name: string };
  note?: string | null;
  requested?: { start: string; end: string };
}

/** A change of teacher, told to the student, the new teacher and the old one. There is no class involved. */
export interface AssignmentPayload {
  audience: 'student' | 'new_teacher' | 'old_teacher';
  recipient: { email: string; name: string | null };
  student: { email: string; name: string | null };
  teacher: { email: string; name: string | null } | null;
  previousTeacher: { email: string; name: string | null } | null;
  note: string | null;
}

export async function enqueueAssignmentMail(q: Queryable, payloads: AssignmentPayload[]) {
  for (const p of payloads) {
    await q.query(`insert into calendar.email_outbox (kind, event_id, to_email, payload) values ('teacher_assigned', null, $1, $2)`, [p.recipient.email, JSON.stringify(p)]);
  }
}

/** A website request for the free class, told to the teacher ('lead') and confirmed to the parent ('lead_confirmation'). */
export interface LeadPayload {
  parentName: string; email: string; phone?: string; grade: string; goal?: string; timeZone?: string; source?: string; page?: string;
}

export async function enqueueLeadMail(q: Queryable, lead: LeadPayload, teacherEmail: string) {
  for (const [kind, to] of [['lead', teacherEmail], ['lead_confirmation', lead.email]] as const) {
    await q.query('insert into calendar.email_outbox (kind, event_id, to_email, payload) values ($1, null, $2, $3)', [kind, to, JSON.stringify(lead)]);
  }
}

function renderLead(kind: 'lead' | 'lead_confirmation', p: LeadPayload, to: string): MailMessage {
  const details = [
    `Name: ${oneLine(p.parentName)}`, `Email: ${oneLine(p.email)}`, ...(p.phone ? [`Phone: ${oneLine(p.phone)}`] : []), `Grade: ${oneLine(p.grade)}`,
    ...(p.goal ? [`Goal: ${oneLine(p.goal)}`] : []), ...(p.timeZone ? [`Time zone: ${oneLine(p.timeZone)}`] : []),
  ];
  if (kind === 'lead') return { to, replyTo: p.email, subject: `Free class request: ${oneLine(p.parentName)} (${oneLine(p.grade)})`, text: ['A new free class request came in from the website:', '', ...details].join('\n') };
  return {
    to,
    subject: 'We received your free class request',
    text: [`Hi ${oneLine(p.parentName)},`, '', 'Thank you for requesting a free class at Quanttoria. Your teacher will reply within one business day to arrange a time.', '', 'What you sent us:', ...details, '', 'If anything is wrong, just reply to this email.'].join('\n'),
  };
}

function renderAssignment(p: AssignmentPayload, opts: { calendarUrl?: string }): MailMessage {
  const name = (x: { name: string | null; email: string } | null, fallback: string) => oneLine(x?.name || x?.email || fallback);
  const [student, teacher, previous] = [name(p.student, 'A student'), name(p.teacher, 'no teacher'), name(p.previousTeacher, 'your previous teacher')];
  const hello = p.recipient.name ? `Hi ${oneLine(p.recipient.name)},` : 'Hello,';
  const note = p.note?.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  const [subject, line] =
    p.audience === 'student'
      ? p.teacher
        ? [`Your teacher is ${teacher}`, `${teacher} is now your teacher.${p.previousTeacher ? ` (Before, it was ${previous}.)` : ''}`]
        : ['You no longer have an assigned teacher', `${previous} is no longer assigned to you. We will let you know when a new teacher is assigned.`]
      : p.audience === 'new_teacher'
        ? [`${student} is now your student`, `${student} has been assigned to you.`]
        : [`${student} is no longer your student`, `${student} is no longer assigned to you${p.teacher ? `; ${teacher} is taking over` : ''}.`];
  return { to: p.recipient.email, subject, text: [hello, '', line, ...(note ? ['', `Note from the admin: ${note}`] : []), ...(opts.calendarUrl ? ['', `Your calendar: ${opts.calendarUrl}`] : [])].join('\n') };
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

/** A student's answer, sent to the teacher: a decline with their note, or a request to move the class. Plain text, no attachment. */
function renderStudentNote(kind: 'declined' | 'change_request', p: OutboxPayload, w: { text: string; short: string }, opts: { calendarUrl?: string }): MailMessage {
  const { event: e, recipient: r } = p;
  const student = oneLine(p.from?.name ?? 'A student');
  const wanted = p.requested ? when(p.requested.start, p.requested.end, e.timezone).text : '';
  const note = p.note?.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim();
  const lines = [
    r.name ? `Hi ${oneLine(r.name)},` : 'Hello,',
    '',
    kind === 'declined' ? `${student} declined:` : `${student} asked to move:`,
    '',
    oneLine(e.title),
    `When: ${w.text}`,
    ...(kind === 'change_request' ? [`Requested time: ${wanted}`] : []),
    ...(note ? ['', `Their note: ${note}`] : []),
    '',
    kind === 'change_request' ? 'Approve or reject the request on the class' : 'See the class',
    ...(opts.calendarUrl ? [opts.calendarUrl] : []),
  ];
  return {
    to: r.email,
    subject: kind === 'declined' ? `${student} declined: ${oneLine(e.title)} (${w.short})` : `${student} asks to move: ${oneLine(e.title)} (${w.short})`,
    text: lines.join('\n'),
  };
}

export function renderMail(kind: MailKind, p: OutboxPayload | AssignmentPayload | LeadPayload, opts: { fromEmail: string; calendarUrl?: string }, to = ''): MailMessage {
  if (kind === 'lead' || kind === 'lead_confirmation') return renderLead(kind, p as LeadPayload, to);
  if (kind === 'teacher_assigned') return renderAssignment(p as AssignmentPayload, opts);
  return renderEventMail(kind, p as OutboxPayload, opts);
}

function renderEventMail(kind: Exclude<MailKind, 'teacher_assigned' | 'lead' | 'lead_confirmation'>, p: OutboxPayload, opts: { fromEmail: string; calendarUrl?: string }): MailMessage {
  const { event: e, recipient: r } = p;
  const w = when(e.start, e.end, e.timezone);
  if (kind === 'declined' || kind === 'change_request') return renderStudentNote(kind, p, w, opts);
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
  const rows = await db.query<{ id: string; kind: MailKind; to_email: string; payload: OutboxPayload | AssignmentPayload | LeadPayload; attempts: number }>(
    `update calendar.email_outbox set next_at = now() + interval '2 minutes'
      where id in (select id from calendar.email_outbox where status = 'pending' and next_at <= now() order by id limit $1 for update skip locked)
      returning id, kind, to_email, payload, attempts`,
    [opts.batch ?? 20],
  );
  let sent = 0;
  for (const row of rows.sort((a, b) => Number(a.id) - Number(b.id))) {
    try {
      await mailer.send(renderMail(row.kind, row.payload, opts, row.to_email));
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
