import { test, expect } from '@playwright/test';
import { resetBackend } from './helpers';

test.beforeEach(async ({ request }) => resetBackend(request));

test.describe('sign-in screens', () => {
  test('the footer links switch between Log in and Sign up and keep next', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Welcome back/ })).toBeVisible();
    await page.getByRole('link', { name: 'Create an account' }).click();
    await expect(page).toHaveURL(/\/signup\?next=/);
    await expect(page.getByRole('heading', { name: /Create your account/ })).toBeVisible();
    await expect(page.getByLabel('Full name')).toHaveCount(0); // sign-up asks for email and a confirmed password only
    await expect(page.getByRole('navigation', { name: 'Log in or sign up' })).toHaveCount(0); // no tab bar
    await page.getByRole('link', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test('Forgot password? is bold like Create an account', async ({ page }) => {
    await page.goto('/login');
    const weight = (name: string) => page.getByRole('link', { name }).evaluate((el) => getComputedStyle(el).fontWeight);
    expect(await weight('Forgot password?')).toBe('700');
    expect(await weight('Create an account')).toBe('700');
  });

  test('the Show/Hide button reveals each password field on its own', async ({ page }) => {
    await page.goto('/signup');
    const pw = page.getByLabel('Password', { exact: true });
    const confirm = page.getByLabel('Confirm password');
    await expect(pw).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Show' }).first().click();
    await expect(pw).toHaveAttribute('type', 'text');
    await expect(confirm).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: 'Hide' }).click();
    await expect(pw).toHaveAttribute('type', 'password');
  });

  test('help links go to the website booking form and to WhatsApp; unbuilt things are marked and disabled', async ({ page }) => {
    await page.goto('/signup');
    await expect(page.getByRole('link', { name: 'Book Free Demo' })).toHaveAttribute('href', 'http://localhost:3004/#book');
    for (const name of ['Need help? / Parent Support', 'Connect on WhatsApp']) {
      await expect(page.getByRole('link', { name })).toHaveAttribute('href', /^https:\/\/wa\.me\/919119571369\?text=/);
    }
    for (const name of ['Call us', 'Privacy Policy']) {
      const b = page.getByRole('button', { name });
      await expect(b).toBeDisabled();
      await expect(b).toHaveAttribute('title', 'Coming soon');
    }
    await expect(page.getByText('Back to Website')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Chat with Advisor' })).toHaveCount(0);
    // the safe-learning note sits above the streak banner
    const order = await page.evaluate(() => {
      const safe = document.querySelector('.au-safe')!, streak = document.querySelector('.au-streak')!;
      return !!(safe.compareDocumentPosition(streak) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(order).toBe(true);
  });

  test('the other account pages use the same frame', async ({ page }) => {
    for (const path of ['/forgot-password', '/reset-password', '/accept-invite']) {
      await page.goto(path);
      await expect(page.locator('.au-top')).toBeVisible();
      await expect(page.locator('.au-card')).toBeVisible();
    }
  });

  test('no sideways scrolling from phone to desktop widths', async ({ page }) => {
    for (const path of ['/login', '/signup', '/forgot-password']) {
      for (const width of [390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(over, `${path} at ${width}px`).toBeLessThanOrEqual(0);
      }
    }
  });
});

test('the tab shows the Quanttoria title and icon on the sign-in page', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveTitle('Quanttoria | Personalized Learning for US Students');
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', /\/_next\/static\/media\/icon.*\.png/);
});
