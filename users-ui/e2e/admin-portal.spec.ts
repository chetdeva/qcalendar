import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { ADMIN, AUTH_URL, BILLING_URL, CALENDAR_API_URL, pay, resetBackend, seedUser } from './helpers';

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
    await expect(tess.getByRole('link', { name: 'View calendar of tess@example.test' })).toHaveAttribute('href', /\/\?teacher=[0-9a-f-]{36}$/);
    await expect(tess.locator('td').nth(3)).toHaveText('2'); // active students
    await expect(tess.locator('td').nth(6)).toContainText('1'); // upcoming classes
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
    await expect(row.locator('td').nth(4)).toHaveText('15'); // the fake calendar here has no billing wired, so booking does not spend one
    await expect(row.locator('td').nth(5)).toContainText('1');
    await expect(rowOf(page, 'Students', 'ben@example.test').locator('td').nth(4)).toHaveText('0');
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

test.describe('assigning teachers', () => {
  test('assign a student to a teacher from the Students tab, change it, then remove it; the teacher count follows', async ({ page, request }) => {
    await seedUser(request, { email: 'tess@example.test', name: 'Tess Teacher', password: PASS, role: 'teacher' });
    await seedUser(request, { email: 'tom@example.test', name: 'Tom Tutor', password: PASS, role: 'teacher' });
    await seedUser(request, { email: 'amy@example.test', name: 'Amy Student', password: PASS });
    await signInAt(page, '/login/admin', ADMIN);
    await page.getByRole('link', { name: 'Students', exact: true }).click();

    const amy = rowOf(page, 'Students', 'amy@example.test');
    await expect(amy).toContainText('Not assigned');
    await page.getByRole('button', { name: 'Assign a teacher to amy@example.test' }).click();
    await page.getByLabel('Teacher', { exact: true }).selectOption({ label: 'Tess Teacher' });
    await page.getByLabel('Note (optional, sent in the email)').fill('Strong in algebra');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.alert-ok')).toContainText('Amy Student is now assigned to Tess Teacher');
    await expect(amy).toContainText('Tess Teacher');

    await page.getByRole('button', { name: 'Change teacher for amy@example.test' }).click();
    await page.getByLabel('Teacher', { exact: true }).selectOption({ label: 'Tom Tutor' });
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(amy).toContainText('Tom Tutor');

    await page.getByRole('link', { name: 'Teachers', exact: true }).click();
    await expect(rowOf(page, 'Teachers', 'tom@example.test').locator('td').nth(3)).toHaveText('1');
    await expect(rowOf(page, 'Teachers', 'tess@example.test').locator('td').nth(3)).toHaveText('0');

    await page.getByRole('link', { name: 'Students', exact: true }).click();
    await page.getByRole('button', { name: 'Change teacher for amy@example.test' }).click();
    await page.getByRole('button', { name: 'Remove assignment' }).click();
    await expect(amy).toContainText('Not assigned');
  });

  test('assign students from the Teachers tab by searching for them', async ({ page, request }) => {
    await seedUser(request, { email: 'tess@example.test', name: 'Tess Teacher', password: PASS, role: 'teacher' });
    await seedUser(request, { email: 'amy@example.test', name: 'Amy Student', password: PASS });
    await signInAt(page, '/login/admin', ADMIN);
    await page.getByRole('button', { name: 'Assign students to tess@example.test' }).click();
    await page.getByLabel('Search students by name or email').fill('amy');
    await page.getByRole('button', { name: 'Assign amy@example.test' }).click();
    await expect(page.locator('.alert-ok')).toContainText('Amy Student is now assigned to Tess Teacher');
    await expect(rowOf(page, 'Teachers', 'tess@example.test').locator('td').nth(3)).toHaveText('1');
  });

  test('only a teacher can be chosen, and only students can be assigned', async ({ page, request }) => {
    const sam = await seedUser(request, { email: 'sam@example.test', password: PASS });
    const other = await seedUser(request, { email: 'other@example.test', password: PASS });
    await signInAt(page, '/login/admin', ADMIN);
    await expect(page).toHaveURL(/\/admin\/teachers/);
    const put = (id: string, teacherId: string | null) => page.request.put(`/api/admin/students/${id}/teacher`, { data: { teacherId } });
    expect((await put(sam, other)).status()).toBe(400); // a student is not a teacher
    expect((await put(other, null)).status()).toBe(200); // removing when nothing is assigned is harmless
  });
});

