import { NextResponse } from 'next/server';
import { currentSession } from './supabase/server.ts';

const base = () => (process.env.USERS_SERVICE_URL ?? 'http://localhost:3010').replace(/\/$/, '');

/** Calls users-service with the signed-in user's own access token. The service decides what they may do. */
export async function callUsersService<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T | { error: { code: string; message: string } } }> {
  const session = await currentSession();
  if (!session) return { status: 401, json: { error: { code: 'unauthorized', message: 'Please sign in.' } } };
  try {
    const res = await fetch(`${base()}${path}`, {
      method,
      headers: { authorization: `Bearer ${session.token}`, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  } catch {
    return { status: 502, json: { error: { code: 'upstream', message: 'The accounts service is unreachable.' } } };
  }
}

export async function forward(method: string, path: string, body?: unknown) {
  const { status, json } = await callUsersService(method, path, body);
  return NextResponse.json(json, { status });
}

export async function readBody(req: Request) {
  return req.json().catch(() => undefined);
}
