import { forward, readBody } from '@/lib/bff';

/** The browser's time zone, kept by users-service only when the person has none yet. */
export const POST = async (req: Request) => forward('POST', '/v1/me/timezone-hint', (await readBody(req)) ?? null);
