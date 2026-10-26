import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, json, signToken, type Harness } from '../tests/harness.ts';

let h: Harness;
beforeEach(async () => { h = await createHarness(); });

const publishProfile = (t: { call: any }, over: Record<string, unknown> = {}) =>
  t.call('PUT', '/v1/me/mentor-profile', { headline: 'Lead STEM Specialist', specialties: ['Geometry'], levels: ['middle'], quote: 'Every shape has a story.', published: true, ...over });

test('authentication: no token, a bad token and a disabled account are refused; health is open', async () => {
  assert.equal((await h.app.request('/v1/dashboard')).status, 401);
  assert.equal((await h.withToken('nonsense')('GET', '/v1/dashboard')).status, 401);
  assert.equal((await h.withToken(await signToken('u1', { role: 'student', status: 'disabled' }))('GET', '/v1/dashboard')).status, 403);
  assert.equal((await h.app.request('/health')).status, 200);
});

test('who may see and do what: roles are exact, admins only look', async () => {
  const [s, t, a] = [await h.person('student', 'Sam Student'), await h.person('teacher', 'Tess Teacher'), await h.person('admin', 'Ada Admin')];
  assert.equal((await json(await s.call('GET', '/v1/dashboard'))).view, 'student');
  assert.equal((await json(await t.call('GET', '/v1/dashboard'))).view, 'teacher');
  assert.equal((await s.call('GET', '/v1/dashboard?view=teacher')).status, 403);
  assert.equal((await t.call('GET', '/v1/dashboard?view=student')).status, 403);
  assert.equal((await a.call('GET', '/v1/dashboard?view=teacher')).status, 200);
  assert.equal((await a.call('GET', '/v1/dashboard?view=student')).status, 200);
  assert.equal((await s.call('GET', '/v1/dashboard?view=nonsense')).status, 400);
  assert.equal((await s.call('GET', '/v1/students')).status, 403);
  assert.equal((await t.call('GET', '/v1/mentors')).status, 403);
  assert.equal((await t.call('GET', '/v1/assignments')).status, 403);
  for (const [who, path, body] of [
    [s, '/v1/assignments', {}], [a, '/v1/assignments', {}], [s, '/v1/me/mentor-profile', undefined], [s, '/v1/submissions/00000000-0000-4000-8000-000000000000/publish', {}], [a, '/v1/submissions/00000000-0000-4000-8000-000000000000/publish', {}],
    [t, '/v1/assignments/00000000-0000-4000-8000-000000000000/submit', {}], [a, '/v1/attachments', {}],
  ] as const) {
    const r = await who.call(body === undefined ? 'GET' : 'POST', path, body);
    assert.equal(r.status, 403, `${path}`);
  }
});

test('a new student sees an honest empty dashboard, greeted by their own first name', async () => {
  const s = await h.person('student', 'Mia Student');
  const d = (await json(await s.call('GET', '/v1/dashboard'))).student;
  assert.equal(d.welcome.name, 'Mia');
  assert.equal(d.nextSession, null);
  assert.deepEqual([d.sessions.length, d.mentors.length, d.assignments.length, d.feedback.length], [0, 0, 0, 0]);
  assert.deepEqual([d.welcome.streakDays, d.welcome.points, d.welcome.aq], [0, 0, null]);
  assert.equal(d.progress.weekly.value, '0 / 5 Tasks Completed');
  assert.equal(d.progress.tenacity.value, 'Just getting started');
});

