import { expect, test } from '@playwright/test';

const WA = '919119571369';

test('renders every section, the real content and the header links', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Quanttoria/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Math no fear');
  await expect(page.getByText('MathExcellence')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /tailored approach/ })).toBeVisible();
  await expect(page.locator('#how-it-works ol > li')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'Princy Sugandh' })).toBeVisible();
  await expect(page.getByText('Sarah Lin')).toHaveCount(0);
  await expect(page.getByText('Marcus Vance')).toHaveCount(0);
  await expect(page.locator('#reviews .review')).toHaveCount(6);
  // Header: logo, nav, a single Login button; no "Book Free Demo".
  await expect(page.getByRole('link', { name: 'Quanttoria home' }).locator('img')).toBeVisible();
  const login = page.getByRole('banner').getByRole('link', { name: 'Login' });
  await expect(login).toHaveAttribute('href', 'http://accounts.test/login');
  await expect(login).toHaveClass(/btn-primary/);
  await expect(page.getByRole('banner').getByText(/Book Free Demo/i)).toHaveCount(0);
});

test('every image loads, including the student and teacher photos', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => { // scroll through the page so lazy images load
    for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
  });
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 15_000 });
  const broken = await page.$$eval('img', (imgs) => imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src));
  expect(broken).toEqual([]);
});

test('WhatsApp links use the Quanttoria number', async ({ page }) => {
  await page.goto('/');
  const links = page.getByRole('link', { name: /Connect on WhatsApp/ });
  await expect(links).toHaveCount(1); // founder section; the floating button is now "Book a free demo"
  for (const l of await links.all()) await expect(l).toHaveAttribute('href', new RegExp(`^https://wa\\.me/${WA}\\?text=`));
});

test('Trustpilot links use the Quanttoria review URL', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Read all reviews/ })).toHaveAttribute('href', /trustpilot\.com\/review\/byjusfutureschool\.com\?search=princy/);
});

test('header anchors scroll to their section', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'How it works' }).click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(page.locator('#how-it-works')).toBeInViewport();
});

test('no inline plan form; the floating "Book a free demo" button opens it in a dialog', async ({ page }) => {
  await page.goto('/');
  const dialog = page.getByRole('dialog', { name: /plan that fits your child/ });
  await expect(dialog).toBeHidden();
  await expect(page.locator('main form')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Connect on WhatsApp' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Book a free demo' }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Customize your plan' }).click(); // hero button opens the same dialog
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Book your free demo' }).click(); // free-demo banner too
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5); // backdrop
  await expect(dialog).toBeHidden();
});

