import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIcs, escapeText, fold } from './ics.ts';

/** Calendar apps unfold continuation lines before reading; so do the tests. */
const unfold = (ics: string) => ics.replace(/\r\n /g, '');

const base = {
  method: 'REQUEST' as const, uid: 'abc@syncschedule', sequence: 2, start: new Date('2030-01-07T15:00:00Z'), end: new Date('2030-01-07T16:30:00Z'),
  summary: 'AP Calculus', organizer: { email: 'tess@example.test', name: 'Tess Teacher' }, attendee: { email: 'kid@example.test', name: 'Kid One' },
  now: new Date('2030-01-01T00:00:00Z'),
};

test('a request has the fields calendar apps need, with CRLF line endings', () => {
  const ics = buildIcs({ ...base, description: 'Bring your notes', url: 'https://meet.example.test/room', location: 'https://meet.example.test/room' });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  for (const line of ['METHOD:REQUEST', 'UID:abc@syncschedule', 'SEQUENCE:2', 'DTSTAMP:20300101T000000Z', 'DTSTART:20300107T150000Z', 'DTEND:20300107T163000Z',
    'SUMMARY:AP Calculus', 'STATUS:CONFIRMED', 'URL:https://meet.example.test/room', 'ORGANIZER;CN=Tess Teacher:mailto:tess@example.test']) {
    assert.ok(ics.split('\r\n').includes(line), `missing ${line}`);
  }
  assert.ok(!/[^\r]\n/.test(ics), 'every line ends with CRLF');
});

test('a cancellation reuses the UID with CANCEL and STATUS:CANCELLED', () => {
  const ics = buildIcs({ ...base, method: 'CANCEL', sequence: 3 });
  assert.ok(ics.includes('METHOD:CANCEL\r\n') && ics.includes('STATUS:CANCELLED\r\n') && ics.includes('SEQUENCE:3\r\n') && ics.includes('UID:abc@syncschedule\r\n'));
});

test('only the recipient is listed as an attendee, so group classes never leak other students', () => {
  const ics = unfold(buildIcs(base));
  assert.equal((ics.match(/^ATTENDEE/gm) ?? []).length, 1);
  assert.ok(ics.includes('mailto:kid@example.test'));
  assert.ok(!ics.includes('evil') && !ics.includes('other'));
});

test('text values are escaped and cannot inject new properties', () => {
  assert.equal(escapeText('a,b;c\\d\ne'), 'a\\,b\;c\\\\d\\ne');
  const evil = unfold(buildIcs({ ...base, summary: 'Hi\r\nATTENDEE:mailto:evil@x.test', description: 'x\nEND:VEVENT\nBEGIN:VEVENT' }));
  const lines = evil.split('\r\n');
  assert.equal(lines.filter((l) => l.startsWith('ATTENDEE')).length, 1, 'no injected ATTENDEE');
  assert.equal(lines.filter((l) => l === 'END:VEVENT').length, 1, 'no injected END:VEVENT');
});

test('names with special characters are quoted, control characters dropped', () => {
  const ics = unfold(buildIcs({ ...base, attendee: { email: 'a@b.test', name: 'Kid, "The" One\r\nX' } }));
  const line = ics.split('\r\n').find((l) => l.startsWith('ATTENDEE')) ?? '';
  assert.ok(line.includes('CN="Kid, The OneX"'), line); // quoted because of the comma; quote and control characters removed
  assert.equal(ics.split('\r\n').filter((l) => l.startsWith('ATTENDEE')).length, 1);
});

test('long lines fold at 75 octets without splitting multi-byte characters', () => {
  const folded = fold('DESCRIPTION:' + 'é'.repeat(100));
  for (const line of folded.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, `${Buffer.byteLength(line)} bytes`);
  assert.equal(folded.split('\r\n').slice(1).every((l) => l.startsWith(' ')), true);
  assert.equal(folded.replace(/\r\n /g, ''), 'DESCRIPTION:' + 'é'.repeat(100), 'unfolding restores the text');
});

test('unicode titles survive', () => {
  assert.ok(buildIcs({ ...base, summary: 'Matemáticas 数学' }).replace(/\r\n /g, '').includes('SUMMARY:Matemáticas 数学'));
});
