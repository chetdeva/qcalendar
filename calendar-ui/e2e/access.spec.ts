import { test, expect } from '@playwright/test';
import { calendarAs, openPage, resetBackend, seed, signIn, tokenFor, USERS_UI, USERS_URL, WEB_URL } from './helpers';

test.beforeEach(async ({ request }) => resetBackend(request));


test.describe('signing in', () => {
  test('a signed-out visitor is sent to the users-ui login page and told where to come back to', async ({ page }) => {
    await page.goto('/');
    const url = new URL(page.url());
    expect(url.origin).toBe(USERS_UI);
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('next')).toBe(`${WEB_URL}/`);
    await expect(page.getByRole('heading', { name: 'login page' })).toBeVisible();
  });

  test('a made-up or tampered session cookie is not accepted', async ({ page, context }) => {
    await context.addCookies([{ name: 'sb-localhost-auth-token', value: 'base64-bm90LWEtcmVhbC1zZXNzaW9u', url: WEB_URL }]);
    await page.goto('/');
    expect(new URL(page.url()).origin).toBe(USERS_UI);
  });

  test('the API answers 401 without a session, and never falls back to anything else', async ({ playwright }) => {
    const anon = await playwright.request.newContext({ baseURL: WEB_URL });
    for (const [method, path] of [['GET', '/api/me'], ['GET', '/api/events'], ['POST', '/api/events'], ['GET', '/api/students'], ['GET', '/api/teachers'], ['GET', '/api/availability'], ['GET', '/api/settings']] as const) {
      const res = await anon.fetch(path, { method, data: method === 'POST' ? { title: 'x' } : undefined });
      expect(res.status(), `${method} ${path}`).toBe(401);
      expect((await res.json()).error.code).toBe('unauthorized');
    }
    await anon.dispose();
  });

  test('Account and Sign out go to users-ui, and signing out lands on its login page', async ({ context, request }) => {
    const page = await openPage(context, request, await seed(request, 'teacher', 'Tess Teacher'));
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(`${USERS_UI}/login?signed-out=1`);
    await expect(page.getByRole('heading', { name: 'login page' })).toBeVisible();
    await page.goto('/');
    await page.getByRole('link', { name: 'Account' }).click();
    await expect(page).toHaveURL(`${USERS_UI}/profile`);
  });

  test('header shows who is signed in, with account and sign-out handled by users-ui', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const page = await openPage(context, request, teacher);
    await expect(page.locator('.who-name')).toHaveText('Tess Teacher');
    await expect(page.locator('.who .badge')).toHaveText('teacher');
    await expect(page.getByRole('link', { name: 'Account' })).toHaveAttribute('href', `${USERS_UI}/profile`);
    const form = page.locator('.who form');
    await expect(form).toHaveAttribute('action', `${USERS_UI}/auth/signout`);
    await expect(form).toHaveAttribute('method', 'post');
  });
});

test.describe('each role gets its own view', () => {
  test('a teacher gets the full calendar with the New Lesson form', async ({ context, request }) => {
    const page = await openPage(context, request, await seed(request, 'teacher', 'Tess Teacher'));
    await expect(page.getByRole('button', { name: 'Quick Add Lesson' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'New Lesson' })).toBeVisible();
    await expect(page.locator('.fc-timeGridWeek-view')).toBeVisible();
    await expect(page.locator('.sync-label')).toHaveText('My calendar');
    await expect(page.getByText('Utilization:')).toBeVisible();
    await expect(page.getByLabel('Teacher *')).toHaveCount(0);
  });

  test('a student gets "My classes" and no way to create or change anything', async ({ context, request }) => {
    const page = await openPage(context, request, await seed(request, 'student', 'Sam Student'));
    await expect(page.getByRole('heading', { name: 'My classes' })).toBeVisible();
    await expect(page.locator('.sync-label')).toHaveText('My classes');
    await expect(page.getByRole('button', { name: 'Quick Add Lesson' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'New Lesson' })).toHaveCount(0);
    await expect(page.getByText('Utilization:')).toHaveCount(0);
    await expect(page.getByTestId('no-classes')).toBeVisible();
    await expect(page.locator('.fc-timeGridWeek-view')).toBeVisible();
  });

  test('an admin gets every class and must choose a teacher to create one', async ({ context, request }) => {
    await seed(request, 'teacher', 'Tess Teacher');
    const page = await openPage(context, request, await seed(request, 'admin', 'Ada Admin'));
    await expect(page.locator('.sync-label')).toHaveText('All classes');
    await expect(page.getByLabel('Teacher *')).toBeVisible();
    await expect(page.getByText('Utilization:')).toHaveCount(0);
  });
});

