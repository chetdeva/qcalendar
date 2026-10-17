import { HttpError } from './errors.ts';
import type { Actor } from './auth.ts';
import type { Db, Queryable } from './db.ts';

/** Decides whether the caller may start a conversation with these members. Gets the caller's own Authorization header. */
export type Policy = (authorization: string, memberIds: string[]) => Promise<boolean>;
export interface Ctx { db: Db; policy?: Policy }

/** Asks another service (CHAT_POLICY_URL): 2xx = allowed, 4xx = refused, anything else = chat cannot decide. */
export const httpPolicy = (url: string): Policy => async (authorization, memberIds) => {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify({ memberIds }), signal: AbortSignal.timeout(5000) });
  } catch {
    throw new HttpError(502, 'policy_unavailable', 'Could not check whether this conversation is allowed');
  }
  if (res.ok) return true;
  if (res.status < 500) return false;
  throw new HttpError(502, 'policy_unavailable', 'Could not check whether this conversation is allowed');
};

interface ConvRow { id: string; ref_type: string | null; ref_id: string | null; created_at: Date; last_message_at: Date }
interface MsgRow { id: number; conversation_id: string; sender_id: string; body: string; created_at: Date }

const iso = (d: Date | string) => new Date(d).toISOString();
const messageOut = (m: MsgRow) => ({ id: m.id, senderId: m.sender_id, body: m.body, createdAt: iso(m.created_at) });

function userId(actor: Actor): string {
  if (actor.kind !== 'user') throw new HttpError(403, 'forbidden', 'This needs a signed-in user');
  return actor.id;
}

/** Conversations as seen by `me`: members, the last message and how many messages from others are unread. */
async function viewsFor(q: Queryable, me: string, where: string, args: unknown[]) {
  const convs = await q.query<ConvRow>(
    `select c.* from chat.conversations c join chat.conversation_members m on m.conversation_id = c.id and m.user_id = $1
     ${where} order by c.last_message_at desc, c.id`, [me, ...args]);
  if (!convs.length) return [];
  const ids = convs.map((c) => c.id);
  const members = await q.query<{ conversation_id: string; user_id: string }>(
    'select conversation_id, user_id from chat.conversation_members where conversation_id = any($1::uuid[]) order by joined_at, user_id', [ids]);
  const last = await q.query<MsgRow>(
    'select distinct on (conversation_id) * from chat.messages where conversation_id = any($1::uuid[]) order by conversation_id, id desc', [ids]);
  const unread = await q.query<{ conversation_id: string; n: number }>(
    `select m.conversation_id, count(*)::int as n from chat.messages m
       join chat.conversation_members me on me.conversation_id = m.conversation_id and me.user_id = $1
      where m.conversation_id = any($2::uuid[]) and m.sender_id <> $1 and m.created_at > me.last_read_at group by m.conversation_id`, [me, ids]);
  return convs.map((c) => {
    const lm = last.find((m) => m.conversation_id === c.id);
    return {
      id: c.id, refType: c.ref_type, refId: c.ref_id, createdAt: iso(c.created_at), lastMessageAt: iso(c.last_message_at),
      memberIds: members.filter((m) => m.conversation_id === c.id).map((m) => m.user_id),
      lastMessage: lm ? messageOut(lm) : null,
      unread: unread.find((u) => u.conversation_id === c.id)?.n ?? 0,
    };
  });
}

/** The conversation, only if `me` is a member. Everyone else gets the same 404 as for a conversation that does not exist. */
async function requireMember(q: Queryable, me: string, id: string) {
  const row = (await q.query('select 1 as ok from chat.conversation_members where conversation_id = $1 and user_id = $2', [id, me]))[0];
  if (!row) throw new HttpError(404, 'not_found', 'Conversation not found');
}

export interface CreateInput { memberIds: string[]; refType?: string; refId?: string }

/**
 * A trusted backend (API key) may open any conversation. A person may only when the policy service says so for exactly
 * these members, and they must be one of them. Two-person conversations are idempotent: the same pair gets the same one.
 */
