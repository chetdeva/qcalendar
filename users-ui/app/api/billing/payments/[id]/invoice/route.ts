import { forwardBilling } from '@/lib/bff';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return forwardBilling('GET', `/v1/billing/payments/${encodeURIComponent((await params).id)}/invoice`);
}
