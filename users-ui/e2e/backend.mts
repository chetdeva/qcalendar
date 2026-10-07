// Test backend for the Playwright suite: a small fake of Supabase Auth (GoTrue) plus the REAL users-service
// application code running on an in-memory directory. Both live in this one process so the fake can do what the
// database triggers do in production (create a profile, apply an invitation once the email is confirmed).
//
//   fake Supabase Auth  http://localhost:58731   (sign up, password login, PKCE code exchange, refresh, recovery,
//                                                 invite + confirmation links, Google "authorize", JWKS, /__test helpers)
//   users-service       http://localhost:58732
import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { serve } from '@hono/node-server';
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import { createApp } from '../../users-service/src/app.ts';
import { createVerifier } from '../../users-service/src/auth.ts';
import { DirectoryError } from '../../users-service/src/directory.ts';
import { MemoryDirectory } from '../../users-service/tests/memory-directory.ts';

const AUTH_PORT = 58731;
const USERS_PORT = 58732;
const AUTH_URL = `http://localhost:${AUTH_PORT}`;
const ISS = `${AUTH_URL}/auth/v1`;
const WEB = 'http://localhost:58733';

const { publicKey, privateKey } = await generateKeyPair('ES256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'e2e-key', alg: 'ES256', use: 'sig' };

interface AuthUser {
  id: string; email: string; password: string | null; confirmed: boolean;
  provider: 'email' | 'google'; name: string; createdAt: string;
}
interface Mail { to: string; kind: 'signup' | 'recovery' | 'invite'; link: string }

const users = new Map<string, AuthUser>();
const codes = new Map<string, string>();       // PKCE auth code -> user id
const refreshTokens = new Map<string, string>(); // refresh token -> user id
const verifyTokens = new Map<string, { userId: string; type: 'signup' | 'recovery' | 'invite'; redirectTo: string }>();
let inbox: Mail[] = [];
const directory = new MemoryDirectory();

const byEmail = (email: string) => [...users.values()].find((u) => u.email.toLowerCase() === email.toLowerCase());

/** What the database triggers do: profile row on sign-up, invitation applied once the email is confirmed. */
function applyInvitation(u: AuthUser) {
  const inv = directory.invitations.find((i) => i.email === u.email.toLowerCase() && i.status === 'pending' && Date.parse(i.expires_at) > Date.now());
  const profile = directory.profiles.get(u.id);
  if (inv && profile) { profile.role = inv.role; inv.status = 'accepted'; inv.accepted_at = new Date().toISOString(); }
}
function createUser(email: string, password: string | null, opts: { confirmed?: boolean; name?: string; provider?: 'email' | 'google'; role?: 'student' | 'teacher' | 'admin' } = {}) {
  const u: AuthUser = { id: randomUUID(), email, password, confirmed: false, provider: opts.provider ?? 'email', name: opts.name ?? '', createdAt: new Date().toISOString() };
  users.set(u.id, u);
  directory.addProfile({ id: u.id, email, full_name: u.name || null, role: opts.role ?? 'student' });
  if (opts.confirmed) confirm(u);
  return u;
}
function confirm(u: AuthUser) {
  if (u.confirmed) return;
  u.confirmed = true;
  applyInvitation(u);
}
directory.sendInviteEmail = async (email, redirectTo) => {
  if (directory.failInvites) throw new DirectoryError('upstream', 'smtp down');
  const existing = byEmail(email);
  if (existing?.confirmed) throw new DirectoryError('email_exists', 'exists');
  const u = existing ?? createUser(email, null);
  mail(u, 'invite', redirectTo);
};

function mail(u: AuthUser, kind: Mail['kind'], redirectTo: string) {
  const token = randomBytes(12).toString('hex');
  verifyTokens.set(token, { userId: u.id, type: kind, redirectTo });
  inbox.push({ to: u.email, kind, link: `${AUTH_URL}/auth/v1/verify?token=${token}&type=${kind}&redirect_to=${encodeURIComponent(redirectTo)}` });
}

async function mint(u: AuthUser) {
  const profile = directory.profiles.get(u.id);
  const now = Math.floor(Date.now() / 1000);
  const access_token = await new SignJWT({
    email: u.email, role: 'authenticated', session_id: randomUUID(),
    app_metadata: { provider: u.provider, providers: [u.provider], role: profile?.role ?? 'student', status: profile?.status ?? 'active' },
    user_metadata: { full_name: u.name, email: u.email },
  }).setProtectedHeader({ alg: 'ES256', kid: 'e2e-key', typ: 'JWT' }).setSubject(u.id).setIssuer(ISS).setAudience('authenticated').setIssuedAt(now).setExpirationTime(now + 3600).sign(privateKey);
  const refresh_token = randomBytes(8).toString('hex');
  refreshTokens.set(refresh_token, u.id);
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token, user: userJson(u) };
}

