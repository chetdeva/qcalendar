import { test, expect } from '@playwright/test';
import { logInAs, pay, profileOf, resetBackend, seedUser } from './helpers';

const KID = { email: 'kid@example.test', password: 'kid-password-1' };

test.beforeEach(async ({ request }) => {
  await resetBackend(request);
});

test('signup asks for the student\'s grade and keeps it on the profile', async ({ page, request }) => {
  await page.goto('/signup');
  await page.getByLabel('Email').fill('new@example.test');
  await page.getByLabel('Password', { exact: true }).fill('a-good-password-1');
  await page.getByLabel('Confirm password').fill('a-good-password-1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.locator('.alert-error')).toHaveText('Choose your grade.');
  await page.getByLabel("Student's grade").selectOption('7');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Check your email.')).toBeVisible();
  expect((await profileOf(request, 'new@example.test'))?.grade).toBe(7);
});

test('a student with no grade sets it, then sees the price for their band and the annual discount', async ({ page, request }) => {
  await seedUser(request, { ...KID, name: 'Kid One' });
  await logInAs(page, KID);
  await page.goto('/billing');
  await expect(page.getByText('Your free first class is ready to book.')).toBeVisible();
  await page.getByLabel('Grade', { exact: true }).selectOption('6');
  await page.getByRole('button', { name: 'Save grade' }).click();
  await expect(page.getByRole('heading', { name: 'Grade 6 plan' })).toBeVisible();
  await expect(page.locator('.bl-price b')).toHaveText('$350');
  await page.getByRole('radio', { name: /Annual/ }).click();
  await expect(page.locator('.bl-price b')).toHaveText('$3,360');
  await expect(page.locator('.bl-price span')).toContainText('$280 a month instead of $350');
});

test('Subscribe sends the student to the gateway\'s hosted checkout for their band and period', async ({ page, request }) => {
  await seedUser(request, { ...KID, name: 'Kid One', grade: 9 });
  await logInAs(page, KID);
  await page.route('https://pay.example.test/**', (route) => route.fulfill({ body: 'hosted checkout' }));
  await page.goto('/billing');
  await page.getByRole('radio', { name: /Annual/ }).click();
  await page.getByRole('button', { name: 'Subscribe' }).click();
  await page.waitForURL(/pay\.example\.test\/checkout/);
  expect(page.url()).toContain('plan=high');
  expect(page.url()).toContain('interval=year');
});

test('after paying, the student sees 15 classes, their renewal date, and can cancel at period end', async ({ page, request }) => {
  await seedUser(request, { ...KID, name: 'Kid One', grade: 6 });
  await logInAs(page, KID);
  await pay(request, KID.email);
  await page.goto('/billing?checkout=success');
  await expect(page.getByText('Your payment is being confirmed.')).toBeVisible();
  await expect(page.locator('.bl-meter b')).toHaveText('15');
  await expect(page.getByText('Monthly plan, 15 classes every month. Renews on')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Cancel plan' }).click();
  await expect(page.getByText(/Ends on/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel plan' })).toHaveCount(0);
});

test('teachers have nothing to pay', async ({ page, request }) => {
  await seedUser(request, { email: 'teach@example.test', password: 'teach-password-1', role: 'teacher' });
  await logInAs(page, { email: 'teach@example.test', password: 'teach-password-1' });
  await page.goto('/billing');
  await expect(page.getByText('Billing is for students.')).toBeVisible();
});
