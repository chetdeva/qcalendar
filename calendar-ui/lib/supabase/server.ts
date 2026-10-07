import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cookieOptions } from '../cookies.ts';
import { supabaseKey, supabaseUrl } from '../env.ts';

export async function createClient() {
  const store = await cookies();
  return createServerClient(supabaseUrl, supabaseKey, {
    cookieOptions: cookieOptions(),
    cookies: {
      getAll: () => store.getAll(),
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a Server Component, which cannot set cookies. The proxy refreshes the session instead.
        }
      },
    },
  });
}

/** The signed-in user and the access token to forward to the services, or null. */
export async function currentSession() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); // asks Supabase, so the cookie cannot be forged
  if (!user) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { user, token: session.access_token } : null;
}
