import { NextResponse } from 'next/server';
import { callCalendar } from '@/lib/bff';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { status, json } = await callCalendar('POST', `/v1/class-requests/${encodeURIComponent(id)}/approve`);
  return NextResponse.json(json, { status });
}
