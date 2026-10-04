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
  await expect(page.getByRole('link', { name: 'Users' })).toHaveCount(0);
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
  await expect(page.locator('.app-header')).toContainText('Kid Renamed');
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
