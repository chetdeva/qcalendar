import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { createApp } from './app.ts';
import { createVerifier, type Role } from './auth.ts';
import { makeAdmin } from './bootstrap.ts';
import { DirectoryError } from './directory.ts';
import { MemoryDirectory } from '../tests/memory-directory.ts';

const ISS = 'https://project.supabase.co/auth/v1';
const REDIRECT = 'https://accounts.example.test/accept-invite';
const { publicKey, privateKey } = await generateKeyPair('ES256');
const other = await generateKeyPair('ES256');

let dir: MemoryDirectory;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  dir = new MemoryDirectory();
  app = createApp({ verifier: createVerifier(async () => publicKey, ISS), directory: dir, inviteRedirectTo: REDIRECT });
});

async function token(sub: string, role: Role | undefined, extra: { status?: string; key?: CryptoKey; iss?: string; aud?: string; exp?: string; userMeta?: object } = {}) {
  return new SignJWT({ email: `${sub}@example.test`, app_metadata: { role, status: extra.status ?? 'active' }, user_metadata: extra.userMeta ?? {} })
    .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
    .setSubject(sub).setIssuer(extra.iss ?? ISS).setAudience(extra.aud ?? 'authenticated').setIssuedAt()
    .setExpirationTime(extra.exp ?? '1h').sign(extra.key ?? privateKey);
}

/** Creates a profile and a matching signed-in client. */
async function as(role: Role, over: Partial<Parameters<MemoryDirectory['addProfile']>[0]> = {}) {
  const profile = dir.addProfile({ email: `${role}-${dir.profiles.size}@example.test`, full_name: `${role} person`, role, ...over });
  const jwt = await token(profile.id, role);
  const call = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { profile, jwt, call };
}

test('authentication: rejects missing, malformed, expired, foreign-key, wrong-issuer and wrong-audience tokens', async () => {
  assert.equal((await app.request('/v1/me')).status, 401);
  assert.equal((await app.request('/v1/me', { headers: { authorization: 'Bearer nonsense' } })).status, 401);
  const id = dir.addProfile({ email: 'a@example.test' }).id;
  const bad = [
    await token(id, 'student', { exp: '-1h' }),
    await token(id, 'student', { key: other.privateKey }),
    await token(id, 'student', { iss: 'https://evil.test/auth/v1' }),
    await token(id, 'student', { aud: 'service_role' }),
  ];
  for (const jwt of bad) assert.equal((await app.request('/v1/me', { headers: { authorization: `Bearer ${jwt}` } })).status, 401);
  assert.equal((await app.request('/health')).status, 200);
});

test('a role in user_metadata is ignored; only app_metadata counts', async () => {
  const student = dir.addProfile({ email: 's@example.test' });
  const jwt = await token(student.id, 'student', { userMeta: { role: 'admin' } });
  const res = await app.request('/v1/users', { headers: { authorization: `Bearer ${jwt}` } });
  assert.equal(res.status, 403);
  const noRole = await token(student.id, undefined);
  assert.equal((await app.request('/v1/invitations', { headers: { authorization: `Bearer ${noRole}` } })).status, 403);
});

test('a disabled account is refused even with a still-valid token', async () => {
  const u = dir.addProfile({ email: 'x@example.test', status: 'disabled' });
  const jwt = await token(u.id, 'student', { status: 'disabled' });
  const res = await app.request('/v1/me', { headers: { authorization: `Bearer ${jwt}` } });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error.code, 'account_disabled');
});

test('/me: read and update name, timezone and guardian email; clear with null', async () => {
  const { call } = await as('student');
  const updated = await (await call('PATCH', '/v1/me', { full_name: ' Mia Chen ', timezone: 'Asia/Kolkata', guardian_email: 'parent@example.test' })).json();
  assert.equal(updated.full_name, 'Mia Chen');
  assert.equal(updated.timezone, 'Asia/Kolkata');
  assert.equal(updated.guardian_email, 'parent@example.test');
  assert.equal((await (await call('GET', '/v1/me')).json()).guardian_email, 'parent@example.test');
  assert.equal((await (await call('PATCH', '/v1/me', { guardian_email: null })).json()).guardian_email, null);
  assert.equal((await call('PATCH', '/v1/me', {})).status, 200);
});

