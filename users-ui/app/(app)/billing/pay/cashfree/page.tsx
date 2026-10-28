import { CashfreeCheckout } from './checkout';

/** Cashfree's hosted checkout is opened with its JavaScript SDK and a session id, so the gateway adapter sends students here. */
export default async function Page({ searchParams }: { searchParams: Promise<{ session?: string; mode?: string }> }) {
  const { session, mode } = await searchParams;
  const ok = session && /^[\w-]{10,500}$/.test(session) && (mode === 'sandbox' || mode === 'production');
  return (
    <div className="bl">
      <div className="bl-in">
        <h1>Opening checkout…</h1>
        {ok ? <CashfreeCheckout session={session} mode={mode} /> : <div className="alert alert-error" role="alert">This checkout link is not valid. Go back to <a href="/billing">Plan &amp; billing</a> and try again.</div>}
      </div>
    </div>
  );
}
