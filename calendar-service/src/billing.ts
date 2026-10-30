import { HttpError } from './errors.ts';

export type Refusal = 'subscription_required' | 'payment_required' | 'no_credits';
export type Reservation = { ok: true } | { ok: false; code: Refusal };

/** Pays for / gives back one student's seat in one lesson. billing-service decides; this service only asks. */
export interface BillingClient {
  /** Idempotent: asking again for the same ref does not spend twice. */
  reserve(userId: string, ref: string, endsAt?: string): Promise<Reservation>;
  /** Idempotent. */
  release(userId: string, ref: string): Promise<void>;
  /** One credit earned by a teacher for a student's seat in a class they taught. Idempotent. */
  earn(teacherId: string, ref: string, earnedAt: string): Promise<void>;
}

export function createBillingClient(opts: { url: string; key: string }): BillingClient {
  const call = async (path: string, body: unknown) => {
    try {
      return await fetch(`${opts.url.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${opts.key}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new HttpError(503, 'billing_unavailable', 'Billing is unavailable right now. Please try again in a moment.');
    }
  };
  return {
    async reserve(userId, ref, endsAt) {
      const r = await call('/v1/service/credits/reserve', { userId, ref, endsAt });
      if (r.ok) return { ok: true };
      if (r.status === 402) return { ok: false, code: ((await r.json().catch(() => ({}))) as { error?: { code?: Refusal } }).error?.code ?? 'no_credits' };
      throw new HttpError(503, 'billing_unavailable', 'Billing is unavailable right now. Please try again in a moment.');
    },
    async release(userId, ref) {
      const r = await call('/v1/service/credits/release', { userId, ref });
      if (!r.ok) throw new Error(`billing answered ${r.status}`);
    },
    async earn(teacherId, ref, earnedAt) {
      const r = await call('/v1/service/earnings', { teacherId, ref, earnedAt });
      if (!r.ok) throw new Error(`billing answered ${r.status}`);
    },
  };
}

/** For tests and for running without billing: every lesson is free and nothing is recorded. */
export const noBilling: BillingClient = { reserve: async () => ({ ok: true }), release: async () => {}, earn: async () => {} };