test('/me: rejects role, status, email, id and other unknown fields, and bad values', async () => {
  const { call, profile } = await as('student');
  for (const body of [{ role: 'admin' }, { status: 'active' }, { email: 'new@example.test' }, { id: 'x' }, { full_name: 'ok', is_admin: true }]) {
    assert.equal((await call('PATCH', '/v1/me', body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await call('PATCH', '/v1/me', { guardian_email: 'nope' })).status, 400);
  assert.equal((await call('PATCH', '/v1/me', { timezone: 'Mars/Base' })).status, 400);
  assert.equal((await call('PATCH', '/v1/me', { full_name: '' })).status, 400);
  assert.equal(dir.profiles.get(profile.id)?.role, 'student');
});

test('students cannot browse users, invite, or change roles', async () => {
  const { call } = await as('student');
  const target = dir.addProfile({ email: 't@example.test' });
  assert.equal((await call('GET', '/v1/users')).status, 403);
  assert.equal((await call('GET', `/v1/users/${target.id}`)).status, 403);
  assert.equal((await call('POST', '/v1/invitations', { email: 'n@example.test', role: 'teacher' })).status, 403);
  assert.equal((await call('GET', '/v1/invitations')).status, 403);
  assert.equal((await call('PATCH', `/v1/users/${target.id}/role`, { role: 'admin' })).status, 403);
  assert.equal((await call('POST', `/v1/users/${target.id}/disable`)).status, 403);
});

test('teachers see active students with name and email only, never staff, disabled users or guardian emails', async () => {
  const { call } = await as('teacher');
  const kid = dir.addProfile({ email: 'kid@example.test', full_name: 'Kid One', guardian_email: 'mum@example.test', timezone: 'UTC' });
  dir.addProfile({ email: 'gone@example.test', full_name: 'Gone', status: 'disabled' });
  const staff = dir.addProfile({ email: 'boss@example.test', role: 'admin' });

  const list = (await (await call('GET', '/v1/users')).json()).users;
  assert.deepEqual(list.map((u: { email: string }) => u.email), ['kid@example.test']);
  assert.deepEqual(Object.keys(list[0]).sort(), ['email', 'full_name', 'id']);

  const one = await (await call('GET', `/v1/users/${kid.id}`)).json();
  assert.deepEqual(Object.keys(one).sort(), ['email', 'full_name', 'id']);
  assert.equal((await call('GET', `/v1/users/${staff.id}`)).status, 404);
  assert.equal((await call('GET', '/v1/users?role=admin')).status, 200);
  assert.deepEqual((await (await call('GET', '/v1/users?role=admin')).json()).users.map((u: { email: string }) => u.email), ['kid@example.test']);
  assert.equal((await call('POST', '/v1/invitations', { email: 'n@example.test', role: 'teacher' })).status, 403);
  assert.equal((await call('PATCH', `/v1/users/${kid.id}/role`, { role: 'teacher' })).status, 403);
});

test('teacher search by name or email, with paging', async () => {
  const { call } = await as('teacher');
  for (const n of ['Ana', 'Ben', 'Anya', 'Carl']) dir.addProfile({ email: `${n.toLowerCase()}@example.test`, full_name: n });
  assert.equal((await (await call('GET', '/v1/users?q=an')).json()).users.length, 2);
  assert.equal((await (await call('GET', '/v1/users?q=CARL@')).json()).users.length, 1);
  assert.equal((await (await call('GET', '/v1/users?limit=2')).json()).users.length, 2);
  assert.equal((await (await call('GET', '/v1/users?limit=2&offset=3')).json()).users.length, 1);
  assert.equal((await call('GET', '/v1/users?limit=1000')).status, 400);
});

test('admins see everyone with full fields and can filter', async () => {
  const { call } = await as('admin');
  dir.addProfile({ email: 'kid@example.test', guardian_email: 'mum@example.test' });
  dir.addProfile({ email: 'tea@example.test', role: 'teacher' });
  const all = (await (await call('GET', '/v1/users')).json()).users;
  assert.equal(all.length, 3);
  assert.ok(all.every((u: object) => 'guardian_email' in u && 'role' in u && 'status' in u));
  assert.equal((await (await call('GET', '/v1/users?role=teacher')).json()).users.length, 1);
  const kid = all.find((u: { email: string }) => u.email === 'kid@example.test');
  assert.equal((await (await call('GET', `/v1/users/${kid.id}`)).json()).guardian_email, 'mum@example.test');
  assert.equal((await call('GET', '/v1/users/not-a-uuid')).status, 400);
});

test('a stale admin token is not enough: admin routes check the database', async () => {
  const demoted = dir.addProfile({ email: 'was-admin@example.test', role: 'student' });
  const jwt = await token(demoted.id, 'admin'); // token still says admin, database says student
  const res = await app.request('/v1/users', { headers: { authorization: `Bearer ${jwt}` } });
  assert.equal(res.status, 403);
  assert.equal((await app.request('/v1/invitations', { method: 'POST', headers: { authorization: `Bearer ${jwt}`, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'x@example.test', role: 'admin' }) })).status, 403);
});

test('a token that is behind the database never locks people out or lets them see too much', async () => {
  const get = (jwt: string, path: string) => app.request(path, { headers: { authorization: `Bearer ${jwt}` } });
  dir.addProfile({ email: 'kid@example.test', full_name: 'Kid One', guardian_email: 'mum@example.test' });

  // Promoted to admin AFTER signing in: the token still says student, the database says admin.
  const newAdmin = dir.addProfile({ email: 'new-admin@example.test', role: 'admin' });
  const lagging = await token(newAdmin.id, 'student');
  const list = await get(lagging, '/v1/users');
  assert.equal(list.status, 200);
  assert.ok((await list.json()).users.every((u: object) => 'guardian_email' in u), 'admins get the full view');
  assert.equal((await get(lagging, `/v1/users/${newAdmin.id}`)).status, 200);
  assert.equal((await get(lagging, '/v1/invitations')).status, 200);

  // Promoted to teacher after signing in: can now search students.
  const newTeacher = dir.addProfile({ email: 'new-teacher@example.test', role: 'teacher' });
  const res = await get(await token(newTeacher.id, 'student'), '/v1/users');
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).users.map((u: { email: string }) => u.email), ['kid@example.test']);

  // Demoted from admin to teacher: the old admin token must not keep the admin view or the guardian emails.
  const demoted = dir.addProfile({ email: 'demoted@example.test', role: 'teacher' });
  const stale = await get(await token(demoted.id, 'admin'), '/v1/users');
  const body = await stale.json();
  assert.ok(body.users.every((u: object) => Object.keys(u).sort().join() === 'email,full_name,id'), 'only the teacher view');
  assert.ok(!JSON.stringify(body).includes('mum@example.test'));

  // Demoted to student: nothing at all.
  const gone = dir.addProfile({ email: 'gone@example.test', role: 'student' });
  assert.equal((await get(await token(gone.id, 'admin'), '/v1/users')).status, 403);
  assert.equal((await get(await token(gone.id, 'teacher'), `/v1/users/${newAdmin.id}`)).status, 403);

  // Disabled in the database, token still looks fine.
  const off = dir.addProfile({ email: 'off@example.test', role: 'admin', status: 'disabled' });
  assert.equal((await get(await token(off.id, 'admin'), '/v1/users')).status, 403);
});

