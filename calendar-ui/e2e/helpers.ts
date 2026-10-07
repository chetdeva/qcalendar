import { createServerClient } from '@supabase/ssr';
import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';

// Deliberately unusual ports: local machines often run Supabase stacks and dev servers on the usual ones.
export const AUTH_URL = 'http://localhost:58741';
export const USERS_URL = 'http://localhost:58742';
export const CAL_URL = 'http://localhost:58743';
export const WEB_URL = 'http://localhost:58744';
/** Pretend users-ui. Never actually served; tests intercept requests to it. */
export const USERS_UI = 'http://localhost:58745';
export const SERVICE_KEY = 'e2e-service-key-e2e-service-key-0123456789';

export type Role = 'student' | 'teacher' | 'admin';
export interface User { id: string; email: string; name: string; role: Role; password: string }

let counter = 0;

/** Clears people (fake auth + users-service) and cancels every class, so tests cannot see each other's leftovers. */
export async function resetBackend(request: APIRequestContext) {
  expect((await request.post(`${AUTH_URL}/__test/reset`)).ok()).toBeTruthy();
  const headers = { authorization: `Bearer ${SERVICE_KEY}` };
  const { events } = (await (await request.get(`${CAL_URL}/v1/events`, { headers })).json()) as { events: { id: string }[] };
  for (const e of events) await request.delete(`${CAL_URL}/v1/events/${e.id}`, { headers });
}

export async function seed(request: APIRequestContext, role: Role, name: string, emailOverride?: string): Promise<User> {
  const email = emailOverride ?? `${name.toLowerCase().replace(/[^a-z]+/g, '.')}.${++counter}@example.test`;
  const password = 'password123';
  const res = await request.post(`${AUTH_URL}/__test/user`, { data: { email, password, role, name } });
  expect(res.ok()).toBeTruthy();
  return { id: (await res.json()).id, email, name, role, password };
}

export async function tokenFor(request: APIRequestContext, u: User): Promise<string> {
  const res = await request.post(`${AUTH_URL}/auth/v1/token?grant_type=password`, { data: { email: u.email, password: u.password } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).access_token;
}

/** Calls calendar-service directly as that person: used to set up and to check what really got stored. */
export function calendarAs(request: APIRequestContext, token: string) {
  const call = async (method: string, path: string, data?: unknown) => {
    const res = await request.fetch(`${CAL_URL}${path}`, { method, data, headers: { authorization: `Bearer ${token}` } });
    return { status: res.status(), body: await res.json().catch(() => ({})) as any };
  };
  return {
    call,
    create: async (body: Record<string, unknown>) => {
      const r = await call('POST', '/v1/events', body);
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return r.body;
    },
    list: async (q = '') => (await call('GET', `/v1/events${q}`)).body.events as any[],
  };
}

/**
 * A real signed-in session in the browser. A token is obtained from the fake Supabase and written as the exact
 * cookies the app's Supabase client produces (same library, same options), so the app cannot tell it from a login.
 */
export async function signIn(context: BrowserContext, request: APIRequestContext, u: User) {
  const jar = new Map<string, string>();
  const supabase = createServerClient(AUTH_URL, 'sb_publishable_e2e', {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (list) => list.forEach((c) => jar.set(c.name, c.value)) },
  });
  const { error } = await supabase.auth.signInWithPassword({ email: u.email, password: u.password });
  expect(error).toBeNull();
  await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: WEB_URL, sameSite: 'Lax' as const })));
  void request;
}

export async function openPage(context: BrowserContext, request: APIRequestContext, u: User, path = '/'): Promise<Page> {
  await signIn(context, request, u);
  const page = await context.newPage();
  await page.goto(path);
  return page;
}

/** Make a teacher bookable all day, every day, so tests do not depend on the time they run. */
export async function openAllDay(request: APIRequestContext, teacher: User) {
  const allDay = [['00:00', '23:59']];
  const r = await calendarAs(request, await tokenFor(request, teacher)).call('PUT', '/v1/settings', {
    timezone: 'UTC', workingHours: { sun: allDay, mon: allDay, tue: allDay, wed: allDay, thu: allDay, fri: allDay, sat: allDay },
  });
  expect(r.status).toBe(200);
}

export const todayUtc = () => new Date().toISOString().slice(0, 10);
/** An ISO time today (UTC), at the given hour. The browser runs in UTC, so this matches what the calendar shows. */
export const at = (hour: number, minute = 0) => `${todayUtc()}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`;

/** An ISO time `days` from today (UTC) at the given hour. Use days >= 1 when a class must still be upcoming whatever time the tests run. */
export const inDays = (days: number, hour: number, minute = 0) => {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`;
};