test('upcoming classes come from the calendar: only the student\'s own, confirmed, not finished, soonest first, at most three', async () => {
  const [t, s, other] = [await h.person('teacher', 'Tess Teacher'), await h.person('student', 'Mia Student'), await h.person('student', 'Olly Other')];
  h.classFor(t, [s], { title: 'Later', start: '2030-03-16T09:00:00.000Z', end: '2030-03-16T09:45:00.000Z', meetingUrl: null });
  h.classFor(t, [s], { title: 'Today', description: 'Squares on triangles' });
  h.classFor(t, [s], { title: 'Cancelled', status: 'cancelled' });
  h.classFor(t, [s], { title: 'Finished', start: '2030-03-15T08:00:00.000Z', end: '2030-03-15T08:45:00.000Z' });
  h.classFor(t, [other], { title: 'Not mine' });
  for (const n of [1, 2, 3]) h.classFor(t, [s], { title: `Extra ${n}`, start: `2030-03-2${n}T09:00:00.000Z`, end: `2030-03-2${n}T09:45:00.000Z` });
  const d = (await json(await s.call('GET', '/v1/dashboard'))).student;
  assert.deepEqual(d.sessions.map((x: any) => x.topic), ['Today', 'Later', 'Extra 1']);
  const [today, later] = d.sessions;
  assert.deepEqual([today.badge, today.next, today.primary, today.who, today.whoNote], ['Starting Today', true, 'Join Classroom', 'Tess Teacher', 'Private tutoring']);
  assert.equal(today.meetingUrl, 'https://meet.example.test/room');
  assert.equal(today.when, 'Today, 2:30 PM – 3:15 PM (45m)');
  assert.deepEqual([later.badge, later.primary, later.meetingUrl], ['Confirmed', 'View Details', null]); // no meeting link: nothing to join
  assert.equal(d.nextSession.title, 'Today');
  assert.equal(d.nextSession.liveIn, 'In 4 hr 30 mins');
  assert.equal(d.nextSession.mentor, 'With Tess Teacher');
});

test('mentors: only published profiles, with real names, filters, search and the student\'s own coach first', async () => {
  const [t1, t2, t3, s] = [await h.person('teacher', 'Tess Teacher'), await h.person('teacher', 'Tom Teacher'), await h.person('teacher', 'Tia Teacher'), await h.person('student', 'Mia Student')];
  assert.equal((await publishProfile(t1)).status, 200);
  assert.equal((await publishProfile(t2, { headline: 'Olympiad coach', specialties: ['Number Theory'], levels: ['olympiad', 'high'], quote: 'Puzzles, fast.' })).status, 200);
  assert.equal((await publishProfile(t3, { published: false })).status, 200); // saved but hidden
  h.classFor(t2, [s]); // Tom is Mia's coach
  const list = async (qs = '') => (await json(await s.call('GET', `/v1/mentors${qs}`))).mentors;
  const all = await list();
  assert.deepEqual(all.map((m: any) => [m.name, m.primary]), [['Coach Tom Teacher', true], ['Coach Tess Teacher', false]]);
  assert.deepEqual(all[1].specialties, ['Geometry']);
  assert.deepEqual((await list('?filter=olympiad')).map((m: any) => m.name), ['Coach Tom Teacher']);
  assert.deepEqual((await list('?filter=middle')).map((m: any) => m.name), ['Coach Tess Teacher']);
  assert.deepEqual((await list('?q=NUMBER')).map((m: any) => m.name), ['Coach Tom Teacher']);
  assert.deepEqual(await list('?q=zzz'), []);
  assert.equal((await s.call('GET', '/v1/mentors?filter=bogus')).status, 400);
  assert.equal((await json(await s.call('GET', '/v1/dashboard'))).student.mentors.length, 2); // same list inside the dashboard
});

test('a published profile whose person cannot be found is not shown as a nameless card', async () => {
  const [t, s] = [await h.person('teacher', 'Tess Teacher'), await h.person('student', 'Mia Student')];
  assert.equal((await publishProfile(t)).status, 200);
  h.state.people.delete(t.id); // as if the teacher's account were gone
  assert.deepEqual((await json(await s.call('GET', '/v1/mentors'))).mentors, []);
});

test('mentor profile: validated, needs a headline and quote to be published, and is private to its teacher until then', async () => {
  const t = await h.person('teacher', 'Tess Teacher');
  assert.deepEqual(await json(await t.call('GET', '/v1/me/mentor-profile')), { headline: '', specialties: [], levels: [], quote: '', published: false });
  assert.equal((await publishProfile(t, { headline: '' })).status, 400);
  for (const bad of [{ levels: ['college'] }, { specialties: Array(9).fill('x') }, { quote: 'x'.repeat(401) }, { extra: 1 }]) assert.equal((await publishProfile(t, bad)).status, 400, JSON.stringify(bad));
  assert.equal((await publishProfile(t)).status, 200);
  assert.equal((await json(await t.call('GET', '/v1/me/mentor-profile'))).headline, 'Lead STEM Specialist');
  assert.equal((await json(await t.call('GET', '/v1/dashboard'))).teacher.mentorProfile.published, true);
});

