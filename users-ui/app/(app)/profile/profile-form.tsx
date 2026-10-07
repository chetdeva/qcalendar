'use client';

import { useMemo, useState } from 'react';
import type { Me } from '@/lib/me';
import { emailError, nameError } from '@/lib/validation';

export function ProfileForm({ me, timezones }: { me: Me; timezones: string[] }) {
  const [name, setName] = useState(me.full_name ?? '');
  const [timezone, setTimezone] = useState(me.timezone ?? '');
  const [guardian, setGuardian] = useState(me.guardian_email ?? '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [extraZone, setExtraZone] = useState('');

  // Intl.supportedValuesOf omits "UTC" and some aliases (it says Asia/Calcutta, a browser may say Asia/Kolkata), so
  // always include the saved zone and the browser's zone, or the selector would silently show "Not set".
  const zones = useMemo(
    () => [...new Set([...timezones, 'UTC', me.timezone ?? '', extraZone].filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [timezones, me.timezone, extraZone],
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSaved(false);
    const bad = nameError(name) ?? (guardian.trim() ? emailError(guardian) : null);
    if (bad) return setError(guardian.trim() && emailError(guardian) ? 'Enter a valid guardian email, or leave it empty.' : bad);
    setBusy(true);
    const res = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ full_name: name.trim(), timezone: timezone || null, guardian_email: guardian.trim() || null }),
    }).catch(() => null);
    setBusy(false);
    if (!res) return setError('Could not reach the server. Try again.');
    if (!res.ok) return setError(((await res.json().catch(() => ({}))).error?.message as string) ?? 'Could not save your changes.');
    setSaved(true);
  }

  return (
    <form onSubmit={submit} className="panel" noValidate>
      <div className="field">
        <label htmlFor="email">Email</label>
        <input id="email" value={me.email} readOnly />
        <span className="hint">Your sign-in address. Role: {me.role}.</span>
      </div>
      <div className="field">
        <label htmlFor="name">Full name</label>
        <input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="tz">Time zone</label>
        <select id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          <option value="">Not set</option>
          {zones.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
        </select>
        <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start', marginTop: 6 }}
          onClick={() => { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; setExtraZone(tz); setTimezone(tz); }}>Use my browser&apos;s time zone</button>
      </div>
      <div className="field">
        <label htmlFor="guardian">Guardian email (optional)</label>
        <input id="guardian" type="email" value={guardian} onChange={(e) => setGuardian(e.target.value)} />
        <span className="hint">A parent or guardian we can contact. Only you and admins can see it.</span>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {saved && <div className="alert alert-ok" role="status">Saved.</div>}
      <div><button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
    </form>
  );
}
