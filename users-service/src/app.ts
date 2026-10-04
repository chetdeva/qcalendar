import { Hono } from 'hono';
import { z } from 'zod';
import type { Principal, Role, TokenVerifier } from './auth.ts';
import { DirectoryError, type Directory, type Profile } from './directory.ts';
import { HttpError } from './errors.ts';

export interface AppDeps {
  verifier: TokenVerifier;
  directory: Directory;
  inviteRedirectTo: string;
}

type Env = { Variables: { principal: Principal } };

function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'invalid_request', 'Invalid request', r.error.issues);
  return r.data;
}

const isTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

// .strict(): any extra key (role, status, email, id...) is rejected, so a client can never smuggle one in.
const MePatch = z
  .object({
    full_name: z.string().trim().min(1).max(100).nullable().optional(),
    timezone: z.string().refine(isTz, 'Unknown timezone').nullable().optional(),
    guardian_email: z.email().max(254).nullable().optional(),
  })
  .strict();

const InviteBody = z.object({ email: z.email().max(254), role: z.enum(['teacher', 'admin']) }).strict();
const RoleBody = z.object({ role: z.enum(['student', 'teacher', 'admin']) }).strict();
const ListQuery = z.object({
  q: z.string().max(100).optional(),
  role: z.enum(['student', 'teacher', 'admin']).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const IdParam = z.uuid();

/** What a teacher may know about a student: enough to pick them for a class, nothing more. */
const studentCard = (p: Profile) => ({ id: p.id, full_name: p.full_name, email: p.email });

export function createApp({ verifier, directory, inviteRedirectTo }: AppDeps) {
  const app = new Hono<Env>();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message, details: err.details } }, err.status as 400);
    }
    if (err instanceof DirectoryError) {
      const map = {
        last_admin: [409, 'Cannot demote or disable the last active admin'],
        email_exists: [409, 'That email already has an account'],
        invitation_pending: [409, 'That email already has a pending invitation'],
        upstream: [502, 'Identity provider error'],
      } as const;
      const [status, message] = map[err.code];
      return c.json({ error: { code: err.code, message } }, status);
    }
    console.error(err);
    return c.json({ error: { code: 'internal', message: 'Internal error' } }, 500);
  });

  app.get('/health', (c) => c.json({ ok: true }));

  app.use('/v1/*', async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new HttpError(401, 'unauthorized', 'Missing bearer token');
    const principal = await verifier.verify(token);
    if (principal.status === 'disabled') throw new HttpError(403, 'account_disabled', 'This account is disabled');
    c.set('principal', principal);
    await next();
  });

  /**
   * Admin-only routes check the database, not the token: a token can be up to an hour stale, and the cost of
   * trusting a demoted admin for that long is too high for user management.
   */
  const requireAdmin = async (c: { get: (k: 'principal') => Principal }) => {
    const me = await directory.getProfile(c.get('principal').id);
    if (!me || me.role !== 'admin' || me.status !== 'active') throw new HttpError(403, 'forbidden', 'Admin access required');
    return me;
  };

  const requireId = (raw: string) => {
    const r = IdParam.safeParse(raw);
    if (!r.success) throw new HttpError(400, 'invalid_request', 'Invalid user id');
    return r.data;
  };

  app.get('/v1/me', async (c) => {
    const me = await directory.getProfile(c.get('principal').id);
    if (!me) throw new HttpError(404, 'not_found', 'Profile not found');
    return c.json(me);
  });

  app.patch('/v1/me', async (c) => {
    const patch = parse(MePatch, await c.req.json().catch(() => null));
    const id = c.get('principal').id;
    const me = Object.keys(patch).length ? await directory.updateProfile(id, patch) : await directory.getProfile(id);
    if (!me) throw new HttpError(404, 'not_found', 'Profile not found');
    return c.json(me);
  });

  /**
   * Who is asking, according to the DATABASE. A token can be up to an hour behind a promotion or demotion, so decisions
   * about who may see whom are made from the stored role, never from the role inside the token.
   */
  const liveProfile = async (c: { get: (k: 'principal') => Principal }) => {
    const me = await directory.getProfile(c.get('principal').id);
    if (!me || me.status !== 'active') throw new HttpError(403, 'forbidden', 'This account cannot do that');
    return me;
  };

  // ---- directory: admins see everyone; teachers see active students (name + email only); students see nobody ----
  app.get('/v1/users', async (c) => {
    const me = await liveProfile(c);
    const q = parse(ListQuery, c.req.query());
    if (me.role === 'admin') {
      const rows = await directory.listProfiles({ search: q.q, role: q.role, status: q.status, limit: q.limit, offset: q.offset });
      return c.json({ users: rows });
    }
    if (me.role === 'teacher') {
      const rows = await directory.listProfiles({ search: q.q, role: 'student', status: 'active', limit: q.limit, offset: q.offset });
      return c.json({ users: rows.map(studentCard) });
    }
    throw new HttpError(403, 'forbidden', 'Students cannot browse users');
  });

  app.get('/v1/users/:id', async (c) => {
    const id = requireId(c.req.param('id'));
    const me = await liveProfile(c);
    if (id === me.id) return c.json(me);
    if (me.role === 'admin') {
      const user = await directory.getProfile(id);
      if (!user) throw new HttpError(404, 'not_found', 'User not found');
      return c.json(user);
    }
    if (me.role === 'teacher') {
      const user = await directory.getProfile(id);
      // Anyone a teacher may not see looks exactly like someone who does not exist.
      if (!user || user.role !== 'student' || user.status !== 'active') throw new HttpError(404, 'not_found', 'User not found');
      return c.json(studentCard(user));
    }
    throw new HttpError(403, 'forbidden', 'Not allowed');
  });

  // ---- admin: roles and account status ----
  app.patch('/v1/users/:id/role', async (c) => {
    const admin = await requireAdmin(c);
    const id = requireId(c.req.param('id'));
    const { role } = parse(RoleBody, await c.req.json().catch(() => null));
    if (id === admin.id) throw new HttpError(400, 'cannot_change_own_role', 'Ask another admin to change your role');
    const updated = await directory.setRole(id, role as Role);
    if (!updated) throw new HttpError(404, 'not_found', 'User not found');
    return c.json(updated);
  });

  app.post('/v1/users/:id/disable', async (c) => {
    const admin = await requireAdmin(c);
    const id = requireId(c.req.param('id'));
    if (id === admin.id) throw new HttpError(400, 'cannot_disable_self', 'You cannot disable your own account');
    const updated = await directory.setStatus(id, 'disabled'); // the database refuses to disable the last admin
    if (!updated) throw new HttpError(404, 'not_found', 'User not found');
    await directory.setBanned(id, true);
    return c.json(updated);
  });

  app.post('/v1/users/:id/enable', async (c) => {
    await requireAdmin(c);
    const id = requireId(c.req.param('id'));
    await directory.setBanned(id, false);
    const updated = await directory.setStatus(id, 'active');
    if (!updated) throw new HttpError(404, 'not_found', 'User not found');
    return c.json(updated);
  });

  // ---- admin: invitations (how teachers and extra admins get their role) ----
  app.post('/v1/invitations', async (c) => {
    const admin = await requireAdmin(c);
    const body = parse(InviteBody, await c.req.json().catch(() => null));
    const email = body.email.toLowerCase();
    const invitation = await directory.createInvitation({ email, role: body.role, invitedBy: admin.id });
    try {
      await directory.sendInviteEmail(email, inviteRedirectTo);
    } catch (e) {
      await directory.revokeInvitation(invitation.id); // do not leave a pending invite for an email we could not send to
      throw e;
    }
    return c.json(invitation, 201);
  });

  app.get('/v1/invitations', async (c) => {
    await requireAdmin(c);
    const status = c.req.query('status');
    const parsed = z.enum(['pending', 'accepted', 'revoked']).optional().safeParse(status);
    if (!parsed.success) throw new HttpError(400, 'invalid_request', 'Invalid status');
    return c.json({ invitations: await directory.listInvitations(parsed.data) });
  });

  app.delete('/v1/invitations/:id', async (c) => {
    await requireAdmin(c);
    const id = requireId(c.req.param('id'));
    const revoked = await directory.revokeInvitation(id);
    if (!revoked) throw new HttpError(404, 'not_found', 'No pending invitation with that id');
    return c.json(revoked);
  });

  return app;
}