test('the teacher\'s day: today\'s classes with student names, the next one first, group classes as a head count', async () => {
  const [t, a, b] = [await h.person('teacher', 'Tess Teacher'), await h.person('student', 'Ann Student'), await h.person('student', 'Ben Student')];
  h.classFor(t, [a], { title: 'Algebra', start: '2030-03-15T16:00:00.000Z', end: '2030-03-15T16:45:00.000Z' });
  h.classFor(t, [a, b], { title: 'Group maths', start: '2030-03-15T18:00:00.000Z', end: '2030-03-15T18:45:00.000Z' });
  h.classFor(t, [b], { title: 'Done already', start: '2030-03-15T08:00:00.000Z', end: '2030-03-15T08:45:00.000Z' });
  h.classFor(t, [b], { title: 'Tomorrow', start: '2030-03-16T08:00:00.000Z', end: '2030-03-16T08:45:00.000Z' });
  const d = (await json(await t.call('GET', '/v1/dashboard'))).teacher;
  assert.equal(d.welcome.name, 'Coach Tess');
  assert.deepEqual(d.schedule.sessions.map((x: any) => [x.detail, x.student, x.hero ?? false, x.kind, x.startsIn]), [
    ['Algebra', 'Ann Student', true, '1-on-1 Studio', 'In 6 hr'], // the next class today leads
    ['Done already', 'Ben Student', false, '1-on-1 Studio', 'Finished'],
    ['Group maths', '2 students', false, 'Group class', 'In 8 hr'],
  ]);
  assert.equal(d.schedule.sessions[0].meetingUrl, 'https://meet.example.test/room');
  assert.deepEqual(d.metrics.map((m: any) => [m.label, m.value, m.note]), [
    ['Today’s Classes', '3 Sessions', 'Next at 4:00 PM'], ['Active Learners', '2 Students', 'From your classes'],
    ['Pending Grading', '0 Submissions', 'All caught up'], ['Student AQ Growth', '—', 'Needs two months of tasks'],
  ]);
});

test('the student directory: people from the teacher\'s classes, with a grade the teacher sets, search and a grade filter', async () => {
  const [t, a, b, other] = [await h.person('teacher', 'Tess Teacher'), await h.person('student', 'Ann Student'), await h.person('student', 'Ben Student'), await h.person('teacher', 'Tom Teacher')];
  h.classFor(t, [a, b]);
  const dir = async (qs = '') => (await json(await t.call('GET', `/v1/students${qs}`))).students;
  assert.deepEqual((await dir()).map((x: any) => [x.name, x.grade, x.mastery, x.topic, x.lastSession]), [['Ann Student', '', null, 'No tasks yet', '—'], ['Ben Student', '', null, 'No tasks yet', '—']]);
  assert.equal((await t.call('PUT', `/v1/students/${a.id}/settings`, { grade: 'Grade 8' })).status, 204);
  assert.equal((await t.call('PUT', `/v1/students/${b.id}/settings`, { grade: 'Grade 5' })).status, 204);
  assert.deepEqual((await dir('?grade=8')).map((x: any) => x.name), ['Ann Student']);
  assert.deepEqual((await dir('?q=ben')).map((x: any) => [x.name, x.gradeNumber]), [['Ben Student', 5]]);
  assert.deepEqual(await dir('?grade=9'), []);
  assert.equal((await t.call('GET', '/v1/students?grade=12')).status, 400);
  // Not someone else's student, not an unknown grade, not a bad id.
  assert.equal((await other.call('PUT', `/v1/students/${a.id}/settings`, { grade: 'Grade 3' })).status, 403);
  assert.equal((await t.call('PUT', `/v1/students/${a.id}/settings`, { grade: 'Grade 12' })).status, 400);
  assert.equal((await t.call('PUT', '/v1/students/nope/settings', { grade: 'Grade 3' })).status, 404);
  assert.equal((await json(await a.call('GET', '/v1/dashboard'))).student.profile.grade, 'Grade 8'); // the student sees their own grade
  assert.deepEqual((await json(await other.call('GET', '/v1/students'))).students, []); // another teacher sees none of them
});

test('a calendar-service outage does not blank the dashboard', async () => {
  const s = await h.person('student', 'Mia Student');
  h.sources.events = async () => { throw new Error('calendar down'); };
  const r = await s.call('GET', '/v1/dashboard');
  assert.equal(r.status, 200);
  assert.equal((await json(r)).student.sessions.length, 0);
});
