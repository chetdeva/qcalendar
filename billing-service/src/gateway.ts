/**
 * The only thing the rest of the service knows about a payment provider. To add or switch gateways, write one file in
 * ./gateways that implements this and register it in ./gateways/index.ts. Nothing else changes.
 */
export type Interval = 'month' | 'year';

/** What a provider's webhook means, in our words. Adapters translate; the domain code never sees provider payloads. */
export type NormalizedEvent =
  | {
      type: 'payment_succeeded';
      gateway: string;
      eventId: string;
      userId: string;
      customerRef: string;
      subscriptionRef: string;
      planKey: string;
      interval: Interval;
      periodStart: Date;
      periodEnd: Date;
      amountCents: number;
      currency: string;
    }
  | { type: 'payment_failed'; gateway: string; eventId: string; subscriptionRef: string }
  | { type: 'subscription_canceled'; gateway: string; eventId: string; subscriptionRef: string };

export interface PaymentGateway {
  readonly name: string;
  /** A hosted payment page for a new subscription. The user id travels with it so the webhook can name the buyer. */
  createCheckout(o: { userId: string; email: string | undefined; planKey: string; interval: Interval; amountCents: number; successUrl: string; cancelUrl: string }): Promise<{ url: string }>;
  /** A hosted page where the customer updates their payment method or cancels. */
  createPortalSession(o: { customerRef: string; returnUrl: string }): Promise<{ url: string }>;
  cancelSubscription(o: { subscriptionRef: string; atPeriodEnd: boolean }): Promise<void>;
  /** Change what the subscription charges from its next renewal on (a grade moving into another price band). */
  changePlan(o: { subscriptionRef: string; planKey: string; interval: Interval; amountCents: number }): Promise<void>;
  /** Verifies the signature and translates. Throws HttpError(400) on a bad signature; returns null for events we ignore. */
  parseWebhook(o: { rawBody: string; headers: Record<string, string> }): NormalizedEvent | null;
}
