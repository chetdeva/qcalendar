import { NextResponse } from 'next/server';
import { callCalendar } from '@/lib/bff';

/** The student's open class requests (and any a mentor declined this week). */
export async function GET() {
  const { status, json } = await callCalendar('GET', '/v1/class-requests/mine');
  return NextResponse.json(json, { status });
}
