import { rawDashboard } from '@/lib/bff';

/** Streams an uploaded image to the browser. dashboard-service decides who may see it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return rawDashboard(`/v1/attachments/${encodeURIComponent((await params).id)}`);
}
