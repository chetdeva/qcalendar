'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { emailError, nameError, passwordError } from '@/lib/validation';
import { GoogleButton } from '../google-button';

export function SignupForm({ next }: { next: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState(false);
  const redirectTo = () => `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const bad = nameError(name) ?? emailError(email) ?? passwordError(password, email);
    if (bad) return setError(bad);
    setBusy(true);
    const { data, error: err } = await createClient().auth.signUp({
      email: email.trim(), password,
      options: { data: { full_name: name.trim() }, emailRedirectTo: redirectTo() },
    });
    setBusy(false);
    if (err) return setError(err.code === 'weak_password' ? 'Choose a stronger password.' : err.message || 'Could not sign up. Try again.');
    if (data.session) return window.location.assign(next); // email confirmation turned off
    setSentTo(email.trim());
  }

  async function resend() {
    const { error: err } = await createClient().auth.resend({ type: 'signup', email: sentTo, options: { emailRedirectTo: redirectTo() } });
    setError(err ? err.message : '');
  }

  if (sentTo) {
    return (
      <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="alert alert-ok"><b>Check your email.</b> We sent a confirmation link to {sentTo}. Open it to finish signing up.</div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <button type="button" className="btn btn-sm" onClick={resend}>Resend the email</button>
      </div>
    );
  }

  return (
    <>
      <GoogleButton next={next} label="Sign up with Google" />
      <div className="divider">or</div>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="name">Full name</label>
          <input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <span className="hint">At least 8 characters.</span>
        </div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </>
  );
}
