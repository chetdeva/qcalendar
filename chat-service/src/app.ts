import { Hono } from 'hono';
import { z } from 'zod';
import type { Actor, Authenticator } from './auth.ts';
import * as chat from './chat.ts';
import { HttpError } from './errors.ts';

type Env = { Variables: { actor: Actor; authorization: string } };

function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'invalid_request', 'Invalid request', r.error.issues);
  return r.data;
}

const uuid = z.uuid();
const CreateSchema = z.object({
  memberIds: z.array(uuid).min(2).max(20),
  refType: z.string().trim().min(1).max(50).optional(),
  refId: z.string().trim().min(1).max(200).optional(),
}).strict();
const SendSchema = z.object({ body: z.string().trim().min(1).max(2000) }).strict();
const MessagesQuery = z.object({
  after: z.coerce.number().int().min(0).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export interface AppDeps { ctx: chat.Ctx; authenticator: Authenticator }

export function createApp({ ctx, authenticator }: AppDeps) {
  const app = new Hono<Env>();

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status as 400);
    console.error(err);
    return c.json({ error: { code: 'internal', message: 'Internal error' } }, 500);
  });

  app.get('/health', (c) => c.json({ ok: true }));

  app.use('/v1/*', async (c, next) => {
    const header = c.req.header('authorization');
    c.set('actor', await authenticator.authenticate(header));
    c.set('authorization', header ?? '');
    await next();
  });

  const body = async (c: { req: { json: () => Promise<unknown> } }) => c.req.json().catch(() => null);
  const id = (raw: string) => {
    const r = uuid.safeParse(raw);
    if (!r.success) throw new HttpError(404, 'not_found', 'Conversation not found');
    return r.data;
  };

  app.post('/v1/conversations', async (c) => c.json(await chat.createConversation(ctx, c.get('actor'), c.get('authorization'), parse(CreateSchema, await body(c))), 201));
  app.get('/v1/conversations', async (c) => c.json({ conversations: await chat.listConversations(ctx, c.get('actor')) }));
  app.get('/v1/unread', async (c) => c.json({ unread: await chat.unreadTotal(ctx, c.get('actor')) }));

  app.get('/v1/conversations/:id/messages', async (c) => {
    const q = parse(MessagesQuery, c.req.query());
    return c.json({ messages: await chat.listMessages(ctx, c.get('actor'), id(c.req.param('id')), q) });
  });
  app.post('/v1/conversations/:id/messages', async (c) => {
    const { body: text } = parse(SendSchema, await body(c));
    return c.json(await chat.sendMessage(ctx, c.get('actor'), id(c.req.param('id')), text), 201);
  });
  app.post('/v1/conversations/:id/read', async (c) => {
    await chat.markRead(ctx, c.get('actor'), id(c.req.param('id')));
    return c.body(null, 204);
  });

  return app;
}