function userJson(u: AuthUser) {
  const at = u.confirmed ? u.createdAt : null;
  return {
    id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: at, confirmed_at: at, phone: '',
    last_sign_in_at: at, app_metadata: { provider: u.provider, providers: [u.provider] },
    user_metadata: { full_name: u.name, email: u.email }, identities: [{ identity_id: u.id, id: u.id, user_id: u.id, provider: u.provider }],
    created_at: u.createdAt, updated_at: u.createdAt, is_anonymous: false,
  };
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info,x-supabase-api-version',
};
const err = (res: http.ServerResponse, status: number, error_code: string, msg: string) =>
  send(res, status, { code: status, error_code, msg });
function send(res: http.ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { ...CORS, 'content-type': 'application/json', ...headers });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}
const redirect = (res: http.ServerResponse, to: string) => { res.writeHead(302, { ...CORS, location: to }); res.end(); };
const readJson = (req: http.IncomingMessage) =>
  new Promise<Record<string, any>>((resolve) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
  });

async function userFromBearer(req: http.IncomingMessage) {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  try {
    const { payload } = await jwtVerify(token, publicKey, { issuer: ISS, audience: 'authenticated' });
    return users.get(payload.sub!) ?? null;
  } catch { return null; }
}

function reset() {
  users.clear(); codes.clear(); refreshTokens.clear(); verifyTokens.clear(); inbox = [];
  directory.profiles.clear(); directory.invitations.length = 0; directory.banned.clear(); directory.sentInvites.length = 0; directory.failInvites = false;
  createUser('admin@example.test', 'admin-pass-123', { confirmed: true, name: 'Ada Admin', role: 'admin' });
}
reset();

