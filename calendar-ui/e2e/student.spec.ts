import { test, expect, type Page } from '@playwright/test';
import { calendarAs, inDays, openPage, resetBackend, seed, tokenFor, todayUtc, type User } from './helpers';

test.beforeEach(async ({ request }) => resetBackend(request));

const as = async (request: any, u: User) => calendarAs(request, await tokenFor(request, u));
const panel = (p: Page) => p.getByRole('complementary', { name: 'My classes' });
const card = (p: Page, title: string) => panel(p).getByRole('article', { name: new RegExp(`^${title},`) });

async function classFor(request: any, teacher: User, title: string, students: User[], over: Record<string, unknown> = {}) {
  return (await as(request, teacher)).create({
    title, start: inDays(1, 10), durationMinutes: 60, participants: students.map((s) => ({ email: s.email, userId: s.id })), ...over,
  });
}

test.describe('My classes', () => {
  test('shows only my classes, those waiting for an answer first', async ({ context, request }) => {
    const [t1, t2] = [await seed(request, 'teacher', 'Tess Teacher'), await seed(request, 'teacher', 'Tom Teacher')];
    const [me, other] = [await seed(request, 'student', 'Mia Student'), await seed(request, 'student', 'Olly Other')];
    await classFor(request, t1, 'Algebra', [me]);
    const answered = await classFor(request, t2, 'Chemistry', [me], { start: inDays(2, 14) });
    await classFor(request, t1, 'Not mine', [other], { start: inDays(3, 9) });
    await (await as(request, me)).call('POST', `/v1/events/${answered.id}/respond`, { response: 'accepted' });

    const page = await openPage(context, request, me);
    await expect(page.getByText('• 2 upcoming · 1 to answer')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Needs your answer' }).getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Needs your answer' })).toContainText('Algebra');
    await expect(page.getByRole('region', { name: 'Upcoming' }).getByRole('article')).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'Upcoming' })).toContainText('Chemistry');
    await expect(panel(page)).not.toContainText('Not mine');
    await expect(card(page, 'Algebra')).toContainText('With Tess Teacher');
    await expect(card(page, 'Algebra')).toContainText('Waiting');
    await expect(card(page, 'Chemistry')).toContainText('Accepted');
  });

  test('accepting and declining are saved, can be changed, and the teacher sees them', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const me = await seed(request, 'student', 'Mia Student');
    const ev = await classFor(request, teacher, 'Algebra', [me]);
    const page = await openPage(context, request, me);
    const answer = (name: string) => card(page, 'Algebra').getByRole('button', { name, exact: true });
    const teacherView = async () => (await (await as(request, teacher)).call('GET', `/v1/events/${ev.id}`)).body.participants[0].status;

    await answer('Accept').click();
    await expect(card(page, 'Algebra')).toContainText('Accepted');
    await expect(answer('Accept')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('region', { name: 'Upcoming' })).toContainText('Algebra'); // moved out of "needs your answer"
    await expect(page.getByText('• 1 upcoming')).toBeVisible();
    expect(await teacherView()).toBe('accepted');

    await answer('Decline').click();
    await expect(card(page, 'Algebra')).toContainText('Declined');
    await expect(answer('Decline')).toHaveAttribute('aria-pressed', 'true');
    await expect(answer('Accept')).toHaveAttribute('aria-pressed', 'false');
    expect(await teacherView()).toBe('declined');

    await page.reload();
    await expect(card(page, 'Algebra')).toContainText('Declined');
    await answer('Accept').click();
    await expect(card(page, 'Algebra')).toContainText('Accepted');
    expect(await teacherView()).toBe('accepted');
  });

  test('a rescheduled class asks again, and a cancelled one disappears', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const me = await seed(request, 'student', 'Mia Student');
    const t = await as(request, teacher);
    const ev = await classFor(request, teacher, 'Algebra', [me]);
    const mine = await as(request, me);
    await mine.call('POST', `/v1/events/${ev.id}/respond`, { response: 'accepted' });

    const page = await openPage(context, request, me);
    await expect(card(page, 'Algebra')).toContainText('Accepted');
    await t.call('PATCH', `/v1/events/${ev.id}`, { start: inDays(1, 15) });
    await page.reload();
    await expect(card(page, 'Algebra')).toContainText('Waiting');
    await expect(page.getByRole('region', { name: 'Needs your answer' })).toContainText('Algebra');

    await t.call('DELETE', `/v1/events/${ev.id}`);
    await page.reload();
    await expect(page.getByTestId('no-classes')).toBeVisible();
    await expect(panel(page)).not.toContainText('Algebra');
  });

  test('answering a class the teacher just cancelled explains what happened', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const me = await seed(request, 'student', 'Mia Student');
    const ev = await classFor(request, teacher, 'Algebra', [me]);
    const page = await openPage(context, request, me);
    await expect(card(page, 'Algebra')).toBeVisible();
    await (await as(request, teacher)).call('DELETE', `/v1/events/${ev.id}`);
    await card(page, 'Algebra').getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(panel(page).getByRole('alert')).toContainText('cancelled');
  });

  test('past classes are not listed, and an empty list says what to expect', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const me = await seed(request, 'student', 'Mia Student');
    await classFor(request, teacher, 'Yesterday\'s class', [me], { start: inDays(-1, 10) });
    const page = await openPage(context, request, me);
    await expect(page.getByTestId('no-classes')).toContainText('No upcoming classes');
    await expect(panel(page)).not.toContainText('Yesterday');
  });

  test('a class shows its video link and notes', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const me = await seed(request, 'student', 'Mia Student');
    await classFor(request, teacher, 'Algebra', [me], { meet: true, description: 'Bring your textbook' });
    const page = await openPage(context, request, me);
    const link = card(page, 'Algebra').getByRole('link', { name: 'Join video meeting' });
    await expect(link).toHaveAttribute('href', /^https:\/\/meet\.example\.test\/sync-/);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(card(page, 'Algebra')).toContainText('Bring your textbook');
  });

  test('classes invited by email before sign-up show up once the student signs in with that address', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    await (await as(request, teacher)).create({ title: 'Welcome class', start: inDays(1, 10), durationMinutes: 60, participants: [{ email: 'new.student@example.test' }] });
    const me = await seed(request, 'student', 'New Student', 'new.student@example.test');
    const page = await openPage(context, request, me);
    await expect(card(page, 'Welcome class')).toBeVisible();
    await card(page, 'Welcome class').getByRole('button', { name: 'Accept', exact: true }).click();
    await expect(card(page, 'Welcome class')).toContainText('Accepted');
  });
});

