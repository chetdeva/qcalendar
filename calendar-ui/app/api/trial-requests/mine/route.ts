import { NextResponse } from 'next/server';
import { callCalendar } from '@/lib/bff';

/** The student's own open free-class request (drawn on their calendar as a tentative block). */
export async function GET() {
  const { status, json } = await callCalendar('GET', '/v1/trial-requests/mine');
  return NextResponse.json(json, { status });
}
