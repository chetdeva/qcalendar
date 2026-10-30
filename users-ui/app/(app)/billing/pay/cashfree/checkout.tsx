'use client';

import { useEffect, useState } from 'react';

declare global {
  interface Window { Cashfree?: (o: { mode: 'sandbox' | 'production' }) => { subscriptionsCheckout: (o: { subsSessionId: string; redirectTarget: '_self' }) => Promise<unknown> } }
}

export function CashfreeCheckout({ session, mode }: { session: string; mode: 'sandbox' | 'production' }) {
  const [error, setError] = useState('');
  useEffect(() => {
    const start = () => {
      if (!window.Cashfree) return setError('The payment page could not be loaded.');
      window.Cashfree({ mode }).subscriptionsCheckout({ subsSessionId: session, redirectTarget: '_self' }).catch(() => setError('The payment page could not be opened.'));
    };
    const script = document.createElement('script');
    script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
    script.onload = start;
    script.onerror = () => setError('The payment page could not be loaded. Check your connection and try again.');
    document.head.appendChild(script);
    return () => script.remove();
  }, [session, mode]);
  return error
    ? <div className="alert alert-error" role="alert">{error} <a href="/billing">Back to Plan &amp; billing</a></div>
    : <p className="bl-lead">Taking you to our secure payment partner. Please do not close this page.</p>;
}
