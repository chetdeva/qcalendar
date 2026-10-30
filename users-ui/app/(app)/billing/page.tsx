import { callBilling } from '@/lib/bff';
import type { BillingMe } from '@/lib/billing';
import { getMe } from '@/lib/me';
import { BillingPanel } from './billing-panel';
import './billing.css';

const lead = (d?: BillingMe) =>
  d?.trial === 'done' && !d.subscription ? 'Loved your class? Pick a plan to keep booking: up to 15 classes every month.' : 'Your first class is free. After that, a plan gives you up to 15 classes every month.';

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const [result, sp] = await Promise.all([getMe(), searchParams]);
  if ('error' in result) return null; // the layout already shows the error
  const { me } = result;
  if (me.role !== 'student') {
    return (
      <div className="bl"><div className="bl-in"><h1>Billing</h1><p className="bl-lead">Billing is for students. Teachers and admins have nothing to pay.</p></div></div>
    );
  }
  const { status, json } = await callBilling<BillingMe>('GET', '/v1/billing/me');
  return (
    <div className="bl">
      <div className="bl-in">
        <header>
          <h1>Plan &amp; billing</h1>
          <p className="bl-lead">{lead(status === 200 ? (json as BillingMe) : undefined)}</p>
        </header>
        {status !== 200 ? (
          <div className="alert alert-error" role="alert">{(json as { error?: { message?: string } }).error?.message ?? 'Billing is unavailable right now.'}</div>
        ) : (
          <BillingPanel data={json as BillingMe} checkout={sp.checkout} />
        )}
      </div>
    </div>
  );
}
