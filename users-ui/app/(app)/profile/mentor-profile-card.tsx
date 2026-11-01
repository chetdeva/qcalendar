'use client';

import { useEffect, useState } from 'react';
import { CheckCircleIcon, SaveIcon, UserIcon } from './_parts/icons';

const LEVELS = ['elementary', 'middle', 'high', 'olympiad'] as const;
type Level = (typeof LEVELS)[number];
const LEVEL_LABEL: Record<Level, string> = { elementary: 'Elementary (1–5)', middle: 'Middle (6–8)', high: 'High (9–10)', olympiad: 'Olympiad / Competitions' };

interface Profile { headline: string; specialties: string[]; levels: Level[]; quote: string; published: boolean }

const messageOf = async (res: Response) => ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? 'Something went wrong. Please try again.';

/** A teacher's mentor card: what students see when they look for a mentor. Nothing is shown to students until it is published. */
export function MentorProfileCard() {
  const [loaded, setLoaded] = useState(false);
  const [headline, setHeadline] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [levels, setLevels] = useState<Level[]>([]);
  const [quote, setQuote] = useState('');
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    fetch('/api/mentor-profile').then(async (res) => {
      if (!res.ok) return setError(await messageOf(res));
      const p = (await res.json()) as Profile;
      setHeadline(p.headline); setSpecialties(p.specialties.join(', ')); setLevels(p.levels); setQuote(p.quote); setPublished(p.published);
      setLoaded(true);
    }, () => setError('The dashboard service is unreachable.'));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setSaved('');
    try {
      const res = await fetch('/api/mentor-profile', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ headline: headline.trim(), specialties: specialties.split(',').map((x) => x.trim()).filter(Boolean), levels, quote: quote.trim(), published }),
      });
      if (!res.ok) return setError(await messageOf(res));
      setSaved(published ? 'Profile saved. Students can now find you under Mentors.' : 'Profile saved. It is hidden from students until you publish it.');
    } catch {
      setError('The dashboard service is unreachable.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="mentor-profile" className="pf-card pf-form" onSubmit={save} aria-labelledby="mentor-h" noValidate>
      <h2 id="mentor-h"><span><UserIcon size={22} /> My Mentor Profile</span></h2>
      <p>This is what students see when they look for a mentor.</p>
      <div className="pf-field">
        <label htmlFor="mp-headline">Headline</label>
        <div className="pf-input pf-plain"><input id="mp-headline" maxLength={120} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="e.g. Lead STEM Specialist • M.Ed." disabled={!loaded} /></div>
      </div>
      <div className="pf-field">
        <label htmlFor="mp-spec">Specialties (separated by commas)</label>
        <div className="pf-input pf-plain"><input id="mp-spec" value={specialties} onChange={(e) => setSpecialties(e.target.value)} placeholder="Geometry, Proofs & Logic" disabled={!loaded} /></div>
      </div>
      <fieldset className="pf-field pf-levels" disabled={!loaded}>
        <legend>Grade levels you teach</legend>
        <div className="pf-tz">
          {LEVELS.map((l) => (
            <button key={l} type="button" className="pf-chip" aria-pressed={levels.includes(l)} onClick={() => setLevels((c) => (c.includes(l) ? c.filter((x) => x !== l) : [...c, l]))}>{LEVEL_LABEL[l]}</button>
          ))}
        </div>
      </fieldset>
      <div className="pf-field">
        <label htmlFor="mp-quote">A line in your own words</label>
        <div className="pf-input pf-plain"><textarea id="mp-quote" rows={3} maxLength={400} value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="What do you want students to know about how you teach?" disabled={!loaded} /></div>
      </div>
      <label className="pf-check"><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} disabled={!loaded} /> Show my profile to students</label>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {saved && <div className="alert alert-ok" role="status"><CheckCircleIcon size={16} /> {saved}</div>}
      <div className="pf-actions">
        <button type="submit" className="pf-save" disabled={busy || !loaded}><SaveIcon /> {busy ? 'Saving…' : 'Save profile'}</button>
      </div>
    </form>
  );
}
