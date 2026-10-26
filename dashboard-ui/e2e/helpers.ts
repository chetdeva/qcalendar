import { createServerClient } from '@supabase/ssr';
import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';

// Deliberately unusual ports: local machines often run Supabase stacks and dev servers on the usual ones.
export const AUTH_URL = 'http://localhost:58761';
export const USERS_URL = 'http://localhost:58762';
export const DASH_URL = 'http://localhost:58763';
export const WEB_URL = 'http://localhost:58764';
/** Pretend users-ui. */
export const USERS_UI = 'http://localhost:58765';
export const CAL_URL = 'http://localhost:58766';
export const SERVICE_KEY = 'e2e-service-key-e2e-service-key-0123456789';

export type Role = 'student' | 'teacher' | 'admin';
export interface User { id: string; email: string; name: string; role: Role; password: string }

/** Makes emails unique per test run: the calendar keeps its classes between tests, and a restarted worker would reuse numbers. */
const RUN = Date.now().toString(36);
let counter = 0;

/** Every test makes its own people, so data from earlier tests is invisible; only the fake logins are cleared. */
export async function resetBackend(request: APIRequestContext) {
  expect((await request.post(`${AUTH_URL}/__test/reset`)).ok()).toBeTruthy();
}

export async function seed(request: APIRequestContext, role: Role, name: string, guardianEmail?: string): Promise<User> {
  const email = `${(name || "person").toLowerCase().replace(/[^a-z]+/g, ".")}.${RUN}.${++counter}@example.test`;
  const password = 'password123';
  const res = await request.post(`${AUTH_URL}/__test/user`, { data: { email, password, role, name, guardianEmail } });
  expect(res.ok()).toBeTruthy();
  return { id: (await res.json()).id, email, name, role, password };
}

export async function tokenFor(request: APIRequestContext, u: User): Promise<string> {
  const res = await request.post(`${AUTH_URL}/auth/v1/token?grant_type=password`, { data: { email: u.email, password: u.password } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).access_token;
}

/** A class tomorrow for the teacher and these students (it is what makes them contacts of each other). */
export async function shareAClass(request: APIRequestContext, teacher: User, students: User[], over: Record<string, unknown> = {}) {
  const res = await request.post(`${CAL_URL}/v1/events`, {
    headers: { authorization: `Bearer ${await tokenFor(request, teacher)}` },
    data: { title: 'Pythagorean Theorem', description: 'Squares on triangles', start: new Date(Date.now() + 86_400_000).toISOString(), durationMinutes: 45, meet: true, participants: students.map((s) => ({ email: s.email, userId: s.id, name: s.name })), ...over },
  });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

/** Calls dashboard-service directly as that person: used to set things up that a test is not about. */
export async function dashboardAs(request: APIRequestContext, u: User, method: string, path: string, data?: unknown) {
  const res = await request.fetch(`${DASH_URL}${path}`, { method, data, headers: { authorization: `Bearer ${await tokenFor(request, u)}` } });
  return { status: res.status(), body: await res.json().catch(() => ({})) as any };
}

/** A real signed-in session in the browser: the exact cookies the app's Supabase client produces. */
export async function signIn(context: BrowserContext, u: User) {
  const jar = new Map<string, string>();
  const supabase = createServerClient(AUTH_URL, 'sb_publishable_e2e', {
    cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: (list) => list.forEach((c) => jar.set(c.name, c.value)) },
  });
  const { error } = await supabase.auth.signInWithPassword({ email: u.email, password: u.password });
  expect(error).toBeNull();
  await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: WEB_URL, sameSite: 'Lax' as const })));
}

export async function openPage(context: BrowserContext, u: User, path = '/'): Promise<Page> {
  await signIn(context, u);
  const page = await context.newPage();
  await page.goto(path);
  return page;
}

/** A second, separate browser session for another person. */
export async function openAs(browser: Browser, u: User, path = '/') {
  return openPage(await browser.newContext({ timezoneId: 'UTC', locale: 'en-US', viewport: { width: 1360, height: 900 } }), u, path);
}

/** A tiny real png, for "attach a picture" tests. */
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
