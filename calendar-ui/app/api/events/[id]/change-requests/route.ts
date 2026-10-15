import { NextResponse } from 'next/server';
import { callCalendar, messageTeacher, readBody, whenIn } from '@/lib/bff';
import type { CalendarEvent } from '@/lib/calendar';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await readBody(req)) as { start?: string; note?: string } | undefined;
  const { status, json } = await callCalendar<CalendarEvent>('POST', `/v1/events/${encodeURIComponent(id)}/change-requests`, body ?? null);
  const cr = json.changeRequest;
  if (status === 201 && cr) {
    const note = cr.note?.trim();
    await messageTeacher(json.ownerId, `Could we move “${json.title}” from ${whenIn(json.start, json.end, json.timezone)} to ${whenIn(cr.start, cr.end, json.timezone)}?${note ? ` ${note}` : ''}`);
  }
  return NextResponse.json(json, { status });
}
