import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { createAuthenticator, supabaseKeys } from './auth.ts';
import { createPgDb, createPgliteDb, migrate, type SslMode } from './db.ts';
import { HttpError } from './errors.ts';
import { ConsoleMailer, createSmtpMailer } from './mail.ts';
import { processOutbox } from './outbox.ts';
import { processWebhooks } from './webhooks.ts';

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

const webhookUrl = env.WEBHOOK_URL ?? '';
const ctx = {
  db,
  defaultTimezone: env.DEFAULT_TIMEZONE ?? 'UTC',
  defaultOwnerId: env.DEFAULT_OWNER_ID || undefined,
  webhooks: Boolean(webhookUrl),
  meetingBaseUrl: env.MEETING_BASE_URL ?? 'https://meet.jit.si',
};
const app = createApp({ ctx, authenticator });

const mailFrom = env.MAIL_FROM ?? 'SyncSchedule <no-reply@localhost>';
const fromEmail = /<([^>]+)>/.exec(mailFrom)?.[1] ?? mailFrom;
if (production && !env.SMTP_URL) console.warn('SMTP_URL is not set: invitation emails will only be logged, not sent.');
const mailer = env.SMTP_URL ? createSmtpMailer(env.SMTP_URL, mailFrom) : new ConsoleMailer();

const tick = (name: string, fn: () => Promise<unknown>) => () => void fn().catch((e) => console.error(`${name} failed:`, e.message));
setInterval(tick('email outbox', () => processOutbox(db, mailer, { fromEmail, calendarUrl: env.CALENDAR_URL })), 15_000);
if (webhookUrl) setInterval(tick('webhooks', () => processWebhooks(db, { url: webhookUrl, secret: env.WEBHOOK_SECRET ?? apiKey })), 10_000);

serve({ fetch: app.fetch, port: Number(env.PORT ?? 3000) }, (i) => console.log(`calendar-service on :${i.port}`));
process.on('SIGTERM', () => void db.close().finally(() => process.exit(0)));
