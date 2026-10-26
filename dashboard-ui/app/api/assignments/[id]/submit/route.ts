import { forwardDashboard, readBody } from '@/lib/bff';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return forwardDashboard('POST', `/v1/assignments/${encodeURIComponent((await params).id)}/submit`, (await readBody(req)) ?? null);
}
