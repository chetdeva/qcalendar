import nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  ics: { method: 'REQUEST' | 'CANCEL'; content: string };
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

/** Collects messages in memory. Used by tests; can be told to fail to exercise retries. */
export class MemoryMailer implements Mailer {
  sent: MailMessage[] = [];
  failNext = 0;
  failAlways = false;
  async send(message: MailMessage) {
    if (this.failAlways || this.failNext > 0) {
      if (this.failNext > 0) this.failNext--;
      throw new Error('smtp unavailable');
    }
    this.sent.push(message);
  }
}

/** Development default: shows what would be sent instead of sending it. */
export class ConsoleMailer implements Mailer {
  async send(m: MailMessage) {
    console.log(`[mail] to=${m.to} subject="${m.subject}" ics=${m.ics.method}`);
  }
}

/** Any SMTP server, including AWS SES's SMTP interface: SMTP_URL=smtps://USER:PASS@email-smtp.<region>.amazonaws.com:465 */
export function createSmtpMailer(smtpUrl: string, from: string): Mailer {
  const transport = nodemailer.createTransport(smtpUrl);
  return {
    async send(m) {
      await transport.sendMail({
        from,
        to: m.to,
        replyTo: m.replyTo,
        subject: m.subject,
        text: m.text,
        icalEvent: { method: m.ics.method, content: m.ics.content, filename: 'invite.ics' },
      });
    },
  };
}
