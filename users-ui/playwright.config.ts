import { defineConfig } from '@playwright/test';
import { AUTH_URL, CALENDAR_ORIGIN, USERS_URL, WEB_PORT, WEB_URL } from './e2e/helpers';

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
      command: `npx next dev -p ${WEB_PORT}`,
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_DIST_DIR: '.next-e2e',
        NEXT_PUBLIC_SUPABASE_URL: AUTH_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_e2e_not_a_real_key',
        USERS_SERVICE_URL: USERS_URL,
        NEXT_PUBLIC_ALLOWED_RETURN_ORIGINS: CALENDAR_ORIGIN,
        NEXT_PUBLIC_CALENDAR_URL: CALENDAR_ORIGIN,
        NEXT_PUBLIC_COOKIE_DOMAIN: '',
      },
    },
  ],
});
