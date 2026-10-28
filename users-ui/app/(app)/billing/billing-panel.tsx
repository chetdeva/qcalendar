'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { dollars, fullDate, type BillingMe } from '@/lib/billing';

type Interval = 'month' | 'year';

async function post(path: string, body?: unknown): Promise<{ ok: boolean; json: { url?: string; error?: { message?: string } } }> {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { ok: res.ok, json: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, json: { error: { message: 'Could not reach the server. Try again.' } } };
  }
}

export function BillingPanel({ data, checkout }: { data: BillingMe; checkout?: string }) {
  const router = useRouter();
  const [paying, setPaying] = useState<Interval | null>(null);
  const [grade, setGrade] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(fn: () => Promise<void>) {
    setError('');
    setBusy(true);
    await fn();
    setBusy(false);
  }
  const go = (path: string, body?: unknown) => run(async () => {
    const r = await post(path, body);
    if (r.ok && r.json.url) return void window.location.assign(r.json.url);
    if (r.ok) return router.refresh();
    setError(r.json.error?.message ?? 'Something went wrong. Try again.');
  });

  const { plan, subscription: sub, credits } = data;
  const live = sub && sub.status !== 'canceled';

  return (
    <>
      {checkout === 'success' && <div className="alert alert-ok" role="status">Thank you! Your payment is being confirmed. Your classes appear here in a moment; refresh if you do not see them yet.</div>}
      {checkout === 'cancelled' && <div className="alert alert-info" role="status">Checkout was cancelled. Nothing was charged.</div>}
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {sub?.status === 'past_due' && <div className="alert alert-error" role="alert">Your last payment did not go through, so new classes cannot be booked. Update your payment method to continue.</div>}

      <section className="bl-card" aria-label="Classes left">
        <div className="bl-meter">
          <b>{credits.remaining}</b><span>{credits.remaining === 1 ? 'class' : 'classes'} left{credits.expiresAt ? `, use by ${fullDate(credits.expiresAt)}` : ''}</span>
        </div>
        {data.trialAvailable && <p className="bl-note">Your free first class is ready to book. Request it from your dashboard.</p>}
        {!live && !data.trialAvailable && credits.remaining === 0 && <p className="bl-note">Choose a plan below to book more classes.</p>}
      </section>

      {live ? (
        <section className="bl-card" aria-label="Your plan">
          <h2>Your plan</h2>
          <p>{sub.interval === 'year' ? 'Annual' : 'Monthly'} plan, 15 classes every month. {sub.cancelAtPeriodEnd ? `Ends on ${fullDate(sub.periodEnd)}.` : `Renews on ${fullDate(sub.periodEnd)}.`}</p>
          {sub.pendingPlan && <p className="bl-note">Your grade moved up a level, so your price changes to {dollars(sub.pendingPlan.cents)} {sub.interval === 'year' ? 'a year' : 'a month'} from {fullDate(sub.pendingPlan.from)}.</p>}
          <div className="bl-actions">
            <button type="button" className="bl-btn" disabled={busy} onClick={() => go('/api/billing/portal')}>Manage payment method</button>
            {!sub.cancelAtPeriodEnd && (
              <button type="button" className="bl-link" disabled={busy} onClick={() => { if (confirm('Cancel at the end of this period? You keep your classes until then.')) void go('/api/billing/cancel'); }}>Cancel plan</button>
            )}
          </div>
        </section>
      ) : data.grade === null ? (
        <section className="bl-card" aria-label="Your grade">
          <h2>Which grade are you in?</h2>
          <p>Your grade sets your price. You can confirm it once each school year.</p>
          <div className="bl-actions">
            <select aria-label="Grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">Choose a grade</option>
              {Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>Grade {i + 1}</option>)}
            </select>
            <button type="button" className="bl-btn" disabled={busy || !grade} onClick={() => run(async () => {
              const r = await post('/api/me/grade', { grade: Number(grade) });
              r.ok ? router.refresh() : setError(r.json.error?.message ?? 'Could not save your grade.');
            })}>Save grade</button>
          </div>
        </section>
      ) : plan && (
        <>
          <section aria-label="Choose a plan">
            <h2 className="bl-h">Grade {data.grade} plan</h2>
            <div className="bl-plans">
              <article className="bl-card bl-plan" aria-label="Monthly plan">
                <h3>Monthly</h3>
                <p className="bl-price"><b>{dollars(plan.monthlyCents)}</b> a month</p>
                <ul className="bl-list"><li>Up to {plan.creditsPerMonth} one-to-one classes every month</li><li>Classes do not carry over to the next month</li><li>Cancel any time</li></ul>
                <button type="button" className="bl-btn" disabled={busy} onClick={() => { setPaying('month'); void go('/api/billing/checkout', { interval: 'month' }); }}>{busy && paying === 'month' ? 'Opening checkout…' : 'Subscribe monthly'}</button>
              </article>
              <article className="bl-card bl-plan bl-best" aria-label="Annual plan">
                <h3>Annual <em>Save 20%</em></h3>
                <p className="bl-price"><b>{dollars(plan.annualCents)}</b> a year</p>
                <p className="bl-sub">{dollars(plan.annualCents / 12)} a month instead of {dollars(plan.monthlyCents)}</p>
                <ul className="bl-list"><li>Up to {plan.creditsPerMonth} one-to-one classes every month, all year</li><li>Pay once for twelve months</li><li>Cancel any time; paid months stay</li></ul>
                <button type="button" className="bl-btn" disabled={busy} onClick={() => { setPaying('year'); void go('/api/billing/checkout', { interval: 'year' }); }}>{busy && paying === 'year' ? 'Opening checkout…' : 'Subscribe annually'}</button>
              </article>
            </div>
          </section>
          <section className="bl-card" aria-label="Prices by grade">
            <h2>Prices by grade</h2>
            <table className="bl-table">
              <thead><tr><th scope="col">Grade</th><th scope="col">Monthly</th><th scope="col">Annual</th></tr></thead>
              <tbody>
                {data.bands.map((b) => (
                  <tr key={b.key} className={b.yours ? 'bl-yours' : undefined}>
                    <th scope="row">{b.label}{b.yours && <em>Your grade</em>}</th>
                    <td>{dollars(b.monthlyCents)} a month</td>
                    <td>{dollars(b.annualCents)} a year</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="bl-note">Your price follows your grade each school year. If you move up a level, the new price starts at your next renewal.</p>
          </section>
        </>
      )}
    </>
  );
}
