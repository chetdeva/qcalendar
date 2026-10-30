'use client';

import { useEffect, useRef, useState } from 'react';
import type { Person } from '@/lib/calendar';
import { api } from '../api-client';

/** What an admin is looking at on the calendar: everyone, one teacher's classes, or one student's. */
export type Viewing = { kind: 'all' } | { kind: 'teacher'; teacher: Person } | { kind: 'student'; students: { email: string; name: string | null }[] };

const label = (p: { name: string | null; email: string }) => p.name || p.email;
const noStudents: Viewing = { kind: 'student', students: [] };

/** A Filters button that opens a dialog: pick everyone, a teacher or a student, then Apply. Nothing changes on the calendar until then. */
export function AdminViewing({ teachers, value, onApply }: { teachers: Person[]; value: Viewing; onApply: (v: Viewing) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<Viewing>(value);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Person[]>([]);
  useEffect(() => setDraft(value), [value]); // a link from the admin portal sets the filter from outside
  useEffect(() => {
    if (draft.kind !== 'student' || !q.trim()) return setFound([]);
    let stale = false; // an answer to an older search must not show up under a newer one
    const t = setTimeout(() => void api<{ students: Person[] }>(`/api/students?q=${encodeURIComponent(q.trim())}`).then((r) => { if (!stale) setFound(r.students); }, () => { if (!stale) setFound([]); }), 250);
    return () => { stale = true; clearTimeout(t); };
  }, [q, draft.kind]);

  const chosen = draft.kind === 'student' ? draft.students : [];
  const isChosen = (email: string) => chosen.some((x) => x.email.toLowerCase() === email.toLowerCase());
  // A student can be added once: the suggestions leave out the ones already chosen, and adding checks again (a slow search can answer late).
  const add = (s: Person) => {
    setQ(''); setFound([]);
    setDraft((d) => (d.kind === 'student' && !d.students.some((x) => x.email.toLowerCase() === s.email.toLowerCase()) ? { kind: 'student', students: [...d.students, { email: s.email, name: s.name }] } : d));
  };
  const ready = draft.kind !== 'student' || draft.students.length > 0;
  const open = () => { setDraft(value); setQ(''); dialog.current?.showModal(); };
  const close = () => dialog.current?.close();
  const active = value.kind === 'all' ? '' : value.kind === 'teacher' ? label(value.teacher) : value.students.length === 1 ? label(value.students[0]!) : `${value.students.length} students`;

  return (
    <>
      <button type="button" className="filter-btn" onClick={open} aria-haspopup="dialog">
        Filters{active && <span className="filter-on">{active}</span>}
      </button>
      <dialog ref={dialog} className="filter-dialog" aria-label="Calendar filters" onClick={(e) => { if (e.target === dialog.current) close(); }}>
        <form method="dialog" onSubmit={(e) => { e.preventDefault(); if (!ready) return; onApply(draft); close(); }}>
          <h2>Filter the calendar</h2>
          <div className="field">
            <label htmlFor="viewing-kind">Show</label>
            <select id="viewing-kind" value={draft.kind} onChange={(e) => { setQ(''); setDraft(e.target.value === 'teacher' ? { kind: 'teacher', teacher: teachers[0]! } : e.target.value === 'student' ? noStudents : { kind: 'all' }); }}>
              <option value="all">Everyone's classes</option>
              <option value="teacher" disabled={teachers.length === 0}>A teacher's classes</option>
              <option value="student">A student's classes</option>
            </select>
          </div>
          {draft.kind === 'teacher' && (
            <div className="field">
              <label htmlFor="viewing-teacher">Teacher</label>
              <select id="viewing-teacher" value={draft.teacher.id} onChange={(e) => setDraft({ kind: 'teacher', teacher: teachers.find((t) => t.id === e.target.value)! })}>
                {teachers.map((t) => <option key={t.id} value={t.id}>{label(t)}</option>)}
              </select>
            </div>
          )}
          {draft.kind === 'student' && (
            <div className="field">
              <label htmlFor="viewing-student">Students</label>
              <span className="viewing-search">
                <input id="viewing-student" aria-label="Find a student" placeholder={draft.students.length ? 'Add another student by name or email' : 'Search students by name or email'} value={q} onChange={(e) => setQ(e.target.value)} />
                {found.some((s) => !isChosen(s.email)) && (
                  <ul className="viewing-results" role="listbox" aria-label="Matching students">
                    {found.filter((s) => !isChosen(s.email)).map((s) => <li key={s.id}><button type="button" role="option" aria-selected="false" onClick={() => add(s)}>{label(s)} <span className="muted">{s.email}</span></button></li>)}
                  </ul>
                )}
              </span>
              {draft.students.map((st) => (
                <span className="viewing-chip" key={st.email}>
                  <span className="viewing-who"><b>{st.name || st.email}</b>{st.name && <span className="muted">{st.email}</span>}</span>
                  <button type="button" className="chip-x" aria-label={`Remove ${st.email}`} onClick={() => setDraft({ kind: 'student', students: draft.students.filter((x) => x.email !== st.email) })}>&times;</button>
                </span>
              ))}
            </div>
          )}
          <div className="filter-actions">
            <button type="button" className="ghost alt" onClick={close}>Cancel</button>
            <button type="submit" className="quick-add" disabled={!ready}>Apply filters</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
