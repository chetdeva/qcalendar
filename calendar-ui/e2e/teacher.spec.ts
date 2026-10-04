import { test, expect, type Page } from '@playwright/test';
import { at, calendarAs, openAllDay, openPage, resetBackend, seed, tokenFor, todayUtc, type User } from './helpers';

test.beforeEach(async ({ request }) => resetBackend(request));

const field = {
  title: (p: Page) => p.getByLabel('Event Title *'),
  date: (p: Page) => p.getByLabel('Date *'),
  start: (p: Page) => p.getByLabel('Start Time *'),
  students: (p: Page) => p.getByRole('combobox', { name: /Students/ }),
  create: (p: Page) => p.getByRole('button', { name: 'Create & Send Invites' }),
  duration: (p: Page, m: number) => p.getByRole('button', { name: `${m}m`, exact: true }),
};
const options = (p: Page) => p.getByRole('listbox', { name: 'Matching students' }).getByRole('option');
const chips = (p: Page) => p.getByRole('list', { name: 'Selected students' }).getByRole('listitem');

async function pickStudent(page: Page, query: string, name: RegExp) {
  await field.students(page).fill(query);
  await page.getByRole('option', { name }).click();
}
async function setWhen(page: Page, hour: string) {
  await field.date(page).fill(todayUtc());
  await field.start(page).fill(hour);
}
const mine = async (request: any, teacher: User) => calendarAs(request, await tokenFor(request, teacher));

test.describe('creating a class', () => {
  test('search for a student, invite someone who has not signed up, and create a group class', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const ann = await seed(request, 'student', 'Ann Student');
    await seed(request, 'student', 'Ben Student');
    const page = await openPage(context, request, teacher);

    await field.title(page).fill('AP Calculus group');
    await pickStudent(page, 'ann', /Ann Student/);
    await field.students(page).fill('carl@new.example.test');
    await page.getByRole('option', { name: /Invite carl@new.example.test/ }).click();
    await expect(chips(page)).toHaveCount(2);
    await expect(chips(page).nth(1)).toContainText('invite');
    await setWhen(page, '10:00');
    await field.create(page).click();

    const card = page.locator('.fc-event', { hasText: 'AP Calculus group' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Ann Student +1');
    await expect(field.title(page)).toHaveValue('');
    await expect(chips(page)).toHaveCount(0);

    const [ev] = await (await mine(request, teacher)).list();
    expect(ev.ownerId).toBe(teacher.id);
    expect(ev.participants.map((p: any) => p.email).sort()).toEqual([ann.email, 'carl@new.example.test']);
    expect(ev.participants.find((p: any) => p.email === ann.email).userId).toBe(ann.id);
    expect(ev.participants.every((p: any) => p.status === 'invited')).toBe(true);
    expect(ev.meetingUrl).toMatch(/^https:\/\/meet\.example\.test\/sync-/);
  });

  test('the picker finds students only, by name or email, hides ones already chosen, and works from the keyboard', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    await seed(request, 'student', 'Ann Student');
    await seed(request, 'student', 'Ben Bright');
    await seed(request, 'teacher', 'Annabel Teacher');
    await seed(request, 'admin', 'Ann Admin');
    const page = await openPage(context, request, teacher);

    await field.students(page).fill('ann');
    await expect(options(page)).toHaveCount(1);
    await expect(options(page).first()).toContainText('Ann Student');
    await field.students(page).fill('bright');
    await expect(options(page).first()).toContainText('Ben Bright');
    await field.students(page).fill('zzz-nobody');
    await expect(page.getByText('No student found')).toBeVisible();

    await field.students(page).fill('ben');
    await field.students(page).press('Enter');
    await expect(chips(page)).toHaveCount(1);
    await expect(chips(page).first()).toContainText('Ben Bright');
    await field.students(page).fill('ben');
    await expect(page.getByText('No student found')).toBeVisible(); // already chosen, so not offered again
    await page.getByRole('button', { name: /^Remove ben/ }).click();
    await expect(chips(page)).toHaveCount(0);

    await field.students(page).fill('not-an-email');
    await expect(page.getByRole('option', { name: /Invite/ })).toHaveCount(0);
  });

  test('Create stays disabled until the form is valid; students are only required for tutoring', async ({ context, request }) => {
    await seed(request, 'student', 'Ann Student');
    const page = await openPage(context, request, await seed(request, 'teacher', 'Tess Teacher'));
    const missing = page.getByTestId('missing');
    await expect(field.create(page)).toBeDisabled();
    await expect(missing).toContainText('a title');
    await expect(missing).toContainText('at least one student');

    await field.title(page).fill('Algebra');
    await expect(field.create(page)).toBeDisabled();
    await expect(missing).toContainText('at least one student');
    await pickStudent(page, 'ann', /Ann Student/);
    await expect(field.create(page)).toBeEnabled();
    await expect(missing).toHaveCount(0);

    await page.getByRole('button', { name: 'Remove' }).first().click();
    await expect(field.create(page)).toBeDisabled();
    await page.getByRole('button', { name: 'Personal' }).click();
    await expect(field.create(page)).toBeEnabled(); // a personal block needs no students
    await page.getByRole('button', { name: 'Tutoring' }).click();
    await expect(field.create(page)).toBeDisabled();
    await field.date(page).fill('');
    await page.getByRole('button', { name: 'Office Hr' }).click();
    await expect(missing).toContainText('a date');
    await field.date(page).fill(todayUtc());
    await field.title(page).fill('   ');
    await expect(missing).toContainText('a title');
  });

  test('office hours and personal blocks can be created with no students, and get their own card style', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const page = await openPage(context, request, teacher);
    await field.title(page).fill('Drop-in help');
    await page.getByRole('button', { name: 'Office Hr' }).click();
    await setWhen(page, '12:00');
    await field.create(page).click();
    const card = page.locator('.fc-event.cat-office_hours', { hasText: 'Drop-in help' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('OFFICE HOURS');
    expect((await (await mine(request, teacher)).list())[0]).toMatchObject({ category: 'office_hours', participantCount: 0 });
  });

  test('the video-meeting switch controls whether the class gets a link', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const page = await openPage(context, request, teacher);
    await page.getByRole('button', { name: 'Personal' }).click();
    await field.title(page).fill('With link');
    await setWhen(page, '09:00');
    await field.create(page).click();
    await expect(page.locator('.fc-event', { hasText: 'With link' })).toBeVisible();

    await page.getByRole('switch', { name: 'Add video meeting' }).click();
    await field.title(page).fill('Without link');
    await setWhen(page, '11:00');
    await field.create(page).click();
    await expect(page.locator('.fc-event', { hasText: 'Without link' })).toBeVisible();

    const evs = await (await mine(request, teacher)).list();
    expect(evs.find((e) => e.title === 'With link').meetingUrl).toMatch(/^https:\/\/meet\.example\.test\/sync-/);
    expect(evs.find((e) => e.title === 'Without link').meetingUrl).toBeNull();
  });
});

