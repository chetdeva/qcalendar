import path from 'node:path';
import { defineConfig } from '@playwright/test';
import { AUTH_URL, CAL_URL, SERVICE_KEY, USERS_UI, USERS_URL, WEB_URL } from './e2e/helpers';

// The suite runs the UI against REAL calendar-service and users-service code. Override to test another checkout.
const CAL_DIR = process.env.CALENDAR_SERVICE_DIR ?? '../calendar-service';

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
    viewport: { width: 1360, height: 1200 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // Fake Supabase Auth + real users-service code on an in-memory directory.
      command: 'node --disable-warning=ExperimentalWarning e2e/backend.mts',
      url: `${AUTH_URL}/__test/health`,
      reuseExistingServer: false,
    },
    {
      // The real calendar-service with an embedded Postgres in a throwaway folder, verifying tokens against the fake.
      command: `rm -rf .e2e-data && mkdir -p .e2e-data && cd ${CAL_DIR} && node --disable-warning=ExperimentalWarning src/index.ts`,
      url: `${CAL_URL}/health`,
      reuseExistingServer: false,
      env: {
        PORT: String(new URL(CAL_URL).port), PGLITE_DIR: path.resolve(__dirname, '.e2e-data/pglite'), SUPABASE_URL: AUTH_URL,
        API_KEY: SERVICE_KEY, DEFAULT_TIMEZONE: 'UTC', MEETING_BASE_URL: 'https://meet.example.test',
      },
    },
    {
      command: `npx next dev -p ${new URL(WEB_URL).port}`,
      url: `${WEB_URL}/api/me`, // answers 401 when signed out; the front page redirects away
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_DIST_DIR: '.next-e2e',
        NEXT_PUBLIC_SUPABASE_URL: AUTH_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_e2e_not_a_real_key',
        NEXT_PUBLIC_USERS_UI_URL: USERS_UI,
        NEXT_PUBLIC_COOKIE_DOMAIN: '',
        CALENDAR_API_URL: CAL_URL,
        USERS_SERVICE_URL: USERS_URL,
      },
    },
  ],
});
