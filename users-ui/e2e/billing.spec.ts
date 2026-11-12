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
  await expect(page.getByText('Your free trial class is ready to book.')).toBeVisible();
  await page.getByLabel('Grade', { exact: true }).selectOption('6');
  await page.getByRole('button', { name: 'Save grade' }).click();
  await expect(page.getByRole('heading', { name: 'Grade 6 plan' })).toBeVisible();
  // Monthly and annual sit side by side, each with its own button, and the table lists every band.
  await expect(page.getByRole('radio', { name: /Monthly/ }).locator('.bl-price b')).toHaveText('$350');
  await expect(page.getByRole('radio', { name: /Annual/ }).locator('.bl-price b')).toHaveText('$3,360');
  await expect(page.getByRole('radio', { name: /Annual/ }).locator('.bl-was')).toHaveText('Full price $4,200'); // twelve months at the monthly price, crossed out
  await expect(page.getByRole('radio', { name: /Monthly/ }).locator('.bl-was')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: /Annual/ })).toContainText('$280 a month instead of $350');
  await expect(page.getByLabel('Prices by grade').getByRole('row')).toHaveCount(4);
  await expect(page.locator('.bl-yours')).toContainText('Grades 6-8');
  await expect(page.locator('.bl-yours')).toContainText('Your grade');
});

test('Subscribe sends the student to the gateway\'s hosted checkout for their band and period', async ({ page, request }) => {
  await seedUser(request, { ...KID, name: 'Kid One', grade: 9 });
  await logInAs(page, KID);
  await page.route('https://pay.example.test/**', (route) => route.fulfill({ body: 'hosted checkout' }));
  await page.goto('/billing');
  await expect(page.getByRole('radio', { name: /Monthly/ })).toBeChecked(); // monthly is preselected
  await expect(page.getByRole('radio', { name: /Annual/ })).not.toBeChecked();
  await expect(page.getByRole('button', { name: /^Subscribe monthly/ })).toBeVisible();
  await page.getByRole('radio', { name: /Annual/ }).click();
  await expect(page.getByRole('radio', { name: /Annual/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /Monthly/ })).not.toBeChecked();
  await page.getByRole('button', { name: 'Subscribe annually, $3,840 a year' }).click();
  await page.waitForURL(/pay\.example\.test\/checkout/);
  expect(page.url()).toContain('plan=high');
  expect(page.url()).toContain('interval=year');
});

test('after paying, the student sees 15 classes, their renewal date, and can cancel at period end', async ({ page, request }) => {
  await seedUser(request, { ...KID, name: 'Kid One', grade: 6 });
  await logInAs(page, KID);
  await pay(request, KID.email);
  await page.context().route('https://pay.example.test/**', (route) => route.fulfill({ body: 'invoice' }));
  await page.goto('/billing?checkout=success');
  const result = page.getByLabel('Payment result');
  await expect(result.getByRole('heading', { name: 'Payment successful' })).toBeVisible();
  await expect(result.getByRole('link', { name: 'Find a mentor' })).toHaveAttribute('href', /#mentors$/);
  await expect(result.getByRole('link', { name: 'Schedule your first class' })).toBeVisible();
  await expect(page.locator('.bl-meter b')).toHaveText('15');
  await expect(page.getByText('Monthly plan, 15 classes every month. Renews on')).toBeVisible();
  const details = page.getByLabel('Subscription');
  await expect(details).toContainText('Grades');
  await expect(details).toContainText('a month');
  await expect(details).toContainText('Active');
  await expect(details).toContainText('Next payment');
  const history = page.getByLabel('Payment history');
  await expect(history.getByRole('row')).toHaveCount(2); // header + the one payment
  await expect(history).toContainText('Paid');
  await expect(history).toContainText('$');
  const [invoice] = await Promise.all([page.waitForEvent('popup'), history.getByRole('button', { name: 'View invoice' }).click()]);
  await invoice.waitForURL(/pay\.example\.test\/invoice\/inv_/);
  await invoice.close();
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Cancel plan' }).click();
  await expect(page.getByText(/Ends on \w+ \d/)).toBeVisible();
  await expect(details).toContainText('Cancelling');
  await expect(page.getByRole('button', { name: 'Cancel plan' })).toHaveCount(0);
});

test('teachers have nothing to pay', async ({ page, request }) => {
  await seedUser(request, { email: 'teach@example.test', password: 'teach-password-1', role: 'teacher' });
  await logInAs(page, { email: 'teach@example.test', password: 'teach-password-1' });
  await page.goto('/billing');
  await expect(page.getByText('Billing is for students.')).toBeVisible();
});

test('students get a Billing link in the profile menu; teachers do not', async ({ page, request }) => {
  await seedUser(request, { ...KID, name: 'Kid One', grade: 6 });
  await logInAs(page, KID);
  await page.goto('/profile');
  await page.locator('.qh-me summary').click();
  await page.getByRole('link', { name: 'Billing' }).click();
  await expect(page).toHaveURL(/\/billing$/);
  await page.context().clearCookies();
  await seedUser(request, { email: 'teach2@example.test', password: 'teach-password-1', role: 'teacher' });
  await logInAs(page, { email: 'teach2@example.test', password: 'teach-password-1' });
  await page.goto('/profile');
  await page.locator('.qh-me summary').click();
  await expect(page.getByRole('link', { name: 'Billing' })).toHaveCount(0);
});

test('coming back before the payment is confirmed shows that it is being confirmed, not a success', async ({ page, request }) => {
  await seedUser(request, { ...KID, name: 'Kid One', grade: 6 });
  await logInAs(page, KID);
  await page.goto('/billing?checkout=success');
  await expect(page.getByLabel('Payment result').getByRole('heading', { name: 'Confirming your payment…' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Find a mentor' })).toHaveCount(0);
});
