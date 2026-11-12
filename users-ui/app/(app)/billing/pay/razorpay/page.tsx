import { RazorpayCheckout } from './checkout';

/** Razorpay's pop-up needs a page of ours to open from (the hosted subscription page cannot send people back), so the gateway adapter sends students here. */
export default async function Page({ searchParams }: { searchParams: Promise<{ subscription?: string; key?: string }> }) {
  const { subscription, key } = await searchParams;
  const ok = subscription && key && /^sub_\w{6,40}$/.test(subscription) && /^rzp_(test|live)_\w{6,40}$/.test(key);
  return (
    <div className="bl">
      <div className="bl-in">
        <h1>Opening checkout…</h1>
        {ok ? <RazorpayCheckout subscription={subscription} keyId={key} /> : <div className="alert alert-error" role="alert">This checkout link is not valid. Go back to <a href="/billing">Plan &amp; billing</a> and try again.</div>}
      </div>
    </div>
  );
}
