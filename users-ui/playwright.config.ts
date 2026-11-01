import { defineConfig } from '@playwright/test';
import { AUTH_URL, BILLING_URL, CALENDAR_API_URL, CALENDAR_ORIGIN, DASHBOARD_API_URL, USERS_URL, WEB_PORT, WEB_URL } from './e2e/helpers';

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
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      // Fake Supabase Auth + the real users-service code on an in-memory directory.
      command: 'node --disable-warning=ExperimentalWarning e2e/backend.mts',
      url: `${AUTH_URL}/__test/health`,
      reuseExistingServer: false,
    },
    {
      command: `rm -rf .next-e2e && npx next dev -p ${WEB_PORT}`,
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_DIST_DIR: '.next-e2e',
        NEXT_PUBLIC_SUPABASE_URL: AUTH_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_e2e_not_a_real_key',
        USERS_SERVICE_URL: USERS_URL,
        BILLING_API_URL: BILLING_URL,
        CALENDAR_API_URL,
        DASHBOARD_API_URL,
        NEXT_PUBLIC_ALLOWED_RETURN_ORIGINS: CALENDAR_ORIGIN,
        NEXT_PUBLIC_CALENDAR_URL: CALENDAR_ORIGIN,
        NEXT_PUBLIC_USERS_UI_URL: WEB_URL, // the header's Account and Sign out links point at this app
        NEXT_PUBLIC_COOKIE_DOMAIN: '',
      },
    },
  ],
});
