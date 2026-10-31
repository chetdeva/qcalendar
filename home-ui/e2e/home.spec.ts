import { expect, test } from '@playwright/test';

const WA = '919119571369';

test('renders every section, the real content and the header links', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Quanttoria/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Confidence\s+unlocked\./);
  await expect(page.getByText('MathExcellence')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /tailored approach/ })).toBeVisible();
  await expect(page.locator('#how-it-works ol > li')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: 'Princy Sugandh' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /our family is part of the journey/ })).toBeVisible();
  // The sections of the Figma design, each with its own content.
  await expect(page.locator('#why .vs')).toHaveCount(2); // old rote way vs the Quanttoria way
  await expect(page.locator('#why .pillar')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: /The Live Classroom/ })).toBeVisible();
  await expect(page.locator('#classroom .board')).toBeVisible();
  await expect(page.locator('#classroom .features li')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: /Experience the Magic/ })).toBeVisible();
  await expect(page.locator('#book .tile')).toHaveCount(4);
  // Figures that were only in the mock-up must not appear as facts.
  for (const invented of ['1,240', '+42%', '89%', '3.4x', 'Top 2%', 'Elena Rostova', 'GeoGebra']) await expect(page.getByText(invented)).toHaveCount(0);
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

test('reviews are word for word, say where they come from, and link to their own Trustpilot review', async ({ page }) => {
  await page.goto('/');
  const section = page.locator('#reviews');
  await expect(section).toContainText('13 five-star reviews of Princy’s teaching');
  await expect(section).toContainText('BYJU’S FutureSchool');
  // The two quotes the audit found reworded, as the parents wrote them (school name kept).
  await expect(section).toContainText('I started BYJU with a demo class with Ms Princy Sugandh.');
  await expect(section).toContainText('BYJU Future School is extraordinary!');
  await expect(section).toContainText('Mr. Princy is an amazing teacher');
  for (const link of await section.getByRole('link', { name: /^Read .* on Trustpilot$/ }).all()) {
    await expect(link).toHaveAttribute('href', /^https:\/\/www\.trustpilot\.com\/reviews\/[0-9a-f]{24}$/);
    await expect(link).toHaveAttribute('rel', /noopener/);
  }
  await expect(section.getByRole('link', { name: /See them on Trustpilot/ })).toHaveAttribute('href', /trustpilot\.com\/review\/byjusfutureschool\.com\?search=princy/);
  await expect(page.getByText('Rated 5 stars on Trustpilot')).toHaveCount(0);
});

test('the founder rating jumps to the reviews on this page', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#tutor').getByRole('link', { name: '13 five-star parent reviews' })).toHaveAttribute('href', '#reviews');
});

test('US spelling and one name, in the page and in the search metadata', async ({ page }) => {
  await page.goto('/');
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/\bmaths\b/i);
  expect(text).not.toMatch(/personalis/i);
  expect(text).not.toContain('Pprincy');
  await expect(page).toHaveTitle(/Online Math Tutor for Kids/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /1-on-1 online math tutoring/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /^https:\/\/www\.quanttoria\.com\/?$/);
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);
  const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').innerText());
  expect(ld['@graph'].map((n: { '@type': string }) => n['@type'])).toEqual(['EducationalOrganization', 'Person']);
});

test('robots.txt, sitemap.xml and llms.txt are served for search engines and AI tools', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).toMatch(/Allow: \//);
  expect(robots).toContain('Sitemap: https://www.quanttoria.com/sitemap.xml');
  const sitemap = await (await request.get('/sitemap.xml')).text();
  for (const p of ['/', '/privacy', '/terms']) expect(sitemap).toContain(`<loc>https://www.quanttoria.com${p === '/' ? '' : p}`);
  expect((await request.get('/llms.txt')).ok()).toBe(true);
});

test('privacy and terms pages exist and the footer links to them', async ({ page }) => {
  await page.goto('/');
  const f = page.getByRole('contentinfo');
  await f.getByRole('link', { name: 'Privacy Policy' }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeVisible();
  await expect(page.locator('#parental-consent')).toBeVisible();
  await page.goto('/terms');
  await expect(page.getByRole('heading', { level: 1, name: 'Terms of Use' })).toBeVisible();
});

test('header anchors scroll to their section', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'How it works' }).click();
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(page.locator('#how-it-works')).toBeInViewport();
});

test('every "book" button scrolls to the inline booking form; there is no pop-up any more', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('dialog')).toHaveCount(0);
  for (const name of ['Book your free 1:1 class', 'Book a free demo']) {
    await expect(page.getByRole('link', { name: new RegExp(name) })).toHaveAttribute('href', '#book');
  }
  await page.getByRole('link', { name: 'Book a free demo' }).click();
  await expect(page).toHaveURL(/#book$/);
  await expect(page.locator('#book')).toBeInViewport();
  await expect(page.getByRole('button', { name: /Claim your child/ })).toBeVisible();
});

