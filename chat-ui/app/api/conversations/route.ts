import { NextResponse } from 'next/server';
import { callChat, peopleOf, readBody } from '@/lib/bff';
import { currentSession } from '@/lib/supabase/server';

interface Conv { id: string; memberIds: string[]; lastMessage: { id: number; senderId: string; body: string; createdAt: string } | null; lastMessageAt: string; unread: number }

/** My conversations, each titled with the other people's names and emails. */
export async function GET() {
  const session = await currentSession();
  const { status, json } = await callChat<{ conversations: Conv[] }>('GET', '/v1/conversations');
  if (status !== 200 || !session) return NextResponse.json(json, { status });
  const me = session.user.id;
  const people = await peopleOf(json.conversations.flatMap((c) => c.memberIds.filter((m) => m !== me)));
  const others = (c: Conv) => c.memberIds.filter((m) => m !== me).map((m) => people.get(m) ?? { id: m, name: 'Unknown person', email: '' });
  return NextResponse.json({
    me,
    conversations: json.conversations.map((c) => ({
      id: c.id, unread: c.unread, lastMessage: c.lastMessage, lastMessageAt: c.lastMessageAt,
      title: others(c).map((p) => p.name).join(', ') || 'Just you',
      email: others(c).map((p) => p.email).filter(Boolean).join(', '),
    })),
  });
}

/** Start (or reopen) a chat with one person. chat-service asks calendar-service whether they may. */
export async function POST(req: Request) {
  const session = await currentSession();
  const body = (await readBody(req)) as { partnerId?: unknown } | undefined;
  if (!session) return NextResponse.json({ error: { code: 'unauthorized', message: 'Please sign in.' } }, { status: 401 });
  if (typeof body?.partnerId !== 'string') return NextResponse.json({ error: { code: 'invalid_request', message: 'partnerId is required' } }, { status: 400 });
  const { status, json } = await callChat('POST', '/v1/conversations', { memberIds: [session.user.id, body.partnerId] });
  return NextResponse.json(status === 201 || status === 200 ? { id: json.id } : json, { status });
}
