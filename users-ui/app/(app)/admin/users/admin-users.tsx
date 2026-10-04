'use client';

import { useCallback, useEffect, useState } from 'react';
import { emailError } from '@/lib/validation';

interface User { id: string; email: string; full_name: string | null; role: 'student' | 'teacher' | 'admin'; status: 'active' | 'disabled'; guardian_email: string | null }
interface Invitation { id: string; email: string; role: 'teacher' | 'admin'; status: string; expires_at: string }
const PAGE = 25;

async function call<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; data: T & { error?: { message: string } } }> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json' } });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
}

export function AdminUsers({ meId }: { meId: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'teacher' | 'admin'>('teacher');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (offset: number) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE + 1), offset: String(offset) });
    if (q.trim()) params.set('q', q.trim());
    if (role) params.set('role', role);
    const r = await call<{ users: User[] }>(`/api/admin/users?${params}`);
    setLoading(false);
    if (!r.ok) return setError(r.data.error?.message ?? 'Could not load users.');
    setError('');
    const rows = r.data.users ?? [];
    setMore(rows.length > PAGE);
    setUsers((prev) => (offset === 0 ? rows.slice(0, PAGE) : [...prev, ...rows.slice(0, PAGE)]));
  }, [q, role]);

  const loadInvitations = useCallback(async () => {
    const r = await call<{ invitations: Invitation[] }>('/api/admin/invitations?status=pending');
    if (r.ok) setInvitations(r.data.invitations ?? []);
  }, []);

  useEffect(() => { const t = setTimeout(() => void load(0), 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { void loadInvitations(); }, [loadInvitations]);

  const replace = (u: User) => setUsers((prev) => prev.map((x) => (x.id === u.id ? u : x)));

  async function changeRole(u: User, next: string) {
    if (next === 'admin' && !confirm(`Make ${u.email} an admin? Admins can manage every account.`)) return;
    setError(''); setNotice('');
    const r = await call<User>(`/api/admin/users/${u.id}/role`, { method: 'PATCH', body: JSON.stringify({ role: next }) });
    if (!r.ok) return setError(r.data.error?.message ?? 'Could not change the role.');
    replace(r.data); setNotice(`${u.email} is now ${next === 'admin' ? 'an admin' : `a ${next}`}.`);
  }

  async function toggle(u: User) {
    setError(''); setNotice('');
    const action = u.status === 'active' ? 'disable' : 'enable';
    const r = await call<User>(`/api/admin/users/${u.id}/${action}`, { method: 'POST' });
    if (!r.ok) return setError(r.data.error?.message ?? `Could not ${action} the account.`);
    replace(r.data); setNotice(`${u.email} ${action}d.`);
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setNotice('');
    const bad = emailError(inviteEmail);
    if (bad) return setError(bad);
    const r = await call<Invitation>('/api/admin/invitations', { method: 'POST', body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }) });
    if (!r.ok) return setError(r.data.error?.message ?? 'Could not send the invitation.');
    setNotice(`Invitation sent to ${inviteEmail.trim().toLowerCase()}.`);
    setInviteEmail('');
    void loadInvitations();
  }

  async function revoke(i: Invitation) {
    setError(''); setNotice('');
    const r = await call(`/api/admin/invitations/${i.id}`, { method: 'DELETE' });
    if (!r.ok) return setError(r.data.error?.message ?? 'Could not revoke the invitation.');
    setNotice(`Invitation for ${i.email} revoked.`);
    void loadInvitations();
  }

  return (
    <>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-ok" role="status">{notice}</div>}

      <section className="panel" aria-labelledby="invite-h">
        <h2 id="invite-h">Invite a teacher or admin</h2>
        <form onSubmit={invite} className="row" noValidate>
          <div className="field">
            <label htmlFor="invite-email">Email to invite</label>
            <input id="invite-email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
          </div>
          <div className="field" style={{ maxWidth: 160 }}>
            <label htmlFor="invite-role">Role</label>
            <select id="invite-role" value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'teacher' | 'admin')}>
              <option value="teacher">Teacher</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary">Send invitation</button>
        </form>
        {invitations.length > 0 && (
          <div className="table-wrap">
            <table aria-label="Pending invitations">
              <thead><tr><th>Email</th><th>Role</th><th>Expires</th><th /></tr></thead>
              <tbody>
                {invitations.map((i) => (
                  <tr key={i.id}>
                    <td>{i.email}</td>
                    <td><span className={`badge badge-${i.role}`}>{i.role}</span></td>
                    <td>{new Date(i.expires_at).toLocaleDateString()}</td>
                    <td><button type="button" className="btn btn-sm btn-danger" aria-label={`Revoke invitation for ${i.email}`} onClick={() => revoke(i)}>Revoke</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="users-h">
        <h2 id="users-h">All users</h2>
        <div className="row">
          <div className="field">
            <label htmlFor="search">Search by name or email</label>
            <input id="search" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="field" style={{ maxWidth: 160 }}>
            <label htmlFor="filter-role">Role</label>
            <select id="filter-role" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">All</option>
              <option value="student">Students</option>
              <option value="teacher">Teachers</option>
              <option value="admin">Admins</option>
            </select>
          </div>
        </div>
        <div className="table-wrap">
          <table aria-label="Users">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.full_name ?? <span className="muted">No name</span>}</td>
                  <td>{u.email}</td>
                  <td>
                    {u.id === meId ? <span className={`badge badge-${u.role}`}>{u.role} (you)</span> : (
                      <select aria-label={`Role for ${u.email}`} value={u.role} onChange={(e) => changeRole(u, e.target.value)}>
                        <option value="student">student</option>
                        <option value="teacher">teacher</option>
                        <option value="admin">admin</option>
                      </select>
                    )}
                  </td>
                  <td>{u.status === 'disabled' ? <span className="badge badge-disabled">disabled</span> : 'Active'}</td>
                  <td>
                    {u.id !== meId && (
                      <div className="actions">
                        <button type="button" className="btn btn-sm" aria-label={`${u.status === 'active' ? 'Disable' : 'Enable'} ${u.email}`} onClick={() => toggle(u)}>
                          {u.status === 'active' ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && users.length === 0 && <tr><td colSpan={5} className="muted">No users match.</td></tr>}
            </tbody>
          </table>
        </div>
        {more && <div><button type="button" className="btn btn-sm" onClick={() => load(users.length)}>Load more</button></div>}
      </section>
    </>
  );
}
