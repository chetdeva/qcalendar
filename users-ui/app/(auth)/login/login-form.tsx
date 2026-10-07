'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { emailError } from '@/lib/validation';
import { GoogleButton } from '../google-button';

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setInfo(''); setNeedsConfirm(false);
    const bad = emailError(email);
    if (bad) return setError(bad);
    if (!password) return setError('Enter your password.');
    setBusy(true);
    const { error: err } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
    if (!err) return window.location.assign(next); // full navigation: cookies are set, and next may be another app
    setBusy(false);
    if (err.code === 'email_not_confirmed') {
      setNeedsConfirm(true);
      setError('Confirm your email first. We sent you a link when you signed up.');
    } else if (err.code === 'invalid_credentials') {
      setError('Incorrect email or password.');
    } else {
      setError(err.message || 'Could not log in. Try again.');
    }
  }

  async function resend() {
    const { error: err } = await createClient().auth.resend({
      type: 'signup', email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (err) setError(err.message); else { setError(''); setNeedsConfirm(false); setInfo('Confirmation email sent. Check your inbox.'); }
  }

  return (
    <>
      {notice && <div className="alert alert-info" role="status">{notice}</div>}
      <GoogleButton next={next} label="Continue with Google" />
      <div className="divider">or</div>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {info && <div className="alert alert-ok" role="status">{info}</div>}
        {needsConfirm && <button type="button" className="btn btn-sm" onClick={resend}>Resend confirmation email</button>}
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
    </>
  );
}
