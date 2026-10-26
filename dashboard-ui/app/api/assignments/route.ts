import { forwardDashboard, readBody } from '@/lib/bff';

export const GET = () => forwardDashboard('GET', '/v1/assignments');
export const POST = async (req: Request) => forwardDashboard('POST', '/v1/assignments', (await readBody(req)) ?? null);
