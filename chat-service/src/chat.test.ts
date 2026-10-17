import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createHarness, json, signToken } from '../tests/harness.ts';
import { httpPolicy } from './chat.ts';

let h: Awaited<ReturnType<typeof createHarness>>;
before(async () => { h = await createHarness(); });
after(() => h.close());
beforeEach(async () => { await h.reset(); h.state.policy = async () => true; });

const open = async (a: { id: string; call: any }, b: { id: string }) => {
  const res = await a.call('POST', '/v1/conversations', { memberIds: [a.id, b.id] });
  assert.ok(res.status === 201, JSON.stringify(await res.clone().json()));
  return json(res);
};
const say = async (p: { call: any }, id: string, body: string) => {
  const res = await p.call('POST', `/v1/conversations/${id}/messages`, { body });
  assert.equal(res.status, 201);
  return json(res);
};

test('starting a conversation: refused without a policy, or when the policy says no; allowed when it says yes', async () => {
  const [a, b] = [await h.person(), await h.person()];
  h.state.policy = undefined;
  assert.equal((await a.call('POST', '/v1/conversations', { memberIds: [a.id, b.id] })).status, 403);
  h.state.policy = async () => false;
  assert.equal((await a.call('POST', '/v1/conversations', { memberIds: [a.id, b.id] })).status, 403);
  let seen: { auth: string; ids: string[] } | undefined;
  h.state.policy = async (auth, ids) => ((seen = { auth, ids }), true);
  const c = await open(a, b);
  assert.deepEqual(c.memberIds.sort(), [a.id, b.id].sort());
  assert.match(seen!.auth, /^Bearer ey/); // the policy gets the caller's own token, not ours
  assert.deepEqual(seen!.ids, [a.id, b.id].sort());
});

test('a person cannot start a conversation they are not part of; the API key can start any', async () => {
  const [a, b, c] = [await h.person(), await h.person(), await h.person()];
  assert.equal((await a.call('POST', '/v1/conversations', { memberIds: [b.id, c.id] })).status, 403);
  const res = await h.service('POST', '/v1/conversations', { memberIds: [b.id, c.id], refType: 'class', refId: 'evt-1' });
  assert.equal(res.status, 201);
  const conv = await json(res);
  assert.equal(conv.refType, 'class');
  assert.equal((await json(await b.call('GET', '/v1/conversations'))).conversations.length, 1);
  assert.equal((await json(await a.call('GET', '/v1/conversations'))).conversations.length, 0);
});

test('input is validated: ids, member count, unknown keys', async () => {
  const a = await h.person();
  for (const memberIds of [[a.id], ['nope', a.id], [a.id, a.id].slice(0, 2)]) {
    assert.ok([400, 403].includes((await a.call('POST', '/v1/conversations', { memberIds })).status));
  }
  assert.equal((await a.call('POST', '/v1/conversations', { memberIds: [a.id, randomUUID()], role: 'admin' })).status, 400);
  assert.equal((await a.call('POST', '/v1/conversations', { memberIds: [a.id, a.id] })).status, 400); // one person twice is not a conversation
});

test('the same pair always gets the same conversation, in either order', async () => {
  const [a, b] = [await h.person(), await h.person()];
  const first = await open(a, b);
  const again = await open(b, a);
  assert.equal(again.id, first.id);
  assert.equal((await h.db.query('select 1 from chat.conversations')).length, 1);
  const raced = await Promise.all([a, b].map((p, i) => open(p, [a, b][1 - i])));
  assert.equal(raced[0].id, raced[1].id);
});

test('both members read the same thread; a third person gets 404 on read, send and mark-read', async () => {
  const [a, b, x] = [await h.person(), await h.person(), await h.person()];
  const c = await open(a, b);
  await say(a, c.id, 'Hi Bea');
  await say(b, c.id, 'Hi Ann');
  for (const p of [a, b]) {
    const msgs = (await json(await p.call('GET', `/v1/conversations/${c.id}/messages`))).messages;
    assert.deepEqual(msgs.map((m: any) => [m.senderId, m.body]), [[a.id, 'Hi Bea'], [b.id, 'Hi Ann']]);
  }
  assert.equal((await x.call('GET', `/v1/conversations/${c.id}/messages`)).status, 404);
  assert.equal((await x.call('POST', `/v1/conversations/${c.id}/messages`, { body: 'hey' })).status, 404);
  assert.equal((await x.call('POST', `/v1/conversations/${c.id}/read`)).status, 404);
  assert.equal((await x.call('GET', '/v1/conversations/not-a-uuid/messages')).status, 404);
  assert.equal((await h.service('GET', '/v1/conversations')).status, 403); // the key opens conversations but does not read them
});

