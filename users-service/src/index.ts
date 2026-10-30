import { serve } from '@hono/node-server';
import { createApp } from './app.ts';
import { createSupabaseVerifier } from './auth.ts';
import { SupabaseDirectory } from './supabase-directory.ts';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INVITE_REDIRECT_URL, PORT, SERVICE_API_KEY, BILLING_URL, BILLING_SERVICE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (see .env.example).');
  process.exit(1);
}

if (SERVICE_API_KEY && SERVICE_API_KEY.length < 24) {
  console.error('SERVICE_API_KEY must be at least 24 characters (try: openssl rand -hex 32)');
  process.exit(1);
}

const app = createApp({
  verifier: createSupabaseVerifier(SUPABASE_URL),
  directory: new SupabaseDirectory(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY),
  inviteRedirectTo: INVITE_REDIRECT_URL ?? 'http://localhost:3003/accept-invite',
  serviceApiKey: SERVICE_API_KEY || undefined,
  // Optional: without BILLING_URL grades are saved and nothing is told (billing reads the grade when it needs it).
  onGradeChanged: BILLING_URL
    ? async (userId, grade) => {
        const r = await fetch(`${BILLING_URL}/v1/service/grade-changed`, {
          method: 'POST',
          headers: { authorization: `Bearer ${BILLING_SERVICE_KEY ?? ''}`, 'content-type': 'application/json' },
          body: JSON.stringify({ userId, grade }),
        });
        if (!r.ok) throw new Error(`billing answered ${r.status}`);
      }
    : undefined,
});

serve({ fetch: app.fetch, port: Number(PORT ?? 3010) }, (i) => console.log(`users-service on :${i.port}`));
