import { cache } from 'react';
import { redirect } from 'next/navigation';
import { callUsers } from './bff.ts';
import { currentSession } from './supabase/server.ts';
import type { Me, Role } from './calendar.ts';
import { usersUiUrl } from './env.ts';

/** The signed-in person's profile (role included) from users-service, deduplicated within a request. */
export const getMe = cache(async (): Promise<{ me: Me } | { error: string }> => {
  const { status, json } = await callUsers<Me>('GET', '/v1/me');
  if (status === 401) redirect(`${usersUiUrl}/login`);
  if (status === 403) redirect(`${usersUiUrl}/login?error=disabled`);
  if (status !== 200) return { error: (json as { error?: { message?: string } }).error?.message ?? 'The accounts service is unavailable.' };
  return { me: json as Me };
});

/**
 * The role written inside the person's login token. calendar-service decides by this, while users-service decides by the
 * database, so right after a promotion or demotion the two can disagree until the person signs in again. Display only: the
 * services verify the token themselves.
 */
export async function tokenRole(): Promise<Role | null> {
  const session = await currentSession();
  if (!session) return null;
  try {
    const payload = JSON.parse(Buffer.from(session.token.split('.')[1], 'base64url').toString()) as { app_metadata?: { role?: string } };
    const r = payload.app_metadata?.role;
    return r === 'student' || r === 'teacher' || r === 'admin' ? r : 'student';
  } catch {
    return null;
  }
}
