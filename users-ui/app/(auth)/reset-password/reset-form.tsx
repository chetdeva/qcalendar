'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { passwordError } from '@/lib/validation';

export function ResetForm({ email }: { email: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const bad = passwordError(password, email) ?? (password !== confirm ? 'The two passwords do not match.' : null);
    if (bad) return setError(bad);
    setBusy(true);
    const { error: err } = await createClient().auth.updateUser({ password });
    if (err) { setBusy(false); return setError(err.code === 'same_password' ? 'Choose a password you have not used before.' : err.message); }
    window.location.assign('/profile?updated=password');
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="password">New password</label>
        <input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        <span className="hint">At least 8 characters.</span>
      </div>
      <div className="field">
        <label htmlFor="confirm">Confirm password</label>
        <input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
    </form>
  );
}
