import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { createAuthenticator, supabaseKeys } from './auth.ts';
import { createMockStore } from './mock.ts';

const env = process.env;
const production = env.NODE_ENV === 'production';
if (!env.SUPABASE_URL) { console.error('SUPABASE_URL is required (it is where login tokens are verified)'); process.exit(1); }

// Phase 1: sample data only. The database and real endpoints replace createMockStore() in the next phase.
const app = createApp({ store: createMockStore(), authenticator: createAuthenticator(supabaseKeys(env.SUPABASE_URL)), production });
serve({ fetch: app.fetch, port: Number(env.PORT ?? 3007) }, (i) => console.log(`dashboard-service on :${i.port} (sample data)`));
