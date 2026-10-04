import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { openDb } from './db.ts';
import { createGoogleClient } from './google.ts';
import { syncPending } from './sync.ts';
import { processWebhooks } from './webhooks.ts';
import { loadSettings } from './availability.ts';

const env = process.env;
const apiKey = env.API_KEY ?? '';
if (apiKey.length < 24) {
  console.error('API_KEY must be set and at least 24 characters (try: openssl rand -hex 32)');
  process.exit(1);
}
const publicUrl = (env.PUBLIC_URL ?? `http://localhost:${env.PORT ?? 3000}`).replace(/\/$/, '');
const db = openDb(env.DB_PATH ?? './data/calendar.db');
const google = createGoogleClient(db, {
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  redirectUri: `${publicUrl}/v1/google/callback`,
});
const app = createApp({
  db,
  google,
  apiKey,
  defaultTimezone: env.DEFAULT_TIMEZONE ?? 'UTC',
  webhookUrlFromEnv: env.WEBHOOK_URL,
});

const webhookSecret = env.WEBHOOK_SECRET ?? apiKey;
setInterval(() => void processWebhooks(db, { url: () => loadSettings(db).webhookUrl || env.WEBHOOK_URL || '', secret: webhookSecret }).catch(console.error), 10_000);
setInterval(() => void syncPending(db, google).catch(console.error), 5 * 60_000);

serve({ fetch: app.fetch, port: Number(env.PORT ?? 3000) }, (i) => console.log(`calendar service on :${i.port}`));
