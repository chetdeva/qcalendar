import { SupabaseDirectory } from '../src/supabase-directory.ts';
import { makeAdmin } from '../src/bootstrap.ts';

const email = process.argv[2];
if (!email) {
  console.error('usage: npm run make-admin -- someone@example.com');
  process.exit(1);
}
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env).');
  process.exit(1);
}
const profile = await makeAdmin(new SupabaseDirectory(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY), email);
console.log(`${profile.email} is now an admin (id ${profile.id}). They must sign out and in again for the new role to reach their token.`);
