import type { NextRequest } from 'next/server';
import { forwardChat, readBody } from '@/lib/bff';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return forwardChat('GET', `/v1/conversations/${encodeURIComponent(id)}/messages${req.nextUrl.search}`);
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  return forwardChat('POST', `/v1/conversations/${encodeURIComponent(id)}/messages`, await readBody(req));
}
