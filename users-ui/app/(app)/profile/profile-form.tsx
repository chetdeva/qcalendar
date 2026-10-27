'use client';

import { useMemo, useState } from 'react';
import type { Me } from '@/lib/me';
import { emailError, nameError } from '@/lib/validation';
import { BadgeIcon, CheckCircleIcon, ClockIcon, InfoIcon, LockIcon, MailIcon, SaveIcon, TargetIcon, UserIcon, UsersIcon } from './_parts/icons';

/** The few zones our families and teachers use. A saved zone or the browser's zone that is not listed is added to the list. */
const ZONES: [string, string][] = [
  ['America/New_York', 'Eastern Time'], ['America/Chicago', 'Central Time'], ['America/Denver', 'Mountain Time'], ['America/Phoenix', 'Arizona'],
  ['America/Los_Angeles', 'Pacific Time'], ['America/Anchorage', 'Alaska'], ['Pacific/Honolulu', 'Hawaii'], ['Europe/London', 'London'], ['Asia/Kolkata', 'India'], ['UTC', 'UTC'],
];

export function ProfileForm({ me }: { me: Me }) {
  const [name, setName] = useState(me.full_name ?? '');
  const [timezone, setTimezone] = useState(me.timezone ?? '');
  const [guardian, setGuardian] = useState(me.guardian_email ?? '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [extraZone, setExtraZone] = useState('');
  const [picked, setPicked] = useState(''); // the zone the browser button chose, shown under the selector
  const student = me.role === 'student';

  const zones = useMemo(
    () => [...ZONES, ...[me.timezone, extraZone].filter((z): z is string => !!z && !ZONES.some(([id]) => id === z)).map((z): [string, string] => [z, z])]
      .filter(([id], i, all) => all.findIndex(([x]) => x === id) === i),
    [me.timezone, extraZone],
  );

  function discard() {
    setName(me.full_name ?? ''); setTimezone(me.timezone ?? ''); setGuardian(me.guardian_email ?? '');
    setError(''); setSaved(false); setPicked('');
  }

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
    <form onSubmit={submit} className="pf-card pf-form" noValidate>
      <h2><span><BadgeIcon size={22} /> Core Information</span></h2>
      <div className="pf-field">
        <label htmlFor="email">Email</label>
        <div className="pf-input pf-locked"><MailIcon /><input id="email" value={me.email} readOnly /><span className="pf-lock" title="Sign-in address, locked"><LockIcon size={18} /></span></div>
        <p className="pf-hint"><InfoIcon size={16} /> Your sign-in address. Role: {me.role}. {student ? 'Contact your guardian or school to request updates.' : 'Contact Quanttoria support to modify official credentials.'}</p>
      </div>
      <div className="pf-field">
        <label htmlFor="name">Full name</label>
        <div className="pf-input"><UserIcon /><input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <p className="pf-hint">{student ? 'This name appears on your classroom leaderboard, assignments, and certificates.' : 'This name appears on student dashboards, live classroom rooms, and weekly summary reports.'}</p>
      </div>
      <div className="pf-field">
        <label htmlFor="tz">Time zone</label>
        <div className="pf-input pf-select"><ClockIcon />
          <select id="tz" value={timezone} onChange={(e) => { setTimezone(e.target.value); setPicked(''); }}>
            <option value="">Not set</option>
            {zones.map(([id, name]) => <option key={id} value={id}>{id === name ? id : `${name} (${id})`}</option>)}
          </select>
        </div>
        <div className="pf-tz">
          <button type="button" className="pf-chip" onClick={() => { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; setExtraZone(tz); setTimezone(tz); setPicked(tz); }}><TargetIcon size={18} /> Use my browser&apos;s time zone</button>
          {timezone && <span className="pf-hint"><CheckCircleIcon size={14} /> {picked ? `Browser applied: ${picked}` : `Active zone: ${timezone}`}</span>}
        </div>
      </div>
      <div className="pf-field">
        <label htmlFor="guardian">Guardian email (optional)</label>
        <div className="pf-input"><UsersIcon /><input id="guardian" type="email" placeholder="e.g. parent@example.com" value={guardian} onChange={(e) => setGuardian(e.target.value)} /></div>
        <p className="pf-hint">{student ? 'A parent or guardian we can contact. Only you and admins can see it.' : 'A parent or guardian we can contact if needed. Only you and Quanttoria verified admins can view this record.'}</p>
      </div>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {saved && <div className="alert alert-ok" role="status">Saved.</div>}
      <div className="pf-actions">
        <button type="button" className="pf-quiet" onClick={discard} disabled={busy}>Discard changes</button>
        <button type="submit" className="pf-save" disabled={busy}><SaveIcon /> {busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </form>
  );
}
