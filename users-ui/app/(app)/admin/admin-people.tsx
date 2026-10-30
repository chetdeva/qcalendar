'use client';

import { useCallback, useEffect, useState } from 'react';
import { calendarUrl } from '@/lib/env';

interface Person {
  id: string; email: string; full_name: string | null; role: 'student' | 'teacher' | 'admin'; status: 'active' | 'disabled';
  classes: { students: number; upcoming: number; nextAt: string | null; teacher: { id: string; name: string | null; email: string } | null } | null;
  credits: { remaining: number; expiresAt: string | null } | null;
}
interface Basic { id: string; email: string; full_name: string | null }
const PAGE = 25;
/** The calendar app, filtered to this person (an admin sees every class there). */
const calendarLink = (p: Person) => `${calendarUrl}/?${p.role === 'teacher' ? `teacher=${p.id}` : `student=${encodeURIComponent(p.email)}${p.full_name ? `&name=${encodeURIComponent(p.full_name)}` : ''}`}`;
const nameOf = (p: { full_name: string | null; email: string }) => p.full_name || p.email;
async function assign(studentId: string, teacherId: string | null, note: string) {
  const res = await fetch(`/api/admin/students/${studentId}/teacher`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ teacherId, note }) });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}
const dash = <span className="muted">-</span>;
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null);

export function AdminPeople({ role }: { role: 'teacher' | 'student' }) {
  const [people, setPeople] = useState<Person[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [partial, setPartial] = useState(false);
  const [panel, setPanel] = useState<Person | null>(null); // the person whose assignment is being edited
  const teacher = role === 'teacher';
  const label = teacher ? 'Teachers' : 'Students';

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    const params = new URLSearchParams({ role, limit: String(PAGE + 1), offset: String(offset) });
    if (q.trim()) params.set('q', q.trim());
    if (status) params.set('status', status);
    const res = await fetch(`/api/admin/people?${params}`);
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data.error?.message ?? `Could not load ${label.toLowerCase()}.`);
    setError('');
    const rows: Person[] = data.users ?? [];
    setPartial(Boolean(data.partial));
    setMore(rows.length > PAGE);
    setPeople((prev) => (offset === 0 ? rows.slice(0, PAGE) : [...prev, ...rows.slice(0, PAGE)]));
  }, [role, q, status, label]);

  useEffect(() => { const t = setTimeout(() => void load(0), 250); return () => clearTimeout(t); }, [load]);

  async function toggle(p: Person) {
    setError(''); setNotice('');
    const action = p.status === 'active' ? 'disable' : 'enable';
    const res = await fetch(`/api/admin/users/${p.id}/${action}`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error?.message ?? `Could not ${action} the account.`);
    setPeople((prev) => prev.map((x) => (x.id === p.id ? { ...x, status: data.status } : x)));
    setNotice(`${p.email} ${action}d.`);
  }

  return (
    <section className="panel" aria-labelledby="people-h">
      <h1 id="people-h">{label}</h1>
      <p className="muted small">{teacher ? 'Everyone who teaches, with the students in their classes and what is coming up.' : 'Every student, with their credits and upcoming classes.'}</p>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-ok" role="status">{notice}</div>}
      {partial && <div className="alert alert-info" role="status">Some details (classes or credits) could not be loaded right now.</div>}
      <div className="row">
        <div className="field">
          <label htmlFor="people-search">Search by name or email</label>
          <input id="people-search" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="field" style={{ maxWidth: 160 }}>
          <label htmlFor="people-status">Status</label>
          <select id="people-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="active">Active</option>
            <option value="disabled">Inactive</option>
          </select>
        </div>
      </div>
      <div className="table-wrap">
        <table aria-label={label}>
          <thead>
            <tr>
              <th>Name</th><th>Email</th><th>Status</th>
              {teacher ? <th>Active students</th> : <><th>Assigned teacher</th><th>Available credits</th></>}
              <th>Upcoming classes</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td>{p.full_name ?? <span className="muted">No name</span>}</td>
                <td>{p.email}</td>
                <td>{p.status === 'disabled' ? <span className="badge badge-disabled">inactive</span> : 'Active'}</td>
                {teacher
                  ? <td>{p.classes ? p.classes.students : dash}</td>
                  : <><td>{p.classes ? (p.classes.teacher ? nameOf({ full_name: p.classes.teacher.name, email: p.classes.teacher.email }) : <span className="muted">Not assigned</span>) : dash}</td><td>{p.credits ? p.credits.remaining : dash}</td></>}
                <td>{p.classes ? <>{p.classes.upcoming}{when(p.classes.nextAt) && <span className="muted small"> (next {when(p.classes.nextAt)})</span>}</> : dash}</td>
                <td>
                  <div className="actions">
                    {calendarUrl && <a className="btn btn-sm" href={calendarLink(p)} aria-label={`View calendar of ${p.email}`}>View calendar</a>}
                    {p.status === 'active' && (
                      <button type="button" className="btn btn-sm" aria-label={`${teacher ? 'Assign students to' : p.classes?.teacher ? 'Change teacher for' : 'Assign a teacher to'} ${p.email}`} onClick={() => setPanel(p)}>
                        {teacher ? 'Assign students' : p.classes?.teacher ? 'Change teacher' : 'Assign teacher'}
                      </button>
                    )}
                    <button type="button" className="btn btn-sm" aria-label={`${p.status === 'active' ? 'Disable' : 'Enable'} ${p.email}`} onClick={() => toggle(p)}>
                      {p.status === 'active' ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && people.length === 0 && <tr><td colSpan={teacher ? 6 : 7} className="muted">No {label.toLowerCase()} match.</td></tr>}
          </tbody>
        </table>
      </div>
      {more && <div><button type="button" className="btn btn-sm" onClick={() => load(people.length)}>Load more</button></div>}
      {panel && (teacher
        ? <AssignStudents teacher={panel} onClose={() => setPanel(null)} onDone={(m) => { setNotice(m); void load(0); }} />
        : <AssignTeacher student={panel} onClose={() => setPanel(null)} onDone={(m, t) => {
            setNotice(m);
            setPeople((prev) => prev.map((x) => (x.id === panel.id && x.classes ? { ...x, classes: { ...x.classes, teacher: t } } : x)));
            setPanel(null);
          }} />)}
    </section>
  );
}