test.describe('what a student must not see or do', () => {
  test('in a group class, other students\' names and emails appear nowhere', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const [me, b, c] = [await seed(request, 'student', 'Mia Student'), await seed(request, 'student', 'Ben Quillfeather'), await seed(request, 'student', 'Cy Zorbleton')];
    await classFor(request, teacher, 'Group class', [me, b, c]);
    const page = await openPage(context, request, me);
    await expect(card(page, 'Group class')).toContainText('3 students');
    const everything = (await page.content()).toLowerCase();
    for (const other of [b, c]) {
      expect(everything).not.toContain(other.email.toLowerCase());
      expect(everything).not.toContain(other.name.split(' ')[1].toLowerCase());
    }
    const api = await (await page.request.get('/api/events')).json();
    expect(api.events[0].participants).toHaveLength(1);
    expect(api.events[0].participants[0].email).toBe(me.email);
    expect(api.events[0].participantCount).toBe(3);
  });

  test('the calendar is read-only: dragging neither creates nor moves anything', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const me = await seed(request, 'student', 'Mia Student');
    const ev = await classFor(request, teacher, 'Algebra', [me], { start: `${todayUtc()}T10:00:00Z`, durationMinutes: 60 });
    const page = await openPage(context, request, me);
    const col = page.locator('.fc-timegrid-col.fc-day-today');
    const from = page.locator('.fc-timegrid-slot-lane[data-time="12:00:00"]');
    const to = page.locator('.fc-timegrid-slot-lane[data-time="13:00:00"]');
    await from.scrollIntoViewIfNeeded();
    const [c, a, b] = [await col.boundingBox(), await from.boundingBox(), await to.boundingBox()];
    const x = c!.x + c!.width / 2;
    await page.mouse.move(x, a!.y + 3);
    await page.mouse.down();
    await page.mouse.move(x, b!.y + 3, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole('heading', { name: 'New Lesson' })).toHaveCount(0);
    await expect(page.locator('.fc-highlight')).toHaveCount(0);

    const eventCard = page.locator('.fc-event', { hasText: 'Algebra' });
    await eventCard.scrollIntoViewIfNeeded();
    const e = await eventCard.boundingBox();
    await page.mouse.move(e!.x + e!.width / 2, e!.y + 6);
    await page.mouse.down();
    await page.mouse.move(e!.x + e!.width / 2, e!.y + 200, { steps: 8 });
    await page.mouse.up();
    expect((await (await as(request, teacher)).call('GET', `/v1/events/${ev.id}`)).body.start).toBe(`${todayUtc()}T10:00:00.000Z`);
  });

  test('students cannot change a class or add people to it, even by calling the server directly', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const me = await seed(request, 'student', 'Mia Student');
    const ev = await classFor(request, teacher, 'Algebra', [me]);
    const page = await openPage(context, request, me);
    expect((await page.request.fetch(`/api/events/${ev.id}`, { method: 'PATCH', data: { title: 'mine now' } })).status()).toBe(403);
    expect((await page.request.fetch(`/api/events/${ev.id}`, { method: 'DELETE' })).status()).toBe(403);
    expect((await page.request.post(`/api/events/${ev.id}/participants`, { data: { participants: [{ email: 'friend@example.test' }] } })).status()).toBe(403);
    expect((await (await as(request, teacher)).call('GET', `/v1/events/${ev.id}`)).body.title).toBe('Algebra');
  });

  test('another student\'s class cannot be opened or answered by guessing its id', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const [me, other] = [await seed(request, 'student', 'Mia Student'), await seed(request, 'student', 'Olly Other')];
    const theirs = await classFor(request, teacher, 'Their class', [other]);
    const page = await openPage(context, request, me);
    expect((await page.request.get(`/api/events/${theirs.id}`)).status()).toBe(404);
    expect((await page.request.post(`/api/events/${theirs.id}/respond`, { data: { response: 'accepted' } })).status()).toBe(404);
  });

  test('clicking a class on the calendar highlights it in the list', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const me = await seed(request, 'student', 'Mia Student');
    await classFor(request, teacher, 'Algebra', [me], { start: `${todayUtc()}T23:00:00Z`, durationMinutes: 30 });
    const page = await openPage(context, request, me);
    await page.getByRole('button', { name: 'Day', exact: true }).click();
    await page.locator('.fc-event', { hasText: 'Algebra' }).click();
    await expect(card(page, 'Algebra')).toHaveClass(/sel/);
  });
});
