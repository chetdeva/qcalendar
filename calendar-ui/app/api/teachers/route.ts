import { NextResponse } from 'next/server';
import { callUsers } from '@/lib/bff';
import type { Me, Person } from '@/lib/calendar';

/**
 * For admins creating a class on a teacher's behalf. users-service ignores the role filter for non-admins (teachers
 * only ever get students back), so this route checks the caller really is an admin before asking for teachers.
 */
export async function GET() {
  const me = await callUsers<Me>('GET', '/v1/me');
  if (me.status !== 200) return NextResponse.json(me.json, { status: me.status });
  if (me.json.role !== 'admin') return NextResponse.json({ error: { code: 'forbidden', message: 'Admins only' } }, { status: 403 });
  const { status, json } = await callUsers<{ users: { id: string; full_name: string | null; email: string }[] }>('GET', '/v1/users?role=teacher&status=active&limit=100');
  if (status !== 200) return NextResponse.json(json, { status });
  const people: Person[] = json.users.map((u) => ({ id: u.id, name: u.full_name, email: u.email }));
  return NextResponse.json({ teachers: people });
}
