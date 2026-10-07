// Minimal RFC 5545 writer for classroom invitations. Each recipient gets their own file listing only themselves
// as attendee, so a group class never reveals one student's email address to another.

export interface IcsInput {
  method: 'REQUEST' | 'CANCEL';
  uid: string;
  sequence: number;
  start: Date;
  end: Date;
  summary: string;
  description?: string | null;
  location?: string | null;
  url?: string | null;
  organizer: { email: string; name?: string | null };
  attendee: { email: string; name?: string | null };
  now?: Date;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

/** Escapes TEXT values: backslash, semicolon, comma, newline (RFC 5545 section 3.3.11). */
export const escapeText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** A parameter value (CN) may not contain control characters, and is quoted when it has special characters. */
const param = (s: string) => {
  const clean = s.replace(/[\u0000-\u001f\u007f"]/g, '');
  return /[;:,]/.test(clean) ? `"${clean}"` : clean;
};

/** Folds a content line at 75 octets, never splitting a multi-byte character; continuation lines start with a space. */
export function fold(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > limit) {
      out.push(current);
      current = ' ';
      bytes = 1;
      limit = 75;
    }
    current += ch;
    bytes += n;
  }
  out.push(current);
  return out.join('\r\n');
}

const mailto = (email: string) => `mailto:${email.replace(/[\u0000-\u001f\u007f\s]/g, '')}`;

export function buildIcs(i: IcsInput): string {
  const cancelled = i.method === 'CANCEL';
  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//SyncSchedule//Calendar//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    `METHOD:${i.method}`,
    'BEGIN:VEVENT',
    `UID:${i.uid}`,
    `DTSTAMP:${stamp(i.now ?? new Date())}`,
    `SEQUENCE:${i.sequence}`,
    `DTSTART:${stamp(i.start)}`,
    `DTEND:${stamp(i.end)}`,
    `SUMMARY:${escapeText(i.summary)}`,
    ...(i.description ? [`DESCRIPTION:${escapeText(i.description)}`] : []),
    ...(i.location ? [`LOCATION:${escapeText(i.location)}`] : []),
    ...(i.url ? [`URL:${i.url.replace(/[\u0000-\u001f\u007f\s]/g, '')}`] : []),
    `ORGANIZER${i.organizer.name ? `;CN=${param(i.organizer.name)}` : ''}:${mailto(i.organizer.email)}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE${i.attendee.name ? `;CN=${param(i.attendee.name)}` : ''}:${mailto(i.attendee.email)}`,
    `STATUS:${cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
