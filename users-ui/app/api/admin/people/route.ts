import { NextResponse, type NextRequest } from 'next/server';
import { callBilling, callCalendar, callUsersService } from '@/lib/bff';

interface User { id: string; email: string; full_name: string | null; role: 'student' | 'teacher' | 'admin'; status: 'active' | 'disabled' }
interface Summary { students: number; upcoming: number; nextAt: string | null }
interface Credits { remaining: number; expiresAt: string | null }

/**
 * One page of teachers or students for the admin portal: the accounts from users-service, plus each person's classes
 * (calendar-service) and credits (billing-service). If either of those is down the page still loads, without those columns.
 */
export async function GET(req: NextRequest) {
  const role = req.nextUrl.searchParams.get('role');
  if (role !== 'teacher' && role !== 'student') return NextResponse.json({ error: { code: 'invalid_request', message: 'role must be teacher or student' } }, { status: 400 });

  const people = await callUsersService<{ users: User[] }>('GET', `/v1/users${req.nextUrl.search}`);
  if (people.status !== 200) return NextResponse.json(people.json, { status: people.status });
  const users = (people.json as { users: User[] }).users;
  if (users.length === 0) return NextResponse.json({ users: [] });

  const userIds = users.map((u) => u.id);
  const [calendar, billing] = await Promise.all([
    callCalendar<{ summary: Record<string, Summary> }>('POST', '/v1/admin/summary', { userIds, role }),
    callBilling<{ balances: Record<string, Credits> }>('POST', '/v1/admin/balances', { userIds }),
  ]);
  const summary = calendar.status === 200 ? (calendar.json as { summary: Record<string, Summary> }).summary : null;
  const balances = billing.status === 200 ? (billing.json as { balances: Record<string, Credits> }).balances : null;
  return NextResponse.json({
    users: users.map((u) => ({ ...u, classes: summary?.[u.id] ?? null, credits: balances?.[u.id] ?? null })),
    partial: !summary || !balances,
  });
}