test.describe('clashes', () => {
  test('overlapping the teacher\'s own class asks first, and "Book anyway" books it', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    await (await mine(request, teacher)).create({ title: 'First', start: at(10), durationMinutes: 60 });
    const page = await openPage(context, request, teacher);
    await page.getByRole('button', { name: 'Personal' }).click();
    await field.title(page).fill('Second');
    await setWhen(page, '10:30');
    await field.create(page).click();
    await expect(page.locator('.err')).toContainText('overlaps another class');
    expect(await (await mine(request, teacher)).list()).toHaveLength(1);
    await page.getByRole('button', { name: 'Book anyway' }).click();
    await expect(page.locator('.fc-event', { hasText: 'Second' })).toBeVisible();
    expect(await (await mine(request, teacher)).list()).toHaveLength(2);
  });

  test('a student already in another teacher\'s class at that time is named, without revealing the other class', async ({ context, request }) => {
    const [t1, t2] = [await seed(request, 'teacher', 'Tess Teacher'), await seed(request, 'teacher', 'Tom Teacher')];
    const busy = await seed(request, 'student', 'Busy Student');
    await (await mine(request, t2)).create({ title: 'Secret other class', start: at(10), durationMinutes: 60, participants: [{ email: busy.email }] });
    const page = await openPage(context, request, t1);
    await field.title(page).fill('Mine');
    await pickStudent(page, 'busy', /Busy Student/);
    await setWhen(page, '10:00');
    await field.create(page).click();
    await expect(page.locator('.err')).toContainText(`Already in another class at this time: ${busy.email}`);
    await expect(page.getByText('Secret other class')).toHaveCount(0);
    await page.getByRole('button', { name: 'Book anyway' }).click();
    await expect(page.locator('.fc-event', { hasText: 'Mine' })).toBeVisible();
  });
});

