import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { createAuthenticator, supabaseKeys } from './auth.ts';
import { createPgDb, createPgliteDb, migrate, type SslMode } from './db.ts';
import { ConsoleMailer, createSmtpMailer } from './mail.ts';
import { processOutbox } from './outbox.ts';
import { s3Files } from './files.ts';
import { httpSources } from './sources.ts';

const env = process.env;
const production = env.NODE_ENV === 'production';
const fail = (msg: string): never => { console.error(msg); process.exit(1); };

const supabaseUrl = env.SUPABASE_URL ?? fail('SUPABASE_URL is required (it is where login tokens are verified)');
if (production && !env.DATABASE_URL) fail('DATABASE_URL is required in production');
if (env.USERS_SERVICE_API_KEY && env.USERS_SERVICE_API_KEY.length < 24) fail('USERS_SERVICE_API_KEY must be at least 24 characters (try: openssl rand -hex 32)');

const db = env.DATABASE_URL
  ? createPgDb(env.DATABASE_URL, { ssl: env.DATABASE_SSL as SslMode | undefined, caCert: env.DATABASE_CA_CERT })
  : createPgliteDb(env.PGLITE_DIR ?? './data/pglite'); // zero-setup local development: an embedded Postgres in a folder
const applied = await migrate(db);
if (applied.length) console.log(`applied migrations: ${applied.join(', ')}`);

const files = env.FILES_BUCKET
  ? s3Files({ bucket: env.FILES_BUCKET, endpoint: env.FILES_ENDPOINT || undefined, region: env.FILES_REGION || undefined, accessKeyId: env.FILES_ACCESS_KEY_ID ?? fail('FILES_ACCESS_KEY_ID is required with FILES_BUCKET'), secretAccessKey: env.FILES_SECRET_ACCESS_KEY ?? fail('FILES_SECRET_ACCESS_KEY is required with FILES_BUCKET') })
  : undefined; // unset = uploads are stored in the database
if (production && !files) console.warn('FILES_BUCKET is not set: uploaded work is stored in the database.');
const sources = httpSources({ calendarUrl: env.CALENDAR_API_URL ?? 'http://localhost:3000', usersUrl: env.USERS_SERVICE_URL ?? 'http://localhost:3010', usersKey: env.USERS_SERVICE_API_KEY });
if (!env.USERS_SERVICE_API_KEY) console.warn('USERS_SERVICE_API_KEY is not set: grades are published but parents are not emailed.');
const app = createApp({
  ctx: { db, sources, files, now: () => new Date(), dashboardUrl: env.DASHBOARD_URL ?? 'http://localhost:3006' },
  authenticator: createAuthenticator(supabaseKeys(supabaseUrl)),
});

const mailFrom = env.MAIL_FROM ?? 'Quanttoria <no-reply@localhost>';
if (production && !env.SMTP_URL) console.warn('SMTP_URL is not set: parent emails will only be logged, not sent.');
const mailer = env.SMTP_URL ? createSmtpMailer(env.SMTP_URL, mailFrom) : new ConsoleMailer();
setInterval(() => void processOutbox(db, mailer).catch((e) => console.error('mail outbox failed:', e.message)), 15_000);

serve({ fetch: app.fetch, port: Number(env.PORT ?? 3007) }, (i) => console.log(`dashboard-service on :${i.port}`));
process.on('SIGTERM', () => void db.close().finally(() => process.exit(0)));
