import { createServerClient } from '@supabase/ssr';
import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';

// Deliberately unusual ports: local machines often run Supabase stacks and dev servers on the usual ones.
export const AUTH_URL = 'http://localhost:58761';
export const USERS_URL = 'http://localhost:58762';
export const DASH_URL = 'http://localhost:58763';
export const WEB_URL = 'http://localhost:58764';
/** Pretend users-ui. */
export const USERS_UI = 'http://localhost:58765';

export type Role = 'student' | 'teacher' | 'admin';
export interface User { id: string; email: string; name: string; role: Role; password: string }

let counter = 0;

export async function seed(request: APIRequestContext, role: Role, name: string): Promise<User> {
  const email = `${(name || 'person').toLowerCase().replace(/[^a-z]+/g, '.')}.${++counter}@example.test`;
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

/** Clears the fake people and puts the dashboard's sample data back, so tests cannot see each other's changes. */
export async function resetBackend(request: APIRequestContext) {
  expect((await request.post(`${AUTH_URL}/__test/reset`)).ok()).toBeTruthy();
  const admin = await seed(request, 'admin', 'Reset Admin');
  const res = await request.post(`${DASH_URL}/v1/__reset`, { headers: { authorization: `Bearer ${await tokenFor(request, admin)}` } });
  expect(res.status()).toBe(204);
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
