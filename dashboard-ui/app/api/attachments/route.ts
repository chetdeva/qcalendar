import { forwardDashboard, readBody } from '@/lib/bff';

export const POST = async (req: Request) => forwardDashboard('POST', '/v1/attachments', (await readBody(req)) ?? null);
