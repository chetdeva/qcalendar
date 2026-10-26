'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';

export function GoogleButton({ next, label }: { next: string; label: string }) {
  const [error, setError] = useState('');
  async function go() {
    setError('');
    const { error: err } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (err) setError(err.message);
  }
  return (
    <>
      <button type="button" className="au-google" onClick={go}>
        <img src="/images/auth/google.svg" alt="" width={20} height={20} aria-hidden />
        {label}
      </button>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
    </>
  );
}
