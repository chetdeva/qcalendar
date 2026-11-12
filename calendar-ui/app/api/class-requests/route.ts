import { NextResponse } from 'next/server';
import { callCalendar, callUsers, readBody } from '@/lib/bff';

/** A mentor's open class requests. */
export async function GET() {
  const { status, json } = await callCalendar('GET', '/v1/class-requests');
  return NextResponse.json(json, { status });
}

/**
 * A student asks one mentor for a class. The mentor's name and address are looked up here, on the server, and only an active mentor
 * is accepted: the browser sends just an id, so nobody can aim a request (and its email) at someone who is not a mentor.
 */
export async function POST(req: Request) {
  const b = (await readBody(req)) as { teacherId?: unknown; start?: unknown; note?: unknown } | null;
  if (typeof b?.teacherId !== 'string' || typeof b.start !== 'string') return NextResponse.json({ error: { code: 'validation', message: 'Choose a mentor and a time' } }, { status: 400 });
  const found = await callUsers<{ users: { id: string; full_name: string | null; email: string; mentor?: boolean }[] }>('POST', '/v1/users/lookup', { ids: [b.teacherId] });
  const mentor = found.status === 200 ? found.json.users.find((u) => u.id === b.teacherId && u.mentor) : undefined;
  if (!mentor) return NextResponse.json({ error: { code: 'not_found', message: 'That mentor was not found' } }, { status: found.status === 200 ? 404 : found.status });
  const { status, json } = await callCalendar('POST', '/v1/class-requests', {
    teacher: { id: mentor.id, email: mentor.email, name: mentor.full_name }, start: b.start, ...(typeof b.note === 'string' && b.note.trim() ? { note: b.note } : {}),
  });
  return NextResponse.json(json, { status });
}