export async function createConversation(ctx: Ctx, actor: Actor, authorization: string, input: CreateInput) {
  const members = [...new Set(input.memberIds.map((m) => m.toLowerCase()))].sort();
  if (members.length < 2) throw new HttpError(400, 'invalid_request', 'A conversation needs at least two different people');
  let me: string;
  if (actor.kind === 'user') {
    me = actor.id;
    if (!members.includes(me.toLowerCase())) throw new HttpError(403, 'forbidden', 'You can only start conversations you are part of');
    if (!ctx.policy) throw new HttpError(403, 'forbidden', 'Starting conversations is not enabled');
    if (!(await ctx.policy(authorization, members))) throw new HttpError(403, 'forbidden', 'You cannot start this conversation');
  } else {
    me = members[0]; // the view is rendered for the first member
  }
  const directKey = members.length === 2 ? members.join(':') : null;
  const id = await ctx.db.tx(async (q) => {
    if (directKey) {
      const found = (await q.query<{ id: string }>('select id from chat.conversations where direct_key = $1', [directKey]))[0];
      if (found) return found.id;
    }
    const c = (await q.query<{ id: string }>(
      'insert into chat.conversations (ref_type, ref_id, direct_key) values ($1,$2,$3) returning id',
      [input.refType ?? null, input.refId ?? null, directKey]))[0];
    for (const m of members) await q.query('insert into chat.conversation_members (conversation_id, user_id) values ($1,$2)', [c.id, m]);
    return c.id;
  }).catch(async (e) => {
    // Two requests for the same new pair raced: the unique key lets one win; the other reads the winner.
    if (directKey && e?.code === '23505') return (await ctx.db.query<{ id: string }>('select id from chat.conversations where direct_key = $1', [directKey]))[0].id;
    throw e;
  });
  return (await viewsFor(ctx.db, me, 'where c.id = $2', [id]))[0];
}

export async function listConversations(ctx: Ctx, actor: Actor) {
  return viewsFor(ctx.db, userId(actor), '', []);
}

export async function unreadTotal(ctx: Ctx, actor: Actor) {
  const me = userId(actor);
  const r = (await ctx.db.query<{ n: number }>(
    `select count(*)::int as n from chat.messages m join chat.conversation_members me on me.conversation_id = m.conversation_id and me.user_id = $1
      where m.sender_id <> $1 and m.created_at > me.last_read_at`, [me]))[0];
  return r.n;
}

/** No cursor: the latest `limit` messages. With `after`: only newer ones (what polling asks for). Always oldest first. */
export async function listMessages(ctx: Ctx, actor: Actor, id: string, o: { after?: number; limit: number }) {
  const me = userId(actor);
  await requireMember(ctx.db, me, id);
  const rows = o.after === undefined
    ? (await ctx.db.query<MsgRow>('select * from chat.messages where conversation_id = $1 order by id desc limit $2', [id, o.limit])).reverse()
    : await ctx.db.query<MsgRow>('select * from chat.messages where conversation_id = $1 and id > $2 order by id limit $3', [id, o.after, o.limit]);
  return rows.map(messageOut);
}

export async function sendMessage(ctx: Ctx, actor: Actor, id: string, body: string) {
  const me = userId(actor);
  return ctx.db.tx(async (q) => {
    await requireMember(q, me, id);
    const m = (await q.query<MsgRow>('insert into chat.messages (conversation_id, sender_id, body) values ($1,$2,$3) returning *', [id, me, body]))[0];
    await q.query('update chat.conversations set last_message_at = $2 where id = $1', [id, m.created_at]);
    await q.query('update chat.conversation_members set last_read_at = $3 where conversation_id = $1 and user_id = $2', [id, me, m.created_at]); // you have seen your own message
    return messageOut(m);
  });
}

export async function markRead(ctx: Ctx, actor: Actor, id: string) {
  const me = userId(actor);
  await requireMember(ctx.db, me, id);
  await ctx.db.query('update chat.conversation_members set last_read_at = now() where conversation_id = $1 and user_id = $2', [id, me]);
}
