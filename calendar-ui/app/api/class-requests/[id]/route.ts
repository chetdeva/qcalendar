import { NextResponse } from 'next/server';
import { callCalendar } from '@/lib/bff';

/** The student withdraws an open request. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { status, json } = await callCalendar('DELETE', `/v1/class-requests/${encodeURIComponent(id)}`);
  return status === 204 ? new NextResponse(null, { status }) : NextResponse.json(json, { status });
}
