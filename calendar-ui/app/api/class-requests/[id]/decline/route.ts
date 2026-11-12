import { NextResponse } from 'next/server';
import { callCalendar, readBody } from '@/lib/bff';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { status, json } = await callCalendar('POST', `/v1/class-requests/${encodeURIComponent(id)}/decline`, (await readBody(req)) ?? {});
  return NextResponse.json(json, { status });
}
