import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { AUTH_URL, CAL_URL, CHAT_URL, SERVICE_KEY, USERS_UI, USERS_URL, WEB_URL } from './e2e/helpers';

// The suite runs the UI against REAL chat-service, calendar-service and users-service code. Override to test another checkout.
const CAL_DIR = process.env.CALENDAR_SERVICE_DIR ?? '../calendar-service';
const CHAT_DIR = process.env.CHAT_SERVICE_DIR ?? '../chat-service';
const service = (dir: string, url: string, env: Record<string, string>) => ({
  command: `cd ${dir} && node --disable-warning=ExperimentalWarning src/index.ts`,
  url: `${url}/health`,
  reuseExistingServer: false,
  env: { PORT: String(new URL(url).port), SUPABASE_URL: AUTH_URL, API_KEY: SERVICE_KEY, ...env },
});

export default defineConfig({
  testDir: './e2e',
  testMatch: '*.spec.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: WEB_URL,
    channel: 'chrome', // uses the installed Google Chrome, no browser download
    timezoneId: 'UTC',
    locale: 'en-US',
    viewport: { width: 1360, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // Fake Supabase Auth + real users-service code on an in-memory directory.
      command: 'node --disable-warning=ExperimentalWarning e2e/backend.mts',
      url: `${AUTH_URL}/__test/health`,
      reuseExistingServer: false,
    },
    // Each service gets an embedded Postgres in a throwaway folder.
    { ...service(CAL_DIR, CAL_URL, { PGLITE_DIR: path.resolve(__dirname, '.e2e-data/calendar'), DEFAULT_TIMEZONE: 'UTC' }), command: `rm -rf .e2e-data && mkdir -p .e2e-data && cd ${CAL_DIR} && node --disable-warning=ExperimentalWarning src/index.ts` },
    service(CHAT_DIR, CHAT_URL, { PGLITE_DIR: path.resolve(__dirname, '.e2e-data/chat'), CHAT_POLICY_URL: `${CAL_URL}/v1/chat-policy` }),
    {
      command: `rm -rf .next-e2e && npx next dev -p ${new URL(WEB_URL).port}`,
      url: `${WEB_URL}/api/me`, // answers 401 when signed out; the front page redirects away
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_DIST_DIR: '.next-e2e',
        NEXT_PUBLIC_SUPABASE_URL: AUTH_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_e2e_not_a_real_key',
        NEXT_PUBLIC_USERS_UI_URL: USERS_UI,
        NEXT_PUBLIC_CHAT_URL: WEB_URL, // the header's own tab
        NEXT_PUBLIC_COOKIE_DOMAIN: '',
        CHAT_API_URL: CHAT_URL,
        CALENDAR_API_URL: CAL_URL,
        USERS_SERVICE_URL: USERS_URL,
      },
    },
  ],
});
