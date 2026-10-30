import { NextResponse } from 'next/server';
import { callCalendar } from '@/lib/bff';

/** A teacher accepts the time a student asked for: the free class is created for both. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { status, json } = await callCalendar('POST', `/v1/trial-requests/${encodeURIComponent((await params).id)}/confirm`);
  return NextResponse.json(json, { status });
}
