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
  /** The buyer got further through checkout (their payment method was verified, the subscription went live) but nothing is paid yet. */
  | { type: 'payment_progress'; gateway: string; eventId: string; subscriptionRef: string; step: 'authenticated' | 'activated' }
  /** A card or bank attempt was declined. The provider may name only the invoice; the service then asks `subscriptionOfInvoice`. */
  | { type: 'payment_attempt_failed'; gateway: string; eventId: string; subscriptionRef?: string; invoiceRef?: string }
  | { type: 'payment_failed'; gateway: string; eventId: string; subscriptionRef: string }
  | { type: 'subscription_canceled'; gateway: string; eventId: string; subscriptionRef: string };

export interface PaymentGateway {
  readonly name: string;
  /** A hosted payment page for a new subscription. The user id travels with it so the webhook can name the buyer. */
  createCheckout(o: { userId: string; email: string | undefined; planKey: string; interval: Interval; amountCents: number; successUrl: string; cancelUrl: string }): Promise<{ url: string; /** the gateway's id for the new subscription, which its later webhooks name */ ref?: string; currency?: string }>;
  /** A hosted page where the customer updates their payment method or cancels. */
  createPortalSession(o: { customerRef: string; returnUrl: string }): Promise<{ url: string }>;
  cancelSubscription(o: { subscriptionRef: string; atPeriodEnd: boolean }): Promise<void>;
  /** Change what the subscription charges from its next renewal on (a grade moving into another price band). */
  changePlan(o: { subscriptionRef: string; planKey: string; interval: Interval; amountCents: number }): Promise<void>;
  /** Optional: which subscription an invoice belongs to, for providers whose failure messages name only the invoice. */
  subscriptionOfInvoice?(invoiceRef: string): Promise<string | undefined>;
  /** Verifies the signature and translates. Throws HttpError(400) on a bad signature; returns null for events we ignore. */
  parseWebhook(o: { rawBody: string; headers: Record<string, string> }): NormalizedEvent | null;
}
