import { NextResponse } from 'next/server';
import { currentSession } from './supabase/server.ts';

const base = (name: string, fallback: string) => (process.env[name] ?? fallback).replace(/\/$/, '');
const chatBase = () => base('CHAT_API_URL', 'http://localhost:3001');
const calendarBase = () => base('CALENDAR_API_URL', 'http://localhost:3000');
const usersBase = () => base('USERS_SERVICE_URL', 'http://localhost:3010');

export type Reply<T = any> = { status: number; json: T };

async function call<T>(root: string, method: string, path: string, body?: unknown): Promise<Reply<T>> {
  const session = await currentSession();
  if (!session) return { status: 401, json: { error: { code: 'unauthorized', message: 'Please sign in.' } } as T };
  try {
    const res = await fetch(`${root}${path}`, {
      method,
      headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    return { status: res.status, json: res.status === 204 ? ({} as T) : await res.json().catch(() => ({})) };
  } catch {
    return { status: 502, json: { error: { code: 'upstream', message: 'The service is unreachable. Try again in a moment.' } } as T };
  }
}

/** Every service receives the signed-in person's OWN token, so each one decides what that person may do. */
export const callChat = <T = any>(method: string, path: string, body?: unknown) => call<T>(chatBase(), method, path, body);
export const callCalendar = <T = any>(method: string, path: string, body?: unknown) => call<T>(calendarBase(), method, path, body);
export const callUsers = <T = any>(method: string, path: string, body?: unknown) => call<T>(usersBase(), method, path, body);

export async function forwardChat(method: string, path: string, body?: unknown) {
  const { status, json } = await callChat(method, path, body);
  return status === 204 ? new NextResponse(null, { status }) : NextResponse.json(json, { status });
}

export const readBody = (req: Request) => req.json().catch(() => undefined);

export interface Person { id: string; name: string; email: string }

/** Names and emails for profile ids. Chat stores only ids; people come from users-service, so they are never stale. */
export async function peopleOf(ids: string[]): Promise<Map<string, Person>> {
  const unique = [...new Set(ids)].slice(0, 50); // ponytail: one lookup of up to 50 people; page it if lists get longer
  if (!unique.length) return new Map();
  const { status, json } = await callUsers<{ users: { id: string; full_name: string | null; email: string }[] }>('POST', '/v1/users/lookup', { ids: unique });
  return new Map(status === 200 ? json.users.map((u) => [u.id, { id: u.id, name: u.full_name?.trim() || u.email, email: u.email }] as const) : []);
}
