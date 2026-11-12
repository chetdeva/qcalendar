'use client';

import { useEffect, useState } from 'react';

interface Options {
  key: string; subscription_id: string; name: string;
  handler: () => void;
  modal: { ondismiss: () => void };
}
declare global {
  interface Window { Razorpay?: new (o: Options) => { open: () => void; on: (e: 'payment.failed', cb: () => void) => void } }
}

/** Opens Razorpay's pop-up for the subscription, then returns to Plan & billing, which says the payment is being confirmed (classes arrive with the webhook). */
export function RazorpayCheckout({ subscription, keyId }: { subscription: string; keyId: string }) {
  const [error, setError] = useState('');
  useEffect(() => {
    const done = (state: 'success' | 'cancelled') => window.location.assign(`/billing?checkout=${state}`);
    const start = () => {
      if (!window.Razorpay) return setError('The payment page could not be loaded.');
      const rzp = new window.Razorpay({ key: keyId, subscription_id: subscription, name: 'Quanttoria', handler: () => done('success'), modal: { ondismiss: () => done('cancelled') } });
      rzp.on('payment.failed', () => setError('The payment did not go through. You can try again from Plan & billing.'));
      rzp.open();
    };
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = start;
    script.onerror = () => setError('The payment page could not be loaded. Check your connection and try again.');
    document.head.appendChild(script);
    return () => script.remove();
  }, [subscription, keyId]);
  return error
    ? <div className="alert alert-error" role="alert">{error} <a href="/billing">Back to Plan &amp; billing</a></div>
    : <p className="bl-lead">Taking you to our secure payment partner. Please do not close this page.</p>;
}
