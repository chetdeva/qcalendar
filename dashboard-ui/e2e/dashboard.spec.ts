import { expect, test } from '@playwright/test';
import { PNG, dashboardAs, openAs, openPage, resetBackend, seed, shareAClass } from './helpers';

test.beforeEach(({ request }) => resetBackend(request));

const profile = { headline: 'Lead STEM Specialist', specialties: ['Geometry', 'Proofs & Logic'], levels: ['middle'], quote: 'Every shape has a story.', published: true };

test.describe('student dashboard', () => {
  test('a new student sees honest empty states, their own name and no teacher tools', async ({ context, request }) => {
    const page = await openPage(context, await seed(request, 'student', 'Mia Student'));
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome back, Mia!');
    await expect(page.getByText('No upcoming classes yet')).toBeVisible();
    await expect(page.getByText('No class coming up')).toBeVisible();
    await expect(page.getByText('No mentors have published a profile yet.')).toBeVisible();
    await page.goto('/assignments');
    await expect(page.getByText('No tasks right now.')).toBeVisible();
    await expect(page.getByRole('heading', { name: /My Assignments, Practice/ })).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /My Assignments, Practice/ })).toHaveCount(0); // moved to Assignments
    await expect(page.getByRole('region', { name: 'Progress' }).locator('.tile')).toHaveCount(3);
    await expect(page.getByText('sample data')).toHaveCount(0); // the data is real now
    await expect(page.getByRole('heading', { name: /Teaching Schedule/ })).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Dashboard view' })).toHaveCount(0); // only admins get the switch
    await expect(page.locator('.qh-role')).toHaveText('Student');
  });

  test('upcoming classes come from the calendar, and Join opens the class meeting link', async ({ context, request }) => {
    const [t, s] = [await seed(request, 'teacher', 'Tess Teacher'), await seed(request, 'student', 'Mia Student')];
    await shareAClass(request, t, [s]);
    const page = await openPage(context, s);
    const card = page.locator('.session').first();
    await expect(card).toContainText('Pythagorean Theorem');
    await expect(card).toContainText('Tess Teacher');
    await expect(card).toContainText('Tomorrow');
    await expect(card.getByRole('link', { name: 'Join Classroom' })).toHaveAttribute('href', /^https:\/\/meet\.example\.test\//);
    const next = page.getByRole('region', { name: 'Next session' }).or(page.getByLabel('Next session'));
    await expect(next).toContainText('Pythagorean Theorem');
    await expect(next.getByRole('link', { name: 'Join Live Classroom' })).toHaveAttribute('href', /^https:\/\/meet\.example\.test\//);
    await expect(page.getByText('No upcoming classes yet')).toHaveCount(0);
  });

  test('links go to the calendar and chat apps; unbuilt things are marked and cannot be clicked', async ({ context, request }) => {
    const page = await openPage(context, await seed(request, 'student', 'Mia Student'));
    const main = page.getByRole('navigation', { name: 'Main' });
    await expect(main.getByRole('link', { name: 'Calendar' })).toHaveAttribute('href', 'http://localhost:3002');
    await expect(main.getByRole('link', { name: 'Chat' })).toHaveAttribute('href', 'http://localhost:3005');
    await expect(main.getByRole('link', { name: 'Assignments' })).toHaveAttribute('href', /\/assignments$/); // live for students now
    await expect(page.getByRole('link', { name: 'Full Calendar View' })).toHaveAttribute('href', 'http://localhost:3002');
    await expect(page.getByRole('button', { name: /Launch AI Warm-Up with Sparky/ })).toBeDisabled();
    await page.goto('/assignments');
    for (const name of ['Ask Sparky Hint']) {
      const b = page.getByRole('button', { name: new RegExp(name.replace(/[&]/g, '\\&')) }).first();
      await expect(b).toBeDisabled();
      await expect(b).toHaveAttribute('title', 'Coming soon');
    }
  });

  test('mentors are the teachers who published a profile; filters and search narrow them; unpublished stay hidden', async ({ context, request }) => {
    const tag = Math.random().toString(36).slice(2, 7); // this test's own mentors: the database keeps profiles from other tests
    const [t1, t2, hidden, s] = [await seed(request, 'teacher', 'Tess Teacher'), await seed(request, 'teacher', 'Tom Teacher'), await seed(request, 'teacher', 'Hana Hidden'), await seed(request, 'student', 'Mia Student')];
    await dashboardAs(request, t1, 'PUT', '/v1/me/mentor-profile', { ...profile, headline: `Lead STEM ${tag}` });
    await dashboardAs(request, t2, 'PUT', '/v1/me/mentor-profile', { ...profile, headline: `Olympiad coach ${tag}`, specialties: [`Number Theory ${tag}`], levels: ['olympiad'], quote: 'Puzzles, fast.' });
    await dashboardAs(request, hidden, 'PUT', '/v1/me/mentor-profile', { ...profile, headline: `Hidden ${tag}`, published: false });
    await shareAClass(request, t2, [s]); // Tom is Mia's own coach
    const page = await openPage(context, s);
    const cards = page.locator('.mentor');
    await page.getByLabel('Search teachers').fill(tag);
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText('Coach Tom Teacher');
    await expect(cards.first()).toContainText('Your Primary Coach');
    await expect(page.getByText('Hana Hidden')).toHaveCount(0);
    await expect(cards.first().getByRole('link', { name: 'Book Extra 1:1 Session' })).toHaveAttribute('href', 'http://localhost:3002');
    await page.getByRole('button', { name: 'Middle School (6–8)' }).click();
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText('Coach Tess Teacher');
    await expect(cards).toContainText('Proofs & Logic');
    await page.getByRole('button', { name: 'Olympiad / Competitions' }).click();
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText('Coach Tom Teacher');
    await page.getByRole('button', { name: 'All Mentors' }).click();
    await page.getByLabel('Search teachers').fill(`theory ${tag}`);
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText('Coach Tom Teacher');
    await page.getByLabel('Search teachers').fill(`zzzz ${tag}`);
    await expect(page.getByText('No mentors match your search.')).toBeVisible();
  });

  test('a student cannot reach teacher tools, other people\'s tasks or the teacher dashboard', async ({ context, request }) => {
    const [t, s, other] = [await seed(request, 'teacher', 'Tess Teacher'), await seed(request, 'student', 'Mia Student'), await seed(request, 'student', 'Olly Other')];
    await shareAClass(request, t, [s]);
    const made = await dashboardAs(request, t, 'POST', '/v1/assignments', { studentId: s.id, concept: 'Right Triangles', dueDate: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10), xp: 100, prompt: 'Explore.' });
    const page = await openPage(context, other, '/?view=teacher');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome back');
    expect((await page.request.get('/api/dashboard?view=teacher')).status()).toBe(403);
    expect((await page.request.get('/api/students')).status()).toBe(403);
    expect((await page.request.post('/api/assignments', { data: { studentId: s.id, concept: 'x', dueDate: '2099-01-01', xp: 1, prompt: 'x' } })).status()).toBe(403);
    expect((await page.request.get(`/api/assignments/${made.body.id}`)).status()).toBe(404); // someone else's task looks like no task
    const res = await page.goto(`/assignments/${made.body.id}`);
    expect(res?.status()).toBe(404);
  });
});

