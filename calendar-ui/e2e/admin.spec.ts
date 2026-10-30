import { test, expect, type Page } from '@playwright/test';
import { at, calendarAs, openForm, openPage, resetBackend, seed, tokenFor, todayUtc } from './helpers';

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
  await openForm(page);
  await expect(teacherSelect(page).locator('option')).toHaveText(['Choose a teacher', 'Tess Teacher', 'Tom Teacher']);

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
  await page.mouse.move(x, tg!.y - 10, { steps: 10 }); // the grab offset (4px) shifts FullCalendar's hit zone up; this lands the event on the 14:00 quarter
  await page.mouse.up();
  await expect.poll(async () => (await t.call('GET', `/v1/events/${ev.id}`)).body.start).toBe(`${todayUtc()}T14:00:00.000Z`);
});

test('free-time shading follows the teacher chosen in the form', async ({ context, request }) => {
  const teacher = await seed(request, 'teacher', 'Tess Teacher');
  const { openAllDay } = await import('./helpers');
  await openAllDay(request, teacher);
  const page = await openPage(context, request, await seed(request, 'admin', 'Ada Admin'));
  await openForm(page);
  await expect(page.getByLabel('Shade free times for this duration')).toHaveCount(0); // no teacher chosen yet
  await expect(page.locator('.fc-bg-event.free')).toHaveCount(0);
  await teacherSelect(page).selectOption({ label: 'Tess Teacher' });
  await expect(page.getByLabel('Shade free times for this duration')).toBeVisible();
  await expect(page.locator('.fc-bg-event.free').first()).toBeVisible();
});

test('an admin filters the calendar to one teacher or one student from the Filters dialog, and can open it from a link', async ({ context, request }) => {
  const [t1, t2] = [await seed(request, 'teacher', 'Tess Teacher'), await seed(request, 'teacher', 'Tom Teacher')];
  const sam = await seed(request, 'student', 'Sam Student');
  await (await as(request, t1)).create({ title: 'Tess class', start: at(10), durationMinutes: 60 });
  await (await as(request, t2)).create({ title: 'Tom class', start: at(12), durationMinutes: 60, participants: [{ email: sam.email, userId: sam.id }] });
  const page = await openPage(context, request, await seed(request, 'admin', 'Ada Admin'));
  const [tess, tom] = [page.locator('.fc-event', { hasText: 'Tess class' }), page.locator('.fc-event', { hasText: 'Tom class' })];
  await expect(tess).toBeVisible();
  await expect(tom).toBeVisible();

  // the button sits to the right of Quick Add Lesson
  const [add, filters] = [await page.getByRole('button', { name: 'Quick Add Lesson' }).boundingBox(), await page.getByRole('button', { name: 'Filters' }).boundingBox()];
  expect(filters!.x).toBeGreaterThan(add!.x + add!.width);

  const dialog = page.getByRole('dialog', { name: 'Calendar filters' });
  await page.getByRole('button', { name: 'Filters' }).click();
  await dialog.getByLabel('Show').selectOption('teacher');
  await dialog.getByLabel('Teacher', { exact: true }).selectOption({ label: 'Tess Teacher' });
  await expect(tom).toBeVisible(); // nothing changes until Apply
  await dialog.getByRole('button', { name: 'Apply filters' }).click();
  await expect(dialog).toBeHidden();
  await expect(tom).toHaveCount(0);
  await expect(tess).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filters' })).toContainText('Tess Teacher'); // the active filter shows on the button

  await page.getByRole('button', { name: 'Filters' }).click();
  await dialog.getByLabel('Show').selectOption('student');
  await expect(dialog.getByRole('button', { name: 'Apply filters' })).toBeDisabled(); // pick a student first
  await dialog.getByLabel('Find a student').fill('sam');
  await page.getByRole('option', { name: /Sam Student/ }).click();
  await expect(dialog.locator('.viewing-chip')).toContainText('Sam Student'); // both the name and the email are shown
  await expect(dialog.locator('.viewing-chip')).toContainText(sam.email);
  expect((await dialog.getByRole('button', { name: `Remove ${sam.email}` }).boundingBox())!.width).toBeLessThan(40); // a small cross, not a wide button
  await dialog.getByRole('button', { name: 'Apply filters' }).click();
  await expect(tess).toHaveCount(0);
  await expect(tom).toBeVisible();

  await page.getByRole('button', { name: 'Filters' }).click();
  await dialog.getByLabel('Show').selectOption('all');
  await dialog.getByRole('button', { name: 'Apply filters' }).click();
  await expect(tess).toBeVisible();
  await expect(tom).toBeVisible();

  await page.goto(`/?teacher=${t2.id}`); // the link from the admin portal
  await expect(tess).toHaveCount(0);
  await expect(tom).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filters' })).toContainText('Tom Teacher');
  await page.goto(`/?student=${encodeURIComponent(sam.email)}&name=Sam%20Student`);
  await expect(page.getByRole('button', { name: 'Filters' })).toContainText('Sam Student');
  await expect(tom).toBeVisible();
  await expect(tess).toHaveCount(0);

  await page.getByRole('button', { name: 'Filters' }).click(); // Cancel leaves the filter as it was
  await dialog.getByLabel('Show').selectOption('all');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(tess).toHaveCount(0);
});

