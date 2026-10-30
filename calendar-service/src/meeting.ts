import { randomBytes, randomUUID } from 'node:crypto';

export interface MeetingInfo { title: string; start: string; end: string }
export type NewMeeting = (info: MeetingInfo) => Promise<string>;

/** A unique room on a Jitsi server: the link needs nothing from the server, so it cannot fail. */
export const jitsiUrl = (base: string) => `${base.replace(/\/$/, '')}/sync-${randomBytes(9).toString('base64url')}`;

export interface GoogleConfig { clientId: string; clientSecret: string; refreshToken: string }

/**
 * Meeting links for new classes. With a Google account configured, each class is made an event on that account's calendar
 * (no guests, no Google invitations; ours are the only ones) purely to get its Google Meet link. Without one, or when Google
 * fails, the link is a Jitsi room, so booking never depends on Google being up.
 */
export function createMeetingProvider(o: { jitsiBase: string; google?: GoogleConfig; fetch?: typeof fetch }): NewMeeting {
  const doFetch = o.fetch ?? fetch;
  let token: { value: string; expires: number } | undefined;

  async function accessToken(g: GoogleConfig) {
    if (token && token.expires > Date.now() + 60_000) return token.value;
    const res = await doFetch('https://oauth2.googleapis.com/token', {
      method: 'POST', signal: AbortSignal.timeout(8000), headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: g.clientId, client_secret: g.clientSecret, refresh_token: g.refreshToken, grant_type: 'refresh_token' }),
    });
    const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!res.ok || !j.access_token) throw new Error(`token ${res.status} ${j.error ?? ''}`);
    token = { value: j.access_token, expires: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return token.value;
  }

  async function googleMeet(g: GoogleConfig, i: MeetingInfo) {
    const res = await doFetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none', {
      method: 'POST', signal: AbortSignal.timeout(8000), headers: { authorization: `Bearer ${await accessToken(g)}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        summary: i.title, start: { dateTime: i.start }, end: { dateTime: i.end },
        conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { hangoutLink?: string; error?: { message?: string } };
    if (!res.ok || !j.hangoutLink) throw new Error(`event ${res.status} ${j.error?.message ?? 'no meeting link'}`);
    return j.hangoutLink;
  }

  return async (info) => {
    if (o.google) {
      try { return await googleMeet(o.google, info); } catch (e) { console.error(`google meet failed, using Jitsi: ${(e as Error).message}`); }
    }
    return jitsiUrl(o.jitsiBase);
  };
}
