'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { passwordError } from '@/lib/validation';
import { Field } from '../_parts/field';
import { Submit } from '../_parts/submit';

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
    <form className="au-form" onSubmit={submit} noValidate>
      <Field id="password" label="New password" icon="lock" type="password" reveal autoComplete="new-password" hint="At least 8 characters." value={password} onChange={setPassword} />
      <Field id="confirm" label="Confirm password" icon="lock" type="password" reveal autoComplete="new-password" value={confirm} onChange={setConfirm} />
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <Submit busy={busy}>{busy ? 'Saving…' : 'Update password'}</Submit>
    </form>
  );
}