test('dialog form opens WhatsApp with the details filled in', async ({ page, context }) => {
  await context.route('https://wa.me/**', (r) => r.fulfill({ body: 'ok' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Book a free demo' }).click();
  const form = page.getByRole('dialog');
  await form.getByRole('button', { name: /Customize my child/ }).click();
  await expect(form.getByLabel('Parent/Guardian name')).toBeFocused(); // blocked by the browser: fields are required
  await form.getByLabel('Parent/Guardian name').fill('Jessica Miller');
  await form.getByLabel('Child’s name').fill('Leo');
  await form.getByLabel('Grade').selectOption('Grade 7');
  // The goals field is optional: send without it first.
  const send = async () => {
    const [popup] = await Promise.all([context.waitForEvent('page'), form.getByRole('button', { name: /Customize my child/ }).click()]);
    await popup.waitForLoadState();
    const url = new URL(popup.url());
    expect(url.host).toBe('wa.me');
    expect(url.pathname).toBe(`/${WA}`);
    await expect(form).toBeHidden(); // closes after sending
    return url.searchParams.get('text')!;
  };
  const without = await send();
  expect(without).toContain('Parent: Jessica Miller');
  expect(without).toContain('Child: Leo');
  expect(without).toContain('Grade: Grade 7');
  expect(without).not.toContain('Learning goals');

  await page.getByRole('button', { name: 'Book a free demo' }).click();
  await form.getByLabel('Learning goals or challenges').fill('Fractions');
  expect(await send()).toContain('Learning goals or challenges: Fractions');
});

test('mobile: no horizontal scroll and the dialog fits the screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Book a free demo' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeInViewport({ ratio: 0.99 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('buttons work when the dev site is opened as 127.0.0.1 (not only localhost)', async ({ page }) => {
  await page.goto('http://127.0.0.1:58741/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Book a free demo' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('footer: both emails, and the links and contact rows share one left edge', async ({ page }) => {
  await page.goto('/');
  const f = page.getByRole('contentinfo');
  await expect(f.getByRole('link', { name: 'pprincyaaghaww@quanttoria.com' })).toHaveAttribute('href', 'mailto:pprincyaaghaww@quanttoria.com');
  await expect(f.getByRole('link', { name: 'pprincyaaghaww@gmail.com' })).toHaveAttribute('href', 'mailto:pprincyaaghaww@gmail.com');
  await expect(f.locator('.pill', { hasText: /^Contact$/ })).toBeVisible(); // same pill style as the other section titles
  const x = async (name: string | RegExp) => Math.round((await f.getByRole('link', { name }).first().boundingBox())!.x);
  expect(await x('Why Quanttoria')).toBe(await x(/^WhatsApp/));
});

test('mobile: section links move into a menu that opens, navigates and closes', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const header = page.getByRole('banner');
  await expect(header.getByRole('link', { name: 'Login' })).toBeVisible(); // Login stays in the bar
  await expect(header.getByRole('link', { name: 'How it works' })).toHaveCount(0); // desktop links are hidden
  const menu = page.getByRole('navigation', { name: 'Mobile' });
  await expect(menu).toHaveCount(0);
  await header.getByRole('button', { name: 'Open menu' }).click();
  for (const l of ['Why Quanttoria', 'How it works', 'Meet our founder', 'Why parents trust us', 'Contact']) await expect(menu.getByRole('link', { name: l })).toBeVisible();
  await menu.getByRole('link', { name: 'How it works' }).click();
  await expect(menu).toHaveCount(0); // closes after choosing
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(page.locator('#how-it-works')).toBeInViewport();
  await header.getByRole('button', { name: 'Open menu' }).click();
  await expect(menu).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await header.getByRole('button', { name: 'Open menu' }).click();
  await header.getByRole('button', { name: 'Close menu' }).click();
  await expect(menu).toHaveCount(0);
});

test('desktop: no menu button', async ({ page }) => {
  await page.setViewportSize({ width: 1296, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden();
  await expect(page.getByRole('banner').getByRole('link', { name: 'How it works' })).toBeVisible();
});

test('tablet 768: menu button shown, no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('why intro is a sentence plus bullets, and the how-it-works intro sits under its title across the full width', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#why .lede2')).toHaveText(/Here’s how we help every child feel confident in maths\. We:$/);
  await expect(page.locator('#why .bullets li')).toHaveText([/Meet children where they are/, /Bridge foundational gaps/, /Train them to apply strategies/, /Keep going when a problem is hard/]);
  const head = page.locator('#how-it-works .sec-head');
  const [box, title, intro] = await Promise.all([head.boundingBox(), head.locator('h2').boundingBox(), head.locator(':scope > p').boundingBox()]);
  expect(intro!.y).toBeGreaterThanOrEqual(title!.y + title!.height - 1); // under the title
  expect(Math.round(intro!.x)).toBe(Math.round(box!.x));
  expect(Math.round(intro!.width)).toBe(Math.round(box!.width)); // spans the whole row
});

test('"Book a free demo" animates on hover and press like the other primary buttons', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const state = (name: string) => page.getByRole(name === 'Login' ? 'link' : 'button', { name }).first().evaluate((e) => { const c = getComputedStyle(e); return { t: c.transform, s: c.boxShadow }; });
  for (const name of ['Login', 'Customize your plan', 'Book a free demo']) {
    const loc = page.getByRole(name === 'Login' ? 'link' : 'button', { name }).first();
    const rest = await state(name);
    await loc.hover();
    await page.waitForTimeout(300);
    const hover = await state(name);
    expect(hover.t, `${name} moves on hover`).not.toBe(rest.t);
    expect(hover.s, `${name} shadow shrinks on hover`).not.toBe(rest.s);
    await page.mouse.move(0, 400);
  }
});
