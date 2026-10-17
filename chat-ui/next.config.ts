import type { NextConfig } from 'next';

const config: NextConfig = {
  // Lets the e2e suite run its own dev server next to a normal one.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default config;
