import { randomUUID } from 'node:crypto';
import { kvGet, kvSet, type DB } from './db.ts';
import type { Interval } from './availability.ts';

export interface GoogleEventInput {
  title: string;
  description?: string | null;
  location?: string | null;
  startIso: string;
  endIso: string;
  timezone: string;
  attendees: string[];
  requestMeet: boolean;
}

export interface GoogleClient {
  configured: boolean;
  isConnected(): boolean;
  authUrl(state: string): string;
  handleCallback(code: string): Promise<void>;
  upsertEvent(input: GoogleEventInput, googleId?: string): Promise<{ id: string; meetUrl?: string }>;
  deleteEvent(googleId: string): Promise<void>;
  freeBusy(fromIso: string, toIso: string): Promise<Interval[]>;
}

interface Tokens {
  refresh_token: string;
  access_token: string;
  expires_at: number;
}

export interface GoogleConfig {
  clientId?: string;
  clientSecret?: string;
  redirectUri: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
].join(' ');

export function createGoogleClient(db: DB, cfg: GoogleConfig): GoogleClient {
  const configured = Boolean(cfg.clientId && cfg.clientSecret);

  async function tokenRequest(params: Record<string, string>) {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      body: new URLSearchParams({ client_id: cfg.clientId!, client_secret: cfg.clientSecret!, ...params }),
    });
    if (!res.ok) throw new Error(`Google token request failed: ${res.status} ${await res.text()}`);
    return (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
  }

  async function accessToken(): Promise<string> {
    const t = kvGet<Tokens>(db, 'google_tokens');
    if (!t) throw new Error('Google is not connected');
    if (t.expires_at > Date.now() + 60_000) return t.access_token;
    const j = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token });
    kvSet(db, 'google_tokens', { ...t, access_token: j.access_token, expires_at: Date.now() + j.expires_in * 1000 });
    return j.access_token;
  }

  async function call(method: string, path: string, body?: unknown, okStatuses: number[] = []) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok && !okStatuses.includes(res.status)) {
      throw new Error(`Google API ${method} ${path} failed: ${res.status} ${await res.text()}`);
    }
    return res.status === 204 ? null : res.ok ? await res.json() : null;
  }

  return {
    configured,
    isConnected: () => configured && kvGet<Tokens>(db, 'google_tokens') !== undefined,
    authUrl(state) {
      const q = new URLSearchParams({
        client_id: cfg.clientId ?? '',
        redirect_uri: cfg.redirectUri,
        response_type: 'code',
        scope: SCOPES,
        access_type: 'offline',
        prompt: 'consent',
        state,
      });
      return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
    },
    async handleCallback(code) {
      const j = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri });
      if (!j.refresh_token) throw new Error('Google returned no refresh token; revoke app access and reconnect');
      kvSet(db, 'google_tokens', {
        refresh_token: j.refresh_token,
        access_token: j.access_token,
        expires_at: Date.now() + j.expires_in * 1000,
      });
    },
    async upsertEvent(input, googleId) {
      const body: Record<string, unknown> = {
        summary: input.title,
        description: input.description ?? '',
        location: input.location ?? '',
        start: { dateTime: input.startIso, timeZone: input.timezone },
        end: { dateTime: input.endIso, timeZone: input.timezone },
        attendees: input.attendees.map((email) => ({ email })),
      };
      if (input.requestMeet) {
        body.conferenceData = {
          createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
        };
      }
      const qs = '?sendUpdates=all&conferenceDataVersion=1';
      const res = googleId
        ? await call('PATCH', `/calendars/primary/events/${encodeURIComponent(googleId)}${qs}`, body)
        : await call('POST', `/calendars/primary/events${qs}`, body);
      return { id: res.id as string, meetUrl: res.hangoutLink as string | undefined };
    },
    async deleteEvent(googleId) {
      await call('DELETE', `/calendars/primary/events/${encodeURIComponent(googleId)}?sendUpdates=all`, undefined, [404, 410]);
    },
    async freeBusy(fromIso, toIso) {
      const res = await call('POST', '/freeBusy', { timeMin: fromIso, timeMax: toIso, items: [{ id: 'primary' }] });
      const busy = (res?.calendars?.primary?.busy ?? []) as { start: string; end: string }[];
      return busy.map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
    },
  };
}
