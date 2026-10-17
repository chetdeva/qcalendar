import { NextResponse } from 'next/server';
import { forwardCalendar } from '@/lib/bff';

/** The teacher answers a request: decision is "approve" or "reject". Anything else is not a route. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string; rid: string; decision: string }> }) {
  const { id, rid, decision } = await params;
  if (decision !== 'approve' && decision !== 'reject') return NextResponse.json({ error: { code: 'not_found', message: 'Not found' } }, { status: 404 });
  return forwardCalendar('POST', `/v1/events/${encodeURIComponent(id)}/change-requests/${encodeURIComponent(rid)}/${decision}`);
}
