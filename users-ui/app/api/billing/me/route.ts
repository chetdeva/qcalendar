import { forwardBilling } from '@/lib/bff';

export const GET = () => forwardBilling('GET', '/v1/billing/me');
