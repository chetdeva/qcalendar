import { NextResponse } from 'next/server';
import { callCalendar, readBody } from '@/lib/bff';

/** The teachers' list of open free-class requests. */
export async function GET() {
  const { status, json } = await callCalendar('GET', '/v1/trial-requests');
  return NextResponse.json(json, { status });
}
export async function POST(req: Request) {
  const { status, json } = await callCalendar('POST', '/v1/trial-requests', (await readBody(req)) ?? {});
  return NextResponse.json(json, { status });
}
export async function DELETE() {
  const { status, json } = await callCalendar('DELETE', '/v1/trial-requests/mine');
  return status === 204 ? new NextResponse(null, { status }) : NextResponse.json(json, { status });
}
