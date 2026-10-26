import { forwardDashboard } from '@/lib/bff';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return forwardDashboard('GET', `/v1/assignments/${encodeURIComponent((await params).id)}`);
}
