import { serve } from '@hono/node-server';
import { createApp, type UsersClient } from './app.ts';
import { createAuthenticator, supabaseKeys } from './auth.ts';
import { sweepExpired, topUpAnnual } from './credits.ts';
import { createPgDb, createPgliteDb, migrate, type SslMode } from './db.ts';
import { HttpError } from './errors.ts';
import { gatewayFor } from './gateways/index.ts';

const env = process.env;
const production = env.NODE_ENV === 'production';
const apiKey = env.BILLING_SERVICE_KEY ?? '';
const fail = (msg: string): never => { console.error(msg); process.exit(1); };

if (apiKey.length < 24) fail('BILLING_SERVICE_KEY must be at least 24 characters (try: openssl rand -hex 32)');
if (production && !env.DATABASE_URL) fail('DATABASE_URL is required in production');
if (production && !env.SUPABASE_URL) fail('SUPABASE_URL is required in production (it is where login tokens are verified)');
if (production && env.BILLING_GATEWAY === 'fake') fail('BILLING_GATEWAY=fake is for development only');

const db = env.DATABASE_URL
  ? createPgDb(env.DATABASE_URL, { ssl: env.DATABASE_SSL as SslMode | undefined, caCert: env.DATABASE_CA_CERT })
  : createPgliteDb(env.PGLITE_DIR ?? './data/pglite');
const applied = await migrate(db);
if (applied.length) console.log(`applied migrations: ${applied.join(', ')}`);

const keys = env.SUPABASE_URL
  ? supabaseKeys(env.SUPABASE_URL)
  : { getKey: async () => { throw new HttpError(401, 'unauthorized', 'Token login is not configured'); }, issuer: 'none' };

const defaultGateway = env.BILLING_GATEWAY ?? 'fake';
// During a switch, list the old gateway too so its webhooks keep arriving: BILLING_GATEWAYS_ALSO=old1,old2
const names = [defaultGateway, ...(env.BILLING_GATEWAYS_ALSO ?? '').split(',').map((s) => s.trim()).filter(Boolean)];
const gateways = Object.fromEntries(names.map((n) => [n, gatewayFor(n, env)]));

const usersUrl = env.USERS_SERVICE_URL ?? '';
const users: UsersClient = {
  async grade(userId) {
    if (!usersUrl) return null;
    const r = await fetch(`${usersUrl}/v1/service/students/${encodeURIComponent(userId)}`, { headers: { authorization: `Bearer ${env.USERS_SERVICE_API_KEY ?? ''}` } });
    if (!r.ok) throw new HttpError(502, 'upstream', 'Could not read the student profile');
    return ((await r.json()) as { grade: number | null }).grade;
  },
};

const app = createApp({ db, authenticator: createAuthenticator({ apiKey, ...keys }), gateways, defaultGateway, users, returnUrl: env.BILLING_RETURN_URL ?? 'http://localhost:3003/billing' });

const tick = (name: string, fn: () => Promise<unknown>) => () => void fn().catch((e) => console.error(`${name} failed:`, e.message));
setInterval(tick('annual top-up', () => topUpAnnual(db)), 60 * 60_000); // hourly; each month's block is created once
setInterval(tick('expiry sweep', () => sweepExpired(db)), 60 * 60_000);
tick('annual top-up', () => topUpAnnual(db))();

serve({ fetch: app.fetch, port: Number(env.PORT ?? 3012) }, (i) => console.log(`billing-service on :${i.port} (gateway: ${defaultGateway})`));
process.on('SIGTERM', () => void db.close().finally(() => process.exit(0)));