test('polling: after=<last id> returns only newer messages; with no cursor, the latest ones in order', async () => {
  const [a, b] = [await h.person(), await h.person()];
  const c = await open(a, b);
  const sent = [];
  for (const t of ['one', 'two', 'three']) sent.push(await say(a, c.id, t));
  const after = async (n: number) => (await json(await b.call('GET', `/v1/conversations/${c.id}/messages?after=${n}`))).messages.map((m: any) => m.body);
  assert.deepEqual(await after(sent[0].id), ['two', 'three']);
  assert.deepEqual(await after(sent[2].id), []);
  const latest = (await json(await b.call('GET', `/v1/conversations/${c.id}/messages?limit=2`))).messages.map((m: any) => m.body);
  assert.deepEqual(latest, ['two', 'three']);
});

test('unread: rises for the receiver only, shows per conversation and in total, clears on read', async () => {
  const [a, b, c3] = [await h.person(), await h.person(), await h.person()];
  const ab = await open(a, b);
  const ac = await open(c3, a);
  await say(a, ab.id, 'x'); await say(a, ab.id, 'y'); await say(c3, ac.id, 'z');
  const list = async (p: typeof a) => (await json(await p.call('GET', '/v1/conversations'))).conversations;
  assert.equal((await list(a)).find((c: any) => c.id === ab.id).unread, 0); // my own messages are not unread
  assert.equal((await list(b))[0].unread, 2);
  assert.deepEqual((await json(await a.call('GET', '/v1/unread'))), { unread: 1 });
  assert.deepEqual((await json(await b.call('GET', '/v1/unread'))), { unread: 2 });
  assert.equal((await b.call('POST', `/v1/conversations/${ab.id}/read`)).status, 204);
  assert.deepEqual((await json(await b.call('GET', '/v1/unread'))), { unread: 0 });
  const last = (await list(b))[0];
  assert.equal(last.lastMessage.body, 'y');
  await say(a, ab.id, 'again');
  assert.equal((await json(await b.call('GET', '/v1/unread'))).unread, 1);
});

test('conversations list newest activity first', async () => {
  const [a, b, c3] = [await h.person(), await h.person(), await h.person()];
  const ab = await open(a, b);
  const ac = await open(a, c3);
  await say(a, ab.id, 'later');
  assert.deepEqual((await json(await a.call('GET', '/v1/conversations'))).conversations.map((c: any) => c.id), [ab.id, ac.id]);
});

test('messages are trimmed and must be 1 to 2000 characters', async () => {
  const [a, b] = [await h.person(), await h.person()];
  const c = await open(a, b);
  assert.equal((await say(a, c.id, '  hello  ')).body, 'hello');
  for (const body of ['', '   ', 'x'.repeat(2001), 5 as any]) assert.equal((await a.call('POST', `/v1/conversations/${c.id}/messages`, { body })).status, 400);
  assert.equal((await a.call('POST', `/v1/conversations/${c.id}/messages`, { body: 'x'.repeat(2000) })).status, 201);
});

test('a conversation can have three members (the model is not tied to pairs)', async () => {
  const [a, b, c3] = [await h.person(), await h.person(), await h.person()];
  const conv = await json(await h.service('POST', '/v1/conversations', { memberIds: [a.id, b.id, c3.id] }));
  assert.equal(conv.memberIds.length, 3);
  await say(a, conv.id, 'all hands');
  for (const p of [b, c3]) assert.equal((await json(await p.call('GET', '/v1/unread'))).unread, 1);
});

test('authentication: no token, a bad token and a disabled account are refused', async () => {
  assert.equal((await h.app.request('/v1/conversations')).status, 401);
  assert.equal((await h.withToken('nonsense')('GET', '/v1/conversations')).status, 401);
  const off = await signToken(randomUUID(), { status: 'disabled' });
  assert.equal((await h.withToken(off)('GET', '/v1/conversations')).status, 403);
  assert.equal((await h.app.request('/health')).status, 200);
});

test('httpPolicy: 2xx allows, 4xx refuses, a server error or a dead server is a 502, and the token is forwarded', async () => {
  let status = 204; let got = '';
  const server = createServer((req, res) => { got = String(req.headers.authorization); res.statusCode = status; res.end(); });
  await new Promise<void>((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${(server.address() as any).port}/p`;
  const policy = httpPolicy(url);
  assert.equal(await policy('Bearer tok', ['a', 'b']), true);
  assert.equal(got, 'Bearer tok');
  status = 403; assert.equal(await policy('Bearer tok', ['a', 'b']), false);
  status = 500; await assert.rejects(policy('Bearer tok', ['a', 'b']), { status: 502 });
  await new Promise((r) => server.close(r));
  await assert.rejects(policy('Bearer tok', ['a', 'b']), { status: 502 });
});
