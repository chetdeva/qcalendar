import { forwardBilling } from '@/lib/bff';

export const POST = () => forwardBilling('POST', '/v1/billing/portal');