test.describe('a class in the calendar', () => {
  test('the roster shows who accepted, declined or has not answered', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const [a, b, c] = [await seed(request, 'student', 'Ann Student'), await seed(request, 'student', 'Ben Student'), await seed(request, 'student', 'Cy Student')];
    const t = await mine(request, teacher);
    const ev = await t.create({ title: 'Group chem', start: at(10), durationMinutes: 60, participants: [a, b, c].map((s) => ({ email: s.email, userId: s.id })) });
    await calendarAs(request, await tokenFor(request, a)).call('POST', `/v1/events/${ev.id}/respond`, { response: 'accepted' });
    await calendarAs(request, await tokenFor(request, b)).call('POST', `/v1/events/${ev.id}/respond`, { response: 'declined' });

    const page = await openPage(context, request, teacher);
    await page.locator('.fc-event', { hasText: 'Group chem' }).click();
    const drawer = page.getByRole('complementary', { name: 'Lesson details' });
    await expect(drawer).toContainText('Students (3)');
    await expect(drawer).toContainText('1 accepted · 1 declined · 1 waiting');
    const row = (name: string) => drawer.getByRole('list', { name: 'Students in this class' }).getByRole('listitem').filter({ hasText: name });
    await expect(row('Ann Student')).toContainText('Accepted');
    await expect(row('Ben Student')).toContainText('Declined');
    await expect(row('Cy Student')).toContainText('Waiting');
    await expect(drawer.getByRole('link', { name: 'Join video meeting' })).toHaveCount(0); // none was requested
  });

  test('remove a student and add another, with the roster updating', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const [a, b] = [await seed(request, 'student', 'Ann Student'), await seed(request, 'student', 'Ben Student')];
    const t = await mine(request, teacher);
    await t.create({ title: 'Roster', start: at(10), durationMinutes: 60, participants: [{ email: a.email, userId: a.id }] });
    const page = await openPage(context, request, teacher);
    await page.locator('.fc-event', { hasText: 'Roster' }).click();
    const drawer = page.getByRole('complementary', { name: 'Lesson details' });

    await drawer.getByRole('combobox', { name: /Add students/ }).fill('ben');
    await page.getByRole('option', { name: /Ben Student/ }).click();
    await drawer.getByRole('button', { name: 'Add to class' }).click();
    await expect(drawer.getByRole('listitem').filter({ hasText: 'Ben Student' })).toBeVisible();
    await expect(drawer).toContainText('Students (2)');

    await drawer.getByRole('button', { name: `Remove ${a.email}` }).click();
    await expect(drawer.getByRole('listitem').filter({ hasText: 'Ann Student' })).toHaveCount(0);
    await expect(drawer).toContainText('Students (1)');
    expect((await t.list())[0].participants.map((p: any) => p.email)).toEqual([b.email]);
  });

  test('adding a student who is busy elsewhere asks first', async ({ context, request }) => {
    const [t1, t2] = [await seed(request, 'teacher', 'Tess Teacher'), await seed(request, 'teacher', 'Tom Teacher')];
    const busy = await seed(request, 'student', 'Busy Student');
    await (await mine(request, t2)).create({ title: 'Elsewhere', start: at(10), durationMinutes: 60, participants: [{ email: busy.email }] });
    await (await mine(request, t1)).create({ title: 'Mine', start: at(10), durationMinutes: 60 });
    const page = await openPage(context, request, t1);
    await page.locator('.fc-event', { hasText: 'Mine' }).click();
    const drawer = page.getByRole('complementary', { name: 'Lesson details' });
    const roster = drawer.getByRole('list', { name: 'Students in this class' });
    await drawer.getByRole('combobox', { name: /Add students/ }).fill('busy');
    await page.getByRole('option', { name: /Busy Student/ }).click();
    await drawer.getByRole('button', { name: 'Add to class' }).click();
    await expect(drawer.locator('.err')).toContainText(busy.email);
    await expect(roster.getByRole('listitem').filter({ hasText: 'Busy Student' })).toHaveCount(0);
    await drawer.getByRole('button', { name: 'Add anyway' }).click();
    await expect(roster.getByRole('listitem').filter({ hasText: 'Busy Student' })).toBeVisible();
  });

  test('cancelling removes the class from the calendar and keeps the record', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const t = await mine(request, teacher);
    const ev = await t.create({ title: 'To cancel', start: at(10), durationMinutes: 60 });
    const page = await openPage(context, request, teacher);
    await page.locator('.fc-event', { hasText: 'To cancel' }).click();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('complementary', { name: 'Lesson details' }).getByRole('button', { name: 'Cancel lesson' }).click();
    await expect(page.locator('.fc-event', { hasText: 'To cancel' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'New Lesson' })).toBeVisible();
    expect((await t.call('GET', `/v1/events/${ev.id}`)).body.status).toBe('cancelled');
  });

  test('dragging a class to another time moves it and asks every student to answer again', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const s = await seed(request, 'student', 'Ann Student');
    const t = await mine(request, teacher);
    const ev = await t.create({ title: 'Drag me', start: at(10), durationMinutes: 60, participants: [{ email: s.email, userId: s.id }] });
    await calendarAs(request, await tokenFor(request, s)).call('POST', `/v1/events/${ev.id}/respond`, { response: 'accepted' });

    const page = await openPage(context, request, teacher);
    const card = page.locator('.fc-event', { hasText: 'Drag me' });
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
    const moved = (await t.call('GET', `/v1/events/${ev.id}`)).body;
    expect(moved.end).toBe(`${todayUtc()}T15:00:00.000Z`);
    expect(moved.participants[0].status).toBe('invited');
  });
});

