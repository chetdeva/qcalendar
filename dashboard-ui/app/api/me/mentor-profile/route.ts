import { forwardDashboard, readBody } from '@/lib/bff';

export const GET = () => forwardDashboard('GET', '/v1/me/mentor-profile');
export const PUT = async (req: Request) => forwardDashboard('PUT', '/v1/me/mentor-profile', (await readBody(req)) ?? null);
