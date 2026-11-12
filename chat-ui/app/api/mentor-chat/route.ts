import { NextResponse } from 'next/server';
import { callCalendar, callChat, callUsers, readBody } from '@/lib/bff';
import { currentSession } from '@/lib/supabase/server';

/**
 * A student opens a chat with a mentor from the mentor's card. Only an active mentor is accepted (users-service says so; the browser
 * sends just an id). Calendar-service records that the student reached out, which makes the two contacts, and then the chat opens.
 */
export async function POST(req: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: { code: 'unauthorized', message: 'Please sign in.' } }, { status: 401 });
  const body = (await readBody(req)) as { mentorId?: unknown } | undefined;
  if (typeof body?.mentorId !== 'string') return NextResponse.json({ error: { code: 'invalid_request', message: 'mentorId is required' } }, { status: 400 });

  const found = await callUsers<{ users: { id: string; mentor?: boolean }[] }>('POST', '/v1/users/lookup', { ids: [body.mentorId] });
  if (found.status !== 200) return NextResponse.json(found.json, { status: found.status });
  if (!found.json.users.some((u) => u.id === body.mentorId && u.mentor)) return NextResponse.json({ error: { code: 'not_found', message: 'That mentor was not found' } }, { status: 404 });

  const link = await callCalendar('POST', '/v1/chat-links', { teacherId: body.mentorId });
  if (link.status !== 204) return NextResponse.json(link.json, { status: link.status });
  const { status, json } = await callChat('POST', '/v1/conversations', { memberIds: [session.user.id, body.mentorId] });
  return NextResponse.json(status === 201 || status === 200 ? { id: json.id } : json, { status });
}
