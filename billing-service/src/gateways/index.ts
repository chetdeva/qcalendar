import type { PaymentGateway } from '../gateway.ts';
import { createFakeGateway } from './fake.ts';

/** The one place that knows which gateways exist. A new provider = one new file + one line here. */
const registry: Record<string, (env: NodeJS.ProcessEnv) => PaymentGateway> = {
  fake: () => createFakeGateway().gateway,
};

export function gatewayFor(name: string, env: NodeJS.ProcessEnv = process.env): PaymentGateway {
  const make = registry[name];
  if (!make) throw new Error(`Unknown BILLING_GATEWAY "${name}". Known: ${Object.keys(registry).join(', ')}`);
  return make(env);
}