test.describe('a teacher\'s calendar is their own', () => {
  test('another teacher\'s classes are neither shown nor reachable', async ({ context, request }) => {
    const [t1, t2] = [await seed(request, 'teacher', 'Tess Teacher'), await seed(request, 'teacher', 'Tom Teacher')];
    const theirs = await (await mine(request, t1)).create({ title: 'Tess private class', start: at(10), durationMinutes: 60 });
    await (await mine(request, t2)).create({ title: 'Tom class', start: at(10), durationMinutes: 60 });
    const page = await openPage(context, request, t2);
    await expect(page.locator('.fc-event', { hasText: 'Tom class' })).toBeVisible();
    await expect(page.locator('.fc-event', { hasText: 'Tess private class' })).toHaveCount(0);
    expect((await page.request.get(`/api/events/${theirs.id}`)).status()).toBe(404);
    expect((await page.request.fetch(`/api/events/${theirs.id}`, { method: 'PATCH', data: { title: 'hijacked' } })).status()).toBe(404);
    expect((await page.request.fetch(`/api/events/${theirs.id}`, { method: 'DELETE' })).status()).toBe(404);
    expect((await calendarAs(request, await tokenFor(request, t1)).call('GET', `/v1/events/${theirs.id}`)).body.title).toBe('Tess private class');
  });
});

test.describe('the top bar and free times', () => {
  test('counts this week\'s classes and the hours by type', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    await openAllDay(request, teacher);
    const t = await mine(request, teacher);
    await t.create({ title: 'A', start: at(9), durationMinutes: 120, category: 'tutoring' });
    await t.create({ title: 'B', start: at(13), durationMinutes: 60, category: 'office_hours' });
    const page = await openPage(context, request, teacher);
    await expect(page.getByText('• 2 classes this week')).toBeVisible();
    await expect(page.getByText('2h Tutoring')).toBeVisible();
    await expect(page.getByText('1h Office hours')).toBeVisible();
    await expect(page.getByText('3 hrs')).toBeVisible();
  });

  test('free times are shaded from the teacher\'s own hours, and can be switched off', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    await openAllDay(request, teacher);
    const page = await openPage(context, request, teacher);
    const free = page.locator('.fc-bg-event.free');
    await expect(free.first()).toBeVisible();
    await page.getByLabel('Shade free times for this duration').uncheck();
    await expect(free).toHaveCount(0);
    await page.getByLabel('Shade free times for this duration').check();
    await expect(free.first()).toBeVisible();
  });
});

test.describe('the calendar itself', () => {
  test('switching views, the toolbar above the grid, and dragging across it to pre-fill the form', async ({ context, request }) => {
    const page = await openPage(context, request, await seed(request, 'teacher', 'Tess Teacher'));
    const bar = await page.locator('.cal-toolbar').boundingBox();
    const header = await page.locator('.fc-col-header').boundingBox();
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(header!.y + 1);
    await expect(page.locator('.cal-toolbar .tz-chip')).toHaveText(/^GMT/);

    await page.getByRole('button', { name: 'Month', exact: true }).click();
    await expect(page.locator('.fc-dayGridMonth-view')).toBeVisible();
    await page.getByRole('button', { name: 'Week', exact: true }).click();

    const col = page.locator('.fc-timegrid-col.fc-day-today');
    const from = page.locator('.fc-timegrid-slot-lane[data-time="10:00:00"]');
    const to = page.locator('.fc-timegrid-slot-lane[data-time="10:30:00"]');
    await from.scrollIntoViewIfNeeded();
    const [c, a, b] = [await col.boundingBox(), await from.boundingBox(), await to.boundingBox()];
    const x = c!.x + c!.width / 2;
    await page.mouse.move(x, a!.y + 3);
    await page.mouse.down();
    await page.mouse.move(x, (a!.y + b!.y) / 2, { steps: 5 });
    await page.mouse.move(x, b!.y + 3, { steps: 5 });
    await page.mouse.up();
    await expect(field.date(page)).toHaveValue(todayUtc());
    await expect(field.start(page)).toHaveValue('10:00');
    await expect(field.duration(page, 60)).toHaveAttribute('aria-pressed', 'true');
  });
});
