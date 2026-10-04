import { test, expect, type Page } from '@playwright/test';
import { cancelAll, createEvent, listEvents, seedSettings, todayUtc } from './helpers';

test.beforeAll(async ({ request }) => seedSettings(request));

test.beforeEach(async ({ page, request }) => {
  await cancelAll(request);
  await page.goto('/');
  await expect(page.locator('.fc-timeGridWeek-view')).toBeVisible();
});

const create = (page: Page) => page.getByRole('button', { name: 'Create & Send Invites' });
const view = (page: Page, name: 'Day' | 'Week' | 'Month') => page.getByRole('button', { name, exact: true });
const field = {
  title: (p: Page) => p.getByLabel('Event Title *'),
  date: (p: Page) => p.getByLabel('Date *'),
  start: (p: Page) => p.getByLabel('Start Time *'),
  email: (p: Page) => p.getByLabel('Student Email *'),
  duration: (p: Page, m: number) => p.getByRole('button', { name: `${m}m`, exact: true }),
};

async function fillForm(page: Page, v: { title: string; time: string; email?: string; duration?: number }) {
  await field.title(page).fill(v.title);
  await field.date(page).fill(todayUtc());
  await field.start(page).fill(v.time);
  if (v.duration) await field.duration(page, v.duration).click();
  await field.email(page).fill(v.email ?? 'student@example.com');
}

/** Drags between two time slots in today's column of the week view. */
async function dragAcrossToday(page: Page, fromTime: string, toTime: string) {
  const col = page.locator('.fc-timegrid-col.fc-day-today');
  const from = page.locator(`.fc-timegrid-slot-lane[data-time="${fromTime}"]`);
  const to = page.locator(`.fc-timegrid-slot-lane[data-time="${toTime}"]`);
  await from.scrollIntoViewIfNeeded();
  const [c, a, b] = [await col.boundingBox(), await from.boundingBox(), await to.boundingBox()];
  const x = c!.x + c!.width / 2;
  await page.mouse.move(x, a!.y + 3);
  await page.mouse.down();
  await page.mouse.move(x, (a!.y + b!.y) / 2, { steps: 5 });
  await page.mouse.move(x, b!.y + 3, { steps: 5 });
  await page.mouse.up();
}

