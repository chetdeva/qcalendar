import { NextResponse, type NextRequest } from 'next/server';
import { callUsers } from '@/lib/bff';

/** Time zones of students already in a class, by id, so the class dialog can show each one's local time. */
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 50);
  if (!ids.length) return NextResponse.json({ zones: {} });
  const { status, json } = await callUsers<{ users: { id: string; timezone?: string | null }[] }>('POST', '/v1/users/lookup', { ids });
  if (status !== 200) return NextResponse.json(json, { status });
  return NextResponse.json({ zones: Object.fromEntries(json.users.filter((u) => u.timezone).map((u) => [u.id, u.timezone])) });
}