/** Pick (or remove) a student's teacher. */
function AssignTeacher({ student, onClose, onDone }: { student: Person; onClose: () => void; onDone: (notice: string, teacher: { id: string; name: string | null; email: string } | null) => void }) {
  const [teachers, setTeachers] = useState<Basic[]>([]);
  const [teacherId, setTeacherId] = useState(student.classes?.teacher?.id ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch('/api/admin/users?role=teacher&status=active&limit=100').then((r) => r.json()).then((d) => setTeachers(d.users ?? []), () => setError('Could not load teachers.'));
  }, []);

  async function save(next: string | null) {
    setError(''); setBusy(true);
    const r = await assign(student.id, next, note);
    setBusy(false);
    if (!r.ok) return setError(r.data.error?.message ?? 'Could not save the assignment.');
    const t = teachers.find((x) => x.id === next);
    onDone(!r.data.changed ? 'Nothing changed.' : t ? `${nameOf(student)} is now assigned to ${nameOf(t)}. They have been notified.` : `${nameOf(student)} no longer has an assigned teacher. They have been notified.`, t ? { id: t.id, name: t.full_name, email: t.email } : null);
  }

  return (
    <div className="panel" role="region" aria-label={`Assign a teacher to ${student.email}`}>
      <h2>Teacher for {nameOf(student)}</h2>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="row">
        <div className="field">
          <label htmlFor="assign-teacher">Teacher</label>
          <select id="assign-teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">Choose a teacher</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{nameOf(t)}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="assign-note">Note (optional, sent in the email)</label>
          <input id="assign-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="actions">
        <button type="button" className="btn btn-primary" disabled={!teacherId || busy} onClick={() => save(teacherId)}>Save</button>
        {student.classes?.teacher && <button type="button" className="btn btn-danger" disabled={busy} onClick={() => save(null)}>Remove assignment</button>}
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}

/** Find students and assign them to this teacher. */
function AssignStudents({ teacher, onClose, onDone }: { teacher: Person; onClose: () => void; onDone: (notice: string) => void }) {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Basic[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!q.trim()) return setFound([]);
    const t = setTimeout(() => void fetch(`/api/admin/users?role=student&status=active&limit=8&q=${encodeURIComponent(q.trim())}`).then((r) => r.json()).then((d) => setFound(d.users ?? []), () => setError('Search failed.')), 250);
    return () => clearTimeout(t);
  }, [q]);

  async function add(s: Basic) {
    setError('');
    const r = await assign(s.id, teacher.id, '');
    if (!r.ok) return setError(r.data.error?.message ?? 'Could not save the assignment.');
    onDone(r.data.changed ? `${nameOf(s)} is now assigned to ${nameOf(teacher)}. They have been notified.` : `${nameOf(s)} was already assigned to ${nameOf(teacher)}.`);
    setFound((prev) => prev.filter((x) => x.id !== s.id));
  }

  return (
    <div className="panel" role="region" aria-label={`Assign students to ${teacher.email}`}>
      <h2>Assign students to {nameOf(teacher)}</h2>
      <p className="muted small">A student has one teacher: assigning moves them from their current teacher, and both are notified.</p>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="field">
        <label htmlFor="assign-search">Search students by name or email</label>
        <input id="assign-search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {found.length > 0 && (
        <ul className="plain-list">
          {found.map((s) => (
            <li key={s.id} className="row" style={{ alignItems: 'center' }}>
              <span style={{ flex: 1 }}>{nameOf(s)} <span className="muted small">{s.email}</span></span>
              <button type="button" className="btn btn-sm btn-primary" aria-label={`Assign ${s.email}`} onClick={() => add(s)}>Assign</button>
            </li>
          ))}
        </ul>
      )}
      <div className="actions"><button type="button" className="btn" onClick={onClose}>Done</button></div>
    </div>
  );
}