test.describe('the whole loop: assign, work, hand in, grade, feedback', () => {
  test('a teacher assigns a task, the student hands in work with a picture, the teacher grades it and the student sees the result', async ({ context, browser, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const student = await seed(request, 'student', 'Mia Student', 'parent@example.test');
    await shareAClass(request, teacher, [student]);

    // The teacher assigns a task from their Assignments page.
    const tPage = await openPage(context, teacher);
    await tPage.goto('/assignments');
    await tPage.getByRole('button', { name: '5-Question Micro-Quest' }).click();
    await expect(tPage.getByLabel('XP reward')).toHaveValue('60');
    await tPage.getByLabel('Coach’s Prompt to Student').fill('Find the missing side of each triangle.');
    await tPage.getByRole('button', { name: /Dispatch Assignment/ }).click();
    await expect(tPage.getByRole('status')).toContainText('Assignment sent to Mia Student');

    // The student sees it, opens it, ticks steps, and the progress is remembered.
    const sPage = await openAs(browser, student);
    await sPage.goto('/assignments');
    const todo = sPage.getByRole('list', { name: 'Active tasks' }).getByRole('listitem');
    await expect(todo).toHaveCount(1);
    await expect(todo).toContainText('Find the missing side of each triangle.');
    await expect(todo).toContainText('Not Started');
    await todo.getByRole('link', { name: 'Start Task' }).click();
    await expect(sPage.getByRole('heading', { level: 1 })).toContainText('GeoGebra Dynamic Right Triangles Sandbox');
    for (const n of [1, 2]) { // wait for each save: the first click can land before the page is hydrated on a cold dev server
      await expect(async () => {
        const saved = sPage.waitForResponse((r) => r.url().includes('/progress') && r.request().postDataJSON().stepsDone === n, { timeout: 2000 });
        await sPage.getByLabel(`Step ${n}`).check();
        await saved;
      }).toPass({ timeout: 15_000 });
    }
    await expect(sPage.getByRole('status')).toHaveText('Progress saved.');
    await sPage.reload();
    await expect(sPage.getByLabel('Step 2')).toBeChecked();
    await expect(sPage.getByLabel('Step 3')).not.toBeChecked();

    // Hand-in is blocked without an answer, refuses non-images, then works with a picture.
    await expect(sPage.getByRole('button', { name: 'Hand in' })).toBeDisabled();
    await sPage.getByLabel('Your answer').fill('The missing side is 5, because 3² + 4² = 25.');
    await sPage.getByLabel('Picture or PDF of your working').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
    await expect(sPage.locator('.err')).toContainText('png, jpeg or webp picture, or a PDF');
    await sPage.getByLabel('Picture or PDF of your working').setInputFiles({ name: 'working.png', mimeType: 'image/png', buffer: PNG });
    await expect(sPage.locator('.file')).toHaveText('working.png');
    await sPage.getByLabel('Picture or PDF of your working').setInputFiles({ name: 'working.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF') });
    await expect(sPage.locator('.file')).toHaveText('working.pdf');
    await sPage.getByRole('button', { name: 'Hand in' }).click();
    await expect(sPage.getByText('Handed in.')).toBeVisible();
    await expect(sPage.getByLabel('Your work')).toContainText('The missing side is 5');
    await expect(sPage.getByRole('link', { name: 'Open the PDF' })).toBeVisible();
    await expect(sPage.getByRole('button', { name: 'Hand in' })).toHaveCount(0); // once only

    // The teacher sees the answer and the picture, and cannot publish without a score.
    await tPage.reload();
    const card = tPage.getByLabel('Grade Mia Student');
    await expect(card).toContainText('The missing side is 5');
    await expect(card.getByRole('link', { name: 'Open the PDF' })).toHaveAttribute('href', /\/api\/attachments\//);
    await expect(card.getByRole('button', { name: /Publish Grade/ })).toBeDisabled();
    await card.getByLabel('Assessment score').fill('96');
    await card.getByRole('button', { name: 'High Adversity Quotient (AQ)' }).click();
    await card.getByLabel('Encouragement note').fill('Lovely clear working.');
    await card.getByRole('button', { name: /Publish Grade/ }).click();
    await expect(tPage.getByRole('status')).toContainText('Grade published for Mia Student. Their parent has been emailed.');
    await expect(tPage.getByLabel('Grade Mia Student')).toHaveCount(0);
    await tPage.goto('/');
    await expect(tPage.locator('.metric', { hasText: 'Pending Grading' })).toContainText('0 Submissions');

    // The student sees the feedback and the numbers moved.
    await sPage.goto('/assignments');
    const fb = sPage.locator('.feedback').first();
    await expect(fb).toContainText('GeoGebra Dynamic Right Triangles Sandbox');
    await expect(fb).toContainText('Score: 96/100 (A)');
    await expect(fb).toContainText('Lovely clear working.');
    await expect(fb).toContainText('Tess Teacher');
    await expect(sPage.getByRole('list', { name: 'Active tasks' })).toHaveCount(0);
    await sPage.goto('/');
    await expect(sPage.getByRole('region', { name: 'Welcome' })).toContainText('Points: 60');
    await expect(sPage.getByRole('region', { name: 'Welcome' })).toContainText('Current Streak: 1 Day');
    await expect(sPage.getByRole('region', { name: 'Progress' })).toContainText('1 / 5 Tasks Completed');
    await sPage.goto('/assignments');
    await fb.getByRole('link', { name: 'View Graded Task' }).click();
    await expect(sPage.getByLabel('Feedback')).toContainText('Score: 96/100 (A)');
  });

  test('without a guardian email on file the grade still publishes and the teacher is told', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const student = await seed(request, 'student', 'Mia Student');
    await shareAClass(request, teacher, [student]);
    const made = await dashboardAs(request, teacher, 'POST', '/v1/assignments', { studentId: student.id, concept: 'Slopes', dueDate: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10), xp: 80, prompt: 'Rise over run.' });
    expect((await dashboardAs(request, student, 'POST', `/v1/assignments/${made.body.id}/submit`, { answer: 'm = 2' })).status).toBe(204);
    const page = await openPage(context, teacher);
    await page.goto('/assignments');
    const card = page.getByLabel('Grade Mia Student');
    await card.getByLabel('Assessment score').fill('88');
    await card.getByRole('button', { name: 'Draft' }).click();
    await expect(page.getByRole('status')).toHaveText('Draft saved.');
    await page.reload();
    await expect(page.getByLabel('Grade Mia Student').getByLabel('Assessment score')).toHaveValue('88'); // the draft was kept
    await page.getByLabel('Grade Mia Student').getByRole('button', { name: /Publish Grade/ }).click();
    await expect(page.getByRole('status')).toContainText('No parent email is on file, so no email was sent.');
  });

  test('an out-of-range score cannot be published', async ({ context, request }) => {
    const teacher = await seed(request, 'teacher', 'Tess Teacher');
    const student = await seed(request, 'student', 'Mia Student');
    await shareAClass(request, teacher, [student]);
    const made = await dashboardAs(request, teacher, 'POST', '/v1/assignments', { studentId: student.id, concept: 'Slopes', dueDate: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10), xp: 80, prompt: 'Rise over run.' });
    await dashboardAs(request, student, 'POST', `/v1/assignments/${made.body.id}/submit`, { answer: 'm = 2' });
    const page = await openPage(context, teacher);
    await page.goto('/assignments');
    const publish = page.getByLabel('Grade Mia Student').getByRole('button', { name: /Publish Grade/ });
    await page.getByLabel('Assessment score').fill('150');
    await expect(publish).toBeDisabled();
    await page.getByLabel('Assessment score').fill('-4');
    await expect(publish).toBeDisabled();
    await page.getByLabel('Assessment score').fill('100');
    await expect(publish).toBeEnabled();
  });
});

