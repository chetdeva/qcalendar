import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { HttpError } from '../errors.ts';
import type { Interval, NormalizedEvent, PaymentGateway } from '../gateway.ts';

export interface CashfreeConfig {
  clientId: string;
  clientSecret: string;
  env: 'sandbox' | 'production';
  /** Plans are charged in this currency. Sandbox/test accounts may only allow INR. */
  currency: string;
  /** Cashfree requires a phone number on every subscription and we do not collect one yet. Use a real one in production. */
  defaultPhone: string;
  apiVersion?: string;
  fetch?: typeof fetch;
}

const BASE = { sandbox: 'https://sandbox.cashfree.com/pg', production: 'https://api.cashfree.com/pg' } as const;
const INTERVAL = { month: 'MONTH', year: 'YEAR' } as const;
const FIRST_CHARGE_DELAY_MS = 24 * 3600_000;
const MAX_CYCLES = { month: 120, year: 10 } as const; // ten years of billing cycles

/**
 * Our subscription ids carry who bought what, because Cashfree's payment webhooks name only the subscription id:
 * qt-<user uuid>-<plan key: elementary|middle|high>-<month|year>-<8 hex>. (Cashfree ids are limited to simple characters, hence no JSON.)
 */
const subscriptionId = (userId: string, planKey: string, interval: Interval) => `qt-${userId}-${planKey}-${interval}-${randomUUID().slice(0, 8)}`;
const ID = /^qt-([0-9a-f-]{36})-([a-z]+)-(month|year)-[0-9a-f]{8}$/;

/**
 * Cashfree Subscriptions. Dashboard > Developers > Webhooks: URL https://accounts.<domain>/api/webhooks/billing/cashfree, and
 * enable SUBSCRIPTION_PAYMENT_SUCCESS, SUBSCRIPTION_PAYMENT_FAILED and SUBSCRIPTION_STATUS_CHANGED. Webhooks are signed with
 * the same secret as the API (the client secret).
 *
 * Cashfree's hosted checkout is opened with its JavaScript SDK and a session id, not a URL, so checkout returns a page of
 * ours (users-ui /billing/pay/cashfree) that does that.
 */
