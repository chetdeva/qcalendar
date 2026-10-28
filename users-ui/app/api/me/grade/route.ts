import { forward, readBody } from '@/lib/bff';

export const POST = async (req: Request) => forward('POST', '/v1/me/grade', (await readBody(req)) ?? null);
