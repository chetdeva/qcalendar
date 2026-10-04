import type { NextRequest } from 'next/server';
import { forward, readBody } from '@/lib/bff';

export const GET = (req: NextRequest) => forward('GET', `/v1/invitations${req.nextUrl.search}`);
export const POST = async (req: Request) => forward('POST', '/v1/invitations', (await readBody(req)) ?? null);
