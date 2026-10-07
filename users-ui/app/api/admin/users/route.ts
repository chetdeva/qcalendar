import type { NextRequest } from 'next/server';
import { forward } from '@/lib/bff';

export const GET = (req: NextRequest) => forward('GET', `/v1/users${req.nextUrl.search}`);
