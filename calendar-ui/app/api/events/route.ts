import type { NextRequest } from 'next/server';
import { forwardCalendar, readBody } from '@/lib/bff';

export const GET = (req: NextRequest) => forwardCalendar('GET', `/v1/events${req.nextUrl.search}`);
export const POST = async (req: NextRequest) => forwardCalendar('POST', '/v1/events', (await readBody(req)) ?? null);
