import { NextResponse } from 'next/server';
import { currentSession } from './supabase/server.ts';

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
export const callUsers = <T = any>(method: string, path: string, body?: unknown) => call<T>(usersBase(), method, path, body);

export async function forwardCalendar(method: string, path: string, body?: unknown) {
  const { status, json } = await callCalendar(method, path, body);
  return NextResponse.json(json, { status });
}

export const readBody = (req: Request) => req.json().catch(() => undefined);
