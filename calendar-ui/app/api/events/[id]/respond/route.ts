import { NextResponse } from 'next/server';
import { callCalendar, messageTeacher, readBody, whenIn } from '@/lib/bff';
import type { CalendarEvent } from '@/lib/calendar';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await readBody(req)) as { response?: string; note?: string } | undefined;
  const { status, json } = await callCalendar<CalendarEvent>('POST', `/v1/events/${encodeURIComponent(id)}/respond`, body ?? null);
  if (status === 200 && body?.response === 'declined') {
    const note = body.note?.trim();
    await messageTeacher(json.ownerId, `I can’t make “${json.title}” on ${whenIn(json.start, json.end, json.timezone)}.${note ? ` ${note}` : ''}`);
  }
  return NextResponse.json(json, { status });
}
