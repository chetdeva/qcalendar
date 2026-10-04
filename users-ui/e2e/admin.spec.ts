import { test, expect, type Page } from '@playwright/test';
import { ADMIN, logIn, logInAs, mailFor, profileOf, resetBackend, seedUser } from './helpers';

const row = (page: Page, email: string) => page.locator('table[aria-label="Users"] tbody tr', { hasText: email });

test.beforeEach(async ({ request }) => resetBackend(request));

test.describe('who can see the admin page', () => {
  for (const role of ['student', 'teacher'] as const) {
    test(`a ${role} has no Users link, sees "No access", and cannot invite or change roles`, async ({ page, request }) => {
      await seedUser(request, { email: `${role}@example.test`, password: 'pass-12345', role });
      const victim = await seedUser(request, { email: 'victim@example.test' });
      await logInAs(page, { email: `${role}@example.test`, password: 'pass-12345' });
      await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);
      await page.goto('/admin/users');
      await expect(page.getByRole('heading', { name: 'No access' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'All users' })).toHaveCount(0);
      expect((await page.request.post('/api/admin/invitations', { data: { email: 'x@example.test', role: 'admin' } })).status()).toBe(403);
      expect((await page.request.get('/api/admin/invitations')).status()).toBe(403);
      expect((await page.request.patch(`/api/admin/users/${victim}/role`, { data: { role: 'admin' } })).status()).toBe(403);
      expect((await page.request.post(`/api/admin/users/${victim}/disable`)).status()).toBe(403);
      expect((await profileOf(request, 'victim@example.test'))?.role).toBe('student');
    });
  }

  test('students cannot list users at all; teachers get only active students, name and email', async ({ page, request }) => {
    await seedUser(request, { email: 'student@example.test', password: 'pass-12345' });
    await seedUser(request, { email: 'teacher@example.test', password: 'pass-12345', role: 'teacher' });
    await seedUser(request, { email: 'kid@example.test', name: 'Kid One' });
    await logInAs(page, { email: 'student@example.test', password: 'pass-12345' });
    expect((await page.request.get('/api/admin/users')).status()).toBe(403);
    await page.getByRole('button', { name: 'Sign out' }).click();

    await logInAs(page, { email: 'teacher@example.test', password: 'pass-12345' });
    const res = await page.request.get('/api/admin/users');
    expect(res.status()).toBe(200);
    const { users } = (await res.json()) as { users: Record<string, unknown>[] };
    expect(users.every((u) => Object.keys(u).sort().join() === 'email,full_name,id')).toBeTruthy();
    expect(users.map((u) => u.email).sort()).toEqual(['kid@example.test', 'student@example.test']); // no staff, no guardian emails
  });

  test('signed-out API calls get 401', async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL });
    expect((await anon.get('/api/me')).status()).toBe(401);
    expect((await anon.get('/api/admin/users')).status()).toBe(401);
    await anon.dispose();
  });

  test('an admin sees the Users page', async ({ page }) => {
    await logInAs(page, ADMIN);
    await page.getByRole('link', { name: 'Users' }).click();
    await expect(page.getByRole('heading', { name: 'All users' })).toBeVisible();
    await expect(row(page, ADMIN.email)).toContainText('admin (you)');
  });
});

