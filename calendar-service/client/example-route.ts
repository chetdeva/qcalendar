// A backend that books a class for a teacher with several students, for example the future booking app.
// It authenticates to calendar-service with the service API key, so it must say whose calendar (ownerId).
// app/api/book/route.ts in a Next.js app:
import { NextResponse } from 'next/server';
import { calendarClient, CalendarError } from '@/lib/calendar';

const calendar = calendarClient(process.env.CALENDAR_API_KEY!);

export async function POST(req: Request) {
  const { teacherId, teacherEmail, teacherName, studentEmails, start, sessionId } = await req.json();
  // TODO: authenticate the caller with your own session/auth, and check they may book for this teacher.
  try {
    const event = await calendar.createEvent({
      ownerId: teacherId, ownerEmail: teacherEmail, ownerName: teacherName,
      title: 'Tutoring session', start, durationMinutes: 60, meet: true, externalRef: sessionId,
      participants: studentEmails.map((email: string) => ({ email })),
    });
    return NextResponse.json(event, { status: 201 });
  } catch (e) {
    if (e instanceof CalendarError) return NextResponse.json({ error: e.message, code: e.code, details: e.details }, { status: e.status });
    throw e;
  }
}
