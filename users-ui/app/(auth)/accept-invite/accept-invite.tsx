'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { nameError, passwordError } from '@/lib/validation';
import { Field } from '../_parts/field';
import { Submit } from '../_parts/submit';

type State = { kind: 'loading' } | { kind: 'invalid'; reason: string } | { kind: 'ready'; email: string; role: string; name: string };

/**
 * Supabase's default invitation email sends the browser here with the session in the URL hash
 * (#access_token=...&refresh_token=...). The hash never reaches the server, so this must run in the browser:
 * it turns the hash into a session, strips it from the address bar, then asks the invitee to choose a password.
 */
export function AcceptInvite() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // React runs effects twice in development. Process the invitation exactly once: a second, slower run would
    // otherwise finish later and reset whatever the invitee has already typed.
    if (started.current) return;
    started.current = true;
    (async () => {
      const supabase = createClient();
      const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
      if (hash.get('error')) {
        return setState({ kind: 'invalid', reason: hash.get('error_code') === 'otp_expired' ? 'This invitation link has expired.' : 'This invitation link is not valid.' });
      }
      const access_token = hash.get('access_token');
      const refresh_token = hash.get('refresh_token');
      if (access_token && refresh_token) {
        const { error: err } = await supabase.auth.setSession({ access_token, refresh_token });
        history.replaceState(null, '', location.pathname);
        if (err) return setState({ kind: 'invalid', reason: 'This invitation link is not valid.' });
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setState({ kind: 'invalid', reason: 'This invitation link is not valid or has already been used.' });
      const me = await fetch('/api/me').then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const full = me?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? '';
      setName((typed) => typed || full); // never overwrite what the invitee has already typed
      setState({ kind: 'ready', email: user.email ?? '', role: me?.role ?? 'student', name: full });
    })();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind !== 'ready') return;
    setError('');
    const bad = nameError(name) ?? passwordError(password, state.email) ?? (password !== confirm ? 'The two passwords do not match.' : null);
    if (bad) return setError(bad);
    setBusy(true);
    const { error: err } = await createClient().auth.updateUser({ password, data: { full_name: name.trim() } });
    if (err) { setBusy(false); return setError(err.message); }
    await fetch('/api/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ full_name: name.trim() }) });
    window.location.assign('/profile?welcome=1');
  }

  if (state.kind === 'loading') return <p className="au-switch" role="status">Checking your invitation…</p>;
  if (state.kind === 'invalid') {
    return (
      <>
        <div className="au-head"><h1>Invitation problem</h1></div>
        <div className="alert alert-error" role="alert">{state.reason}</div>
        <p className="au-switch">Ask an admin to send you a new invitation, or <Link href="/login">log in</Link> if you already have an account.</p>
      </>
    );
  }
  return (
    <>
      <div className="au-head">
        <h1>Welcome aboard <span aria-hidden>🎉</span></h1>
        <p>You have been invited as a <b>{state.role}</b>. Choose a password to finish setting up {state.email}.</p>
      </div>
      <form className="au-form" onSubmit={submit} noValidate>
        <Field id="name" label="Full name" icon="user" autoComplete="name" placeholder="e.g., Alex Rivera" value={name} onChange={setName} />
        <Field id="password" label="Password" icon="lock" type="password" reveal autoComplete="new-password" hint="At least 8 characters." value={password} onChange={setPassword} />
        <Field id="confirm" label="Confirm password" icon="lock" type="password" reveal autoComplete="new-password" value={confirm} onChange={setConfirm} />
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <Submit busy={busy}>{busy ? 'Saving…' : 'Set password and continue'}</Submit>
      </form>
    </>
  );
}
