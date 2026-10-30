import { forwardBilling, readBody } from '@/lib/bff';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return forwardBilling('POST', `/v1/admin/teachers/${encodeURIComponent((await params).id)}/payouts`, (await readBody(req)) ?? null);
}
