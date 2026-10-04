import { test, expect } from '@playwright/test';
import { ADMIN, CALENDAR_ORIGIN, logIn, logInAs, mailFor, profileOf, resetBackend, seedUser } from './helpers';

test.beforeEach(async ({ request }) => resetBackend(request));

const signupAs = async (page: import('@playwright/test').Page, name: string, email: string, password: string) => {
  await page.goto('/signup');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
};

test.describe('sign up', () => {
  test('creates a student, asks to confirm the email, and the link signs them in', async ({ page, request }) => {
    await signupAs(page, 'Mia Chen', 'mia@example.test', 'correct-horse-1');
    await expect(page.getByText('Check your email.')).toBeVisible();
    await expect(page.getByText('mia@example.test')).toBeVisible();

    const profile = await profileOf(request, 'mia@example.test');
    expect(profile?.role).toBe('student');
    expect(profile?.full_name).toBe('Mia Chen');

    const link = await mailFor(request, 'mia@example.test', 'signup');
    expect(link).toBeTruthy();
    await page.goto(link!);
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
    await expect(page.locator('.app-header .badge')).toHaveText('student');
    await expect(page.getByLabel('Full name')).toHaveValue('Mia Chen');
  });

  test('cannot log in before confirming, can resend the email, then log in after confirming', async ({ page, request }) => {
    await signupAs(page, 'Ben Ito', 'ben@example.test', 'correct-horse-1');
    await expect(page.getByText('Check your email.')).toBeVisible();

    await logIn(page, 'ben@example.test', 'correct-horse-1');
    await expect(page.locator('.alert-error')).toContainText('Confirm your email first');
    await page.getByRole('button', { name: 'Resend confirmation email' }).click();
    await expect(page.getByText('Confirmation email sent')).toBeVisible();

    await page.goto((await mailFor(request, 'ben@example.test', 'signup'))!);
    await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  });

  test('validates the form before talking to the server', async ({ page }) => {
    await page.goto('/signup');
    const create = page.getByRole('button', { name: 'Create account' });
    await create.click();
    await expect(page.locator('.alert-error')).toContainText('Enter your name');
    await page.getByLabel('Full name').fill('Zed');
    await create.click();
    await expect(page.locator('.alert-error')).toContainText('Enter your email');
    await page.getByLabel('Email').fill('zed');
    await create.click();
    await expect(page.locator('.alert-error')).toContainText('valid email');
    await page.getByLabel('Email').fill('zed@example.test');
    await create.click();
    await expect(page.locator('.alert-error')).toContainText('at least 8');
    await page.getByLabel('Password').fill('zed@example.test');
    await create.click();
    await expect(page.locator('.alert-error')).toContainText('cannot be your email');
  });

  test('signing up with an address that already has an account reveals nothing', async ({ page, request }) => {
    await seedUser(request, { email: 'taken@example.test' });
    await signupAs(page, 'Imposter', 'taken@example.test', 'correct-horse-1');
    await expect(page.getByText('Check your email.')).toBeVisible(); // same screen as a brand-new address
  });
});

