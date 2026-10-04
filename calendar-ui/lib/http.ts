import { NextResponse } from 'next/server';
import { CalendarError } from './calendar';

export function fail(e: unknown) {
  if (e instanceof CalendarError) {
    return NextResponse.json({ error: e.message, code: e.code, details: e.details }, { status: e.status });
  }
  console.error(e);
  return NextResponse.json({ error: 'Calendar service unreachable' }, { status: 502 });
}