test('invitations: create, email is lower-cased and sent, duplicates and bad input rejected, revoke', async () => {
  const { call } = await as('admin');
  const res = await call('POST', '/v1/invitations', { email: 'New.Teacher@Example.test', role: 'teacher' });
  assert.equal(res.status, 201);
  const inv = await res.json();
  assert.equal(inv.email, 'new.teacher@example.test');
  assert.equal(inv.role, 'teacher');
  assert.deepEqual(dir.sentInvites, [{ email: 'new.teacher@example.test', redirectTo: REDIRECT }]);

  assert.equal((await call('POST', '/v1/invitations', { email: 'NEW.teacher@example.test', role: 'admin' })).status, 409);
  assert.equal((await call('POST', '/v1/invitations', { email: 'x@example.test', role: 'student' })).status, 400);
  assert.equal((await call('POST', '/v1/invitations', { email: 'not-an-email', role: 'teacher' })).status, 400);
  assert.equal((await call('POST', '/v1/invitations', { email: 'x@example.test', role: 'teacher', status: 'accepted' })).status, 400);

  assert.equal((await (await call('GET', '/v1/invitations?status=pending')).json()).invitations.length, 1);
  assert.equal((await call('DELETE', `/v1/invitations/${inv.id}`)).status, 200);
  assert.equal((await call('DELETE', `/v1/invitations/${inv.id}`)).status, 404);
  assert.equal((await call('POST', '/v1/invitations', { email: 'new.teacher@example.test', role: 'teacher' })).status, 201);
});

test('invitations: an email that already has an account, or a mail failure, leaves no pending invitation behind', async () => {
  const { call } = await as('admin');
  dir.confirmedEmails.add('taken@example.test');
  const exists = await call('POST', '/v1/invitations', { email: 'taken@example.test', role: 'teacher' });
  assert.equal(exists.status, 409);
  assert.equal((await exists.json()).error.code, 'email_exists');
  dir.failInvites = true;
  assert.equal((await call('POST', '/v1/invitations', { email: 'fine@example.test', role: 'teacher' })).status, 502);
  assert.equal((await dir.listInvitations('pending')).length, 0);
});