test.describe('credits and payouts', () => {
  test('a student\'s credits: add and deduct with a reason, never below zero, and the history says why', async ({ page, request }) => {
    await seedUser(request, { email: 'amy@example.test', name: 'Amy Student', password: PASS, grade: 6 });
    await signInAt(page, '/login/admin', ADMIN);
    await page.getByRole('link', { name: 'Students', exact: true }).click();
    const amy = rowOf(page, 'Students', 'amy@example.test');
    await page.getByRole('button', { name: 'Credits of amy@example.test' }).click();
    const panel = page.getByRole('region', { name: 'Credits of amy@example.test' });

    await panel.getByLabel('Credits', { exact: true }).fill('3');
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(panel.locator('.alert-error')).toContainText('reason is required');
    await panel.getByLabel('Reason (required)').fill('Make-up for a cancelled week');
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(panel.locator('.alert-ok')).toContainText('Added 3 credits');
    await expect(amy.locator('td').nth(4)).toHaveText('3');
    await expect(panel.getByRole('table', { name: 'Credit history' })).toContainText('Make-up for a cancelled week');

    await panel.getByLabel('Change').selectOption('deduct');
    await panel.getByLabel('Credits', { exact: true }).fill('5');
    await panel.getByLabel('Reason (required)').fill('Entered by mistake');
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(panel.locator('.alert-error')).toContainText('does not have that many');
    await panel.getByLabel('Credits', { exact: true }).fill('2');
    await panel.getByRole('button', { name: 'Save' }).click();
    await expect(panel.locator('.alert-ok')).toContainText('Removed 2 credits');
    await expect(amy.locator('td').nth(4)).toHaveText('1');
    await expect(panel.getByRole('table', { name: 'Credit history' }).locator('tbody tr').first()).toContainText('Entered by mistake');
  });

  test('a teacher\'s earned credits are paid out at their rate and marked settled', async ({ page, request }) => {
    const tess = await seedUser(request, { email: 'tess@example.test', name: 'Tess Teacher', password: PASS, role: 'teacher' });
    for (const ref of ['ev1:a', 'ev1:b', 'ev2:a']) {
      const r = await request.post(`${BILLING_URL}/v1/service/earnings`, { headers: { authorization: `Bearer ${'b'.repeat(32)}` }, data: { teacherId: tess, ref, earnedAt: new Date().toISOString() } });
      expect(r.ok()).toBeTruthy();
    }
    await signInAt(page, '/login/admin', ADMIN);
    const row = rowOf(page, 'Teachers', 'tess@example.test');
    await expect(row.locator('td').nth(4)).toHaveText('3'); // credit balance
    await expect(row).toContainText('3 to pay');

    await page.getByRole('button', { name: 'Payout for tess@example.test' }).click();
    const panel = page.getByRole('region', { name: 'Payout for tess@example.test' });
    await expect(panel).toContainText('set a rate to see the amount');
    await panel.getByLabel('Paid per credit').fill('250');
    await panel.getByRole('button', { name: 'Save rate' }).click();
    await expect(panel).toContainText('₹750.00');
    await panel.getByLabel('Payment reference').fill('UTR-8841');
    await panel.getByLabel('Notes (optional)').fill('October');
    await panel.getByRole('button', { name: 'Mark as paid' }).click();
    await expect(panel.locator('.alert-ok')).toContainText('3 credits, ₹750.00');
    await expect(panel.getByRole('table', { name: 'Past payouts' })).toContainText('UTR-8841');
    await expect(panel.getByRole('button', { name: 'Mark as paid' })).toHaveCount(0); // nothing left to settle
    await expect(row.locator('td').nth(4)).toHaveText('0');
    await expect(row).toContainText('Settled');

    await panel.getByRole('button', { name: 'Close' }).click();
    await page.getByRole('button', { name: 'Credits of tess@example.test' }).click();
    const credits = page.getByRole('region', { name: 'Credits of tess@example.test' });
    await credits.getByLabel('Reason (required)').fill('Covered a missed class');
    await credits.getByRole('button', { name: 'Save' }).click();
    await expect(credits.locator('.alert-ok')).toContainText('Added 1 credit');
    await expect(row.locator('td').nth(4)).toHaveText('1');
    await expect(row).toContainText('1 to pay');
  });

  test('credit and payout routes are for admins', async ({ page, request }) => {
    const sam = await seedUser(request, { email: 'sam@example.test', password: PASS });
    await signInAt(page, '/login', { email: 'sam@example.test', password: PASS });
    await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
    expect((await page.request.post('/api/admin/credits/adjust', { data: { userId: sam, kind: 'student', delta: 5, reason: 'free credits', requestId: crypto.randomUUID() } })).status()).toBe(403);
    expect((await page.request.get(`/api/admin/teachers/${sam}/payout`)).status()).toBe(403);
  });
});
