// Test backend: a small fake of Supabase Auth plus the REAL users-service code on an in-memory directory.
// (calendar-service runs as its own real process, started by Playwright, and verifies tokens against this fake's JWKS.)
//   fake Supabase Auth  http://localhost:58741
//   users-service       http://localhost:58742
import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { serve } from '@hono/node-server';
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose';
import { createApp } from '../../users-service/src/app.ts';
import { createVerifier } from '../../users-service/src/auth.ts';
import { MemoryDirectory } from '../../users-service/tests/memory-directory.ts';

const AUTH_PORT = 58741;
const USERS_PORT = 58742;
const AUTH_URL = `http://localhost:${AUTH_PORT}`;
const ISS = `${AUTH_URL}/auth/v1`;

const { publicKey, privateKey } = await generateKeyPair('ES256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'e2e-key', alg: 'ES256', use: 'sig' };

interface AuthUser { id: string; email: string; password: string; name: string; createdAt: string }
const users = new Map<string, AuthUser>();
const refreshTokens = new Map<string, string>();
const directory = new MemoryDirectory();
const byEmail = (email: string) => [...users.values()].find((u) => u.email.toLowerCase() === email.toLowerCase());

function createUser(email: string, password: string, role: 'student' | 'teacher' | 'admin', name: string) {
  const u: AuthUser = { id: randomUUID(), email, password, name, createdAt: new Date().toISOString() };
  users.set(u.id, u);
  directory.addProfile({ id: u.id, email, full_name: name || null, role }); // what the database triggers do in production
  return u;
}

async function mint(u: AuthUser) {
  const profile = directory.profiles.get(u.id);
  const now = Math.floor(Date.now() / 1000);
  const access_token = await new SignJWT({
    email: u.email, role: 'authenticated', session_id: randomUUID(),
    app_metadata: { provider: 'email', providers: ['email'], role: profile?.role ?? 'student', status: profile?.status ?? 'active' },
    user_metadata: { full_name: u.name, email: u.email },
  }).setProtectedHeader({ alg: 'ES256', kid: 'e2e-key', typ: 'JWT' }).setSubject(u.id).setIssuer(ISS).setAudience('authenticated').setIssuedAt(now).setExpirationTime(now + 3600).sign(privateKey);
  const refresh_token = randomBytes(8).toString('hex');
  refreshTokens.set(refresh_token, u.id);
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token, user: userJson(u) };
}
const userJson = (u: AuthUser) => ({
  id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.createdAt, confirmed_at: u.createdAt, phone: '',
  last_sign_in_at: u.createdAt, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: { full_name: u.name, email: u.email },
  identities: [], created_at: u.createdAt, updated_at: u.createdAt, is_anonymous: false,
});

const CORS = {
  'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'authorization,apikey,content-type,x-client-info,x-supabase-api-version',
};
const send = (res: http.ServerResponse, status: number, body?: unknown) => {
  res.writeHead(status, { ...CORS, 'content-type': 'application/json' });
  res.end(body === undefined ? undefined : JSON.stringify(body));
};
const err = (res: http.ServerResponse, status: number, error_code: string, msg: string) => send(res, status, { code: status, error_code, msg });
const readJson = (req: http.IncomingMessage) => new Promise<Record<string, any>>((resolve) => {
  let raw = ''; req.on('data', (c) => (raw += c)); req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); } });
});

http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', AUTH_URL);
  const path = url.pathname;
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  if (path === '/__test/health') return send(res, 200, { ok: true });
  if (path === '/__test/reset' && req.method === 'POST') {
    users.clear(); refreshTokens.clear(); directory.profiles.clear(); directory.banned.clear();
    return send(res, 200, { ok: true });
  }
  if (path === '/__test/user' && req.method === 'POST') {
    const b = await readJson(req);
    const u = createUser(b.email, b.password ?? 'password123', b.role ?? 'student', b.name ?? b.email.split('@')[0]);
    return send(res, 200, { id: u.id, email: u.email, name: u.name });
  }

  if (path === '/auth/v1/.well-known/jwks.json') return send(res, 200, { keys: [jwk] });

  if (path === '/auth/v1/token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type');
    const b = await readJson(req);
    if (grant === 'password') {
      const u = byEmail(b.email ?? '');
      if (!u || u.password !== b.password) return err(res, 400, 'invalid_credentials', 'Invalid login credentials');
      return send(res, 200, await mint(u));
    }
    if (grant === 'refresh_token') {
      const id = refreshTokens.get(b.refresh_token); refreshTokens.delete(b.refresh_token);
      const u = id && users.get(id);
      if (!u) return err(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token');
      return send(res, 200, await mint(u));
    }
    return err(res, 400, 'validation_failed', 'unsupported grant_type');
  }

  if (path === '/auth/v1/user' && req.method === 'GET') {
    try {
      const { payload } = await jwtVerify((req.headers.authorization ?? '').replace(/^Bearer /, ''), publicKey, { issuer: ISS, audience: 'authenticated' });
      const u = users.get(payload.sub!);
      return u ? send(res, 200, userJson(u)) : err(res, 401, 'bad_jwt', 'user not found');
    } catch { return err(res, 401, 'bad_jwt', 'invalid JWT'); }
  }
  if (path === '/auth/v1/logout') return send(res, 204);

  send(res, 404, { code: 404, error_code: 'not_found', msg: `no fake for ${req.method} ${path}` });
}).on('error', (e: NodeJS.ErrnoException) => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${AUTH_PORT} is in use; refusing to start so tests never talk to someone else's server.` : e);
  process.exit(1);
}).listen(AUTH_PORT, () => console.log(`fake supabase auth on :${AUTH_PORT}`));

const usersApp = createApp({ verifier: createVerifier(async () => publicKey, ISS), directory, inviteRedirectTo: 'http://localhost:58745/accept-invite' });
serve({ fetch: usersApp.fetch, port: USERS_PORT }, (i) => console.log(`users-service (real code, in-memory directory) on :${i.port}`));

// A stand-in for users-ui on :58745, just enough for the calendar's links: login, account, and a POST-only sign-out.
const html = (body: string) => `<!doctype html><title>users-ui stand-in</title>${body}`;
http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost:58745');
  if (url.pathname === '/auth/signout' && req.method === 'POST') { res.writeHead(303, { location: '/login?signed-out=1' }); return res.end(); }
  if (url.pathname === '/login') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(html('<h1>login page</h1>')); }
  if (url.pathname === '/profile') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(html('<h1>account page</h1>')); }
  res.writeHead(404); res.end();
}).listen(58745, () => console.log('users-ui stand-in on :58745'));
