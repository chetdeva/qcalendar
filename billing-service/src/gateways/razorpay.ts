import { createHmac, timingSafeEqual } from 'node:crypto';
import { HttpError } from '../errors.ts';
import type { Interval, NormalizedEvent, PaymentGateway } from '../gateway.ts';

export interface RazorpayConfig {
  keyId: string;
  keySecret: string;
  /** Set when creating the webhook in the dashboard; signs every webhook (not the same as the API secret). */
  webhookSecret: string;
  /** Plans are charged in this currency. Indian accounts charge INR unless international payments are enabled. */
  currency: string;
  fetch?: typeof fetch;
}

const BASE = 'https://api.razorpay.com/v1'; // test and live differ only by key (rzp_test_ / rzp_live_)
const PERIOD = { month: 'monthly', year: 'yearly' } as const;
const CYCLES = { month: 120, year: 10 } as const; // ten years of billing cycles

/**
 * Razorpay Subscriptions. Dashboard > Account & Settings > Webhooks: URL https://accounts.<domain>/api/webhooks/billing/razorpay,
 * your own secret (RAZORPAY_WEBHOOK_SECRET) and the events subscription.charged, subscription.pending, subscription.halted,
 * subscription.cancelled, subscription.completed.
 *
 * The buyer travels in the subscription's notes (user_id, plan_key, interval), so no id encoding is needed. Checkout is
 * Razorpay's hosted page (the subscription's short_url). The first payment on that page is the first month's charge, so
 * classes arrive as soon as the student pays.
 */
export function createRazorpayGateway(cfg: RazorpayConfig): PaymentGateway {
  const doFetch = cfg.fetch ?? fetch;
  const auth = `Basic ${Buffer.from(`${cfg.keyId}:${cfg.keySecret}`).toString('base64')}`;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await doFetch(`${BASE}${path}`, { method, headers: { authorization: auth, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
      throw new HttpError(502, 'gateway_unreachable', 'The payment provider is unreachable. Please try again.');
    }
    const json = (await res.json().catch(() => ({}))) as T & { error?: { description?: string } };
    if (!res.ok) {
      console.error(`razorpay ${method} ${path} -> ${res.status}: ${json.error?.description ?? ''}`);
      throw new HttpError(502, 'gateway_error', 'The payment provider refused the request. Please try again or contact support.');
    }
    return json;
  }

  const createPlan = (planKey: string, interval: Interval, amountCents: number) =>
    call<{ id: string }>('POST', '/plans', {
      period: PERIOD[interval], interval: 1,
      item: { name: `Quanttoria ${planKey} ${interval === 'month' ? 'monthly' : 'annual'}`.slice(0, 40), amount: amountCents, currency: cfg.currency.toUpperCase() },
    });

  const verified = (rawBody: string, signature: string | undefined) => {
    if (!signature) return false;
    const expected = Buffer.from(createHmac('sha256', cfg.webhookSecret).update(rawBody).digest('hex'));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  };

  return {
    name: 'razorpay',

    async createCheckout(o) {
      const plan = await createPlan(o.planKey, o.interval, o.amountCents);
      const sub = await call<{ short_url: string }>('POST', '/subscriptions', {
        plan_id: plan.id, total_count: CYCLES[o.interval], customer_notify: 1,
        notes: { user_id: o.userId, plan_key: o.planKey, interval: o.interval, email: o.email ?? '' },
      });
      return { url: sub.short_url };
    },

    async createPortalSession() {
      throw new HttpError(501, 'not_supported', 'Updating the payment method is not available yet. Please contact support.');
    },

    async cancelSubscription(o) {
      await call('POST', `/subscriptions/${encodeURIComponent(o.subscriptionRef)}/cancel`, { cancel_at_cycle_end: o.atPeriodEnd ? 1 : 0 });
    },

    // Applies at the end of the current cycle. Razorpay refuses plan changes on subscriptions paid by UPI or e-mandate;
    // that surfaces as a gateway_error and the student's price band change then has to be made by hand.
    async changePlan(o) {
      const plan = await createPlan(o.planKey, o.interval, o.amountCents);
      await call('PATCH', `/subscriptions/${encodeURIComponent(o.subscriptionRef)}`, { plan_id: plan.id, schedule_change_at: 'cycle_end' });
    },

    parseWebhook({ rawBody, headers: h }) {
      if (!verified(rawBody, h['x-razorpay-signature'])) throw new HttpError(400, 'bad_signature', 'Webhook signature mismatch');
      const body = JSON.parse(rawBody) as Body;
      const sub = body.payload?.subscription?.entity;
      if (!sub?.id) return null;
      const payId = body.payload?.payment?.entity?.id;
      const eventId = h['x-razorpay-event-id'] ?? `${body.event}:${sub.id}:${payId ?? sub.current_start ?? body.created_at}`;

      switch (body.event) {
        case 'subscription.charged': {
          const { user_id, plan_key, interval } = sub.notes ?? {};
          const pay = body.payload?.payment?.entity;
          if (!user_id || !plan_key || (interval !== 'month' && interval !== 'year') || !sub.current_start || !sub.current_end) {
            console.error(`razorpay: charge on subscription ${sub.id} is not one of ours; ignored`);
            return null;
          }
          return {
            type: 'payment_succeeded', gateway: 'razorpay', eventId, userId: user_id, customerRef: sub.id, subscriptionRef: sub.id, planKey: plan_key, interval,
            periodStart: new Date(sub.current_start * 1000), periodEnd: new Date(sub.current_end * 1000),
            amountCents: pay?.amount ?? 0, currency: (pay?.currency ?? cfg.currency).toLowerCase(),
          } satisfies NormalizedEvent;
        }
        case 'subscription.pending': // a renewal charge failed and Razorpay will retry
        case 'subscription.halted': // retries exhausted
          return { type: 'payment_failed', gateway: 'razorpay', eventId, subscriptionRef: sub.id };
        case 'subscription.cancelled':
        case 'subscription.completed':
        case 'subscription.expired':
          return { type: 'subscription_canceled', gateway: 'razorpay', eventId, subscriptionRef: sub.id };
        default:
          return null;
      }
    },
  };
}

interface Body {
  event?: string; created_at?: number;
  payload?: {
    subscription?: { entity?: { id?: string; current_start?: number | null; current_end?: number | null; notes?: Record<string, string> } };
    payment?: { entity?: { id?: string; amount?: number; currency?: string } };
  };
}