test('an expired pending invitation does not block inviting the same email again', async () => {
  const { call, profile } = await as('admin');
  const old = await dir.createInvitation({ email: 'late@example.test', role: 'teacher', invitedBy: profile.id });
  old.expires_at = new Date(Date.now() - 1000).toISOString();
  assert.equal((await call('POST', '/v1/invitations', { email: 'late@example.test', role: 'teacher' })).status, 201);
});

test('role changes: promote and demote another user; never your own; unknown roles and ids are refused', async () => {
  const { call, profile: me } = await as('admin');
  const kid = dir.addProfile({ email: 'kid@example.test' });
  assert.equal((await (await call('PATCH', `/v1/users/${kid.id}/role`, { role: 'teacher' })).json()).role, 'teacher');
  assert.equal((await (await call('PATCH', `/v1/users/${kid.id}/role`, { role: 'student' })).json()).role, 'student');
  assert.equal((await call('PATCH', `/v1/users/${kid.id}/role`, { role: 'owner' })).status, 400);
  assert.equal((await call('PATCH', `/v1/users/${me.id}/role`, { role: 'student' })).status, 400, 'own role');
  assert.equal(dir.profiles.get(me.id)!.role, 'admin');
  assert.equal((await call('PATCH', `/v1/users/${crypto.randomUUID()}/role`, { role: 'teacher' })).status, 404);
});

test('an admin demoted by another admin loses admin powers immediately, despite a still-valid token', async () => {
  const a = await as('admin');
  const b = await as('admin');
  assert.equal((await a.call('PATCH', `/v1/users/${b.profile.id}/role`, { role: 'student' })).status, 200);
  assert.equal((await b.call('PATCH', `/v1/users/${a.profile.id}/role`, { role: 'student' })).status, 403);
  assert.equal((await b.call('POST', '/v1/invitations', { email: 'x@example.test', role: 'admin' })).status, 403);
  assert.equal(dir.profiles.get(a.profile.id)!.role, 'admin', 'the remaining admin is untouched');
});

test('the database guard against removing the last admin surfaces as a 409', async () => {
  const { call } = await as('admin');
  const kid = dir.addProfile({ email: 'kid@example.test', role: 'admin' });
  dir.setRole = async () => { throw new DirectoryError('last_admin', 'cannot demote or disable the last active admin'); };
  dir.setStatus = dir.setRole;
  const demote = await call('PATCH', `/v1/users/${kid.id}/role`, { role: 'student' });
  assert.equal(demote.status, 409);
  assert.equal((await demote.json()).error.code, 'last_admin');
  assert.equal((await call('POST', `/v1/users/${kid.id}/disable`)).status, 409);
  assert.ok(!dir.banned.has(kid.id), 'a refused disable must not ban the account');
});

test('MemoryDirectory mirrors the database rule: the sole active admin cannot be demoted or disabled', async () => {
  const only = dir.addProfile({ email: 'only@example.test', role: 'admin' });
  await assert.rejects(() => dir.setRole(only.id, 'student'), /last active admin/);
  await assert.rejects(() => dir.setStatus(only.id, 'disabled'), /last active admin/);
  dir.addProfile({ email: 'second@example.test', role: 'admin' });
  assert.equal((await dir.setRole(only.id, 'student'))?.role, 'student');
});

test('disable and enable: bans sign-in, and an admin cannot disable themselves', async () => {
  const { call, profile: me } = await as('admin');
  const kid = dir.addProfile({ email: 'kid@example.test' });
  const off = await (await call('POST', `/v1/users/${kid.id}/disable`)).json();
  assert.equal(off.status, 'disabled');
  assert.ok(dir.banned.has(kid.id));
  const on = await (await call('POST', `/v1/users/${kid.id}/enable`)).json();
  assert.equal(on.status, 'active');
  assert.ok(!dir.banned.has(kid.id));
  assert.equal((await call('POST', `/v1/users/${me.id}/disable`)).status, 400);
  assert.equal((await call('POST', `/v1/users/${crypto.randomUUID()}/disable`)).status, 404);
});

test('makeAdmin promotes an existing account, is idempotent, and refuses unknown emails', async () => {
  const u = dir.addProfile({ email: 'First@Example.test' });
  assert.equal((await makeAdmin(dir, 'first@example.test')).role, 'admin');
  assert.equal(dir.profiles.get(u.id)!.role, 'admin');
  assert.equal((await makeAdmin(dir, 'first@example.test')).role, 'admin');
  await assert.rejects(() => makeAdmin(dir, 'nobody@example.test'), /Sign up first/);
});
