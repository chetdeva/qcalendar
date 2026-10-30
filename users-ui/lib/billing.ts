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
  trial: 'available' | 'booked' | 'done';
  /** What to nudge the student toward; the same list every app shows. */
  prompts: ('book_trial' | 'trial_booked' | 'subscribe')[];
  /** Every price band, for the grade-by-grade table. `yours` marks the student's own. */
  bands: { key: string; label: string; monthlyCents: number; annualCents: number; yours: boolean }[];
}

export const dollars = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
export const fullDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