export function createCashfreeGateway(cfg: CashfreeConfig): PaymentGateway {
  const doFetch = cfg.fetch ?? fetch;
  const headers = (extra: Record<string, string> = {}) => ({
    'x-client-id': cfg.clientId, 'x-client-secret': cfg.clientSecret, 'x-api-version': cfg.apiVersion ?? '2025-01-01', 'content-type': 'application/json', ...extra,
  });

  async function call<T>(method: string, path: string, body?: unknown, extra?: Record<string, string>): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(`${BASE[cfg.env]}${path}`, { method, headers: headers(extra), body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new HttpError(502, 'gateway_unreachable', 'The payment provider is unreachable. Please try again.');
    }
    const json = (await res.json().catch(() => ({}))) as T & { message?: string };
    if (!res.ok) {
      console.error(`cashfree ${method} ${path} -> ${res.status}: ${json.message ?? ''}`);
      throw new HttpError(502, 'gateway_error', 'The payment provider refused the request. Please try again or contact support.');
    }
    return json;
  }

  // A band can rise (e.g. $350 to $400) after the mandate is set, and Cashfree will not charge above the plan's maximum.
  const planBody = (planKey: string, interval: Interval, amountCents: number) => ({
    plan_name: `Quanttoria ${planKey} ${interval === 'month' ? 'monthly' : 'annual'}`.slice(0, 40),
    plan_type: 'PERIODIC', plan_currency: cfg.currency, plan_amount: amountCents / 100, plan_max_amount: Math.ceil((amountCents * 2) / 100),
    plan_interval_type: INTERVAL[interval], plan_intervals: 1, plan_max_cycles: MAX_CYCLES[interval],
  });

  const verified = (rawBody: string, signature: string | undefined, timestamp: string | undefined) => {
    if (!signature || !timestamp) return false;
    const given = Buffer.from(signature);
    // The docs show both `${timestamp}${body}` and `${timestamp}.${body}`; either is signed with our secret, so either is safe to accept.
    return [`${timestamp}${rawBody}`, `${timestamp}.${rawBody}`].some((signed) => {
      const expected = Buffer.from(createHmac('sha256', cfg.clientSecret).update(signed).digest('base64'));
      return expected.length === given.length && timingSafeEqual(expected, given);
    });
  };

  return {
    name: 'cashfree',

    async createCheckout(o) {
      const id = subscriptionId(o.userId, o.planKey, o.interval);
      const sub = await call<{ subscription_session_id: string }>('POST', '/subscriptions', {
        subscription_id: id,
        customer_details: { customer_name: o.email?.split('@')[0] || 'Student', customer_email: o.email ?? 'unknown@example.com', customer_phone: cfg.defaultPhone },
        plan_details: planBody(o.planKey, o.interval, o.amountCents),
        // Without this Cashfree charges first a whole interval after sign-up. UPI mandates cannot be debited sooner than the next day.
        subscription_first_charge_time: new Date(Date.now() + FIRST_CHARGE_DELAY_MS).toISOString(),
        authorization_details: { authorization_amount: 1, authorization_amount_refund: true, payment_methods: ['card', 'upi'] },
        subscription_meta: { return_url: o.successUrl },
      }, { 'x-idempotency-key': randomUUID() });
      const page = new URL('/billing/pay/cashfree', o.successUrl);
      page.search = new URLSearchParams({ session: sub.subscription_session_id, mode: cfg.env }).toString();
      return { url: page.toString() };
    },

    async createPortalSession() {
      throw new HttpError(501, 'not_supported', 'Updating the payment method is not available yet. Please contact support.');
    },

    // Cashfree cancels the mandate immediately (there is no "at the end of the period"). That is fine: classes already paid for
    // stay usable until they expire, and an annual plan keeps getting its monthly classes while cancel_at_period_end is set.
    async cancelSubscription(o) {
      await call('POST', `/subscriptions/${encodeURIComponent(o.subscriptionRef)}/manage`, { subscription_id: o.subscriptionRef, action: 'CANCEL' });
    },

    // Cashfree charges only at renewal, so changing the plan now means the new amount applies from the next charge.
    async changePlan(o) {
      const planId = `qt_${o.planKey}_${o.interval}_${o.amountCents}_${randomUUID().slice(0, 6)}`;
      await call('POST', '/plans', { plan_id: planId, ...planBody(o.planKey, o.interval, o.amountCents) });
      await call('POST', `/subscriptions/${encodeURIComponent(o.subscriptionRef)}/manage`, { subscription_id: o.subscriptionRef, action: 'CHANGE_PLAN', action_details: { plan_id: planId } });
    },

    parseWebhook({ rawBody, headers: h }) {
      if (!verified(rawBody, h['x-webhook-signature'], h['x-webhook-timestamp'])) throw new HttpError(400, 'bad_signature', 'Webhook signature mismatch');
      const body = JSON.parse(rawBody) as { type?: string; event_time?: string; data?: Data };
      const d = body.data;
      const subRef = d?.subscription_id ?? d?.subscription_details?.subscription_id;
      if (!d || !subRef) return null;
      const payId = d.cf_payment_id ?? d.payment_id;

      switch (body.type) {
        case 'SUBSCRIPTION_PAYMENT_SUCCESS': {
          // The first payment is the mandate authorisation (a small refundable amount), not a month of lessons. Only charges count.
          // Assumption to confirm in the sandbox: the first plan charge arrives as payment_type CHARGE.
          if (d.payment_type !== 'CHARGE') return null;
          const who = ID.exec(subRef);
          if (!who || !payId) {
            console.error(`cashfree: payment ${payId} on subscription ${subRef} is not one of ours; ignored`);
            return null;
          }
          const start = new Date(d.payment_schedule_date ?? d.payment_initiated_date ?? body.event_time ?? Date.now());
          const interval = who[3] as Interval;
          const end = new Date(start);
          if (interval === 'month') end.setUTCMonth(end.getUTCMonth() + 1); else end.setUTCFullYear(end.getUTCFullYear() + 1);
          return {
            type: 'payment_succeeded', gateway: 'cashfree', eventId: `payment:${payId}`, userId: who[1]!, customerRef: subRef, subscriptionRef: subRef,
            planKey: who[2]!, interval, periodStart: start, periodEnd: end, amountCents: Math.round((d.payment_amount ?? 0) * 100), currency: (d.payment_currency ?? cfg.currency).toLowerCase(),
          } satisfies NormalizedEvent;
        }
        case 'SUBSCRIPTION_PAYMENT_FAILED':
          return { type: 'payment_failed', gateway: 'cashfree', eventId: `payment:${payId}`, subscriptionRef: subRef };
        case 'SUBSCRIPTION_STATUS_CHANGED': {
          const status = d.subscription_details?.subscription_status;
          const eventId = `status:${subRef}:${status}:${body.event_time}`;
          if (status === 'ON_HOLD') return { type: 'payment_failed', gateway: 'cashfree', eventId, subscriptionRef: subRef };
          if (status === 'CANCELLED' || status === 'CUSTOMER_CANCELLED' || status === 'EXPIRED' || status === 'COMPLETED')
            return { type: 'subscription_canceled', gateway: 'cashfree', eventId, subscriptionRef: subRef };
          return null;
        }
        default:
          return null;
      }
    },
  };
}

interface Data {
  payment_id?: string; cf_payment_id?: string | number; subscription_id?: string; payment_type?: string; payment_amount?: number; payment_currency?: string;
  payment_schedule_date?: string; payment_initiated_date?: string;
  subscription_details?: { subscription_id?: string; subscription_status?: string };
}
