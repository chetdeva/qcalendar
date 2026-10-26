import type { NextRequest } from 'next/server';
import { forwardDashboard } from '@/lib/bff';

export const GET = (req: NextRequest) => forwardDashboard('GET', `/v1/students${req.nextUrl.search}`);
