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
  trialAvailable: boolean;
}

export const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
export const fullDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
