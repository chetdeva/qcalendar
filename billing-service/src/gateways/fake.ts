import { HttpError } from '../errors.ts';
import type { NormalizedEvent, PaymentGateway } from '../gateway.ts';

type Unnamed<T> = T extends unknown ? Omit<T, 'gateway'> : never;
export const FAKE_SECRET = 'fake-secret';

/** In-memory gateway for tests and local development. "Webhooks" are JSON bodies signed with a fixed header. */
export function createFakeGateway() {
  const calls: { method: string; args: unknown }[] = [];
  const record = (method: string, args: unknown) => void calls.push({ method, args });
  const gateway: PaymentGateway = {
    name: 'fake',
    async createCheckout(o) {
      record('createCheckout', o);
      return { url: `https://pay.example.test/checkout?user=${o.userId}&plan=${o.planKey}&interval=${o.interval}` };
    },
    async createPortalSession(o) {
      record('createPortalSession', o);
      return { url: `https://pay.example.test/portal?customer=${o.customerRef}` };
    },
    async cancelSubscription(o) { record('cancelSubscription', o); },
    async changePlan(o) { record('changePlan', o); },
    parseWebhook({ rawBody, headers }) {
      if (headers['x-fake-signature'] !== FAKE_SECRET) throw new HttpError(400, 'bad_signature', 'Webhook signature mismatch');
      const e = JSON.parse(rawBody, (k, v) => (k === 'periodStart' || k === 'periodEnd' ? new Date(v) : v));
      return e.type ? ({ gateway: 'fake', ...e } as NormalizedEvent) : null;
    },
  };
  /** What the provider would POST to us for this event. */
  const deliver = (e: Unnamed<NormalizedEvent>) => ({ rawBody: JSON.stringify(e), headers: { 'x-fake-signature': FAKE_SECRET } });
  return { gateway, calls, deliver };
}
