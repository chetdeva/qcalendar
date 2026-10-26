import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  // Without this, `next dev` blocks its client scripts when the page is opened as 127.0.0.1, so nothing hydrates and buttons do nothing.
  allowedDevOrigins: ['127.0.0.1'],
  // The shared footer lives in ../components-ui: Turbopack may read from the repo root, and its imports of react resolve to this app's copy.
  turbopack: {
    root: path.join(import.meta.dirname, '..'),
    resolveAlias: { react: './node_modules/react', 'react/jsx-runtime': './node_modules/react/jsx-runtime', 'react/jsx-dev-runtime': './node_modules/react/jsx-dev-runtime' },
  },
  // Lets the e2e suite run its own dev server next to a normal one.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default config;
