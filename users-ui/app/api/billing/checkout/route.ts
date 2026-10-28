import { forwardBilling, readBody } from '@/lib/bff';

export const POST = async (req: Request) => forwardBilling('POST', '/v1/billing/checkout', (await readBody(req)) ?? null);
