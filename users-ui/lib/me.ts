import { cache } from 'react';
import { redirect } from 'next/navigation';
import { callUsersService } from './bff.ts';

export interface Me {
  id: string;
  email: string;
  full_name: string | null;
  role: 'student' | 'teacher' | 'admin';
  status: 'active' | 'disabled';
  timezone: string | null;
  guardian_email: string | null;
}

/** The signed-in user's profile from users-service (deduplicated within a request). Signed-out visitors go to /login. */
export const getMe = cache(async (): Promise<{ me: Me } | { error: string }> => {
  const { status, json } = await callUsersService<Me>('GET', '/v1/me');
  if (status === 401) redirect('/login');
  if (status === 403) redirect('/login?error=disabled');
  if (status !== 200) return { error: (json as { error?: { message?: string } }).error?.message ?? 'The accounts service is unavailable.' };
  return { me: json as Me };
});
