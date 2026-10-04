import { forwardCalendar, readBody } from '@/lib/bff';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardCalendar('POST', `/v1/events/${encodeURIComponent(id)}/respond`, (await readBody(req)) ?? null);
}
