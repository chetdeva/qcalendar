import { defineConfig } from '@playwright/test';

// Unusual port on purpose: other dev servers often sit on the usual ones.
const PORT = 58741;

export default defineConfig({
  testDir: './e2e',
  testMatch: '*.spec.ts',
  workers: 1,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome', // uses the installed Google Chrome, no browser download
    locale: 'en-US',
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXT_DIST_DIR: '.next-e2e', NEXT_PUBLIC_ACCOUNTS_URL: 'http://accounts.test' },
  },
});
