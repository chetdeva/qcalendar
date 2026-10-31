import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHarness, json } from '../tests/harness.ts';

let h: Awaited<ReturnType<typeof createHarness>>;
before(async () => { h = await createHarness(); });
after(() => h.close());
beforeEach(() => h.reset());

const lead = (over: Record<string, unknown> = {}) => ({ parentName: 'Pat Parent', email: 'Pat@Example.test', grade: 'Grades 3–5', goal: 'Bridging Gaps', timeZone: 'America/Chicago', phone: '555 0100', ...over });
const count = async (table: string) => (await h.db.query(`select 1 from calendar.${table}`)).length;

test('a request is saved and queues one mail to the teacher and a confirmation to the parent', async () => {
  const r = await h.service('POST', '/v1/leads', lead({ source: 'website', page: '/book' }));
  assert.equal(r.status, 201);
  const [row] = await h.db.query<any>('select * from calendar.leads');
  assert.deepEqual([row.parent_name, row.email, row.grade, row.goal, row.time_zone, row.source, row.status], ['Pat Parent', 'Pat@Example.test', 'Grades 3–5', 'Bridging Gaps', 'America/Chicago', 'website', 'new']);

  const mails = await h.db.query<any>('select kind, to_email, event_id from calendar.email_outbox order by id');
  assert.deepEqual(mails.map((m) => [m.kind, m.to_email, m.event_id]), [['lead', 'pprincyaaghaww@quanttoria.com', null], ['lead_confirmation', 'Pat@Example.test', null]]);

  await h.outbox();
  const [toTeacher, toParent] = h.mailer.sent;
  assert.equal(toTeacher.replyTo, 'Pat@Example.test');
  assert.match(toTeacher.text, /Grades 3–5/);
  assert.match(toParent.subject, /free class/);
  assert.match(toParent.text, /within one business day/);
  assert.match(toParent.text, /Bridging Gaps/);
  assert.equal(toParent.ics, undefined);
});

test('LEADS_TO decides who the teacher mail goes to', async () => {
  h.ctx.leadsTo = 'someone@example.test';
  try {
    await h.service('POST', '/v1/leads', lead());
    assert.equal((await h.db.query<any>(`select to_email from calendar.email_outbox where kind = 'lead'`))[0].to_email, 'someone@example.test');
  } finally { h.ctx.leadsTo = undefined; }
});

test('bad input is refused and saves nothing', async () => {
  for (const bad of [{ parentName: '' }, { parentName: 'x'.repeat(101) }, { email: 'nope' }, { grade: 'Grade 11' }, { goal: 'Fun' }, { timeZone: 'Mars/Base' }, { extra: 1 }]) {
    const r = await h.service('POST', '/v1/leads', lead(bad));
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.equal((await h.service('POST', '/v1/leads', { email: 'a@b.test' })).status, 400);
  assert.equal(await count('leads') + await count('email_outbox'), 0);
});

test('the honeypot field answers 201 and saves nothing', async () => {
  assert.equal((await h.service('POST', '/v1/leads', lead({ website: 'http://spam.test' }))).status, 201);
  assert.equal(await count('leads') + await count('email_outbox'), 0);
});

test('the same email on the same day is one request, however it is cased or how fast it is sent', async () => {
  const rs = await Promise.all([h.service('POST', '/v1/leads', lead()), h.service('POST', '/v1/leads', lead({ email: 'pat@example.test' }))]);
  assert.deepEqual(rs.map((r) => r.status), [201, 201]);
  assert.equal(await count('leads'), 1);
  assert.equal(await count('email_outbox'), 2);
  await h.db.query(`update calendar.leads set created_at = now() - interval '2 days'`);
  await h.service('POST', '/v1/leads', lead());
  assert.equal(await count('leads'), 2, 'a new day is a new request');
});

test('only the service key may submit; only admins read', async () => {
  const [admin, teacher] = [await h.person('admin'), await h.person('teacher')];
  assert.equal((await h.withToken('wrong-key')('POST', '/v1/leads', lead())).status, 401);
  assert.equal((await h.app.request('/v1/leads', { method: 'POST', body: JSON.stringify(lead()), headers: { 'content-type': 'application/json' } })).status, 401);
  assert.equal((await admin.call('POST', '/v1/leads', lead())).status, 403, 'a signed-in user is not the website');
  assert.equal(await count('leads'), 0);

  await h.service('POST', '/v1/leads', lead());
  await h.service('POST', '/v1/leads', lead({ email: 'second@example.test', parentName: 'Sam' }));
  await h.db.query(`update calendar.leads set created_at = now() - interval '1 hour' where email = 'Pat@Example.test'`);
  const page = await json(await admin.call('GET', '/v1/admin/leads?limit=1'));
  assert.equal(page.total, 2);
  assert.deepEqual(page.leads.map((l: any) => l.email), ['second@example.test'], 'newest first');
  const next = await json(await admin.call('GET', '/v1/admin/leads?limit=1&offset=1'));
  assert.equal(next.leads[0].parentName, 'Pat Parent');
  assert.equal((await teacher.call('GET', '/v1/admin/leads')).status, 403);
  assert.equal((await h.app.request('/v1/admin/leads')).status, 401);
});