test.describe('log in', () => {
  test('wrong password and unknown email give the same message', async ({ page, request }) => {
    await seedUser(request, { email: 'kid@example.test', password: 'right-password-1' });
    await logIn(page, 'kid@example.test', 'wrong-password-1');
    await expect(page.locator('.alert-error')).toHaveText('Incorrect email or password.');
    await logIn(page, 'nobody@example.test', 'whatever-123');
    await expect(page.locator('.alert-error')).toHaveText('Incorrect email or password.');
  });

  test('validates empty fields', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.locator('.alert-error')).toContainText('Enter your email');
    await page.getByLabel('Email').fill('a@example.test');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.locator('.alert-error')).toContainText('Enter your password');
  });

  test('logs in, shows the role, and a signed-in visitor skips /login and /signup', async ({ page, request }) => {
    await seedUser(request, { email: 'tess@example.test', password: 'teacher-pass-1', role: 'teacher', name: 'Tess Teacher' });
    await logInAs(page, { email: 'tess@example.test', password: 'teacher-pass-1' });
    await expect(page.locator('.app-header .badge')).toHaveText('teacher');
    await expect(page.locator('.app-header')).toContainText('Tess Teacher');
    await page.goto('/login');
    await expect(page).toHaveURL(/\/profile$/);
    await page.goto('/signup');
    await expect(page).toHaveURL(/\/profile$/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/profile$/);
  });

  test('signed-out visitors are sent to /login and returned to the page they wanted', async ({ page, request }) => {
    await seedUser(request, { email: 'adm@example.test', password: 'admin-pass-9', role: 'admin' });
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fusers$/);
    await page.getByLabel('Email').fill('adm@example.test');
    await page.getByLabel('Password').fill('admin-pass-9');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(/\/admin\/users$/);
    await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible();
  });

  test('"next" never becomes an open redirect, but allow-listed apps are honoured', async ({ page, request }) => {
    await seedUser(request, { email: 'kid@example.test', password: 'right-password-1' });
    for (const evil of ['https://evil.test/phish', '//evil.test', 'javascript:alert(1)', `${CALENDAR_ORIGIN}.evil.test/`]) {
      await page.context().clearCookies();
      await page.goto(`/login?next=${encodeURIComponent(evil)}`);
      await page.getByLabel('Email').fill('kid@example.test');
      await page.getByLabel('Password').fill('right-password-1');
      await page.getByRole('button', { name: 'Log in' }).click();
      await expect(page).toHaveURL(/\/profile$/);
    }

    await page.context().clearCookies();
    await page.route(`${CALENDAR_ORIGIN}/**`, (r) => r.fulfill({ contentType: 'text/html', body: '<h1>calendar app</h1>' }));
    await page.goto(`/login?next=${encodeURIComponent(`${CALENDAR_ORIGIN}/week`)}`);
    await page.getByLabel('Email').fill('kid@example.test');
    await page.getByLabel('Password').fill('right-password-1');
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).toHaveURL(`${CALENDAR_ORIGIN}/week`);
    await expect(page.getByRole('heading', { name: 'calendar app' })).toBeVisible();
  });

  test('Continue with Google signs a student in', async ({ page, request }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.locator('.app-header')).toContainText('Gina Google');
    await expect(page.locator('.app-header .badge')).toHaveText('student');
    expect((await profileOf(request, 'gina.google@example.test'))?.role).toBe('student');
  });

  test('an invalid or reused email link lands on /login with an explanation', async ({ page }) => {
    await page.goto('/auth/callback?code=not-a-real-code');
    await expect(page).toHaveURL(/\/login\?error=link$/);
    await expect(page.locator('.alert-ok, .alert-info')).toContainText('invalid or has expired');
  });
});

test.describe('password reset', () => {
  test('forgot password, link, new password, then log in with it (and not the old one)', async ({ page, request }) => {
    await seedUser(request, { email: 'lena@example.test', password: 'old-password-1' });
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('lena@example.test');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.locator('.alert-ok, .alert-info')).toContainText('If an account exists');

    await page.goto((await mailFor(request, 'lena@example.test', 'recovery'))!);
    await expect(page).toHaveURL(/\/reset-password$/);
    await page.getByLabel('New password').fill('brand-new-pass-1');
    await page.getByLabel('Confirm password').fill('different-pass-1');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page.locator('.alert-error')).toContainText('do not match');
    await page.getByLabel('Confirm password').fill('brand-new-pass-1');
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page).toHaveURL(/\/profile\?updated=password$/);
    await expect(page.locator('.alert-ok, .alert-info')).toContainText('password was updated');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await logIn(page, 'lena@example.test', 'old-password-1');
    await expect(page.locator('.alert-error')).toHaveText('Incorrect email or password.');
    await logInAs(page, { email: 'lena@example.test', password: 'brand-new-pass-1' });
  });

  test('an unknown address gets the same confirmation and no email is sent', async ({ page, request }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('ghost@example.test');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.locator('.alert-ok, .alert-info')).toContainText('If an account exists');
    expect(await mailFor(request, 'ghost@example.test', 'recovery')).toBeUndefined();
  });

  test('/reset-password without a valid link says the link expired', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByRole('heading', { name: 'Link expired' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Request a new link' })).toBeVisible();
  });
});

test.describe('sign out', () => {
  test('ends the session: protected pages need a new login', async ({ page }) => {
    await logInAs(page, ADMIN);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/login\?next=%2Fprofile$/);
  });

  test('signing out is POST only, so a link cannot do it', async ({ page }) => {
    await logInAs(page, ADMIN);
    const res = await page.request.get('/auth/signout');
    expect(res.status()).toBe(405);
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible();
  });
});
