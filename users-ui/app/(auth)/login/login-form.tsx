'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { emailError } from '@/lib/validation';
import Link from 'next/link';
import { Field } from '../_parts/field';
import { Submit } from '../_parts/submit';
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
      {notice && <div className="alert alert-info" role="status" style={{ marginBottom: 12 }}>{notice}</div>}
      <GoogleButton next={next} label="Continue with Google" />
      <div className="au-or">or</div>
      <form className="au-form" onSubmit={submit} noValidate>
        <Field id="email" label="Email" icon="mail" type="email" autoComplete="email" placeholder="alex@example.com" value={email} onChange={setEmail} />
        <Field id="password" label="Password" icon="lock" type="password" reveal autoComplete="current-password" value={password} onChange={setPassword} />
        <Link className="au-forgot" href="/forgot-password">Forgot password?</Link>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        {info && <div className="alert alert-ok" role="status">{info}</div>}
        {needsConfirm && <button type="button" className="au-secondary" onClick={resend}>Resend confirmation email</button>}
        <Submit busy={busy}>{busy ? 'Logging in…' : 'Log in'}</Submit>
      </form>
    </>
  );
}