test('scheduling for a teacher outside their working hours asks first; "Book anyway" goes ahead', async ({ context, request }) => {
  await seed(request, 'teacher', 'Tess Teacher'); // default hours: 09:00 to 17:00 on weekdays
  await seed(request, 'student', 'Sam Student');
  const page = await openPage(context, request, await seed(request, 'admin', 'Ada Admin'));
  await openForm(page);
  await teacherSelect(page).selectOption({ label: 'Tess Teacher' });
  await page.getByRole('button', { name: 'Tutoring' }).click();
  await page.getByRole('combobox', { name: /Students/ }).fill('sam');
  await page.getByRole('option', { name: /Sam Student/ }).click();
  await page.getByLabel('Event Title *').fill('Late class');
  await page.getByLabel('Date *').fill(todayUtc());
  await page.getByLabel('Start Time *').fill('22:00');
  await page.getByRole('button', { name: 'Create & Send Invites' }).click();
  await expect(page.getByText("outside this teacher's working hours")).toBeVisible();
  await expect(page.locator('.fc-event', { hasText: 'Late class' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Book anyway' }).click();
  await expect(page.locator('.fc-event', { hasText: 'Late class' })).toBeVisible();
});

test('scheduling for a student starts from their assigned teacher', async ({ context, request }) => {
  const [tess] = [await seed(request, 'teacher', 'Tess Teacher'), await seed(request, 'teacher', 'Tom Teacher')];
  const sam = await seed(request, 'student', 'Sam Student');
  const admin = await seed(request, 'admin', 'Ada Admin');
  const put = await (await as(request, admin)).call('PUT', `/v1/admin/students/${sam.id}/teacher`, {
    teacherId: tess.id, student: { email: sam.email, name: 'Sam Student' }, teacher: { email: tess.email, name: 'Tess Teacher' },
  });
  expect(put.status).toBe(200);
  const page = await openPage(context, request, admin);
  await openForm(page);
  await expect(teacherSelect(page)).toHaveValue('');
  await page.getByRole('combobox', { name: /Students/ }).fill('sam');
  await page.getByRole('option', { name: /Sam Student/ }).click();
  await expect(teacherSelect(page)).toHaveValue(tess.id);
});

test('the students filter finds students by name or by email, and takes several at once', async ({ context, request }) => {
  const teacher = await seed(request, 'teacher', 'Tess Teacher');
  const [sam, ann, zed] = [await seed(request, 'student', 'Sam Student'), await seed(request, 'student', 'Ann Student'), await seed(request, 'student', 'Zed Student')];
  const t = await as(request, teacher);
  await t.create({ title: 'Sam class', start: at(9), durationMinutes: 60, participants: [{ email: sam.email, userId: sam.id }] });
  await t.create({ title: 'Ann class', start: at(11), durationMinutes: 60, participants: [{ email: ann.email, userId: ann.id }] });
  await t.create({ title: 'Zed class', start: at(13), durationMinutes: 60, participants: [{ email: zed.email, userId: zed.id }] });
  const page = await openPage(context, request, await seed(request, 'admin', 'Ada Admin'));
  const ev = (title: string) => page.locator('.fc-event', { hasText: title });
  await expect(ev('Zed class')).toBeVisible();

  const dialog = page.getByRole('dialog', { name: 'Calendar filters' });
  await page.getByRole('button', { name: 'Filters' }).click();
  await dialog.getByLabel('Show').selectOption('student');
  const find = dialog.getByLabel('Find a student');
  await find.fill(ann.email); // by email
  await page.getByRole('option', { name: /Ann Student/ }).click();
  await find.fill('sam stu'); // by name
  await page.getByRole('option', { name: /Sam Student/ }).click();
  await expect(dialog.locator('.viewing-chip')).toHaveCount(2);
  await find.fill('sam');
  await expect(page.getByRole('option', { name: /Sam Student/ })).toHaveCount(0); // already chosen
  await find.fill('student'); // a search that matches everyone still leaves out the two already chosen
  await expect(page.getByRole('option', { name: /Zed Student/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /Ann Student|Sam Student/ })).toHaveCount(0);
  await page.getByRole('option', { name: /Zed Student/ }).click();
  await expect(dialog.locator('.viewing-chip')).toHaveCount(3);
  await dialog.getByRole('button', { name: `Remove ${zed.email}` }).click();
  await expect(dialog.locator('.viewing-chip')).toHaveCount(2);
  await find.fill('');

  await dialog.getByRole('button', { name: 'Apply filters' }).click();
  await expect(ev('Sam class')).toBeVisible();
  await expect(ev('Ann class')).toBeVisible();
  await expect(ev('Zed class')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Filters' })).toContainText('2 students');

  await page.getByRole('button', { name: 'Filters' }).click();
  await dialog.getByRole('button', { name: `Remove ${ann.email}` }).click();
  await dialog.getByRole('button', { name: 'Apply filters' }).click();
  await expect(ev('Ann class')).toHaveCount(0);
  await expect(ev('Sam class')).toBeVisible();
});
