'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { emailError } from '@/lib/validation';

export function ForgotForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const bad = emailError(email);
    if (bad) return setError(bad);
    setBusy(true);
    const { error: err } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent('/reset-password')}`,
    });
    setBusy(false);
    // The same message whether or not the address has an account, so this form cannot be used to look people up.
    if (err && err.status !== 400) return setError('Could not send the email. Try again in a minute.');
    setSent(true);
  }

  if (sent) return <div className="alert alert-ok" role="status">If an account exists for {email.trim()}, a reset link is on its way.</div>;
  return (
    <form onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
    </form>
  );
}
