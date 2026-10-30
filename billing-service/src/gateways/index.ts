import type { PaymentGateway } from '../gateway.ts';
import { createFakeGateway } from './fake.ts';
import { createCashfreeGateway } from './cashfree.ts';
import { createRazorpayGateway } from './razorpay.ts';

/** The one place that knows which gateways exist. A new provider = one new file + one line here. */
const registry: Record<string, (env: NodeJS.ProcessEnv) => PaymentGateway> = {
  fake: () => createFakeGateway().gateway,
  cashfree: (env) => {
    const need = (k: string) => env[k] || (() => { throw new Error(`${k} is required when BILLING_GATEWAY=cashfree`); })();
    return createCashfreeGateway({
      clientId: need('CASHFREE_CLIENT_ID'), clientSecret: need('CASHFREE_CLIENT_SECRET'),
      env: env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox', currency: env.CASHFREE_CURRENCY || 'INR', defaultPhone: env.CASHFREE_DEFAULT_PHONE || '9999999999',
      apiVersion: env.CASHFREE_API_VERSION || undefined,
    });
  },
  razorpay: (env) => {
    const need = (k: string) => env[k] || (() => { throw new Error(`${k} is required when BILLING_GATEWAY=razorpay`); })();
    return createRazorpayGateway({
      keyId: need('RAZORPAY_KEY_ID'), keySecret: need('RAZORPAY_KEY_SECRET'), webhookSecret: need('RAZORPAY_WEBHOOK_SECRET'), currency: env.RAZORPAY_CURRENCY || 'INR',
    });
  },
};

export function gatewayFor(name: string, env: NodeJS.ProcessEnv = process.env): PaymentGateway {
  const make = registry[name];
  if (!make) throw new Error(`Unknown BILLING_GATEWAY "${name}". Known: ${Object.keys(registry).join(', ')}`);
  return make(env);
}
