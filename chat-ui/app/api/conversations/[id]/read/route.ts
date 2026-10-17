import { forwardChat } from '@/lib/bff';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forwardChat('POST', `/v1/conversations/${encodeURIComponent(id)}/read`);
}
