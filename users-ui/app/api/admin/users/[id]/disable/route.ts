import { forward } from '@/lib/bff';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forward('POST', `/v1/users/${encodeURIComponent(id)}/disable`);
}
