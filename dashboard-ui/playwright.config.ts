import { defineConfig } from '@playwright/test';
import { AUTH_URL, DASH_URL, USERS_UI, USERS_URL, WEB_URL } from './e2e/helpers';

// The suite runs the UI against the REAL dashboard-service and users-service code. Override to test another checkout.
const DASH_DIR = process.env.DASHBOARD_SERVICE_DIR ?? '../dashboard-service';

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
      command: `cd ${DASH_DIR} && node --disable-warning=ExperimentalWarning src/index.ts`,
      url: `${DASH_URL}/health`,
      reuseExistingServer: false,
      env: { PORT: String(new URL(DASH_URL).port), SUPABASE_URL: AUTH_URL },
    },
    {
      command: `npx next dev -p ${new URL(WEB_URL).port}`,
      url: `${WEB_URL}/api/dashboard`, // answers 401 when signed out; the front page redirects away
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_DIST_DIR: '.next-e2e',
        NEXT_PUBLIC_SUPABASE_URL: AUTH_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_e2e_not_a_real_key',
        NEXT_PUBLIC_USERS_UI_URL: USERS_UI,
        NEXT_PUBLIC_COOKIE_DOMAIN: '',
        DASHBOARD_API_URL: DASH_URL,
        USERS_SERVICE_URL: USERS_URL,
      },
    },
  ],
});
