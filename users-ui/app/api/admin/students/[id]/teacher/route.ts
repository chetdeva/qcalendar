import { NextResponse } from 'next/server';
import { callCalendar, callUsersService, readBody } from '@/lib/bff';

interface Profile { id: string; email: string; full_name: string | null; role: string; status: string }
const fail = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

/**
 * Assigns a student to a teacher, or removes the assignment ({teacherId: null}). Names and emails come from users-service
 * here, not from the browser, because calendar-service keeps them with the record and uses them in the notifications.
 */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = (await readBody(req)) as { teacherId?: string | null; note?: string } | undefined;
  if (!b || b.teacherId === undefined) return fail(400, 'invalid_request', 'teacherId is required (or null to remove the assignment).');

  const student = await callUsersService<Profile>('GET', `/v1/users/${encodeURIComponent(id)}`);
  if (student.status !== 200) return NextResponse.json(student.json, { status: student.status });
  const s = student.json as Profile;
  if (s.role !== 'student') return fail(400, 'invalid_request', 'Only students can be assigned a teacher.');

  let teacher: { email: string; name: string | null } | undefined;
  if (b.teacherId) {
    const t = await callUsersService<Profile>('GET', `/v1/users/${encodeURIComponent(b.teacherId)}`);
    if (t.status !== 200) return NextResponse.json(t.json, { status: t.status });
    const tp = t.json as Profile;
    if (tp.role !== 'teacher' || tp.status !== 'active') return fail(400, 'invalid_request', 'Choose an active teacher.');
    teacher = { email: tp.email, name: tp.full_name };
  }
  const r = await callCalendar('PUT', `/v1/admin/students/${encodeURIComponent(id)}/teacher`, {
    teacherId: b.teacherId, ...(b.note?.trim() ? { note: b.note.trim() } : {}), student: { email: s.email, name: s.full_name }, ...(teacher ? { teacher } : {}),
  });
  return NextResponse.json(r.json, { status: r.status });
}
