'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { Person, Student } from '@/lib/calendar';
import { initials, isEmail, personName } from '@/lib/format';
import { Icon } from './ui-icon';

const MAX = 50;

/**
 * Pick the students for a class: search people who already have an account, or type an email to invite someone who
 * does not yet. Chosen students show as chips that can be removed.
 */
export function StudentPicker({ label, value, onChange, exclude = [], required }: {
  label: string; value: Student[]; onChange: (v: Student[]) => void; exclude?: string[]; required?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Person[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const taken = new Set([...value.map((s) => s.email.toLowerCase()), ...exclude.map((e) => e.toLowerCase())]);

  const search = useCallback(async (q: string): Promise<Person[]> => {
    const r = await fetch(`/api/students?q=${encodeURIComponent(q)}`);
    if (!r.ok) throw new Error('search failed');
    return ((await r.json()) as { students: Person[] }).students;
  }, []);

  useEffect(() => {
    if (!open) return;
    let stale = false;
    setSearching(true);
    const t = setTimeout(() => {
      search(query)
        .then((list) => { if (!stale) { setResults(list); setFailed(false); } })
        .catch(() => { if (!stale) { setResults([]); setFailed(true); } })
        .finally(() => { if (!stale) setSearching(false); });
    }, query ? 250 : 0);
    return () => { stale = true; clearTimeout(t); };
  }, [query, open, search]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const add = (s: Student) => {
    if (taken.has(s.email.toLowerCase()) || value.length >= MAX) return;
    onChange([...value, s]);
    setQuery('');
    setOpen(false);
  };
  const typed = query.trim();
  const visible = results.filter((r) => !taken.has(r.email.toLowerCase()));
  const canInvite = isEmail(typed) && !taken.has(typed.toLowerCase()) && !results.some((r) => r.email.toLowerCase() === typed.toLowerCase());

  async function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') return setOpen(false);
    if (e.key !== 'Enter') return;
    e.preventDefault(); // Enter must never submit the surrounding form by accident
    // The list on screen can lag behind what was just typed (it is debounced), so ask for what is in the box right now.
    const fresh = await search(query).catch(() => [] as Person[]);
    const first = fresh.find((r) => !taken.has(r.email.toLowerCase()));
    if (first) add({ email: first.email, name: first.name ?? undefined, userId: first.id });
    else if (canInvite) add({ email: typed.toLowerCase() });
  }

  return (
    <div className="field picker" ref={box}>
      <label htmlFor={id}>{label}{required ? ' *' : ''}</label>
      {value.length > 0 && (
        <ul className="chips" aria-label="Selected students">
          {value.map((s) => (
            <li key={s.email} className="chip-s">
              <span className="avatar xs" aria-hidden="true">{initials(personName(s))}</span>
              <span className="chip-name">{personName(s)}</span>
              {!s.userId && <span className="chip-note">invite</span>}
              <button type="button" aria-label={`Remove ${s.email}`} onClick={() => onChange(value.filter((x) => x.email !== s.email))}>
                <Icon name="close" color="#414754" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="with-icon">
        <span className="in-icon"><Icon name="mail" color="#727785" /></span>
        <input id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" autoComplete="off"
          value={query} placeholder="Search by name or email" disabled={value.length >= MAX}
          onFocus={() => setOpen(true)} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onKeyDown={onKey} />
      </div>
      {open && (
        <ul id={`${id}-list`} role="listbox" className="picker-list" aria-label="Matching students">
          {visible.map((r) => (
            <li key={r.id} role="option" aria-selected="false">
              <button type="button" onClick={() => add({ email: r.email, name: r.name ?? undefined, userId: r.id })}>
                <span className="avatar xs" aria-hidden="true">{initials(personName(r))}</span>
                <span className="p-text"><b>{personName(r)}</b><small>{r.email}</small></span>
              </button>
            </li>
          ))}
          {canInvite && (
            <li role="option" aria-selected="false">
              <button type="button" onClick={() => add({ email: typed.toLowerCase() })}>
                <span className="avatar xs" aria-hidden="true">@</span>
                <span className="p-text"><b>Invite {typed.toLowerCase()}</b><small>Not signed up yet. They get an email invitation.</small></span>
              </button>
            </li>
          )}
          {!searching && !failed && visible.length === 0 && !canInvite && (
            <li className="p-empty">{typed ? 'No student found. Type a full email address to invite someone new.' : 'No students yet.'}</li>
          )}
          {failed && <li className="p-empty">Could not search right now.</li>}
        </ul>
      )}
    </div>
  );
}
