import { cache } from 'react';
import { redirect } from 'next/navigation';
import { callUsers } from './bff.ts';
import type { Me } from './calendar.ts';
import { usersUiUrl } from './env.ts';

/** The signed-in person's profile (role included) from users-service, deduplicated within a request. */
export const getMe = cache(async (): Promise<{ me: Me } | { error: string }> => {
  const { status, json } = await callUsers<Me>('GET', '/v1/me');
  if (status === 401) redirect(`${usersUiUrl}/login`);
  if (status === 403) redirect(`${usersUiUrl}/login?error=disabled`);
  if (status !== 200) return { error: (json as { error?: { message?: string } }).error?.message ?? 'The accounts service is unavailable.' };
  return { me: json as Me };
});
