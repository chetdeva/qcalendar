'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { emailError, passwordError } from '@/lib/validation';
import { Field } from '../_parts/field';
import { Submit } from '../_parts/submit';
import { GoogleButton } from '../google-button';

export function SignupForm({ next }: { next: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [grade, setGrade] = useState('');
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState(false);
  const redirectTo = () => `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const bad = emailError(email) ?? passwordError(password, email) ?? (password !== confirm ? 'The two passwords do not match.' : null);
    if (bad) return setError(bad);
    if (!grade) return setError('Choose your grade.');
    setBusy(true);
    const { data, error: err } = await createClient().auth.signUp({
      email: email.trim(), password,
      options: { emailRedirectTo: redirectTo(), data: { grade: Number(grade) } },
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
      <div role="status" className="au-form">
        <div className="alert alert-ok"><b>Check your email.</b> We sent a confirmation link to {sentTo}. Open it to finish signing up.</div>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <button type="button" className="au-secondary" onClick={resend}>Resend the email</button>
      </div>
    );
  }

  return (
    <>
      <GoogleButton next={next} label="Sign up with Google" />
      <div className="au-or">or</div>
      <form className="au-form" onSubmit={submit} noValidate>
        <Field id="email" label="Email" icon="mail" type="email" autoComplete="email" placeholder="alex@example.com" value={email} onChange={setEmail} />
        <div className="au-field">
          <label htmlFor="grade">Student&apos;s grade</label>
          <div className="au-input">
            <select id="grade" value={grade} onChange={(e) => setGrade(e.target.value)}>
              <option value="">Choose a grade</option>
              {Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>Grade {i + 1}</option>)}
            </select>
          </div>
          <span className="au-hint">It sets your plan&apos;s price band. You can confirm it once each school year.</span>
        </div>
        <Field id="password" label="Password" icon="lock" type="password" reveal autoComplete="new-password" hint="At least 8 characters." value={password} onChange={setPassword} />
        <Field id="confirm" label="Confirm password" icon="lock" type="password" reveal autoComplete="new-password" value={confirm} onChange={setConfirm} />
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <Submit busy={busy}>{busy ? 'Creating account…' : 'Create account'}</Submit>
      </form>
    </>
  );
}
