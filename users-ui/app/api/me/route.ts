import { forward, readBody } from '@/lib/bff';

export const GET = () => forward('GET', '/v1/me');
export const PATCH = async (req: Request) => forward('PATCH', '/v1/me', (await readBody(req)) ?? null);
