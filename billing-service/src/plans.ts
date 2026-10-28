import type { Queryable } from './db.ts';
import type { Interval } from './gateway.ts';

export interface Plan {
  key: string;
  min_grade: number;
  max_grade: number;
  monthly_cents: number;
  annual_discount_pct: number;
  credits_per_month: number;
}

/** What one payment costs: the monthly price, or twelve months less the annual discount. */
export const priceCents = (p: Plan, interval: Interval) =>
  interval === 'month' ? p.monthly_cents : Math.round((p.monthly_cents * 12 * (100 - p.annual_discount_pct)) / 100);

export async function getPlan(q: Queryable, key: string): Promise<Plan> {
  const [p] = await q.query<Plan>('select * from billing.plans where key = $1', [key]);
  if (!p) throw new Error(`unknown plan ${key}`);
  return p;
}

export async function planForGrade(q: Queryable, grade: number): Promise<Plan | undefined> {
  return (await q.query<Plan>('select * from billing.plans where $1 between min_grade and max_grade', [grade]))[0];
}
