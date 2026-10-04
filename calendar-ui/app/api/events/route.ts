import { NextRequest, NextResponse } from 'next/server';
import { calendar } from '@/lib/calendar';
import { fail } from '@/lib/http';

export async function GET(req: NextRequest) {
  const q: Record<string, string> = {};
  for (const k of ['from', 'to', 'externalRef', 'attendee']) {
    const v = req.nextUrl.searchParams.get(k);
    if (v) q[k] = v;
  }
  try {
    return NextResponse.json(await calendar.listEvents(q));
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    return NextResponse.json(await calendar.createEvent(await req.json()), { status: 201 });
  } catch (e) {
    return fail(e);
  }
}