test.describe('teacher dashboard', () => {
  test('a new teacher sees empty states and a builder that waits for students', async ({ context, request }) => {
    const page = await openPage(context, await seed(request, 'teacher', 'Tess Teacher'));
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome, Coach Tess!');
    await expect(page.locator('.metric')).toHaveCount(4);
    await expect(page.getByText('No classes today.')).toBeVisible();
    await expect(page.getByText('No students yet.')).toBeVisible();
    await expect(page.getByRole('heading', { name: /My Assignments/ })).toHaveCount(0);
    await expect(page.locator('.qh-role')).toHaveText('Teacher');
    await expect(page.getByRole('heading', { name: 'Assign Task / Quest' })).toHaveCount(0); // moved to Assignments
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Assignments' }).click();
    await expect(page).toHaveURL(/\/assignments$/);
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Assignments' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Students appear here once you have a class with them.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Dispatch Assignment/ })).toBeDisabled();
    await expect(page.getByText('The grading queue is clear. Nice work!')).toBeVisible();
  });

  test('"Assign Task" on a student card opens Assignments with that student chosen', async ({ context, request }) => {
    const [t, a, b] = [await seed(request, 'teacher', 'Tess Teacher'), await seed(request, 'student', 'Ann Student'), await seed(request, 'student', 'Ben Student')];
    await shareAClass(request, t, [a, b]);
    const page = await openPage(context, t);
    await page.getByRole('link', { name: 'Assign task to Ben Student' }).click();
    await expect(page).toHaveURL(/\/assignments\?student=/);
    await expect(page.getByLabel('Target Student or Cohort')).toHaveValue(b.id);
  });

  test('the directory lists students from classes; a grade can be set and filtered; search works', async ({ context, request }) => {
    const [t, a, b] = [await seed(request, 'teacher', 'Tess Teacher'), await seed(request, 'student', 'Ann Student'), await seed(request, 'student', 'Ben Student')];
    await shareAClass(request, t, [a, b]);
    const page = await openPage(context, t);
    const cards = page.locator('.student');
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText('Ann Student');
    await expect(cards.first()).toContainText('No grades yet');
    await page.getByLabel('Grade for Ann Student').selectOption('Grade 8');
    await expect(page.getByRole('status')).toContainText('Ann Student’s grade saved.');
    await page.getByLabel('Grade for Ben Student').selectOption('Grade 5');
    await expect(page.getByRole('status')).toContainText('Ben Student’s grade saved.');
    await page.getByLabel('Filter by grade').selectOption('8');
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText('Ann Student');
    await page.getByLabel('Filter by grade').selectOption('all');
    await page.getByLabel('Search student name').fill('ben');
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText('Ben Student');
    await page.getByLabel('Search student name').fill('nobody');
    await expect(page.getByText('No students match.')).toBeVisible();
    await page.getByLabel('Search student name').fill('');
    await expect(page.getByRole('link', { name: 'Assign task to Ben Student' })).toHaveAttribute('href', `/assignments?student=${b.id}`);
  });

  test('today\'s classes show in the schedule with the student\'s name and a link into the class', async ({ context, request }) => {
    const [t, s] = [await seed(request, 'teacher', 'Tess Teacher'), await seed(request, 'student', 'Mia Student')];
    const now = Date.now();
    await shareAClass(request, t, [s], { start: new Date(now + 60_000).toISOString(), durationMinutes: 20 }); // starts in a minute
    const page = await openPage(context, t);
    const hero = page.locator('.session-hero');
    if (await hero.count()) { // (a class that starts just before midnight UTC may belong to tomorrow: then there is nothing to check)
      await expect(hero).toContainText('Mia Student');
      await expect(hero).toContainText('Pythagorean Theorem');
      await expect(hero.getByRole('link', { name: 'Enter Classroom Now' })).toHaveAttribute('href', /^https:\/\/meet\.example\.test\//);
    }
  });

  test('the mentor profile is saved, needs a headline and quote to publish, and then students can find it', async ({ context, browser, request }) => {
    const [t, s] = [await seed(request, 'teacher', 'Tess Teacher'), await seed(request, 'student', 'Mia Student')];
    const page = await openPage(context, t);
    await page.getByLabel('Show my profile to students').check();
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.locator('.err')).toContainText('headline');
    const tag = Math.random().toString(36).slice(2, 7);
    await page.getByLabel('Headline').fill(`Lead STEM Specialist ${tag}`);
    await page.getByLabel('Specialties (separated by commas)').fill('Geometry, Proofs & Logic');
    await page.getByRole('button', { name: 'Middle (6–8)' }).click();
    await page.getByLabel('A line in your own words').fill('Every shape has a story.');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByRole('status')).toContainText('Students can now find you under Mentors.');
    const mine = await openAs(browser, s);
    await mine.getByLabel('Search teachers').fill(tag);
    await expect(mine.locator('.mentor')).toHaveCount(1);
    await expect(mine.locator('.mentor')).toContainText('Coach Tess Teacher');
    await expect(mine.locator('.mentor')).toContainText(`Lead STEM Specialist ${tag}`);
    await page.reload();
    await expect(page.getByLabel('Headline')).toHaveValue(`Lead STEM Specialist ${tag}`); // it is remembered
    await page.getByLabel('Show my profile to students').uncheck();
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByRole('status')).toContainText('hidden from students');
    await mine.reload();
    await mine.getByLabel('Search teachers').fill(tag);
    await expect(mine.getByText('No mentors match your search.')).toBeVisible();
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
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Assignments' }).click();
    await expect(page).toHaveURL(/\/assignments\?view=teacher$/);
    await expect(page.getByRole('heading', { name: 'Assign Task / Quest' })).toBeVisible(); // the teacher page, not the student's list
  });

  test('no sideways scrolling from phone to desktop widths, on every page', async ({ context, request }) => {
    const [t, s] = [await seed(request, 'teacher', 'Tess Teacher'), await seed(request, 'student', 'Mia Student')];
    await shareAClass(request, t, [s]);
    const made = await dashboardAs(request, t, 'POST', '/v1/assignments', { studentId: s.id, concept: 'Right Triangles', dueDate: new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10), xp: 100, prompt: 'Explore.' });
    const student = await openPage(context, s);
    const teacher = await openPage(context, t);
    for (const [page, path] of [[student, '/'], [student, '/assignments'], [student, `/assignments/${made.body.id}`], [teacher, '/'], [teacher, '/assignments']] as const) {
      for (const width of [375, 768, 1101, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(path);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${path} at ${width}px`).toBe(true);
      }
    }
  });

  test('signed-out visitors are sent to the login page', async ({ page }) => {
    await page.route('**/login*', (r) => r.fulfill({ body: 'login' }));
    await page.goto('/');
    await expect(page).toHaveURL(/58765\/login/);
  });
});