test.describe('managing users', () => {
  test.beforeEach(async ({ page, request }) => {
    await seedUser(request, { email: 'kid@example.test', name: 'Kid One' });
    await seedUser(request, { email: 'tess@example.test', name: 'Tess Teacher', role: 'teacher' });
    await seedUser(request, { email: 'zoe@example.test', name: 'Zoe Zed' });
    await logInAs(page, ADMIN);
    await page.goto('/admin/users');
    await expect(row(page, 'zoe@example.test')).toBeVisible();
  });

  test('lists everyone and has no controls on your own row', async ({ page }) => {
    await expect(page.locator('table[aria-label="Users"] tbody tr')).toHaveCount(4);
    await expect(row(page, ADMIN.email).getByRole('button')).toHaveCount(0);
    await expect(row(page, ADMIN.email).getByRole('combobox')).toHaveCount(0);
  });

  test('searches by name or email and filters by role', async ({ page }) => {
    await page.getByLabel('Search by name or email').fill('zed');
    await expect(page.locator('table[aria-label="Users"] tbody tr')).toHaveCount(1);
    await expect(row(page, 'zoe@example.test')).toBeVisible();
    await page.getByLabel('Search by name or email').fill('');
    await page.getByLabel('Role', { exact: true }).last().selectOption('teacher');
    await expect(page.locator('table[aria-label="Users"] tbody tr')).toHaveCount(1);
    await expect(row(page, 'tess@example.test')).toBeVisible();
    await page.getByLabel('Search by name or email').fill('nobody-here');
    await expect(page.getByText('No users match.')).toBeVisible();
  });

  test('changes a role, which sticks', async ({ page, request }) => {
    await page.getByLabel('Role for kid@example.test').selectOption('teacher');
    await expect(page.locator('.alert-ok, .alert-info')).toContainText('kid@example.test is now a teacher.');
    expect((await profileOf(request, 'kid@example.test'))?.role).toBe('teacher');
    await page.reload();
    await expect(page.getByLabel('Role for kid@example.test')).toHaveValue('teacher');
  });

  test('making someone an admin asks first; cancelling changes nothing', async ({ page, request }) => {
    page.once('dialog', (d) => d.dismiss());
    await page.getByLabel('Role for kid@example.test').selectOption('admin');
    await expect(page.getByLabel('Role for kid@example.test')).toHaveValue('student');
    expect((await profileOf(request, 'kid@example.test'))?.role).toBe('student');

    page.once('dialog', (d) => { expect(d.message()).toContain('kid@example.test'); void d.accept(); });
    await page.getByLabel('Role for kid@example.test').selectOption('admin');
    await expect(page.locator('.alert-ok, .alert-info')).toContainText('is now an admin');
    expect((await profileOf(request, 'kid@example.test'))?.role).toBe('admin');
  });

  test('disabling blocks sign-in until the account is enabled again', async ({ page, request, browser }) => {
    await page.getByLabel('Disable kid@example.test').click();
    await expect(row(page, 'kid@example.test').locator('.badge-disabled')).toBeVisible();
    await expect(page.getByLabel('Enable kid@example.test')).toBeVisible();
    expect((await profileOf(request, 'kid@example.test'))?.status).toBe('disabled');

    const other = await browser.newContext({ baseURL: page.url().split('/admin')[0], timezoneId: 'UTC' });
    const kid = await other.newPage();
    await logIn(kid, 'kid@example.test', 'password123');
    await expect(kid.locator('.alert-error')).toContainText('banned');

    await page.getByLabel('Enable kid@example.test').click();
    await expect(row(page, 'kid@example.test').locator('.badge-disabled')).toHaveCount(0);
    await logInAs(kid, { email: 'kid@example.test', password: 'password123' });
    await other.close();
  });

  test('"Load more" pages through a long list', async ({ page, request }) => {
    for (let i = 0; i < 28; i++) await seedUser(request, { email: `bulk${String(i).padStart(2, '0')}@example.test`, name: `Bulk ${i}` });
    await page.reload();
    await expect(page.locator('table[aria-label="Users"] tbody tr')).toHaveCount(25);
    await page.getByRole('button', { name: 'Load more' }).click();
    await expect(page.locator('table[aria-label="Users"] tbody tr')).toHaveCount(32); // admin + kid + tess + zoe + 28
    await expect(page.getByRole('button', { name: 'Load more' })).toHaveCount(0);
  });
});