test('booking form opens WhatsApp with the details filled in', async ({ page, context }) => {
  await context.route('https://wa.me/**', (r) => r.fulfill({ body: 'ok' }));
  await page.goto('/');
  const form = page.locator('#book form');
  await form.getByRole('button', { name: /Claim your child/ }).click();
  await expect(form.getByRole('radio', { name: /Grades 1–2/ })).toBeFocused(); // blocked by the browser: a grade is required
  await form.locator('.tile', { hasText: 'Grades 3–5' }).click();
  await form.getByLabel('Parent Full Name').fill('Jessica Miller');
  await form.getByLabel('Parent Email').fill('jessica@example.com');
  const send = async () => {
    const [popup] = await Promise.all([context.waitForEvent('page'), form.getByRole('button', { name: /Claim your child/ }).click()]);
    await popup.waitForLoadState();
    const url = new URL(popup.url());
    expect(url.host).toBe('wa.me');
    expect(url.pathname).toBe(`/${WA}`);
    await popup.close();
    return url.searchParams.get('text')!;
  };
  // Goal and phone are optional: send without them first.
  const without = await send();
  expect(without).toContain('Parent: Jessica Miller');
  expect(without).toContain('Email: jessica@example.com');
  expect(without).toContain('Grade: Grades 3–5 (Fractions & Logic)');
  expect(without).not.toContain('Phone');
  expect(without).not.toContain('Biggest goal');

  await form.locator('.goal', { hasText: 'Building Confidence' }).click();
  await form.getByLabel('Phone Number').fill('(555) 123-4567');
  const withAll = await send();
  expect(withAll).toContain('Phone: (555) 123-4567');
  expect(withAll).toContain('Biggest goal: Building Confidence');
});

test('picking a grade or a goal selects exactly one, and a selected tile looks selected', async ({ page }) => {
  await page.goto('/');
  const tile = (name: string) => page.locator('#book .tile', { hasText: name });
  await tile('Grades 6–8').click();
  await tile('Grades 9–10').click();
  await expect(page.getByRole('radio', { name: /Grades 9–10/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /Grades 6–8/ })).not.toBeChecked();
  await expect(tile('Grades 9–10').locator('.tile-in')).toHaveCSS('border-color', 'rgb(2, 132, 199)'); // looks selected (after its short transition)
  await page.locator('#book .goal', { hasText: 'School Homework' }).click();
  await expect(page.getByRole('radio', { name: 'School Homework' })).toBeChecked();
});

test('mobile: no horizontal scroll, and the booking form fits the screen with comfortable inputs', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await fits()).toBe(true);
  await page.locator('#book').scrollIntoViewIfNeeded();
  await expect(page.locator('#book form')).toBeInViewport();
  const box = await page.locator('#book form').boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  expect(await page.getByLabel('Parent Email').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16); // no iOS zoom on focus
  expect(await fits()).toBe(true);
});

test('every section fits at tablet and phone widths without sideways scrolling', async ({ page }) => {
  for (const width of [320, 414, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `width ${width}`).toBe(true);
  }
});

test('buttons work when the dev site is opened as 127.0.0.1 (not only localhost)', async ({ page }) => {
  await page.goto('http://127.0.0.1:58741/');
  await page.waitForLoadState('networkidle');
  await page.locator('#book .tile', { hasText: 'Grades 3–5' }).click(); // proves the page hydrated
  await expect(page.getByRole('radio', { name: /Grades 3–5/ })).toBeChecked();
});

test('footer: the shared site footer, with the contact row kept under its legal links', async ({ page }) => {
  await page.goto('/');
  const f = page.getByRole('contentinfo');
  await expect(f).toContainText('COPPA & FERPA Compliant Security');
  for (const l of ['Privacy Policy', 'Parental Consent & Rights', 'Student Data Safety', 'Terms of Use']) await expect(f.getByRole('link', { name: l })).toBeVisible();
  await expect(f).toContainText('For support, mail us at pprincyaaghaww@quanttoria.com');
  await expect(f.getByRole('link', { name: 'pprincyaaghaww@quanttoria.com' })).toHaveAttribute('href', 'mailto:pprincyaaghaww@quanttoria.com');
  await expect(f).not.toContainText('gmail.com');
  await expect(page.locator('footer#contact')).toHaveCount(1); // the Contact nav link lands here
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
  for (const l of ['Why Quanttoria', 'How it works', 'Live classroom', 'Meet our founder', 'Why parents trust us', 'Contact']) await expect(menu.getByRole('link', { name: l })).toBeVisible();
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

test('why section keeps the subtitle, and every section intro shares one measure under its title', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#why .bullets')).toHaveCount(0);
  await expect(page.getByText(/Here’s how we help every child/)).toHaveCount(0);
  await expect(page.locator('#why .head .intro')).toHaveText('We meet children where they are, bridge their foundational gaps, and equip them with strategies to stay persistent and analyze challenging problems with confidence.');
  const head = page.locator('#how-it-works .head');
  const [box, title, intro] = await Promise.all([head.boundingBox(), head.locator('h2').boundingBox(), head.locator('.intro').boundingBox()]);
  expect(intro!.y).toBeGreaterThanOrEqual(title!.y + title!.height - 1); // under the title
  expect(intro!.width).toBeLessThanOrEqual(768);
  expect(intro!.width).toBeLessThanOrEqual(box!.width);
  const why = await page.locator('#why .head .intro').boundingBox();
  expect(Math.round(intro!.width)).toBe(Math.round(why!.width)); // same line length in both sections
});

test('"Book a free demo" animates on hover and press like the other primary buttons', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const state = (name: string) => page.getByRole('link', { name }).first().evaluate((e) => { const c = getComputedStyle(e); return { t: c.transform, s: c.boxShadow }; });
  for (const name of ['Login', 'Book your free 1:1 class', 'Book a free demo']) {
    const loc = page.getByRole('link', { name }).first();
    const rest = await state(name);
    await loc.hover();
    await page.waitForTimeout(300);
    const hover = await state(name);
    expect(hover.t, `${name} moves on hover`).not.toBe(rest.t);
    expect(hover.s, `${name} shadow shrinks on hover`).not.toBe(rest.s);
    await page.mouse.move(0, 400);
  }
});
