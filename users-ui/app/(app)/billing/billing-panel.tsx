'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { dollars, fullDate, money, paymentLabel, paymentTone, type BillingMe, type PaymentStatus } from '@/lib/billing';
import { dashboardUrl } from '@/lib/env';

type Interval = 'month' | 'year';

async function post(path: string, body?: unknown): Promise<{ ok: boolean; json: { url?: string; error?: { message?: string } } }> {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { ok: res.ok, json: await res.json().catch(() => ({})) };
  } catch {
    return { ok: false, json: { error: { message: 'Could not reach the server. Try again.' } } };
  }
}

const Icon = ({ kind }: { kind: 'ok' | 'wait' | 'bad' }) => (
  <span className={`bl-icon bl-icon-${kind}`} aria-hidden>
    {kind === 'ok' && <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
    {kind === 'bad' && <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M7 7l10 10M17 7L7 17" /></svg>}
    {kind === 'wait' && <span className="bl-spin" />}
  </span>
);

/**
 * What the student sees on coming back from the payment window, decided by where the latest payment actually is.
 * While it is still going through, the page re-reads it every few seconds (the gateway's message can take a moment).
 */
function CheckoutResult({ data }: { data: BillingMe }) {
  const router = useRouter();
  const latest: PaymentStatus | undefined = data.payments[0]?.status;
  const pending = latest === undefined || latest === 'started' || latest === 'authenticated' || latest === 'activated';
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!pending || tries >= 20) return;
    const t = setTimeout(() => { setTries(tries + 1); router.refresh(); }, 3000);
    return () => clearTimeout(t);
  }, [pending, tries, router]);

  if (latest === 'succeeded') {
    const n = data.credits.remaining;
    return (
      <section className="bl-card bl-result bl-result-ok" role="status" aria-label="Payment result">
        <Icon kind="ok" />
        <h2>Payment successful</h2>
        <p>Thank you! Your plan is active and {n} {n === 1 ? 'class is' : 'classes are'} ready to book. Next, find a mentor and book your first class.</p>
        <div className="bl-actions bl-center">
          <a className="bl-btn" href={dashboardUrl || '/'}>Find a mentor</a>
        </div>
      </section>
    );
  }
  if (latest === 'failed') {
    return (
      <section className="bl-card bl-result bl-result-bad" role="alert" aria-label="Payment result">
        <Icon kind="bad" />
        <h2>Payment did not go through</h2>
        <p>Nothing was charged. You can try again with the same or another card.</p>
        <div className="bl-actions bl-center"><a className="bl-btn" href="/billing">Try again</a></div>
      </section>
    );
  }
  if (latest === 'cancelled') {
    return (
      <section className="bl-card bl-result" role="status" aria-label="Payment result">
        <Icon kind="bad" />
        <h2>Checkout was not completed</h2>
        <p>Nothing was charged. Choose a plan below whenever you are ready.</p>
      </section>
    );
  }
  return (
    <section className="bl-card bl-result" role="status" aria-label="Payment result">
      <Icon kind="wait" />
      <h2>Confirming your payment…</h2>
      <p>{tries >= 20 ? 'This is taking longer than usual. Your payment is safe. Refresh this page in a minute, or write to us if your classes do not appear.' : 'This takes a few seconds. Please keep this page open.'}</p>
    </section>
  );
}

