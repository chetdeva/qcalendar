import { NextResponse } from 'next/server';
import { currentSession } from './supabase/server.ts';

const base = () => (process.env.USERS_SERVICE_URL ?? 'http://localhost:3010').replace(/\/$/, '');
const billingBase = () => (process.env.BILLING_API_URL ?? 'http://localhost:3012').replace(/\/$/, '');

const calendarBase = () => (process.env.CALENDAR_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

type Reply<T> = { status: number; json: T | { error: { code: string; message: string } } };

/** Calls users-service with the signed-in user's own access token. The service decides what they may do. */
export const callUsersService = <T = unknown>(method: string, path: string, body?: unknown) => callService<T>(base(), 'accounts', method, path, body);

/** Same, for billing-service (plans, credits, checkout). */
export const callBilling = <T = unknown>(method: string, path: string, body?: unknown) => callService<T>(billingBase(), 'billing', method, path, body);

/** Same, for calendar-service (classes per person in the admin tables). */
export const callCalendar = <T = unknown>(method: string, path: string, body?: unknown) => callService<T>(calendarBase(), 'calendar', method, path, body);

async function callService<T>(origin: string, what: string, method: string, path: string, body?: unknown): Promise<Reply<T>> {
  const session = await currentSession();
  if (!session) return { status: 401, json: { error: { code: 'unauthorized', message: 'Please sign in.' } } };
  try {
    const res = await fetch(`${origin}${path}`, {
      method,
      headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  } catch {
    return { status: 502, json: { error: { code: 'upstream', message: `The ${what} service is unreachable.` } } };
  }
}

export async function forward(method: string, path: string, body?: unknown) {
  const { status, json } = await callUsersService(method, path, body);
  return NextResponse.json(json, { status });
}

export async function forwardBilling(method: string, path: string, body?: unknown) {
  const { status, json } = await callBilling(method, path, body);
  return NextResponse.json(json, { status });
}

export async function readBody(req: Request) {
  return req.json().catch(() => undefined);
}

/** Like `forward`, but for bytes (the profile picture): the body goes through untouched and so do the image headers. */
export async function forwardRaw(method: string, path: string, body?: ArrayBuffer, contentType?: string) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: { code: 'unauthorized', message: 'Please sign in.' } }, { status: 401 });
  try {
    const res = await fetch(`${base()}${path}`, {
      method,
      headers: { authorization: `Bearer ${session.token}`, ...(contentType ? { 'content-type': contentType } : {}) },
      body,
      cache: 'no-store',
    });
    const headers = new Headers();
    for (const h of ['content-type', 'cache-control', 'x-content-type-options']) if (res.headers.has(h)) headers.set(h, res.headers.get(h)!);
    return new NextResponse(res.body, { status: res.status, headers });
  } catch {
    return NextResponse.json({ error: { code: 'upstream', message: 'The accounts service is unreachable.' } }, { status: 502 });
  }
}
