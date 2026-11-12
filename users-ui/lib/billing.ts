/** Where a payment is: opened, then the gateway's steps, then one of three ends. */
export type PaymentStatus = 'started' | 'authenticated' | 'activated' | 'succeeded' | 'failed' | 'cancelled';
export const paymentLabel: Record<PaymentStatus, string> = {
  started: 'Checkout started', authenticated: 'Payment method verified', activated: 'Confirming payment',
  succeeded: 'Paid', failed: 'Failed', cancelled: 'Not completed',
};
export const paymentTone = (s: PaymentStatus) => (s === 'succeeded' ? 'bl-ok' : s === 'failed' ? 'bl-bad' : s === 'cancelled' ? 'bl-off' : 'bl-wait');

export interface BillingMe {
  grade: number | null;
  plan: { key: string; monthlyCents: number; annualCents: number; creditsPerMonth: number } | null;
  subscription: {
    status: 'active' | 'past_due' | 'canceled';
    planKey: string;
    interval: 'month' | 'year';
    periodEnd: string;
    cancelAtPeriodEnd: boolean;
    pendingPlan: { key: string; cents: number; from: string } | null;
  } | null;
  credits: { remaining: number; expiresAt: string | null };
  /** Newest first. A failed attempt has no amount. */
  payments: { id: string; hasInvoice: boolean; status: PaymentStatus; amountCents: number | null; currency: string | null; planKey: string | null; interval: 'month' | 'year' | null; at: string }[];
  trialAvailable: boolean;
  trial: 'available' | 'booked' | 'done';
  /** What to nudge the student toward; the same list every app shows. */
  prompts: ('book_trial' | 'trial_booked' | 'subscribe')[];
  /** Every price band, for the grade-by-grade table. `yours` marks the student's own. */
  bands: { key: string; label: string; monthlyCents: number; annualCents: number; yours: boolean }[];
}

export const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
export const fullDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
export const money = (cents: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
