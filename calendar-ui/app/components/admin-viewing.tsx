'use client';

import { useEffect, useState } from 'react';
import type { Person } from '@/lib/calendar';
import { api } from '../api-client';

/** What an admin is looking at on the calendar: everyone, one teacher's classes, or one student's. */
export type Viewing = { kind: 'all' } | { kind: 'teacher'; teacher: Person } | { kind: 'student'; student: { email: string; name: string | null } };

const label = (p: { name: string | null; email: string }) => p.name || p.email;

export function AdminViewing({ teachers, value, onChange }: { teachers: Person[]; value: Viewing; onChange: (v: Viewing) => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Person[]>([]);
  useEffect(() => {
    if (value.kind !== 'student' || !q.trim()) return setFound([]);
    const t = setTimeout(() => void api<{ students: Person[] }>(`/api/students?q=${encodeURIComponent(q.trim())}`).then((r) => setFound(r.students), () => setFound([])), 250);
    return () => clearTimeout(t);
  }, [q, value.kind]);

  return (
    <div className="viewing" role="group" aria-label="Whose calendar">
      <label htmlFor="viewing-kind">Viewing</label>
      <select id="viewing-kind" value={value.kind} onChange={(e) => { setQ(''); onChange(e.target.value === 'teacher' ? { kind: 'teacher', teacher: teachers[0]! } : e.target.value === 'student' ? { kind: 'student', student: { email: '', name: null } } : { kind: 'all' }); }}>
        <option value="all">Everyone</option>
        <option value="teacher" disabled={teachers.length === 0}>A teacher</option>
        <option value="student">A student</option>
      </select>
      {value.kind === 'teacher' && (
        <select aria-label="Teacher" value={value.teacher.id} onChange={(e) => onChange({ kind: 'teacher', teacher: teachers.find((t) => t.id === e.target.value)! })}>
          {teachers.map((t) => <option key={t.id} value={t.id}>{label(t)}</option>)}
        </select>
      )}
      {value.kind === 'student' && (
        value.student.email ? (
          <span className="viewing-chip">{label(value.student)} <button type="button" className="ghost alt" aria-label="Clear student" onClick={() => onChange({ kind: 'student', student: { email: '', name: null } })}>x</button></span>
        ) : (
          <span className="viewing-search">
            <input aria-label="Find a student" placeholder="Search students by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
            {found.length > 0 && (
              <ul className="viewing-results" role="listbox" aria-label="Matching students">
                {found.map((s) => <li key={s.id}><button type="button" role="option" aria-selected="false" onClick={() => { setQ(''); onChange({ kind: 'student', student: { email: s.email, name: s.name } }); }}>{label(s)} <span className="muted">{s.email}</span></button></li>)}
              </ul>
            )}
          </span>
        )
      )}
    </div>
  );
}
