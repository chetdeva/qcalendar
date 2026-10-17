import { NextResponse } from 'next/server';
import { currentSession } from './supabase/server.ts';

const chatBase = () => (process.env.CHAT_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const calendarBase = () => (process.env.CALENDAR_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const usersBase = () => (process.env.USERS_SERVICE_URL ?? 'http://localhost:3010').replace(/\/$/, '');

export type Reply<T = any> = { status: number; json: T };

async function call<T>(base: string, method: string, path: string, body?: unknown): Promise<Reply<T>> {
  const session = await currentSession();
  if (!session) return { status: 401, json: { error: { code: 'unauthorized', message: 'Please sign in.' } } as T };
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  } catch {
    return { status: 502, json: { error: { code: 'upstream', message: 'The service is unreachable. Try again in a moment.' } } as T };
  }
}

/** Both services receive the signed-in person's OWN token, so each one decides what that person may do. */
export const callCalendar = <T = any>(method: string, path: string, body?: unknown) => call<T>(calendarBase(), method, path, body);
/** chat-service, used only to drop a message to the teacher when a student answers an invitation. */
export const callChat = <T = any>(method: string, path: string, body?: unknown) => call<T>(chatBase(), method, path, body);
export const callUsers = <T = any>(method: string, path: string, body?: unknown) => call<T>(usersBase(), method, path, body);

export async function forwardCalendar(method: string, path: string, body?: unknown) {
  const { status, json } = await callCalendar(method, path, body);
  return NextResponse.json(json, { status });
}

export const readBody = (req: Request) => req.json().catch(() => undefined);

/** A class time written out for a chat message, in the class's own timezone. */
export function whenIn(startIso: string, endIso: string, timezone: string) {
  const tz = (() => { try { new Intl.DateTimeFormat('en-US', { timeZone: timezone }); return timezone; } catch { return 'UTC'; } })();
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz }).format(new Date(startIso));
  const t = (iso: string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(iso));
  return `${day}, ${t(startIso)} – ${t(endIso)}`;
}

/**
 * Also tell the teacher in chat, as the student (their own token). Best effort: chat being down or not allowed
 * (calendar-service's chat-policy decides) must never fail the answer the student just gave.
 */
export async function messageTeacher(teacherId: string, text: string) {
  try {
    const session = await currentSession();
    if (!session || session.user.id === teacherId) return;
    const conv = await callChat<{ id?: string }>('POST', '/v1/conversations', { memberIds: [session.user.id, teacherId] });
    if (conv.json.id) await callChat('POST', `/v1/conversations/${conv.json.id}/messages`, { body: text.slice(0, 2000) });
  } catch {
    // ignored on purpose
  }
}
