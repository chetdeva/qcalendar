import { NextResponse, type NextRequest } from 'next/server';
import { callUsers } from '@/lib/bff';
import type { Person } from '@/lib/calendar';

/**
 * Student search for the class form. Whatever users-service returns is cut down to id, name and email here, so a
 * guardian address (which admins can see there) can never reach the browser through this route.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.slice(0, 100) ?? '';
  const params = new URLSearchParams({ role: 'student', status: 'active', limit: '8' });
  if (q.trim()) params.set('q', q.trim());
  const { status, json } = await callUsers<{ users: { id: string; full_name: string | null; email: string }[] }>('GET', `/v1/users?${params}`);
  if (status !== 200) return NextResponse.json(json, { status });
  const people: Person[] = json.users.map((u) => ({ id: u.id, name: u.full_name, email: u.email }));
  return NextResponse.json({ students: people });
}
