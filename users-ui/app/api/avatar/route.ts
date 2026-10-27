import { NextResponse } from 'next/server';
import { forwardRaw } from '@/lib/bff';

const MAX = 256 * 1024; // the same cap users-service enforces; checking here too spares reading a huge body

export const GET = () => forwardRaw('GET', '/v1/me/avatar');
export const DELETE = () => forwardRaw('DELETE', '/v1/me/avatar');
export async function PUT(req: Request) {
  if (Number(req.headers.get('content-length') ?? 0) > MAX) return NextResponse.json({ error: { code: 'too_large', message: 'The picture is too big (256 KB at most)' } }, { status: 413 });
  return forwardRaw('PUT', '/v1/me/avatar', await req.arrayBuffer(), req.headers.get('content-type') ?? undefined);
}
