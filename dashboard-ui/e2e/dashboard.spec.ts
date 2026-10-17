import { expect, test } from '@playwright/test';
import { openAs, openPage, resetBackend, seed } from './helpers';

test.beforeEach(({ request }) => resetBackend(request));

test.describe('student dashboard', () => {
  test('shows every section with the student’s own name and clear sample-data note', async ({ context, request }) => {
    const me = await seed(request, 'student', 'Mia Student');
    const page = await openPage(context, me);
    await expect(page.getByRole('note')).toContainText('sample data');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome back, Mia!');
    await expect(page.getByRole('region', { name: 'Next session' }).or(page.getByLabel('Next session'))).toContainText('1:1 Geometry Mentorship');
    await expect(page.getByRole('region', { name: 'Progress' }).locator('.tile')).toHaveCount(3);
    await expect(page.getByRole('heading', { name: /Upcoming Scheduled Classes/ })).toBeVisible();
    await expect(page.locator('.session')).toHaveCount(3);
    await expect(page.locator('.mentor')).toHaveCount(3);
    await expect(page.getByRole('heading', { name: /My Assignments/ })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Active tasks' }).getByRole('listitem')).toHaveCount(2);
    await expect(page.getByRole('heading', { name: 'Teaching Schedule' })).toHaveCount(0); // nothing from the teacher side
    await expect(page.getByRole('navigation', { name: 'Dashboard view' })).toHaveCount(0); // only admins get the switch
    await expect(page.locator('.role-chip')).toHaveText('Student');
  });

  test('links go to the calendar and chat apps; unbuilt things are marked and cannot be clicked', async ({ context, request }) => {
    const page = await openPage(context, await seed(request, 'student', 'Mia Student'));
    const main = page.getByRole('navigation', { name: 'Main' });
    await expect(main.getByRole('link', { name: 'Schedule & Classes' })).toHaveAttribute('href', 'http://localhost:3002');
    await expect(main.getByRole('link', { name: 'Messages' })).toHaveAttribute('href', 'http://localhost:3005');
    await expect(page.getByRole('link', { name: 'Full Calendar View' })).toHaveAttribute('href', 'http://localhost:3002');
    await expect(page.getByRole('link', { name: 'Book Extra 1:1 Session' })).toHaveAttribute('href', 'http://localhost:3002');
    for (const name of ['Assignments & Tasks', 'Whiteboard & AI Practice', 'Join Live Classroom', 'Launch AI Warm-Up with Sparky']) {
      const b = page.getByRole('button', { name: new RegExp(name.replace(/[&]/g, '\\&')) }).first();
      await expect(b).toBeDisabled();
      await expect(b).toHaveAttribute('title', 'Coming soon');
    }
  });

  test('mentor search and quick filters narrow the list', async ({ context, request }) => {
    const page = await openPage(context, await seed(request, 'student', 'Mia Student'));
    const cards = page.locator('.mentor');
    await page.getByRole('button', { name: 'Olympiad / AMC 8' }).click();
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText('Coach Elena Rostova');
    await page.getByRole('button', { name: 'All Mentors' }).click();
    await expect(cards).toHaveCount(3);
    await page.getByLabel('Search teachers').fill('fractions');
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText('Coach Marcus Vance');
    await page.getByLabel('Search teachers').fill('zzzz');
    await expect(page.getByText('No mentors match your search.')).toBeVisible();
    await page.getByLabel('Search teachers').fill('');
    await expect(cards).toHaveCount(3);
  });

  test('the graded tab lists every graded task', async ({ context, request }) => {
    const page = await openPage(context, await seed(request, 'student', 'Mia Student'));
    await expect(page.locator('.feedback')).toHaveCount(2); // recent feedback beside the to-do list
    await page.getByRole('tab', { name: /Graded & Feedback \(5\)/ }).click();
    await expect(page.locator('.feedback')).toHaveCount(5);
    await expect(page.getByRole('list', { name: 'Active tasks' })).toHaveCount(0);
    await page.getByRole('tab', { name: /Active Tasks/ }).click();
    await expect(page.getByRole('list', { name: 'Active tasks' })).toBeVisible();
  });

  test('a student cannot see the teacher dashboard, even by asking for it', async ({ context, request }) => {
    const page = await openPage(context, await seed(request, 'student', 'Mia Student'), '/?view=teacher');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome back');
    expect((await page.request.get('/api/dashboard?view=teacher')).status()).toBe(403);
    expect((await page.request.get('/api/students')).status()).toBe(403);
  });
});

test.describe('teacher dashboard', () => {
  test('shows the schedule, builder, grading queue and student directory', async ({ context, request }) => {
    const page = await openPage(context, await seed(request, 'teacher', 'Tess Teacher'));
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome, Coach Tess!');
    await expect(page.locator('.metric')).toHaveCount(4);
    await expect(page.locator('.metric', { hasText: 'Pending Grading' })).toContainText('5 Submissions');
    await expect(page.getByRole('heading', { name: /Today’s Teaching Schedule/ })).toBeVisible();
    await expect(page.locator('.session-hero')).toContainText('Maya Jenkins');
    await expect(page.locator('.session-row')).toHaveCount(2);
    await expect(page.getByRole('heading', { name: /Assign Task/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Grading Queue/ })).toBeVisible();
    await expect(page.locator('.student')).toHaveCount(3);
    await expect(page.getByRole('heading', { name: /My Assignments/ })).toHaveCount(0);
    await expect(page.locator('.role-chip')).toHaveText('Teacher');
  });

  test('dispatching a task confirms it, and the student then sees it', async ({ context, browser, request }) => {
    const page = await openPage(context, await seed(request, 'teacher', 'Tess Teacher'));
    const student = await seed(request, 'student', 'Mia Student');
    await page.getByRole('button', { name: '5-Question Micro-Quest' }).click();
    await expect(page.getByLabel('XP reward')).toHaveValue('60');
    await page.getByLabel('Coach’s Prompt to Student').fill('Find the missing side of each triangle.');
    await page.getByRole('button', { name: /Dispatch Assignment/ }).click();
    await expect(page.getByRole('status')).toContainText('Assignment sent to Maya Jenkins');

    const s = await openAs(browser, student);
    const todo = s.getByRole('list', { name: 'Active tasks' }).getByRole('listitem');
    await expect(todo).toHaveCount(3);
    await expect(todo.last()).toContainText('GeoGebra Dynamic Right Triangles Sandbox');
    await expect(todo.last()).toContainText('Find the missing side of each triangle.');
  });

  test('an empty prompt is refused by the form', async ({ context, request }) => {
    const page = await openPage(context, await seed(request, 'teacher', 'Tess Teacher'));
    await page.getByLabel('Coach’s Prompt to Student').fill('');
    await page.getByRole('button', { name: /Dispatch Assignment/ }).click();
    await expect(page.getByLabel('Coach’s Prompt to Student')).toBeFocused();
    await expect(page.getByRole('status')).toHaveText('');
  });

  test('publishing a grade clears it from the queue and the student sees the feedback', async ({ context, browser, request }) => {
    const page = await openPage(context, await seed(request, 'teacher', 'Tess Teacher'));
    const student = await seed(request, 'student', 'Mia Student');
    const card = page.getByLabel('Grade Maya Jenkins');
    await card.getByLabel('Assessment score').fill('96');
    await card.getByRole('button', { name: 'Spatial Insight' }).click(); // untick one
    await card.getByLabel('Encouragement note').fill('Lovely, clear proof.');
    await card.getByRole('button', { name: /Publish Grade/ }).click();
    await expect(page.getByRole('status')).toContainText('Grade published for Maya Jenkins');
    await expect(page.getByLabel('Grade Maya Jenkins')).toHaveCount(0);
    await expect(page.getByLabel('Grade Ethan Cole')).toBeVisible(); // the next submission takes its place
    await expect(page.locator('.metric', { hasText: 'Pending Grading' })).toContainText('4 Submissions');

    const s = await openAs(browser, student);
    const first = s.locator('.feedback').first();
    await expect(first).toContainText('Coordinate Plane Reflections & Rotations');
    await expect(first).toContainText('Lovely, clear proof.');
    await expect(first).toContainText('Score: 96/100 (A)');
  });

  test('begin review swaps the grading card; a draft is saved; a bad score is refused', async ({ context, request }) => {
    const page = await openPage(context, await seed(request, 'teacher', 'Tess Teacher'));
    await page.getByRole('button', { name: 'Begin review of Ethan Cole' }).click();
    const ethan = page.getByLabel('Grade Ethan Cole');
    await expect(ethan).toContainText('No scratchpad was attached');
    await expect(page.getByLabel('Grade Maya Jenkins')).toHaveCount(0);
    await ethan.getByLabel('Assessment score').fill('71');
    await ethan.getByLabel('Encouragement note').fill('Needs another pass.');
    await ethan.getByRole('button', { name: 'Draft' }).click();
    await expect(page.getByRole('status')).toHaveText('Draft saved.');
    await ethan.getByLabel('Assessment score').fill('150');
    await ethan.getByRole('button', { name: /Publish Grade/ }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByLabel('Grade Ethan Cole')).toBeVisible(); // nothing was published
  });

  test('the directory searches and filters, and Assign Task prefills the builder', async ({ context, request }) => {
    const page = await openPage(context, await seed(request, 'teacher', 'Tess Teacher'));
    const cards = page.locator('.student');
    await page.getByLabel('Search student name').fill('ethan');
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText('Ethan Cole');
    await page.getByLabel('Search student name').fill('');
    await page.getByLabel('Filter by grade').selectOption('5');
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText('Liam Davis');
    await page.getByLabel('Filter by grade').selectOption('9');
    await expect(page.getByText('No students match.')).toBeVisible();
    await page.getByLabel('Filter by grade').selectOption('all');
    await expect(cards).toHaveCount(3);
    await page.getByRole('button', { name: 'Assign task to Liam Davis' }).click();
    await expect(page.getByLabel('Target Student or Cohort')).toHaveValue('st-liam');
  });
});

test.describe('admin and layout', () => {
  test('an admin sees the switch and can look at either dashboard', async ({ context, request }) => {
    const page = await openPage(context, await seed(request, 'admin', 'Ada Admin'));
    const switcher = page.getByRole('navigation', { name: 'Dashboard view' });
    await expect(switcher.getByRole('link', { name: 'Student' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome back');
    await switcher.getByRole('link', { name: 'Teacher' }).click();
    await expect(page).toHaveURL(/view=teacher/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome, Coach Ada!');
  });

  test('no sideways scrolling from phone to desktop widths, on either dashboard', async ({ context, request }) => {
    const student = await openPage(context, await seed(request, 'student', 'Mia Student'));
    const teacher = await openPage(context, await seed(request, 'teacher', 'Tess Teacher'));
    for (const page of [student, teacher]) {
      for (const width of [375, 768, 1101, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.reload();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${width}px`).toBe(true);
      }
    }
  });

  test('signed-out visitors are sent to the login page', async ({ page }) => {
    await page.route('**/login*', (r) => r.fulfill({ body: 'login' }));
    await page.goto('/');
    await expect(page).toHaveURL(/58765\/login/);
  });
});