test.describe('layout', () => {
  test('shows the utility bar, week grid and New Lesson drawer from the design', async ({ page }) => {
    await expect(page.getByText('Google not connected')).toBeVisible();
    await expect(page.getByText('Utilization:')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Quick Add Lesson' })).toBeVisible();
    await expect(page.locator('.fc-col-header-cell')).toHaveCount(7);
    await expect(page.locator('.fc-day-today .dh-num')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'New Lesson' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Session Type' })).toBeVisible();
    await expect(field.duration(page, 60)).toHaveAttribute('aria-pressed', 'true');
  });

  test('date range, navigation, views and timezone sit in a row directly above the weekday header', async ({ page }) => {
    const toolbar = page.locator('.cal-toolbar');
    for (const name of ['Previous', 'Today', 'Next', 'Day', 'Week', 'Month']) {
      await expect(toolbar.getByRole('button', { name, exact: true })).toBeVisible();
    }
    await expect(toolbar.locator('.range-title')).not.toBeEmpty();
    await expect(toolbar.locator('.tz-chip')).toHaveText(/^GMT[+-−]?\d/i);

    const [bar, header, drawer, utility] = await Promise.all(
      ['.cal-toolbar', '.fc-col-header', 'aside', '.utility'].map((s) => page.locator(s).first().boundingBox()),
    );
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(header!.y + 1);
    expect(header!.y - (bar!.y + bar!.height)).toBeLessThan(4);
    expect(bar!.y).toBeGreaterThanOrEqual(utility!.y + utility!.height - 1);
    expect(bar!.x + bar!.width).toBeLessThanOrEqual(drawer!.x + 1);
    await expect(page.locator('.utility').getByRole('button', { name: 'Today', exact: true })).toHaveCount(0);
  });

  test("today's date is white on the blue circle, including on a weekend", async ({ page }) => {
    const num = page.locator('.fc-col-header-cell.fc-day-today .dh-num');
    await expect(num).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(num).toHaveCSS('background-color', 'rgb(0, 91, 191)');
    await expect(page.locator('.fc-col-header-cell.fc-day-today .dh-dow')).toHaveCSS('color', 'rgb(0, 91, 191)');
    // Other dates keep their normal colours; weekend dates stay muted.
    await expect(page.locator('.fc-col-header-cell:not(.fc-day-today) .dh-num').first()).not.toHaveCSS('color', 'rgb(255, 255, 255)');
  });

  test('switches between day, week and month views', async ({ page }) => {
    await view(page, 'Month').click();
    await expect(page.locator('.fc-dayGridMonth-view')).toBeVisible();
    await view(page, 'Day').click();
    await expect(page.locator('.fc-timeGridDay-view')).toBeVisible();
    await view(page, 'Week').click();
    await expect(page.locator('.fc-timeGridWeek-view')).toBeVisible();
  });

  test('the drawer closes and Quick Add Lesson reopens it', async ({ page }) => {
    await page.getByRole('button', { name: 'Close panel' }).click();
    await expect(page.getByRole('heading', { name: 'New Lesson' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Quick Add Lesson' }).click();
    await expect(page.getByRole('heading', { name: 'New Lesson' })).toBeVisible();
  });

  test('the utility bar summarises booked lessons for the week', async ({ page, request }) => {
    await createEvent(request, { title: 'Algebra', start: `${todayUtc()}T09:00:00Z`, durationMinutes: 120, category: 'tutoring' });
    await createEvent(request, { title: 'Open hours', start: `${todayUtc()}T13:00:00Z`, durationMinutes: 60, category: 'office_hours' });
    await page.reload();

    await expect(page.getByText('• 2 sessions booked this week')).toBeVisible();
    await expect(page.getByText('2h Tutoring')).toBeVisible();
    await expect(page.getByText('1h Office hours')).toBeVisible();
    await expect(page.getByText('3 hrs')).toBeVisible();
  });
});

test.describe('booking form', () => {
  test('Create & Send Invites stays disabled until every required field is valid', async ({ page }) => {
    const missing = page.getByTestId('missing');

    await expect(create(page)).toBeDisabled();
    await expect(missing).toContainText('a title');

    await field.title(page).fill('Algebra');
    await expect(create(page)).toBeDisabled();
    await expect(missing).toContainText('at least one student email');

    await field.email(page).fill('not-an-email');
    await expect(create(page)).toBeDisabled();
    await expect(missing).toContainText('valid emails (check: not-an-email)');

    await field.email(page).fill('student@example.com, tutor@example.com');
    await expect(create(page)).toBeEnabled();
    await expect(missing).toHaveCount(0);

    await field.title(page).fill('   ');
    await expect(create(page)).toBeDisabled();
    await field.title(page).fill('Algebra');
    await expect(create(page)).toBeEnabled();

    await field.date(page).fill('');
    await expect(create(page)).toBeDisabled();
    await expect(missing).toContainText('a date');
    await field.date(page).fill(todayUtc());
    await field.start(page).fill('');
    await expect(create(page)).toBeDisabled();
    await expect(missing).toContainText('a start time');
  });

  test('books a lesson and shows it on the calendar', async ({ page, request }) => {
    await fillForm(page, { title: 'Booked from UI', time: '09:00', email: 'Student@Example.com, tutor@example.com', duration: 90 });
    await create(page).click();

    await expect(page.locator('.fc-event', { hasText: 'Booked from UI' })).toBeVisible();
    await expect(field.title(page)).toHaveValue('');
    const saved = (await listEvents(request)).find((e) => e.title === 'Booked from UI');
    expect(saved?.start).toBe(`${todayUtc()}T09:00:00.000Z`);
    expect(saved?.end).toBe(`${todayUtc()}T10:30:00.000Z`);
    expect(saved?.attendees).toEqual(['student@example.com', 'tutor@example.com']);
    expect(saved?.category).toBe('tutoring');
  });

  test('the chosen session type is saved and styles the card', async ({ page, request }) => {
    await fillForm(page, { title: 'Drop-in help', time: '12:00' });
    await page.getByRole('button', { name: 'Office Hr' }).click();
    await create(page).click();

    const card = page.locator('.fc-event.cat-office_hours', { hasText: 'Drop-in help' });
    await expect(card).toBeVisible();
    await expect(card).toContainText('OFFICE HOURS');
    expect((await listEvents(request)).find((e) => e.title === 'Drop-in help')?.category).toBe('office_hours');
  });

  test('an overlapping booking offers Book anyway', async ({ page, request }) => {
    await createEvent(request, { title: 'First', start: `${todayUtc()}T14:00:00Z`, durationMinutes: 60 });
    await page.reload();

    await fillForm(page, { title: 'Second', time: '14:30' });
    await create(page).click();
    await expect(page.getByText(/overlaps existing events/i)).toBeVisible();
    expect((await listEvents(request)).map((e) => e.title)).toEqual(['First']);

    await page.getByRole('button', { name: 'Book anyway' }).click();
    await expect(page.locator('.fc-event', { hasText: 'Second' })).toBeVisible();
    expect((await listEvents(request)).map((e) => e.title).sort()).toEqual(['First', 'Second']);
  });

  test('shows the student card with their booking count', async ({ page, request }) => {
    await createEvent(request, { title: 'Past session', start: `${todayUtc()}T08:00:00Z`, durationMinutes: 30, attendees: ['liam.turner@student.edu'] });
    await field.email(page).fill('liam.turner@student.edu');

    const card = page.locator('.student-card');
    await expect(card).toContainText('Liam Turner (Client)');
    await expect(card).toContainText('1 session booked');
    await expect(card.locator('.avatar')).toHaveText('LT');
  });

  test('the Meet switch toggles and the Google sync switch reflects the connection', async ({ page }) => {
    const meet = page.getByRole('switch', { name: 'Add Google Meet' });
    await expect(meet).toHaveAttribute('aria-checked', 'true');
    await meet.click();
    await expect(meet).toHaveAttribute('aria-checked', 'false');
    const sync = page.getByRole('switch', { name: 'Sync to Google Calendar' });
    await expect(sync).toBeDisabled();
    await expect(sync).toHaveAttribute('aria-checked', 'false');
  });
});

test.describe('calendar interactions', () => {
  test('clicking a date in month view selects it without reloading the calendar', async ({ page, request }) => {
    await createEvent(request, { title: 'Existing', start: `${todayUtc()}T10:00:00Z`, durationMinutes: 60 });
    await Promise.all([page.waitForResponse((r) => r.url().includes('/api/availability')), view(page, 'Month').click()]);
    await expect(page.locator('.fc-event', { hasText: 'Existing' })).toBeVisible();
    await field.title(page).fill('Typed before clicking');

    const reloads: string[] = [];
    page.on('request', (r) => {
      if (/\/api\/(events|availability)/.test(r.url())) reloads.push(r.url());
    });

    const cell = page.locator('.fc-daygrid-day:not(.fc-day-today):not(.fc-day-other)').nth(5);
    const date = await cell.getAttribute('data-date');
    await cell.click();
    await expect(field.date(page)).toHaveValue(date!);
    await page.waitForTimeout(1000);

    expect(reloads.filter((u) => !u.includes('attendee='))).toEqual([]);
    await expect(field.title(page)).toHaveValue('Typed before clicking');
    await expect(page.locator('.fc-event', { hasText: 'Existing' })).toBeVisible();
  });

  test('dragging across the week grid fills date, start and duration', async ({ page }) => {
    await dragAcrossToday(page, '10:00:00', '10:30:00');
    await expect(field.date(page)).toHaveValue(todayUtc());
    await expect(field.start(page)).toHaveValue('10:00');
    await expect(field.duration(page, 60)).toHaveAttribute('aria-pressed', 'true');
  });

  test('clicking a lesson shows its details and Cancel lesson removes it', async ({ page, request }) => {
    await createEvent(request, { title: 'Details test', start: `${todayUtc()}T11:00:00Z`, durationMinutes: 60, attendees: ['kid@example.com'] });
    await page.reload();

    await page.locator('.fc-event', { hasText: 'Details test' }).click();
    const panel = page.getByRole('complementary', { name: 'Lesson details' });
    await expect(panel.getByText('kid@example.com')).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await panel.getByRole('button', { name: 'Cancel lesson' }).click();
    await expect(page.locator('.fc-event', { hasText: 'Details test' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'New Lesson' })).toBeVisible();
    expect(await listEvents(request)).toEqual([]);
  });

  test('dragging a lesson reschedules it', async ({ page, request }) => {
    await createEvent(request, { title: 'Drag me', start: `${todayUtc()}T10:00:00Z`, durationMinutes: 60 });
    await page.reload();

    const ev = page.locator('.fc-event', { hasText: 'Drag me' });
    const target = page.locator('.fc-timegrid-slot-lane[data-time="14:00:00"]');
    await ev.scrollIntoViewIfNeeded();
    const [e, t] = [await ev.boundingBox(), await target.boundingBox()];
    const x = e!.x + e!.width / 2;
    await page.mouse.move(x, e!.y + 4);
    await page.mouse.down();
    await page.mouse.move(x, e!.y + 40, { steps: 5 });
    await page.mouse.move(x, t!.y + 4, { steps: 10 });
    await page.mouse.up();

    await expect.poll(async () => (await listEvents(request)).find((x) => x.title === 'Drag me')?.start).toBe(`${todayUtc()}T14:00:00.000Z`);
    const moved = (await listEvents(request)).find((x) => x.title === 'Drag me');
    expect(moved?.end).toBe(`${todayUtc()}T15:00:00.000Z`);
  });

  test('free-time shading can be switched off', async ({ page }) => {
    const free = page.locator('.fc-bg-event.free');
    await expect(free.first()).toBeVisible();
    await page.getByLabel('Shade free times for this duration').uncheck();
    await expect(free).toHaveCount(0);
    await page.getByLabel('Shade free times for this duration').check();
    await expect(free.first()).toBeVisible();
  });
});
