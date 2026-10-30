import { forwardBilling, readBody } from '@/lib/bff';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return forwardBilling('PUT', `/v1/admin/teachers/${encodeURIComponent((await params).id)}/rate`, (await readBody(req)) ?? null);
}
