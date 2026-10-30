import { NextResponse } from 'next/server';
import { callCalendar } from '@/lib/bff';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await callCalendar('GET', `/v1/admin/students/${encodeURIComponent(id)}/assignments`);
  return NextResponse.json(r.json, { status: r.status });
}
