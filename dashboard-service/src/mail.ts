import nodemailer from 'nodemailer';

export interface MailMessage { to: string; subject: string; text: string }
export interface Mailer { send(message: MailMessage): Promise<void> }

/** Collects messages in memory. Used by tests; can be told to fail to exercise retries. */
export class MemoryMailer implements Mailer {
  sent: MailMessage[] = [];
  failAlways = false;
  async send(m: MailMessage) {
    if (this.failAlways) throw new Error('smtp unavailable');
    this.sent.push(m);
  }
}

/** Development default: shows what would be sent instead of sending it. */
export class ConsoleMailer implements Mailer {
  async send(m: MailMessage) { console.log(`[mail] to=${m.to} subject="${m.subject}"`); }
}

/** Any SMTP server, including AWS SES's SMTP interface. */
export function createSmtpMailer(smtpUrl: string, from: string): Mailer {
  const transport = nodemailer.createTransport(smtpUrl);
  return { async send(m) { await transport.sendMail({ from, to: m.to, subject: m.subject, text: m.text }); } };
}

export interface ParentSync {
  studentName: string;
  guardianEmail: string;
  teacherName: string;
  task: string;
  score: number;
  grade: string;
  tags: string[];
  note: string;
  dashboardUrl: string;
}

const oneLine = (s: string) => s.replace(/[\r\n\u0000-\u001f]+/g, ' ').trim();

export function renderParentSync(p: ParentSync): MailMessage {
  const lines = [
    'Hello,',
    '',
    `${oneLine(p.teacherName)} has graded ${oneLine(p.studentName)}’s task “${oneLine(p.task)}”.`,
    '',
    `Score: ${p.score}/100 (${p.grade})`,
    ...(p.tags.length ? [`Strengths: ${p.tags.map(oneLine).join(', ')}`] : []),
    ...(p.note.trim() ? ['', 'A note from the teacher:', p.note.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim()] : []),
    '',
    `${oneLine(p.studentName)} can see the full feedback on their dashboard: ${p.dashboardUrl}`,
  ];
  return { to: p.guardianEmail, subject: `${oneLine(p.studentName)}’s new grade: ${oneLine(p.task)}`, text: lines.join('\n') };
}
