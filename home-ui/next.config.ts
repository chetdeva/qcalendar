import type { NextConfig } from 'next';

const config: NextConfig = {
  // Without this, `next dev` blocks its client scripts when the page is opened as 127.0.0.1, so nothing hydrates and buttons do nothing.
  allowedDevOrigins: ['127.0.0.1'],
  // Lets the e2e suite run its own dev server next to a normal one.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default config;
