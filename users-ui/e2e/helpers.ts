import { expect, type APIRequestContext, type Page } from '@playwright/test';

// Deliberately unusual ports: local machines often run Supabase stacks and dev servers on the usual ones.
export const AUTH_PORT = 58731;
export const USERS_PORT = 58732;
export const WEB_PORT = 58733;
export const AUTH_URL = `http://localhost:${AUTH_PORT}`;
export const USERS_URL = `http://localhost:${USERS_PORT}`;
export const WEB_URL = `http://localhost:${WEB_PORT}`;
/** A pretend second app (the calendar). Never actually served; tests intercept requests to it. */
export const CALENDAR_ORIGIN = 'http://localhost:58734';

export const ADMIN = { email: 'admin@example.test', password: 'admin-pass-123' };

export async function resetBackend(request: APIRequestContext) {
  expect((await request.post(`${AUTH_URL}/__test/reset`)).ok()).toBeTruthy();
}

export async function seedUser(
  request: APIRequestContext,
  u: { email: string; password?: string; role?: 'student' | 'teacher' | 'admin'; name?: string; confirmed?: boolean },
) {
  const res = await request.post(`${AUTH_URL}/__test/user`, { data: { password: 'password123', name: u.email.split('@')[0], ...u } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).id as string;
}

export async function mailFor(request: APIRequestContext, to: string, kind: 'signup' | 'recovery' | 'invite') {
  const mails = (await (await request.get(`${AUTH_URL}/__test/mail`, { params: { to, kind } })).json()) as { link: string }[];
  return mails.at(-1)?.link;
}

export async function profileOf(request: APIRequestContext, email: string) {
  return (await (await request.get(`${AUTH_URL}/__test/profile`, { params: { email } })).json()) as { role: string; status: string; full_name: string | null; guardian_email: string | null; timezone: string | null } | null;
}

export async function logIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
}

export async function logInAs(page: Page, who: { email: string; password: string }) {
  await logIn(page, who.email, who.password);
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
}
