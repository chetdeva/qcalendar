import { NextResponse } from 'next/server';
import { currentSession } from './supabase/server.ts';

const base = (name: string, fallback: string) => (process.env[name] ?? fallback).replace(/\/$/, '');
const dashboardBase = () => base('DASHBOARD_API_URL', 'http://localhost:3007');
const calendarBase = () => base('CALENDAR_API_URL', 'http://localhost:3000');
const billingBase = () => base('BILLING_API_URL', 'http://localhost:3012');
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

/** Both services receive the signed-in person's OWN token, so each one decides what that person may do. */
/** calendar-service (free class requests) and billing-service (what to nudge), only for the student's nudge cards. */
export const callCalendar = <T = any>(method: string, path: string, body?: unknown) => call<T>(calendarBase(), method, path, body);
export const callBilling = <T = any>(method: string, path: string, body?: unknown) => call<T>(billingBase(), method, path, body);
export const callDashboard = <T = any>(method: string, path: string, body?: unknown) => call<T>(dashboardBase(), method, path, body);
export const callUsers = <T = any>(method: string, path: string, body?: unknown) => call<T>(usersBase(), method, path, body);

export async function forwardDashboard(method: string, path: string, body?: unknown) {
  const { status, json } = await callDashboard(method, path, body);
  return status === 204 ? new NextResponse(null, { status }) : NextResponse.json(json, { status });
}

export const readBody = (req: Request) => req.json().catch(() => undefined);

/** A raw (non-JSON) response from dashboard-service, such as an uploaded image, with the person's own token. */
export async function rawDashboard(path: string): Promise<Response> {
  const session = await currentSession();
  if (!session) return new Response('Please sign in.', { status: 401 });
  try {
    const res = await fetch(`${dashboardBase()}${path}`, { headers: { authorization: `Bearer ${session.token}` }, cache: 'no-store' });
    return new Response(res.body, { status: res.status, headers: { 'content-type': res.headers.get('content-type') ?? 'application/octet-stream', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'", 'cache-control': 'private, max-age=300' } });
  } catch {
    return new Response('The service is unreachable.', { status: 502 });
  }
}
