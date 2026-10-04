import { forwardCalendar, readBody } from '@/lib/bff';

type Ctx = { params: Promise<{ id: string }> };
const path = async (c: Ctx) => `/v1/events/${encodeURIComponent((await c.params).id)}`;

export const GET = async (_r: Request, c: Ctx) => forwardCalendar('GET', await path(c));
export const PATCH = async (r: Request, c: Ctx) => forwardCalendar('PATCH', await path(c), (await readBody(r)) ?? null);
export const DELETE = async (_r: Request, c: Ctx) => forwardCalendar('DELETE', await path(c));
