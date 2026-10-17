import { createServerClient } from '@supabase/ssr';
import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';

// Deliberately unusual ports: local machines often run Supabase stacks and dev servers on the usual ones.
export const AUTH_URL = 'http://localhost:58751';
export const USERS_URL = 'http://localhost:58752';
export const CAL_URL = 'http://localhost:58753';
export const WEB_URL = 'http://localhost:58754';
/** Pretend users-ui. */
export const USERS_UI = 'http://localhost:58755';
export const CHAT_URL = 'http://localhost:58756';
export const SERVICE_KEY = 'e2e-service-key-e2e-service-key-0123456789';

export type Role = 'student' | 'teacher' | 'admin';
export interface User { id: string; email: string; name: string; role: Role; password: string }

let counter = 0;

/** Every test makes its own people, so conversations from earlier tests are invisible; only the fake auth is cleared. */
export async function resetBackend(request: APIRequestContext) {
  expect((await request.post(`${AUTH_URL}/__test/reset`)).ok()).toBeTruthy();
}

export async function seed(request: APIRequestContext, role: Role, name: string): Promise<User> {
  const email = `${name.toLowerCase().replace(/[^a-z]+/g, '.')}.${++counter}@example.test`;
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

/** A class today for the teacher and these students: it is what makes them contacts of each other. */
export async function shareAClass(request: APIRequestContext, teacher: User, students: User[]) {
  const res = await request.post(`${CAL_URL}/v1/events`, {
    headers: { authorization: `Bearer ${await tokenFor(request, teacher)}` },
    data: { title: 'Algebra', start: new Date(Date.now() + 86_400_000).toISOString(), durationMinutes: 60, participants: students.map((s) => ({ email: s.email, userId: s.id })) },
  });
  expect(res.status(), await res.text()).toBe(201);
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
