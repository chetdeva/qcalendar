// The rules behind the numbers on the dashboards. Pure functions, so they are tested with fixed dates.

export const AQ_TAG = 'High Adversity Quotient (AQ)';
export const DAY = 86_400_000;

export const dayOf = (d: Date, timeZone = 'UTC') => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** Consecutive days with activity, counted back from today (or from yesterday when today has none yet). */
export function streak(days: string[], now: Date, timeZone = 'UTC'): number {
  const have = new Set(days);
  let cursor = new Date(now);
  if (!have.has(dayOf(cursor, timeZone))) cursor = new Date(cursor.getTime() - DAY);
  let n = 0;
  while (have.has(dayOf(cursor, timeZone))) { n++; cursor = new Date(cursor.getTime() - DAY); }
  return n;
}

export const points = (graded: { xp: number }[]) => graded.reduce((n, g) => n + g.xp, 0);

/** Average score of up to the last ten graded tasks (newest first), or null with none. */
export function mastery(scores: number[]): number | null {
  const last = scores.slice(0, 10);
  return last.length ? Math.round(last.reduce((a, b) => a + b, 0) / last.length) : null;
}

/**
 * 0 to 100: half the share of the last ten graded tasks tagged high-resilience, half the share of the last ten assigned
 * tasks that were handed in. Null until the student has been given something.
 */
export function aq(gradedTags: string[][], assignedHandedIn: boolean[]): number | null {
  if (assignedHandedIn.length === 0) return null;
  const g = gradedTags.slice(0, 10);
  const a = assignedHandedIn.slice(0, 10);
  const tagShare = g.length ? g.filter((t) => t.includes(AQ_TAG)).length / g.length : 0;
  const doneShare = a.filter(Boolean).length / a.length;
  return Math.round(100 * (0.5 * tagShare + 0.5 * doneShare));
}

export function tier(score: number | null): { label: string; tone: 'sun' | 'rose' | 'sky' } {
  if (score === null) return { label: 'Just getting started', tone: 'sky' };
  if (score >= 80) return { label: 'High Resilience', tone: 'sun' };
  if (score >= 60) return { label: 'Growing Steadily', tone: 'rose' };
  return { label: 'Building Confidence', tone: 'sky' };
}

export const letter = (score: number) => (score >= 97 ? 'A+' : score >= 93 ? 'A' : score >= 90 ? 'A-' : score >= 87 ? 'B+' : score >= 83 ? 'B' : score >= 80 ? 'B-' : score >= 70 ? 'C' : 'D');

/** Average AQ of the last 30 days minus the 30 days before; null when either period has nothing to compare. */
export function growth(recent: number[], before: number[]): number | null {
  if (!recent.length || !before.length) return null;
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.round((avg(recent) - avg(before)) * 10) / 10;
}

/** "Graded just now", "Graded yesterday", "Graded 3 days ago", "Graded last week" ... */
export function gradedLabel(at: Date, now: Date): string {
  const days = Math.floor((now.getTime() - at.getTime()) / DAY);
  if (days < 1) return at.getTime() > now.getTime() - 3_600_000 ? 'Graded just now' : 'Graded today';
  if (days === 1) return 'Graded yesterday';
  if (days < 7) return `Graded ${days} days ago`;
  if (days < 14) return 'Graded last week';
  return `Graded ${Math.floor(days / 7)} weeks ago`;
}

export function dueLabel(dueDate: string, now: Date): { label: string; tone: 'warn' | 'plain' } {
  const today = dayOf(now);
  const tomorrow = dayOf(new Date(now.getTime() + DAY));
  if (dueDate < today) return { label: 'Overdue', tone: 'warn' };
  if (dueDate === today) return { label: 'Due Today', tone: 'warn' };
  if (dueDate === tomorrow) return { label: 'Due Tomorrow', tone: 'warn' };
  return { label: `Due ${new Date(`${dueDate}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`, tone: 'plain' };
}

/** "Live in 25 mins", "Starts in 3 hrs", "Today", "Tomorrow" or the weekday. */
export function startsIn(start: Date, now: Date): string {
  const mins = Math.round((start.getTime() - now.getTime()) / 60_000);
  if (mins <= 0) return 'Live now';
  if (mins < 60) return `Live in ${mins} mins`;
  if (mins < 24 * 60 && dayOf(start) === dayOf(now)) { const h = Math.floor(mins / 60); const m = mins % 60; return m ? `In ${h} hr ${m} mins` : `In ${h} hr`; }
  return dayOf(start) === dayOf(new Date(now.getTime() + DAY)) ? 'Tomorrow' : start.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}
