import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { createAuthenticator, supabaseKeys } from './auth.ts';
import { httpPolicy } from './chat.ts';
import { createPgDb, createPgliteDb, migrate, type SslMode } from './db.ts';
import { HttpError } from './errors.ts';

const env = process.env;
const production = env.NODE_ENV === 'production';
const apiKey = env.API_KEY ?? '';
const fail = (msg: string): never => { console.error(msg); process.exit(1); };

if (apiKey && apiKey.length < 24) fail('API_KEY must be at least 24 characters (try: openssl rand -hex 32)');
if (production && !env.DATABASE_URL) fail('DATABASE_URL is required in production');
if (production && !env.SUPABASE_URL) fail('SUPABASE_URL is required in production (it is where login tokens are verified)');
if (!env.SUPABASE_URL && !apiKey) fail('Set SUPABASE_URL (people sign in with Supabase tokens) and/or API_KEY (trusted backends).');

const db = env.DATABASE_URL
  ? createPgDb(env.DATABASE_URL, { ssl: env.DATABASE_SSL as SslMode | undefined, caCert: env.DATABASE_CA_CERT })
  : createPgliteDb(env.PGLITE_DIR ?? './data/pglite'); // zero-setup local development: an embedded Postgres in a folder
const applied = await migrate(db);
if (applied.length) console.log(`applied migrations: ${applied.join(', ')}`);

const keys = env.SUPABASE_URL
  ? supabaseKeys(env.SUPABASE_URL)
  : { getKey: async () => { throw new HttpError(401, 'unauthorized', 'Token login is not configured'); }, issuer: 'none' };
const authenticator = createAuthenticator({ apiKey, ...keys });
if (!env.CHAT_POLICY_URL) console.warn('CHAT_POLICY_URL is not set: people cannot start conversations (only the API key can).');

const app = createApp({ ctx: { db, policy: env.CHAT_POLICY_URL ? httpPolicy(env.CHAT_POLICY_URL) : undefined }, authenticator });
serve({ fetch: app.fetch, port: Number(env.PORT ?? 3001) }, (i) => console.log(`chat-service on :${i.port}`));
process.on('SIGTERM', () => void db.close().finally(() => process.exit(0)));
