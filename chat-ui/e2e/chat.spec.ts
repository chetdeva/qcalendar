import { expect, test, type Browser } from '@playwright/test';
import { openPage, resetBackend, seed, shareAClass } from './helpers';

test.beforeEach(({ request }) => resetBackend(request));

/** A second, separate browser session for the other person. */
const asOther = async (browser: Browser, u: Parameters<typeof openPage>[1]) => openPage(await browser.newContext({ timezoneId: 'UTC', locale: 'en-US' }), u);

test('a student and a teacher with a class chat both ways, see names, unread counts and updates', async ({ context, browser, request }) => {
  const teacher = await seed(request, 'teacher', 'Tess Teacher');
  const student = await seed(request, 'student', 'Sam Student');
  await shareAClass(request, teacher, [student]);

  const s = await openPage(context, student);
  await expect(s.getByTestId('no-conversations')).toBeVisible();
  await s.getByLabel('Search people to chat with').click();
  await s.getByRole('region', { name: 'Start a chat' }).getByRole('button', { name: 'Tess Teacher' }).click();
  const thread = s.getByRole('region', { name: 'Conversation with Tess Teacher' });
  await expect(thread).toBeVisible();
  await expect(thread.getByText(teacher.email)).toBeVisible(); // the name and the email of the other person
  await thread.getByLabel('Message').fill('Hello teacher');
  await thread.getByRole('button', { name: 'Send' }).click();
  await expect(thread.getByText('Hello teacher')).toBeVisible(); // shows straight away
  await expect(thread.getByLabel('Message')).toHaveValue('');

  const t = await asOther(browser, teacher);
  const row = t.getByRole('button', { name: /Sam Student/ });
  await expect(row).toContainText('Hello teacher');
  await expect(row.getByRole('img', { name: '1 unread' })).toBeVisible();
  await row.click();
  const tThread = t.getByRole('region', { name: 'Conversation with Sam Student' });
  await expect(tThread.getByText('Hello teacher')).toBeVisible();
  await expect(row.getByRole('img', { name: /unread/ })).toHaveCount(0); // opening it marks it read
  await tThread.getByLabel('Message').fill('Hi Sam, see you tomorrow');
  await tThread.getByLabel('Message').press('Enter'); // Enter sends
  await expect(tThread.getByText('Hi Sam, see you tomorrow')).toBeVisible();

  await expect(thread.getByText('Hi Sam, see you tomorrow')).toBeVisible({ timeout: 10_000 }); // arrives by polling, no reload
});

test('a person without a saved name is shown by their email, never as "Unnamed"', async ({ context, request }) => {
  const teacher = await seed(request, 'teacher', '');
  const student = await seed(request, 'student', 'Sam Student');
  await shareAClass(request, teacher, [student]);
  const page = await openPage(context, student);
  await page.getByLabel('Search people to chat with').click();
  await page.getByRole('region', { name: 'Start a chat' }).getByRole('button', { name: teacher.email }).first().click();
  await expect(page.getByRole('region', { name: `Conversation with ${teacher.email}` })).toBeVisible();
  await expect(page.getByText('Unnamed')).toHaveCount(0);
});

test('someone with no class has nobody to chat with, and the server refuses a chat anyway', async ({ context, request }) => {
  const teacher = await seed(request, 'teacher', 'Tess Teacher');
  const stranger = await seed(request, 'student', 'Stu Stranger');
  const page = await openPage(context, stranger);
  await page.getByLabel('Search people to chat with').click();
  await expect(page.getByText('No one to chat with yet')).toBeVisible();
  const res = await page.request.post('/api/conversations', { data: { partnerId: teacher.id } });
  expect(res.status()).toBe(403);
});

test('a student cannot chat with another student, even in the same class', async ({ context, request }) => {
  const teacher = await seed(request, 'teacher', 'Tess Teacher');
  const [a, b] = [await seed(request, 'student', 'Ann Student'), await seed(request, 'student', 'Ben Student')];
  await shareAClass(request, teacher, [a, b]);
  const page = await openPage(context, a);
  await page.getByLabel('Search people to chat with').click();
  const picker = page.getByRole('region', { name: 'Start a chat' });
  await expect(picker.getByRole('button', { name: 'Tess Teacher' })).toBeVisible();
  await expect(picker.getByRole('button', { name: 'Ben Student' })).toHaveCount(0);
  expect((await page.request.post('/api/conversations', { data: { partnerId: b.id } })).status()).toBe(403);
});

