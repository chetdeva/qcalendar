import { forward, readBody } from '@/lib/bff';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forward('PATCH', `/v1/users/${encodeURIComponent(id)}/role`, (await readBody(req)) ?? null);
}
