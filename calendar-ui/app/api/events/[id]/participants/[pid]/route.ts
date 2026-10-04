import { forwardCalendar } from '@/lib/bff';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; pid: string }> }) {
  const { id, pid } = await params;
  return forwardCalendar('DELETE', `/v1/events/${encodeURIComponent(id)}/participants/${encodeURIComponent(pid)}`);
}
