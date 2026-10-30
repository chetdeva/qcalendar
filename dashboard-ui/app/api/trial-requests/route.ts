import { NextResponse } from 'next/server';
import { callCalendar, readBody } from '@/lib/bff';

export async function POST(req: Request) {
  const { status, json } = await callCalendar('POST', '/v1/trial-requests', (await readBody(req)) ?? {});
  return NextResponse.json(json, { status });
}
export async function DELETE() {
  const { status, json } = await callCalendar('DELETE', '/v1/trial-requests/mine');
  return status === 204 ? new NextResponse(null, { status }) : NextResponse.json(json, { status });
}