test.describe('a role changed after signing in', () => {
  test('the new view appears at once, with a banner explaining why some actions still fail until the next sign-in', async ({ context, request }) => {
    const person = await seed(request, 'student', 'Pat Promoted');
    const admin = await seed(request, 'admin', 'Ada Admin');
    await signIn(context, request, person); // signs in while still a student: the token says "student"
    const promote = await request.fetch(`${USERS_URL}/v1/users/${person.id}/role`, { method: 'PATCH', data: { role: 'teacher' }, headers: { authorization: `Bearer ${await tokenFor(request, admin)}` } });
    expect(promote.status()).toBe(200);

    const page = await context.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'New Lesson' })).toBeVisible(); // the database says teacher
    await expect(page.locator('.stale-banner')).toContainText('Your role was changed to teacher');
    await expect(page.locator('.stale-banner form')).toHaveAttribute('action', `${USERS_UI}/auth/signout`);

    // Creating a class is decided from the token, so it is refused for now, and the page says so plainly.
    await page.getByRole('button', { name: 'Personal' }).click();
    await page.getByLabel('Event Title *').fill('Too early');
    await page.getByRole('button', { name: 'Create & Send Invites' }).click();
    await expect(page.locator('.err')).toContainText('Students cannot create classes');

    // After signing in again the token matches, the banner is gone, and it works.
    await context.clearCookies();
    await signIn(context, request, person);
    await page.reload();
    await expect(page.locator('.stale-banner')).toHaveCount(0);
    await page.getByRole('button', { name: 'Personal' }).click();
    await page.getByLabel('Event Title *').fill('On time');
    await page.getByRole('button', { name: 'Create & Send Invites' }).click();
    await expect(page.locator('.fc-event', { hasText: 'On time' })).toBeVisible();
  });

  test('no banner when the token and the database agree', async ({ context, request }) => {
    for (const role of ['teacher', 'student', 'admin'] as const) {
      const page = await openPage(context, request, await seed(request, role, `Some ${role}`));
      await expect(page.locator('.who-name')).toBeVisible();
      await expect(page.locator('.stale-banner')).toHaveCount(0);
      await context.clearCookies();
      await page.close();
    }
  });
});

test.describe('the server routes enforce roles even if someone calls them by hand', () => {
  test('a student cannot create classes, search students, or list teachers', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const student = await seed(request, 'student', 'Sam Student');
    await signIn(context, request, student);
    const page = await context.newPage();
    await page.goto('/');
    for (const [method, path, data] of [
      ['POST', '/api/events', { title: 'x', start: '2030-01-07T10:00:00Z', durationMinutes: 60 }],
      ['GET', '/api/students?q=a', undefined],
      ['GET', '/api/teachers', undefined],
      ['GET', '/api/settings', undefined],
    ] as const) {
      const res = await page.request.fetch(path, { method, data });
      expect(res.status(), `${method} ${path}`).toBe(403);
    }
    expect((await calendarAs(request, await tokenFor(request, teacher)).list()).length).toBe(0);
  });

  test('a teacher cannot list teachers (the route would otherwise hand back students under that name)', async ({ context, request }) => {
    await seed(request, 'student', 'Sam Student');
    const page = await openPage(context, request, await seed(request, 'teacher', 'Tess Teacher'));
    expect((await page.request.get('/api/teachers')).status()).toBe(403);
  });

  test('the student search returns only id, name and email', async ({ context, request }) => {
    const page = await openPage(context, request, await seed(request, 'teacher', 'Tess Teacher'));
    await seed(request, 'student', 'Sam Student');
    await seed(request, 'teacher', 'Other Teacher');
    const body = await (await page.request.get('/api/students?q=')).json();
    expect(body.students).toHaveLength(1);
    expect(Object.keys(body.students[0]).sort()).toEqual(['email', 'id', 'name']);
  });

  test('an admin searching students never receives guardian emails, which users-service does show them', async ({ context, request }) => {
    const student = await seed(request, 'student', 'Sam Student');
    const mine = await request.fetch(`${USERS_URL}/v1/me`, { method: 'PATCH', data: { guardian_email: 'parent.of.sam@example.test' }, headers: { authorization: `Bearer ${await tokenFor(request, student)}` } });
    expect(mine.status()).toBe(200);
    const admin = await seed(request, 'admin', 'Ada Admin');
    // Prove the premise: asking users-service directly as an admin does include the guardian address.
    const direct = await (await request.get(`${USERS_URL}/v1/users?role=student`, { headers: { authorization: `Bearer ${await tokenFor(request, admin)}` } })).json();
    expect(direct.users[0].guardian_email).toBe('parent.of.sam@example.test');

    const page = await openPage(context, request, admin);
    const res = await page.request.get('/api/students?q=sam');
    const text = await res.text();
    expect(text).not.toContain('parent.of.sam');
    expect(Object.keys(JSON.parse(text).students[0]).sort()).toEqual(['email', 'id', 'name']);
  });
});
