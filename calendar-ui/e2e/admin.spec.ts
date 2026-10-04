import { test, expect, type Page } from '@playwright/test';
import { at, calendarAs, openPage, resetBackend, seed, tokenFor, todayUtc } from './helpers';

test.beforeEach(async ({ request }) => resetBackend(request));

const as = async (request: any, u: any) => calendarAs(request, await tokenFor(request, u));
const teacherSelect = (p: Page) => p.getByLabel('Teacher *');

test('an admin sees every teacher\'s classes, with the teacher\'s name on each', async ({ context, request }) => {
  const [t1, t2] = [await seed(request, 'teacher', 'Tess Teacher'), await seed(request, 'teacher', 'Tom Teacher')];
  await (await as(request, t1)).create({ title: 'Tess class', start: at(10), durationMinutes: 60 });
  await (await as(request, t2)).create({ title: 'Tom class', start: at(12), durationMinutes: 60 });
  const page = await openPage(context, request, await seed(request, 'admin', 'Ada Admin'));
  const tess = page.locator('.fc-event', { hasText: 'Tess class' });
  const tom = page.locator('.fc-event', { hasText: 'Tom class' });
  await expect(tess).toBeVisible();
  await expect(tom).toBeVisible();
  await expect(tess).toContainText('Tess Teacher');
  await expect(tom).toContainText('Tom Teacher');
  await expect(page.getByText('• 2 classes this week')).toBeVisible();
});

test('creating on a teacher\'s behalf: a teacher must be chosen, and only teachers are offered', async ({ context, request }) => {
  const teacher = await seed(request, 'teacher', 'Tess Teacher');
  await seed(request, 'teacher', 'Tom Teacher');
  await seed(request, 'student', 'Sam Student');
  await seed(request, 'admin', 'Other Admin');
  const page = await openPage(context, request, await seed(request, 'admin', 'Ada Admin'));
  await expect(page.locator('select option')).toHaveText(['Choose a teacher', 'Tess Teacher', 'Tom Teacher']);

  await page.getByRole('button', { name: 'Personal' }).click();
  await page.getByLabel('Event Title *').fill('Planning block');
  await page.getByLabel('Date *').fill(todayUtc());
  await page.getByLabel('Start Time *').fill('09:00');
  const create = page.getByRole('button', { name: 'Create & Send Invites' });
  await expect(create).toBeDisabled();
  await expect(page.getByTestId('missing')).toContainText('a teacher');

  await teacherSelect(page).selectOption({ label: 'Tess Teacher' });
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page.locator('.fc-event', { hasText: 'Planning block' })).toBeVisible();

  const owned = await (await as(request, teacher)).list();
  expect(owned).toHaveLength(1);
  expect(owned[0]).toMatchObject({ title: 'Planning block', ownerId: teacher.id, ownerName: 'Tess Teacher', ownerEmail: teacher.email });
});

test('an admin can add and remove students on, and cancel, any teacher\'s class', async ({ context, request }) => {
  const teacher = await seed(request, 'teacher', 'Tess Teacher');
  const [a, b] = [await seed(request, 'student', 'Ann Student'), await seed(request, 'student', 'Ben Student')];
  const ev = await (await as(request, teacher)).create({ title: 'Their class', start: at(10), durationMinutes: 60, participants: [{ email: a.email, userId: a.id }] });
  const page = await openPage(context, request, await seed(request, 'admin', 'Ada Admin'));
  await page.locator('.fc-event', { hasText: 'Their class' }).click();
  const drawer = page.getByRole('complementary', { name: 'Lesson details' });
  await expect(drawer).toContainText('Teacher: Tess Teacher');

  await drawer.getByRole('combobox', { name: /Add students/ }).fill('ben');
  await page.getByRole('option', { name: /Ben Student/ }).click();
  await drawer.getByRole('button', { name: 'Add to class' }).click();
  const roster = drawer.getByRole('list', { name: 'Students in this class' });
  await expect(roster.getByRole('listitem').filter({ hasText: 'Ben Student' })).toBeVisible();
  await drawer.getByRole('button', { name: `Remove ${a.email}` }).click();
  await expect(roster.getByRole('listitem').filter({ hasText: 'Ann Student' })).toHaveCount(0);
  expect((await (await as(request, teacher)).call('GET', `/v1/events/${ev.id}`)).body.participants.map((p: any) => p.email)).toEqual([b.email]);

  page.once('dialog', (d) => d.accept());
  await drawer.getByRole('button', { name: 'Cancel lesson' }).click();
  await expect(page.locator('.fc-event', { hasText: 'Their class' })).toHaveCount(0);
  expect((await (await as(request, teacher)).call('GET', `/v1/events/${ev.id}`)).body.status).toBe('cancelled');
});

test('an admin can drag any teacher\'s class to a new time', async ({ context, request }) => {
  const teacher = await seed(request, 'teacher', 'Tess Teacher');
  const t = await as(request, teacher);
  const ev = await t.create({ title: 'Move me', start: at(10), durationMinutes: 60 });
  const page = await openPage(context, request, await seed(request, 'admin', 'Ada Admin'));
  const card = page.locator('.fc-event', { hasText: 'Move me' });
  const target = page.locator('.fc-timegrid-slot-lane[data-time="14:00:00"]');
  await card.scrollIntoViewIfNeeded();
  const [e, tg] = [await card.boundingBox(), await target.boundingBox()];
  const x = e!.x + e!.width / 2;
  await page.mouse.move(x, e!.y + 4);
  await page.mouse.down();
  await page.mouse.move(x, e!.y + 40, { steps: 5 });
  await page.mouse.move(x, tg!.y + 4, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await t.call('GET', `/v1/events/${ev.id}`)).body.start).toBe(`${todayUtc()}T14:00:00.000Z`);
});

test('free-time shading follows the teacher chosen in the form', async ({ context, request }) => {
  const teacher = await seed(request, 'teacher', 'Tess Teacher');
  const { openAllDay } = await import('./helpers');
  await openAllDay(request, teacher);
  const page = await openPage(context, request, await seed(request, 'admin', 'Ada Admin'));
  await expect(page.getByLabel('Shade free times for this duration')).toHaveCount(0); // no teacher chosen yet
  await expect(page.locator('.fc-bg-event.free')).toHaveCount(0);
  await teacherSelect(page).selectOption({ label: 'Tess Teacher' });
  await expect(page.getByLabel('Shade free times for this duration')).toBeVisible();
  await expect(page.locator('.fc-bg-event.free').first()).toBeVisible();
});