test.describe('invitations', () => {
  const invite = async (page: Page, email: string, role?: 'Teacher' | 'Admin') => {
    await page.getByLabel('Email to invite').fill(email);
    if (role) await page.getByLabel('Role', { exact: true }).first().selectOption({ label: role });
    await page.getByRole('button', { name: 'Send invitation' }).click();
  };

  test.beforeEach(async ({ page }) => {
    await logInAs(page, ADMIN);
    await page.goto('/admin/users');
  });

  test('only teacher and admin can be invited', async ({ page }) => {
    await expect(page.locator('#invite-role option')).toHaveText(['Teacher', 'Admin']);
  });

  test('the invited teacher accepts, sets a password, and becomes a teacher', async ({ page, request }) => {
    await invite(page, 'New.Teacher@Example.test');
    await expect(page.locator('.alert-ok, .alert-info')).toContainText('Invitation sent to new.teacher@example.test');
    const pending = page.locator('table[aria-label="Pending invitations"] tbody tr');
    await expect(pending).toHaveCount(1);
    await expect(pending.first()).toContainText('new.teacher@example.test');
    expect((await profileOf(request, 'new.teacher@example.test'))?.role).toBe('student'); // not a teacher until they accept

    await page.context().clearCookies(); // the teacher opens the email in their own browser
    const link = await mailFor(request, 'new.teacher@example.test', 'invite');
    expect(link).toBeTruthy();
    await page.goto(link!);
    await expect(page).toHaveURL(/\/accept-invite$/); // the tokens in the URL hash were consumed and removed
    await expect(page.getByRole('heading', { name: 'Welcome aboard' })).toBeVisible();
    await expect(page.getByText('You have been invited as a')).toContainText('teacher');

    await page.getByLabel('Full name').fill('Nora Newteacher');
    await page.getByLabel('Password', { exact: true }).fill('welcome-pass-1');
    await page.getByLabel('Confirm password').fill('mismatch-pass-1');
    await page.getByRole('button', { name: 'Set password and continue' }).click();
    await expect(page.locator('.alert-error')).toContainText('do not match');
    await page.getByLabel('Confirm password').fill('welcome-pass-1');
    await page.getByRole('button', { name: 'Set password and continue' }).click();

    await expect(page).toHaveURL(/\/profile\?welcome=1$/);
    await expect(page.locator('.alert-ok, .alert-info')).toContainText('Welcome to SyncSchedule');
    await expect(page.locator('.app-header .badge')).toHaveText('teacher');
    await expect(page.locator('.app-header')).toContainText('Nora Newteacher');
    await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0); // a teacher, not an admin
    expect(await profileOf(request, 'new.teacher@example.test')).toMatchObject({ role: 'teacher', full_name: 'Nora Newteacher' });

    // they can log in normally from now on
    await page.getByRole('button', { name: 'Sign out' }).click();
    await logInAs(page, { email: 'new.teacher@example.test', password: 'welcome-pass-1' });
  });

  test('an invited admin becomes an admin and can reach the Users page', async ({ page, request }) => {
    await invite(page, 'second.admin@example.test', 'Admin');
    await expect(page.locator('.alert-ok, .alert-info')).toContainText('Invitation sent');
    await page.context().clearCookies();
    await page.goto((await mailFor(request, 'second.admin@example.test', 'invite'))!);
    await page.getByLabel('Full name').fill('Sam Secondadmin');
    await page.getByLabel('Password', { exact: true }).fill('welcome-pass-1');
    await page.getByLabel('Confirm password').fill('welcome-pass-1');
    await page.getByRole('button', { name: 'Set password and continue' }).click();
    await expect(page.locator('.app-header .badge')).toHaveText('admin');
    await page.getByRole('link', { name: 'Users' }).click();
    await expect(page.getByRole('heading', { name: 'All users' })).toBeVisible();
  });

  test('a duplicate pending invitation, an existing account and a bad address are all refused', async ({ page, request }) => {
    await seedUser(request, { email: 'already@example.test' });
    await invite(page, 'once@example.test');
    await expect(page.locator('.alert-ok, .alert-info')).toContainText('Invitation sent');
    await invite(page, 'ONCE@example.test');
    await expect(page.locator('.alert-error')).toContainText('pending invitation');
    await invite(page, 'already@example.test');
    await expect(page.locator('.alert-info')).toContainText('already has an account');
    await invite(page, 'nope');
    await expect(page.locator('.alert-error')).toContainText('valid email');
    await expect(page.locator('table[aria-label="Pending invitations"] tbody tr')).toHaveCount(1);
  });

  test('a pending invitation can be revoked, and its email link then grants nothing', async ({ page, request }) => {
    await invite(page, 'revoked@example.test');
    await expect(page.locator('table[aria-label="Pending invitations"] tbody tr')).toHaveCount(1);
    await page.getByLabel('Revoke invitation for revoked@example.test').click();
    await expect(page.locator('.alert-ok, .alert-info')).toContainText('revoked');
    await expect(page.locator('table[aria-label="Pending invitations"]')).toHaveCount(0);

    await page.context().clearCookies();
    await page.goto((await mailFor(request, 'revoked@example.test', 'invite'))!);
    await page.getByLabel('Full name').fill('Rita Revoked');
    await page.getByLabel('Password', { exact: true }).fill('welcome-pass-1');
    await page.getByLabel('Confirm password').fill('welcome-pass-1');
    await page.getByRole('button', { name: 'Set password and continue' }).click();
    await expect(page.locator('.app-header .badge')).toHaveText('student'); // no invitation, so no teacher role
  });
});

