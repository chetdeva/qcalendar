import { forwardDashboard, readBody } from '@/lib/bff';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return forwardDashboard('PUT', `/v1/students/${encodeURIComponent((await params).id)}/settings`, (await readBody(req)) ?? null);
}
