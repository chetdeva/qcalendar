'use client';

import { useCallback, useEffect, useState } from 'react';

interface Person {
  id: string; email: string; full_name: string | null; role: 'student' | 'teacher' | 'admin'; status: 'active' | 'disabled';
  classes: { students: number; upcoming: number; nextAt: string | null } | null;
  credits: { remaining: number; expiresAt: string | null } | null;
}
const PAGE = 25;
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
              {teacher ? <th>Active students</th> : <th>Available credits</th>}
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
                <td>{teacher ? (p.classes ? p.classes.students : dash) : (p.credits ? p.credits.remaining : dash)}</td>
                <td>{p.classes ? <>{p.classes.upcoming}{when(p.classes.nextAt) && <span className="muted small"> (next {when(p.classes.nextAt)})</span>}</> : dash}</td>
                <td>
                  <div className="actions">
                    <button type="button" className="btn btn-sm" aria-label={`${p.status === 'active' ? 'Disable' : 'Enable'} ${p.email}`} onClick={() => toggle(p)}>
                      {p.status === 'active' ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && people.length === 0 && <tr><td colSpan={6} className="muted">No {label.toLowerCase()} match.</td></tr>}
          </tbody>
        </table>
      </div>
      {more && <div><button type="button" className="btn btn-sm" onClick={() => load(people.length)}>Load more</button></div>}
    </section>
  );
}
