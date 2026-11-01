import { forwardDashboard, readBody } from '@/lib/bff';

/** A teacher's mentor profile (what students see under Mentors). dashboard-service keeps it and decides who may change it. */
export const GET = () => forwardDashboard('GET', '/v1/me/mentor-profile');
export const PUT = async (req: Request) => forwardDashboard('PUT', '/v1/me/mentor-profile', (await readBody(req)) ?? null);
