import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  // The shared header lives in ../components-ui: Turbopack may read from the repo root, and its imports of react resolve to this app's copy.
  turbopack: {
    root: path.join(import.meta.dirname, '..'),
    resolveAlias: { react: './node_modules/react', 'react/jsx-runtime': './node_modules/react/jsx-runtime', 'react/jsx-dev-runtime': './node_modules/react/jsx-dev-runtime' },
  },
  // Lets the e2e suite run its own dev server next to a normal one.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
};

export default config;