test('mobile: no horizontal scroll, and a conversation opens full screen with a Back button', async ({ context, request }) => {
  const teacher = await seed(request, 'teacher', 'Tess Teacher');
  const student = await seed(request, 'student', 'Sam Student');
  await shareAClass(request, teacher, [student]);
  const page = await openPage(context, student);
  await page.setViewportSize({ width: 375, height: 700 });
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await fits()).toBe(true);
  await page.getByLabel('Search people to chat with').click();
  await page.getByRole('button', { name: 'Tess Teacher' }).click();
  await expect(page.getByRole('region', { name: 'Conversation with Tess Teacher' })).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Conversations' })).toBeHidden();
  expect(await fits()).toBe(true);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('complementary', { name: 'Conversations' })).toBeVisible();
});

test('signed-out visitors are sent to the login page', async ({ page }) => {
  await page.route('**/login*', (r) => r.fulfill({ body: 'login' }));
  await page.goto('/');
  await expect(page).toHaveURL(/58755\/login/);
});

test('typing in the search box narrows the people by name or email; Enter or a click opens the chat', async ({ context, request }) => {
  const [tess, tom] = [await seed(request, 'teacher', 'Tess Teacher'), await seed(request, 'teacher', 'Tom Trainer')];
  const student = await seed(request, 'student', 'Sam Student');
  await shareAClass(request, tess, [student]);
  await shareAClass(request, tom, [student], 2);
  const page = await openPage(context, student);
  const search = page.getByLabel('Search people to chat with');
  const results = page.getByRole('region', { name: 'Start a chat' });
  await expect(results).toHaveCount(0); // closed until the box is used

  await search.click();
  await expect(results.getByRole('button')).toHaveCount(2); // everyone, before typing
  await search.fill('tom');
  await expect(results.getByRole('button')).toHaveCount(1);
  await expect(results.getByRole('button', { name: /Tom Trainer/ })).toBeVisible();
  await search.fill(tess.email.slice(0, 8).toUpperCase()); // email, any case
  await expect(results.getByRole('button', { name: /Tess Teacher/ })).toBeVisible();
  await search.fill('zzz');
  await expect(results).toContainText('No one matches');

  await search.fill('tess');
  await search.press('Enter'); // the first match opens
  await expect(page.getByRole('region', { name: 'Conversation with Tess Teacher' })).toBeVisible();
  await expect(search).toHaveValue('');
  await expect(results).toHaveCount(0);

  await search.click();
  await search.press('Escape');
  await expect(results).toHaveCount(0);
});

test('"Send Message" on a mentor\'s card opens a chat with that mentor, even with no class together; the mentor can answer', async ({ browser, context, request }) => {
  const teacher = await seed(request, 'teacher', 'Tess Teacher');
  const student = await seed(request, 'student', 'Sam Student');

  const s = await openPage(context, student);
  await s.goto(`/?mentor=${teacher.id}`);
  const thread = s.getByRole('region', { name: 'Conversation with Tess Teacher' });
  await expect(thread).toBeVisible();
  await expect(s).toHaveURL(/\/$/); // the link's parameter is gone, so a reload does not repeat it
  await thread.getByLabel('Message').fill('Hello, do you teach fractions?');
  await thread.getByRole('button', { name: 'Send' }).click();
  await expect(thread.getByText('Hello, do you teach fractions?')).toBeVisible();

  const other = await browser.newContext();
  const t = await openPage(other, teacher);
  await t.getByRole('button', { name: /Sam Student/ }).click();
  const tThread = t.getByRole('region', { name: 'Conversation with Sam Student' });
  await expect(tThread.getByText('Hello, do you teach fractions?')).toBeVisible();
  await tThread.getByLabel('Message').fill('Yes, happy to help.');
  await tThread.getByRole('button', { name: 'Send' }).click();
  await expect(thread.getByText('Yes, happy to help.')).toBeVisible({ timeout: 15_000 });
  await other.close();
});

test('only a mentor can be reached this way: another student or an unknown id is refused', async ({ context, request }) => {
  const other = await seed(request, 'student', 'Olly Other');
  const student = await seed(request, 'student', 'Sam Student');
  const page = await openPage(context, student);
  await page.goto(`/?mentor=${other.id}`);
  await expect(page.locator('.err')).toContainText('mentor was not found');
  await expect(page.getByTestId('no-conversations')).toBeVisible();
  const res = await page.request.post('/api/mentor-chat', { data: { mentorId: crypto.randomUUID() } });
  expect(res.status()).toBe(404);
  expect((await page.request.post('/api/mentor-chat', { data: {} })).status()).toBe(400);
});
