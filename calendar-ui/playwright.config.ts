import { defineConfig } from '@playwright/test';
import path from 'node:path';

import { API_KEY, API_PORT, API_URL, WEB_PORT } from './e2e/helpers';

// The e2e suite runs the UI against a real calendar-service. Override to test another checkout.
const SERVICE_DIR = process.env.CALENDAR_SERVICE_DIR ?? '../calendar-service';

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    channel: 'chrome', // uses the installed Google Chrome, no browser download
    timezoneId: 'UTC',
    locale: 'en-US',
    viewport: { width: 1280, height: 1400 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `rm -rf .e2e-data && mkdir -p .e2e-data && cd ${SERVICE_DIR} && node --disable-warning=ExperimentalWarning src/index.ts`,
      // An embedded Postgres in a throwaway folder, and the service API key acting on one default teacher (legacy single-owner mode).
      env: { API_KEY, PORT: String(API_PORT), PGLITE_DIR: path.resolve(__dirname, '.e2e-data/pglite'), DEFAULT_OWNER_ID: '00000000-0000-4000-8000-00000000e2e0', DEFAULT_TIMEZONE: 'UTC' },
      url: `${API_URL}/health`,
      reuseExistingServer: false,
    },
    {
      command: `npx next dev -p ${WEB_PORT}`,
      env: { NEXT_DIST_DIR: '.next-e2e', CALENDAR_API_URL: API_URL, CALENDAR_API_KEY: API_KEY },
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
