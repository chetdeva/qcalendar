import os from 'node:os';
import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { AUTH_URL, CAL_URL, DASH_URL, SERVICE_KEY, USERS_UI, USERS_URL, WEB_URL } from './e2e/helpers';

// The suite runs the UI against the REAL dashboard-service, calendar-service and users-service code. Override to test another checkout.
const CAL_DIR = process.env.CALENDAR_SERVICE_DIR ?? '../calendar-service';
const DASH_DIR = process.env.DASHBOARD_SERVICE_DIR ?? '../dashboard-service';

// Outside the repo: the dev server now watches the whole repo (it reads ../components-ui), and database files changing under it made pages reload mid-test.
const DATA = path.join(os.tmpdir(), 'quanttoria-dashboard-e2e');

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
    {
      // The real calendar-service with an embedded Postgres in a throwaway folder: classes are what connect teachers and students.
      command: `rm -rf ${DATA} && mkdir -p ${DATA} && cd ${CAL_DIR} && node --disable-warning=ExperimentalWarning src/index.ts`,
      url: `${CAL_URL}/health`,
      reuseExistingServer: false,
      env: { PORT: String(new URL(CAL_URL).port), PGLITE_DIR: path.join(DATA, 'calendar'), SUPABASE_URL: AUTH_URL, API_KEY: SERVICE_KEY, DEFAULT_TIMEZONE: 'UTC', MEETING_BASE_URL: 'https://meet.example.test' },
    },
    {
      command: `cd ${DASH_DIR} && node --disable-warning=ExperimentalWarning src/index.ts`,
      url: `${DASH_URL}/health`,
      reuseExistingServer: false,
      env: {
        PORT: String(new URL(DASH_URL).port), SUPABASE_URL: AUTH_URL, PGLITE_DIR: path.join(DATA, 'dashboard'),
        CALENDAR_API_URL: CAL_URL, USERS_SERVICE_URL: USERS_URL, USERS_SERVICE_API_KEY: SERVICE_KEY,
      },
    },
    {
      command: `rm -rf .next-e2e && npx next dev -p ${new URL(WEB_URL).port}`,
      url: `${WEB_URL}/api/dashboard`, // answers 401 when signed out; the front page redirects away
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_DIST_DIR: '.next-e2e',
        NEXT_PUBLIC_SUPABASE_URL: AUTH_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_e2e_not_a_real_key',
        NEXT_PUBLIC_USERS_UI_URL: USERS_UI,
        NEXT_PUBLIC_DASHBOARD_URL: WEB_URL, // the header's own links
        NEXT_PUBLIC_COOKIE_DOMAIN: '',
        DASHBOARD_API_URL: DASH_URL,
        USERS_SERVICE_URL: USERS_URL,
      },
    },
  ],
});
