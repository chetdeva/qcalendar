import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMeetingProvider } from './meeting.ts';

const google = { clientId: 'cid', clientSecret: 'sec', refreshToken: 'rt' };
const info = { title: 'Algebra', start: '2030-01-10T10:00:00.000Z', end: '2030-01-10T11:00:00.000Z' };
const JITSI = /^https:\/\/jitsi\.example\.test\/sync-[\w-]{12}$/;

function fake(over: { event?: () => Response; token?: () => Response } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.includes('oauth2.googleapis.com')) return over.token?.() ?? new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }));
    return over.event?.() ?? new Response(JSON.stringify({ hangoutLink: 'https://meet.google.com/abc-defg-hij' }));
  }) as unknown as typeof fetch;
  return { f, calls };
}

test('without Google it is a Jitsi room and calls nothing', async () => {
  const { f, calls } = fake();
  assert.match(await createMeetingProvider({ jitsiBase: 'https://jitsi.example.test/', fetch: f })(info), JITSI);
  assert.equal(calls.length, 0);
});

test('with Google the class becomes a guestless Meet event and its link is used; the access token is reused', async () => {
  const { f, calls } = fake();
  const meet = createMeetingProvider({ jitsiBase: 'https://jitsi.example.test', google, fetch: f });
  assert.equal(await meet(info), 'https://meet.google.com/abc-defg-hij');
  await meet(info);
  assert.equal(calls.filter((c) => c.url.includes('oauth2')).length, 1);
  const ev = calls.find((c) => c.url.includes('/calendars/primary/events'))!;
  assert.match(ev.url, /conferenceDataVersion=1/);
  assert.match(ev.url, /sendUpdates=none/);
  assert.equal((ev.init.headers as Record<string, string>).authorization, 'Bearer at');
  const body = JSON.parse(ev.init.body as string);
  assert.equal(body.conferenceData.createRequest.conferenceSolutionKey.type, 'hangoutsMeet');
  assert.equal(body.attendees, undefined);
  assert.deepEqual([body.summary, body.start.dateTime, body.end.dateTime], [info.title, info.start, info.end]);
});

test('when Google fails (token, event, or no link) the class still gets a Jitsi room', async () => {
  const orig = console.error; console.error = () => {};
  try {
    for (const over of [{ token: () => new Response('{}', { status: 400 }) }, { event: () => new Response('{}', { status: 500 }) }, { event: () => new Response('{}') }]) {
      assert.match(await createMeetingProvider({ jitsiBase: 'https://jitsi.example.test', google, fetch: fake(over).f })(info), JITSI);
    }
    const down = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    assert.match(await createMeetingProvider({ jitsiBase: 'https://jitsi.example.test', google, fetch: down })(info), JITSI);
  } finally { console.error = orig; }
});
