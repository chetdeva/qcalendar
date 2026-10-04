import { forward } from '@/lib/bff';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forward('DELETE', `/v1/invitations/${encodeURIComponent(id)}`);
}
