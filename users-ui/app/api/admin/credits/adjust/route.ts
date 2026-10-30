import { forwardBilling, readBody } from '@/lib/bff';

export const POST = async (req: Request) => forwardBilling('POST', '/v1/admin/credits/adjust', (await readBody(req)) ?? null);