export function BillingPanel({ data, checkout }: { data: BillingMe; checkout?: string }) {
  const router = useRouter();
  const [choice, setChoice] = useState<Interval>('year');
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
  const band = sub ? data.bands.find((b) => b.key === sub.planKey) : undefined;
  const price = band ? (sub?.interval === 'year' ? band.annualCents : band.monthlyCents) : undefined;

  return (
    <>
      {checkout === 'success' && <CheckoutResult data={data} />}
      {checkout === 'cancelled' && <div className="alert alert-info" role="status">Checkout was cancelled. Nothing was charged.</div>}
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {sub?.status === 'past_due' && <div className="alert alert-error" role="alert">Your last payment did not go through, so new classes cannot be booked. Update your payment method to continue.</div>}

      <section className="bl-card" aria-label="Classes left">
        <div className="bl-meter">
          <b>{credits.remaining}</b><span>{credits.remaining === 1 ? 'class' : 'classes'} left{credits.expiresAt ? `, use by ${fullDate(credits.expiresAt)}` : ''}</span>
        </div>
        {data.trialAvailable && <p className="bl-note">Your free trial class is ready to book. Request it from your dashboard.</p>}
        {!live && !data.trialAvailable && credits.remaining === 0 && <p className="bl-note">Choose a plan below to book more classes.</p>}
      </section>

      {live ? (
        <section className="bl-card" aria-label="Your plan">
          <h2>Your plan</h2>
          <p>{sub.interval === 'year' ? 'Annual' : 'Monthly'} plan, 15 classes every month. {sub.cancelAtPeriodEnd ? `Ends on ${fullDate(sub.periodEnd)}.` : `Renews on ${fullDate(sub.periodEnd)}.`}</p>
          <dl className="bl-facts" aria-label="Subscription">
            <div><dt>Plan</dt><dd>{band ? `${band.label}, ` : ''}{sub.interval === 'year' ? 'annual' : 'monthly'}</dd></div>
            {price !== undefined && <div><dt>Price</dt><dd>{dollars(price)} {sub.interval === 'year' ? 'a year' : 'a month'}</dd></div>}
            <div><dt>Status</dt><dd>{sub.status === 'past_due' ? 'Payment failed' : sub.cancelAtPeriodEnd ? 'Cancelling' : 'Active'}</dd></div>
            <div><dt>{sub.cancelAtPeriodEnd ? 'Ends on' : 'Next payment'}</dt><dd>{fullDate(sub.periodEnd)}</dd></div>
          </dl>
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
            <div className="bl-plans" role="radiogroup" aria-label="Billing period">
              <button type="button" role="radio" aria-checked={choice === 'month'} className="bl-card bl-plan" onClick={() => setChoice('month')}>
                <h3>Monthly</h3>
                <p className="bl-price"><b>{dollars(plan.monthlyCents)}</b> a month</p>
                <ul className="bl-list"><li>Up to {plan.creditsPerMonth} one-to-one classes every month</li><li>Classes do not carry over to the next month</li><li>Cancel any time</li></ul>
              </button>
              <button type="button" role="radio" aria-checked={choice === 'year'} className="bl-card bl-plan" onClick={() => setChoice('year')}>
                <h3>Annual <em>Save 20%</em></h3>
                <p className="bl-price"><b>{dollars(plan.annualCents)}</b> a year</p>
                <p className="bl-sub">{dollars(plan.annualCents / 12)} a month instead of {dollars(plan.monthlyCents)}</p>
                <ul className="bl-list"><li>Up to {plan.creditsPerMonth} one-to-one classes every month, all year</li><li>Pay once for twelve months</li><li>Cancel any time; paid months stay</li></ul>
              </button>
            </div>
            <div className="bl-actions bl-subscribe">
              <button type="button" className="bl-btn" disabled={busy} onClick={() => go('/api/billing/checkout', { interval: choice })}>
                {busy ? 'Opening checkout…' : choice === 'month' ? `Subscribe monthly, ${dollars(plan.monthlyCents)} a month` : `Subscribe annually, ${dollars(plan.annualCents)} a year`}
              </button>
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

      {(data.payments.length > 0 || live) && (
        <section className="bl-card" aria-label="Payment history">
          <h2>Payment history</h2>
          {data.payments.length === 0 ? (
            <p>No payments recorded yet. They appear here as they happen.</p>
          ) : (
            <div className="bl-history">
              <table className="bl-table">
                <thead><tr><th scope="col">Date</th><th scope="col">Plan</th><th scope="col">Amount</th><th scope="col">Status</th></tr></thead>
                <tbody>
                  {data.payments.map((p, i) => {
                    const b = data.bands.find((x) => x.key === p.planKey);
                    return (
                      <tr key={`${p.at}-${i}`}>
                        <th scope="row">{fullDate(p.at)}</th>
                        <td>{b ? `${b.label}, ` : ''}{p.interval === 'year' ? 'annual' : 'monthly'}</td>
                        <td>{p.amountCents !== null && p.currency ? money(p.amountCents, p.currency) : '—'}</td>
                        <td className={paymentTone(p.status)}>{paymentLabel[p.status]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
