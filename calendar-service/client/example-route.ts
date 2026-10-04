// app/api/book/route.ts in your Next.js app
import { NextResponse } from 'next/server';
import { calendar, CalendarError } from '@/lib/calendar';

export async function POST(req: Request) {
  const { studentEmail, tutorEmail, start, sessionId } = await req.json();
  // TODO: authenticate the caller with your own session/auth before booking
  try {
    const event = await calendar.createEvent({
      title: 'Tutoring session', start, durationMinutes: 60,
      attendees: [studentEmail, tutorEmail], meet: true, externalRef: sessionId,
    });
    return NextResponse.json(event, { status: 201 });
  } catch (e) {
    if (e instanceof CalendarError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
