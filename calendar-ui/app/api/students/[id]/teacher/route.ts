import { NextResponse } from 'next/server';
import { callCalendar } from '@/lib/bff';

/** The teacher a student is assigned to (admins only, enforced by calendar-service), so scheduling can start from them. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = await callCalendar<{ assignments: { teacher: { id: string }; endedAt: string | null }[] }>('GET', `/v1/admin/students/${encodeURIComponent(id)}/assignments`);
  if (r.status !== 200) return NextResponse.json(r.json, { status: r.status });
  return NextResponse.json({ teacherId: r.json.assignments.find((a) => a.endedAt === null)?.teacher.id ?? null });
}
