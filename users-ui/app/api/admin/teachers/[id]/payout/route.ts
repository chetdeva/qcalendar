import { forwardBilling } from '@/lib/bff';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return forwardBilling('GET', `/v1/admin/teachers/${encodeURIComponent((await params).id)}/payout`);
}
