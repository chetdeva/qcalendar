import { test, expect } from '@playwright/test';
import { CALENDAR_ORIGIN, logInAs, profileOf, resetBackend, seedUser } from './helpers';

const KID = { email: 'kid@example.test', password: 'kid-password-1' };

test.beforeEach(async ({ page, request }) => {
  await resetBackend(request);
  await seedUser(request, { ...KID, name: 'Kid One' });
  await logInAs(page, KID);
});

test('shows the account details; the email is read-only and the header links to the calendar', async ({ page }) => {
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(KID.email);
  await expect(page.getByLabel('Email', { exact: true })).toHaveJSProperty('readOnly', true);
  await expect(page.getByLabel('Full name')).toHaveValue('Kid One');
  await expect(page.getByRole('link', { name: 'Calendar' })).toHaveAttribute('href', `${CALENDAR_ORIGIN}`);
  await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0);
});

test('saves name, time zone and guardian email, and they persist after a reload', async ({ page, request }) => {
  await page.getByLabel('Full name').fill('  Kid Renamed ');
  await page.getByLabel('Time zone').selectOption('America/New_York');
  await page.getByLabel('Guardian email (optional)').fill('parent@example.test');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.alert-ok, .alert-info')).toHaveText('Saved.');

  const saved = await profileOf(request, KID.email);
  expect(saved).toMatchObject({ full_name: 'Kid Renamed', timezone: 'America/New_York', guardian_email: 'parent@example.test' });

  await page.reload();
  await expect(page.getByLabel('Full name')).toHaveValue('Kid Renamed');
  await expect(page.getByLabel('Time zone')).toHaveValue('America/New_York');
  await expect(page.getByLabel('Guardian email (optional)')).toHaveValue('parent@example.test');
  await expect(page.locator('.qh')).toContainText('Kid Renamed');
});

test('the guardian email is optional and can be removed again', async ({ page, request }) => {
  await page.getByLabel('Guardian email (optional)').fill('parent@example.test');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.alert-ok, .alert-info')).toHaveText('Saved.');
  await page.getByLabel('Guardian email (optional)').fill('');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.alert-ok, .alert-info')).toHaveText('Saved.');
  expect((await profileOf(request, KID.email))?.guardian_email).toBeNull();
});

test('a bad guardian email or an empty name is refused and nothing is saved', async ({ page, request }) => {
  await page.getByLabel('Guardian email (optional)').fill('not-an-email');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.alert-error')).toContainText('valid guardian email');
  await page.getByLabel('Guardian email (optional)').fill('');
  await page.getByLabel('Full name').fill('   ');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.alert-error')).toContainText('Enter your name');
  expect(await profileOf(request, KID.email)).toMatchObject({ full_name: 'Kid One', guardian_email: null });
});

test('"Use my browser\'s time zone" fills the selector, even for zones Intl does not list (UTC)', async ({ page, request }) => {
  await page.getByRole('button', { name: /Use my browser/ }).click();
  await expect(page.getByLabel('Time zone')).toHaveValue('UTC');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.locator('.alert-ok, .alert-info')).toHaveText('Saved.');
  expect((await profileOf(request, KID.email))?.timezone).toBe('UTC');
});

test('a saved time zone that is not in the browser list still shows as selected', async ({ page, request }) => {
  await page.request.patch('/api/me', { data: { timezone: 'Asia/Kolkata' } });
  await page.reload();
  await expect(page.getByLabel('Time zone')).toHaveValue('Asia/Kolkata');
});

test('the profile API refuses attempts to change role or status, even with a valid session', async ({ page, request }) => {
  for (const body of [{ role: 'admin' }, { status: 'active' }, { email: 'x@example.test' }]) {
    const res = await page.request.patch('/api/me', { data: body });
    expect(res.status(), JSON.stringify(body)).toBe(400);
  }
  expect((await profileOf(request, KID.email))?.role).toBe('student');
});

test('a student sees the student wording and the linked parent card; Discard puts the saved values back', async ({ page }) => {
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Student Profile');
  await expect(page.getByText('appears on your classroom leaderboard')).toBeVisible();
  await expect(page.getByText('No guardian email yet')).toBeVisible();
  await page.getByLabel('Guardian email (optional)').fill('parent@example.test');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: /Linked Parent Account/ })).toContainText('Connected');
  await page.getByLabel('Full name').fill('Someone Else');
  await page.getByLabel('Guardian email (optional)').fill('');
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await expect(page.getByLabel('Full name')).toHaveValue('Kid One');
  await expect(page.getByLabel('Guardian email (optional)')).toHaveValue('parent@example.test');
});

test('what is not built yet is marked and cannot be clicked; the dashboard link is in the breadcrumb', async ({ page }) => {
  const ai = page.getByRole('button', { name: /Ask AI Math Tutor/ });
  await expect(ai).toBeDisabled();
  await expect(ai).toHaveAttribute('title', 'Coming soon');
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reset my password' })).toHaveAttribute('href', '/forgot-password');
});