test.describe('inviting someone who already has an account', () => {
  test.beforeEach(async ({ page }) => {
    await logInAs(page, ADMIN);
    await page.goto('/admin/users');
  });

  const invite = async (page: Page, email: string, role: 'Teacher' | 'Admin' = 'Teacher') => {
    await page.getByLabel('Email to invite').fill(email);
    await page.getByLabel('Role', { exact: true }).first().selectOption({ label: role });
    await page.getByRole('button', { name: 'Send invitation' }).click();
  };

  test('explains that there is nothing to accept and offers to change the role, which works', async ({ page, request }) => {
    await seedUser(request, { email: 'chet@example.test', name: 'Chet Existing' });
    await invite(page, 'chet@example.test');
    const offer = page.locator('.alert-info');
    await expect(offer).toContainText('chet@example.test already has an account');
    expect((await profileOf(request, 'chet@example.test'))?.role).toBe('student'); // nothing changed yet
    await offer.getByRole('button', { name: 'Make them a teacher' }).click();
    await expect(page.locator('.alert-ok')).toContainText('chet@example.test is now a teacher. They should sign out and back in');
    expect((await profileOf(request, 'chet@example.test'))?.role).toBe('teacher');
    await expect(offer).toHaveCount(0);
    await expect(page.getByLabel('Role for chet@example.test')).toHaveValue('teacher');
  });

  test('"No thanks" leaves the account alone, and making someone an admin still asks first', async ({ page, request }) => {
    await seedUser(request, { email: 'chet@example.test', name: 'Chet Existing' });
    await invite(page, 'chet@example.test');
    await page.locator('.alert-info').getByRole('button', { name: 'No thanks' }).click();
    await expect(page.locator('.alert-info')).toHaveCount(0);
    expect((await profileOf(request, 'chet@example.test'))?.role).toBe('student');

    await invite(page, 'chet@example.test', 'Admin');
    page.once('dialog', (d) => d.dismiss());
    await page.locator('.alert-info').getByRole('button', { name: 'Make them an admin' }).click();
    await expect(page.locator('.alert-info')).toHaveCount(0); // the offer closes once the (declined) change has been handled
    expect((await profileOf(request, 'chet@example.test'))?.role).toBe('student'); // the admin confirmation was declined
    await invite(page, 'chet@example.test', 'Admin');
    page.once('dialog', (d) => d.accept());
    await page.locator('.alert-info').getByRole('button', { name: 'Make them an admin' }).click();
    await expect(page.locator('.alert-ok')).toContainText('is now an admin');
    expect((await profileOf(request, 'chet@example.test'))?.role).toBe('admin');
  });
});

test.describe('invitation links that do not work', () => {
  test('opening /accept-invite with no session explains the problem', async ({ page }) => {
    await page.goto('/accept-invite');
    await expect(page.getByRole('heading', { name: 'Invitation problem' })).toBeVisible();
    await expect(page.locator('.alert-error')).toContainText('not valid or has already been used');
  });

  test('an expired link says so', async ({ page }) => {
    await page.goto('/accept-invite#error=access_denied&error_code=otp_expired&error_description=expired');
    await expect(page.locator('.alert-error')).toContainText('has expired');
  });

  test('a link that was already used goes to the login page', async ({ page, request }) => {
    await logInAs(page, ADMIN);
    await page.goto('/admin/users');
    await page.getByLabel('Email to invite').fill('once@example.test');
    await page.getByRole('button', { name: 'Send invitation' }).click();
    await expect(page.locator('.alert-ok, .alert-info')).toContainText('Invitation sent');
    const link = (await mailFor(request, 'once@example.test', 'invite'))!;
    await page.context().clearCookies();
    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'Welcome aboard' })).toBeVisible();
    await page.context().clearCookies();
    await page.goto(link);
    await expect(page).toHaveURL(/\/login/);
  });
});
