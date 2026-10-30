import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN, AUTH_URL, CALENDAR_API_URL, pay, resetBackend, seedUser } from './helpers';

test.beforeEach(async ({ request }) => resetBackend(request));

async function signInAt(page: Page, path: string, who: { email: string; password: string }) {
  await page.goto(path);
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Log in' }).click();
}
const PASS = 'pass-12345';
const rowOf = (page: Page, table: string, text: string) => page.locator(`table[aria-label="${table}"] tbody tr`, { hasText: text });

async function tokenOf(request: APIRequestContext, email: string, password = PASS) {
  const res = await request.post(`${AUTH_URL}/auth/v1/token?grant_type=password`, { data: { email, password } });
  return (await res.json()).access_token as string;
}
/** A class tomorrow at 10:00 UTC, one hour long, owned by the teacher with these students. */
async function bookClass(request: APIRequestContext, teacher: string, students: { id: string; email: string }[]) {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + 2); d.setUTCHours(10, 0, 0, 0);
  const res = await request.post(`${CALENDAR_API_URL}/v1/events`, {
    headers: { authorization: `Bearer ${await tokenOf(request, teacher)}` },
    data: { title: 'Algebra', start: d.toISOString(), durationMinutes: 60, participants: students.map((s) => ({ userId: s.id, email: s.email })) },
  });
  expect(res.status(), await res.text()).toBe(201);
}

test.describe('admin sign-in page', () => {
  test('an admin signs in at /login/admin and lands on the portal', async ({ page }) => {
    await signInAt(page, '/login/admin', ADMIN);
    await expect(page).toHaveURL(/\/admin\/teachers/);
    await expect(page.getByRole('heading', { name: 'Teachers', exact: true })).toBeVisible();
  });

  test('a teacher is turned away and signed out', async ({ page, request }) => {
    await seedUser(request, { email: 'tess@example.test', password: PASS, role: 'teacher' });
    await signInAt(page, '/login/admin', { email: 'tess@example.test', password: PASS });
    await expect(page.locator('.alert-error')).toContainText('for administrators');
    await page.goto('/admin/teachers');
    await expect(page).toHaveURL(/\/login/); // not signed in any more
  });
});

test.describe('teacher sign-in page', () => {
  test('a teacher signs in at /login/teacher; a student is turned away', async ({ page, request }) => {
    await seedUser(request, { email: 'tess@example.test', password: PASS, role: 'teacher' });
    await seedUser(request, { email: 'sam@example.test', password: PASS });
    await signInAt(page, '/login/teacher', { email: 'sam@example.test', password: PASS });
    await expect(page.locator('.alert-error')).toContainText('for teachers');
    await signInAt(page, '/login/teacher', { email: 'tess@example.test', password: PASS });
    await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  });
});

test.describe('teachers and students tabs', () => {
  test('teachers: classes and active students, search, and the Active/Inactive filter', async ({ page, request }) => {
    await seedUser(request, { email: 'tess@example.test', name: 'Tess Teacher', password: PASS, role: 'teacher' });
    await seedUser(request, { email: 'tom@example.test', name: 'Tom Tutor', password: PASS, role: 'teacher' });
    const a = await seedUser(request, { email: 'amy@example.test', password: PASS });
    const b = await seedUser(request, { email: 'ben@example.test', password: PASS });
    await bookClass(request, 'tess@example.test', [{ id: a, email: 'amy@example.test' }, { id: b, email: 'ben@example.test' }]);

    await signInAt(page, '/login/admin', ADMIN);
    const tess = rowOf(page, 'Teachers', 'tess@example.test');
    await expect(tess).toContainText('Tess Teacher');
    await expect(tess.locator('td').nth(3)).toHaveText('2'); // active students
    await expect(tess.locator('td').nth(4)).toContainText('1'); // upcoming classes
    await expect(rowOf(page, 'Teachers', 'tom@example.test').locator('td').nth(3)).toHaveText('0');

    await page.getByLabel('Search by name or email').fill('tom');
    await expect(rowOf(page, 'Teachers', 'tess@example.test')).toHaveCount(0);
    await expect(rowOf(page, 'Teachers', 'tom@example.test')).toBeVisible();

    await page.getByRole('button', { name: 'Disable tom@example.test' }).click();
    await expect(page.locator('.alert-ok')).toContainText('tom@example.test disabled');
    await page.getByLabel('Status').selectOption('disabled');
    await expect(rowOf(page, 'Teachers', 'tom@example.test')).toContainText('inactive');
    await page.getByLabel('Status').selectOption('active');
    await expect(rowOf(page, 'Teachers', 'tom@example.test')).toHaveCount(0);
  });

  test('students: credits and upcoming classes', async ({ page, request }) => {
    await seedUser(request, { email: 'tess@example.test', password: PASS, role: 'teacher' });
    const amy = await seedUser(request, { email: 'amy@example.test', name: 'Amy Student', password: PASS, grade: 6 });
    await seedUser(request, { email: 'ben@example.test', password: PASS, grade: 6 });
    await pay(request, 'amy@example.test');
    await bookClass(request, 'tess@example.test', [{ id: amy, email: 'amy@example.test' }]);

    await signInAt(page, '/login/admin', ADMIN);
    await page.getByRole('link', { name: 'Students', exact: true }).click();
    const row = rowOf(page, 'Students', 'amy@example.test');
    await expect(row).toContainText('Amy Student');
    await expect(row.locator('td').nth(3)).toHaveText('15'); // the fake calendar here has no billing wired, so booking does not spend one
    await expect(row.locator('td').nth(4)).toContainText('1');
    await expect(rowOf(page, 'Students', 'ben@example.test').locator('td').nth(3)).toHaveText('0');
    await expect(rowOf(page, 'Students', 'tess@example.test')).toHaveCount(0); // only students
  });

  test('the people API is for admins', async ({ page, request }) => {
    await seedUser(request, { email: 'sam@example.test', password: PASS });
    await signInAt(page, '/login', { email: 'sam@example.test', password: PASS });
    await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
    expect((await page.request.get('/api/admin/people?role=student')).status()).toBe(403);
    expect((await page.request.get('/api/admin/people?role=admin')).status()).toBe(400);
  });
});
