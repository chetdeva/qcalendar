import { expect, test } from '@playwright/test';

test('renders every section and the header links', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Confidence');
  await expect(page.getByRole('heading', { name: /Transforms Learners/ })).toBeVisible();
  await expect(page.locator('#how-it-works article')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: /Dedicated Coach/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Trustpilot/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Management Portals/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log In' })).toHaveAttribute('href', 'http://accounts.test/login');
  await expect(page.getByRole('link', { name: 'Create an account' })).toHaveAttribute('href', 'http://accounts.test/signup');
});

test('header anchors scroll to their section', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'How It Works' }).click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(page.locator('#how-it-works')).toBeInViewport();
});

test('booking form: grade choice, required fields, notice and nothing sent', async ({ page }) => {
  const posts: string[] = [];
  page.on('request', (r) => { if (r.method() === 'POST') posts.push(r.url()); });
  await page.goto('/');
  const form = page.locator('#book');
  await expect(form.getByLabel(/Grades 1–5/)).toBeChecked();
  await form.getByLabel(/Grades 6–8/).check({ force: true });
  await expect(form.getByLabel(/Grades 6–8/)).toBeChecked();

  await form.getByRole('button', { name: /Match With Certified Coach/ }).click();
  await expect(form.getByRole('status')).toHaveCount(0); // blocked by the browser: fields are required
  await form.getByLabel('Parent Name').fill('Jessica Miller');
  await form.getByLabel('Email / Mobile (US)').fill('jessica@example.test');
  await form.getByRole('button', { name: /Match With Certified Coach/ }).click();
  await expect(form.getByRole('status')).toContainText('Nothing has been sent');
  expect(posts).toEqual([]);
});

test('portal tabs switch between student and teacher views', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Digital Assignment Locker')).toBeVisible();
  await page.getByRole('tab', { name: /Teacher Management/ }).click();
  await expect(page.getByText('Today’s roster')).toBeVisible();
  await expect(page.getByText('Digital Assignment Locker')).toHaveCount(0);
  await page.getByRole('tab', { name: /Student Experience/ }).click();
  await expect(page.getByText('Digital Assignment Locker')).toBeVisible();
});

test('mobile: no horizontal scroll and the form is usable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: /Register for a Demo/ }).click();
  await expect(page.locator('#book')).toBeInViewport();
});
