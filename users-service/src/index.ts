import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { createSupabaseVerifier } from './auth.ts';
import { SupabaseDirectory } from './supabase-directory.ts';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INVITE_REDIRECT_URL, PORT } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (see .env.example).');
  process.exit(1);
}

const app = createApp({
  verifier: createSupabaseVerifier(SUPABASE_URL),
  directory: new SupabaseDirectory(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
  inviteRedirectTo: INVITE_REDIRECT_URL ?? 'http://localhost:3003/accept-invite',
});

serve({ fetch: app.fetch, port: Number(PORT ?? 3010) }, (i) => console.log(`users-service on :${i.port}`));
