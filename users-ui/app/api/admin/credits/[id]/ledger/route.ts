import type { NextRequest } from 'next/server';
import { forwardBilling } from '@/lib/bff';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardBilling('GET', `/v1/admin/credits/${encodeURIComponent(id)}/ledger${req.nextUrl.search}`);
}
