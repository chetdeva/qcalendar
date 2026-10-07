import type { NextRequest } from 'next/server';
import { forwardCalendar } from '@/lib/bff';

export const GET = (req: NextRequest) => forwardCalendar('GET', `/v1/availability${req.nextUrl.search}`);