test('a teacher sees the teacher wording, no parent card and a support chat', async ({ page, request }) => {
  await seedUser(request, { email: 'tess@example.test', password: 'teacher-pass-1', role: 'teacher', name: 'Tess Teacher' });
  await page.context().clearCookies();
  await logInAs(page, { email: 'tess@example.test', password: 'teacher-pass-1' });
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Teacher Profile');
  await expect(page.getByText('appears on student dashboards')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Linked Parent Account/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Chat with School Operations' })).toHaveAttribute('href', /^https:\/\/wa\.me\//);
  await expect(page.getByRole('button', { name: /Ask AI Math Tutor/ })).toHaveCount(0);
});

test('no sideways scrolling from phone to desktop widths', async ({ page }) => {
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/profile');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px`).toBe(true);
  }
});

const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('a profile picture can be added, shows in the hero and the header, survives a reload and can be removed', async ({ page, request }) => {
  await expect(page.locator('.qh-avatar img')).toHaveCount(0); // initials until there is a picture
  await page.getByLabel('Choose a profile picture').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: PNG_1PX });
  await expect(page.locator('.pf-avatar img')).toBeVisible();
  await expect(page.locator('.qh-avatar img')).toHaveAttribute('src', /\/api\/avatar\?v=/);
  expect((await profileOf(request, KID.email))?.avatar_updated_at).toBeTruthy();

  await page.reload();
  await expect(page.locator('.pf-avatar img')).toBeVisible();
  const res = await page.request.get('/api/avatar');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/^image\/(webp|jpeg)$/); // re-encoded by the browser before upload
  expect((await res.body()).length).toBeLessThan(256 * 1024);

  await page.getByRole('button', { name: 'Remove photo' }).click();
  await expect(page.locator('.pf-avatar img')).toHaveCount(0);
  await expect(page.locator('.qh-avatar img')).toHaveCount(0);
  expect((await page.request.get('/api/avatar')).status()).toBe(404);
  expect((await profileOf(request, KID.email))?.avatar_updated_at).toBeNull();
});

test('a file that is not a picture is refused with a message and nothing changes', async ({ page, request }) => {
  await page.getByLabel('Choose a profile picture').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByRole('alert').filter({ hasText: 'not a picture' })).toBeVisible();
  expect((await profileOf(request, KID.email))?.avatar_updated_at).toBeNull();
  expect((await page.request.put('/api/avatar', { data: 'not an image', headers: { 'content-type': 'image/png' } })).status()).toBe(400); // the service sniffs the bytes too
});

test('the time zone list is short: a few common zones, plus the saved one when it is not among them', async ({ page }) => {
  const options = page.getByLabel('Time zone').locator('option');
  expect(await options.count()).toBeLessThanOrEqual(12);
  await expect(options.filter({ hasText: 'Eastern Time (America/New_York)' })).toHaveCount(1);
  await page.request.patch('/api/me', { data: { timezone: 'Europe/Paris' } });
  await page.reload();
  await expect(page.getByLabel('Time zone')).toHaveValue('Europe/Paris');
  await expect(options.filter({ hasText: 'Europe/Paris' })).toHaveCount(1);
});

const TUTOR = { email: 'tutor@example.test', password: 'tutor-password-1' };

test.describe('the mentor profile card', () => {
  test('students do not see it', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'My Mentor Profile' })).toHaveCount(0);
  });

  test('a teacher edits it on the Account page: it needs a headline and quote to publish, and is remembered', async ({ page, request }) => {
    await seedUser(request, { ...TUTOR, role: 'teacher', name: 'Tess Teacher' });
    await page.context().clearCookies();
    await logInAs(page, TUTOR);
    await expect(page.getByRole('heading', { name: 'My Mentor Profile' })).toBeVisible();
    await page.getByLabel('Show my profile to students').check();
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.locator('.alert-error')).toContainText('headline'); // dashboard-service refuses to publish an empty card
    await page.getByLabel('Headline').fill('Lead STEM Specialist');
    await page.getByLabel('Specialties (separated by commas)').fill('Geometry, Proofs & Logic');
    await page.getByRole('button', { name: 'Middle (6–8)' }).click();
    await page.getByLabel('A line in your own words').fill('Every shape has a story.');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Students can now find you under Mentors.' })).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Headline')).toHaveValue('Lead STEM Specialist');
    await expect(page.getByLabel('Specialties (separated by commas)')).toHaveValue('Geometry, Proofs & Logic');
    await expect(page.getByRole('button', { name: 'Middle (6–8)' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Show my profile to students')).toBeChecked();
    await page.getByLabel('Show my profile to students').uncheck();
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'hidden from students' })).toBeVisible();
  });
});