const taken = (e: NodeJS.ErrnoException) => { console.error(e.code === 'EADDRINUSE' ? `Port ${AUTH_PORT} is already in use; refusing to start so tests never talk to someone else's server.` : e); process.exit(1); };
http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', AUTH_URL);
  const path = url.pathname;
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  // ---------- test helpers ----------
  if (path === '/__test/health') return send(res, 200, { ok: true });
  if (path === '/__test/reset' && req.method === 'POST') { reset(); return send(res, 200, { ok: true }); }
  if (path === '/__test/user' && req.method === 'POST') {
    const b = await readJson(req);
    const u = createUser(b.email, b.password ?? null, { confirmed: b.confirmed ?? true, name: b.name ?? '', role: b.role ?? 'student', provider: b.provider });
    return send(res, 200, { id: u.id });
  }
  if (path === '/__test/mail') {
    const to = url.searchParams.get('to')?.toLowerCase();
    const kind = url.searchParams.get('kind');
    return send(res, 200, inbox.filter((m) => (!to || m.to.toLowerCase() === to) && (!kind || m.kind === kind)));
  }
  if (path === '/__test/profile') {
    const p = await directory.findProfileByEmail(url.searchParams.get('email') ?? '');
    return send(res, 200, p ?? null);
  }

  // ---------- Supabase Auth ----------
  if (path === '/auth/v1/.well-known/jwks.json') return send(res, 200, { keys: [jwk] });

  if (path === '/auth/v1/signup' && req.method === 'POST') {
    const b = await readJson(req);
    if (typeof b.password !== 'string' || b.password.length < 6) return err(res, 422, 'weak_password', 'Password should be at least 6 characters.');
    const existing = byEmail(b.email);
    if (existing) return send(res, 200, { ...userJson(existing), identities: [] }); // looks like success, leaks nothing
    const u = createUser(b.email, b.password, { name: b.data?.full_name ?? '' });
    mail(u, 'signup', url.searchParams.get('redirect_to') ?? WEB);
    return send(res, 200, userJson(u));
  }

  if (path === '/auth/v1/resend' && req.method === 'POST') {
    const b = await readJson(req);
    const u = byEmail(b.email);
    if (u && !u.confirmed) mail(u, 'signup', url.searchParams.get('redirect_to') ?? WEB);
    return send(res, 200, { message_id: randomUUID() });
  }

  if (path === '/auth/v1/token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type');
    const b = await readJson(req);
    if (grant === 'password') {
      const u = byEmail(b.email ?? '');
      if (!u || u.password === null || u.password !== b.password) return err(res, 400, 'invalid_credentials', 'Invalid login credentials');
      if (!u.confirmed) return err(res, 400, 'email_not_confirmed', 'Email not confirmed');
      if (directory.banned.has(u.id)) return err(res, 400, 'user_banned', 'User is banned');
      return send(res, 200, await mint(u));
    }
    if (grant === 'pkce') {
      const id = codes.get(b.auth_code);
      codes.delete(b.auth_code);
      const u = id && users.get(id);
      if (!u) return err(res, 400, 'flow_state_not_found', 'invalid flow state, no valid flow state found');
      return send(res, 200, await mint(u));
    }
    if (grant === 'refresh_token') {
      const id = refreshTokens.get(b.refresh_token);
      refreshTokens.delete(b.refresh_token);
      const u = id && users.get(id);
      if (!u || directory.banned.has(u.id)) return err(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
      return send(res, 200, await mint(u));
    }
    return err(res, 400, 'validation_failed', 'unsupported grant_type');
  }

  if (path === '/auth/v1/user') {
    const u = await userFromBearer(req);
    if (!u) return err(res, 401, 'bad_jwt', 'invalid JWT');
    if (req.method === 'GET') return send(res, 200, userJson(u));
    if (req.method === 'PUT') {
      const b = await readJson(req);
      if (typeof b.password === 'string') {
        if (b.password.length < 6) return err(res, 422, 'weak_password', 'Password should be at least 6 characters.');
        if (b.password === u.password) return err(res, 422, 'same_password', 'New password should be different from the old password.');
        u.password = b.password;
      }
      if (b.data?.full_name !== undefined) u.name = b.data.full_name;
      return send(res, 200, userJson(u));
    }
  }

  if (path === '/auth/v1/logout') return send(res, 204);

  if (path === '/auth/v1/recover' && req.method === 'POST') {
    const b = await readJson(req);
    const u = byEmail(b.email ?? '');
    if (u?.confirmed) mail(u, 'recovery', url.searchParams.get('redirect_to') ?? WEB);
    return send(res, 200, {});
  }

  if (path === '/auth/v1/authorize') { // "Continue with Google": the fake provider signs in a fixed Google user
    const redirectTo = url.searchParams.get('redirect_to') ?? WEB;
    const email = url.searchParams.get('login_hint') ?? 'gina.google@example.test';
    const u = byEmail(email) ?? createUser(email, null, { confirmed: true, name: 'Gina Google', provider: 'google' });
    confirm(u);
    const code = randomBytes(10).toString('hex');
    codes.set(code, u.id);
    return redirect(res, `${redirectTo}${redirectTo.includes('?') ? '&' : '?'}code=${code}`);
  }

  if (path === '/auth/v1/verify') { // the link in confirmation / recovery / invitation emails
    const t = verifyTokens.get(url.searchParams.get('token') ?? '');
    const u = t && users.get(t.userId);
    if (!t || !u) return redirect(res, `${WEB}/login#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
    verifyTokens.delete(url.searchParams.get('token')!);
    confirm(u);
    if (t.type === 'invite') {
      // Admin-sent invitations cannot use PKCE, so Supabase returns the session in the URL hash.
      const s = await mint(u);
      return redirect(res, `${t.redirectTo}#access_token=${s.access_token}&expires_at=${s.expires_at}&expires_in=3600&refresh_token=${s.refresh_token}&token_type=bearer&type=invite`);
    }
    const code = randomBytes(10).toString('hex');
    codes.set(code, u.id);
    return redirect(res, `${t.redirectTo}${t.redirectTo.includes('?') ? '&' : '?'}code=${code}`);
  }

  send(res, 404, { code: 404, error_code: 'not_found', msg: `no fake for ${req.method} ${path}` });
}).on('error', taken).listen(AUTH_PORT, () => console.log(`fake supabase auth on :${AUTH_PORT}`));

const usersApp = createApp({
  verifier: createVerifier(async () => publicKey, ISS),
  directory,
  inviteRedirectTo: `${WEB}/accept-invite`,
});
serve({ fetch: usersApp.fetch, port: USERS_PORT }, (i) => console.log(`users-service (real code, in-memory directory) on :${i.port}`));
