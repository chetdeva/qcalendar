'use client';

import { useCallback, useEffect, useState } from 'react';
import { calendarUrl } from '@/lib/env';

interface Person {
  id: string; email: string; full_name: string | null; role: 'student' | 'teacher' | 'admin'; status: 'active' | 'disabled';
  classes: { students: number; upcoming: number; nextAt: string | null; teacher: { id: string; name: string | null; email: string } | null } | null;
  credits: { remaining: number; expiresAt: string | null; unsettled: number; lastPayoutAt: string | null } | null;
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
  const [panel, setPanel] = useState<{ type: 'assign' | 'credits' | 'payout'; person: Person } | null>(null); // what is open under the table
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
              {teacher ? <><th>Active students</th><th>Credit balance</th><th>Payout</th></> : <><th>Assigned teacher</th><th>Available credits</th></>}
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
                  ? <><td>{p.classes ? p.classes.students : dash}</td><td>{p.credits ? p.credits.unsettled : dash}</td><td>{p.credits ? (p.credits.unsettled > 0 ? <span className="badge">{p.credits.unsettled} to pay</span> : p.credits.lastPayoutAt ? 'Settled' : dash) : dash}</td></>
                  : <><td>{p.classes ? (p.classes.teacher ? nameOf({ full_name: p.classes.teacher.name, email: p.classes.teacher.email }) : <span className="muted">Not assigned</span>) : dash}</td><td>{p.credits ? p.credits.remaining : dash}</td></>}
                <td>{p.classes ? <>{p.classes.upcoming}{when(p.classes.nextAt) && <span className="muted small"> (next {when(p.classes.nextAt)})</span>}</> : dash}</td>
                <td>
                  <div className="actions">
                    {calendarUrl && <a className="btn btn-sm" href={calendarLink(p)} aria-label={`View calendar of ${p.email}`}>View calendar</a>}
                    {p.status === 'active' && (
                      <button type="button" className="btn btn-sm" aria-label={`${teacher ? 'Assign students to' : p.classes?.teacher ? 'Change teacher for' : 'Assign a teacher to'} ${p.email}`} onClick={() => setPanel({ type: 'assign', person: p })}>
                        {teacher ? 'Assign students' : p.classes?.teacher ? 'Change teacher' : 'Assign teacher'}
                      </button>
                    )}
                    <button type="button" className="btn btn-sm" aria-label={`Credits of ${p.email}`} onClick={() => setPanel({ type: 'credits', person: p })}>Credits</button>
                    {teacher && <button type="button" className="btn btn-sm" aria-label={`Payout for ${p.email}`} onClick={() => setPanel({ type: 'payout', person: p })}>Payout</button>}
                    <button type="button" className="btn btn-sm" aria-label={`${p.status === 'active' ? 'Disable' : 'Enable'} ${p.email}`} onClick={() => toggle(p)}>
                      {p.status === 'active' ? 'Disable' : 'Enable'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && people.length === 0 && <tr><td colSpan={teacher ? 8 : 7} className="muted">No {label.toLowerCase()} match.</td></tr>}
          </tbody>
        </table>
      </div>
      {more && <div><button type="button" className="btn btn-sm" onClick={() => load(people.length)}>Load more</button></div>}
      {panel?.type === 'assign' && (teacher
        ? <AssignStudents teacher={panel.person} onClose={() => setPanel(null)} onDone={(m) => { setNotice(m); void load(0); }} />
        : <AssignTeacher student={panel.person} onClose={() => setPanel(null)} onDone={(m, t) => {
            setNotice(m);
            setPeople((prev) => prev.map((x) => (x.id === panel.person.id && x.classes ? { ...x, classes: { ...x.classes, teacher: t } } : x)));
            setPanel(null);
          }} />)}
      {panel?.type === 'credits' && <CreditsPanel person={panel.person} kind={role} onClose={() => setPanel(null)} onChanged={() => void load(0)} />}
      {panel?.type === 'payout' && <PayoutPanel teacher={panel.person} onClose={() => setPanel(null)} onChanged={() => void load(0)} />}
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

interface Entry { id: number; delta: number; kind: string; note: string | null; by: string | null; at: string; settled?: boolean }
const day = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const money = (cents: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

/** Add, deduct or correct credits (a reason is required), and the history of every change. */
function CreditsPanel({ person, kind, onClose, onChanged }: { person: Person; kind: 'teacher' | 'student'; onClose: () => void; onChanged: () => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [direction, setDirection] = useState<'add' | 'deduct'>('add');
  const [amount, setAmount] = useState('1');
  const [days, setDays] = useState('30');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID()); // one per attempt, so a double click cannot apply twice
  const teacher = kind === 'teacher';

  const loadHistory = useCallback(async () => {
    const res = await fetch(`/api/admin/credits/${person.id}/ledger?kind=${kind}&limit=50`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) setEntries(data.entries ?? []); else setError(data.error?.message ?? 'Could not load the history.');
  }, [person.id, kind]);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setNotice('');
    const n = Number(amount);
    if (!Number.isInteger(n) || n < 1) return setError('Enter a whole number of credits.');
    if (reason.trim().length < 3) return setError('A reason is required.');
    setBusy(true);
    const res = await fetch('/api/admin/credits/adjust', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId: person.id, kind, delta: direction === 'add' ? n : -n, reason: reason.trim(), requestId, ...(!teacher && direction === 'add' ? { days: Number(days) || 30 } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error?.message ?? 'Could not save the change.');
    setNotice(`${direction === 'add' ? 'Added' : 'Removed'} ${n} ${n === 1 ? 'credit' : 'credits'}.`);
    setReason(''); setRequestId(crypto.randomUUID());
    void loadHistory(); onChanged();
  }

  return (
    <div className="panel" role="region" aria-label={`Credits of ${person.email}`}>
      <h2>{teacher ? 'Earned credits' : 'Credits'}: {nameOf(person)}</h2>
      <p className="muted small">{teacher ? 'A teacher earns one credit for each student in a class they taught. Corrections here are added to what is still unpaid.' : 'Credits pay for classes. An added block expires after the number of days you choose; nothing carries over.'}</p>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-ok" role="status">{notice}</div>}
      <form onSubmit={save} className="row" noValidate>
        <div className="field" style={{ maxWidth: 130 }}>
          <label htmlFor="credit-dir">Change</label>
          <select id="credit-dir" value={direction} onChange={(e) => setDirection(e.target.value as 'add' | 'deduct')}><option value="add">Add</option><option value="deduct">Deduct</option></select>
        </div>
        <div className="field" style={{ maxWidth: 110 }}>
          <label htmlFor="credit-amount">Credits</label>
          <input id="credit-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        {!teacher && direction === 'add' && (
          <div className="field" style={{ maxWidth: 130 }}>
            <label htmlFor="credit-days">Expires in (days)</label>
            <input id="credit-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
          </div>
        )}
        <div className="field">
          <label htmlFor="credit-reason">Reason (required)</label>
          <input id="credit-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>Save</button>
      </form>
      <div className="table-wrap">
        <table aria-label="Credit history">
          <thead><tr><th>Date</th><th>Change</th><th>What</th><th>Reason</th><th>By</th></tr></thead>
          <tbody>
            {entries.map((x) => (
              <tr key={x.id}>
                <td>{day(x.at)}</td><td>{x.delta > 0 ? `+${x.delta}` : x.delta}</td>
                <td>{x.kind}{x.settled ? ' (paid)' : ''}</td><td>{x.note ?? dash}</td><td>{x.by ?? dash}</td>
              </tr>
            ))}
            {entries.length === 0 && <tr><td colSpan={5} className="muted">No credit history yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="actions"><button type="button" className="btn" onClick={onClose}>Close</button></div>
    </div>
  );
}

interface PayoutInfo {
  unsettledCredits: number; rate: { rateCents: number; currency: string } | null; amountCents: number | null;
  payouts: { id: string; credits: number; rateCents: number; currency: string; amountCents: number; reference: string; notes: string | null; paidAt: string; paidBy: string | null }[];
}

/** A teacher's rate per credit, what is owed, and recording that it was paid. Nothing is transferred from here. */
function PayoutPanel({ teacher, onClose, onChanged }: { teacher: Person; onClose: () => void; onChanged: () => void }) {
  const [info, setInfo] = useState<PayoutInfo | null>(null);
  const [rate, setRate] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/teachers/${teacher.id}/payout`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error?.message ?? 'Could not load the payout details.');
    setInfo(data);
    if (data.rate) { setRate(String(data.rate.rateCents / 100)); setCurrency(data.rate.currency); }
  }, [teacher.id]);
  useEffect(() => { void load(); }, [load]);

  async function saveRate() {
    setError(''); setNotice('');
    const n = Number(rate);
    if (!(n >= 0) || rate.trim() === '') return setError('Enter the amount paid per credit.');
    const res = await fetch(`/api/admin/teachers/${teacher.id}/rate`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rateCents: Math.round(n * 100), currency: currency.trim().toUpperCase() }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error?.message ?? 'Could not save the rate.');
    setInfo(data); setNotice('Rate saved.');
  }

  async function settle(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setNotice('');
    if (!reference.trim()) return setError('Enter the payment reference.');
    const res = await fetch(`/api/admin/teachers/${teacher.id}/payouts`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reference: reference.trim(), ...(notes.trim() ? { notes: notes.trim() } : {}) }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error?.message ?? 'Could not record the payout.');
    setNotice(`Recorded: ${data.credits} credits, ${money(data.amountCents, data.currency)}, marked paid.`);
    setReference(''); setNotes('');
    void load(); onChanged();
  }

  return (
    <div className="panel" role="region" aria-label={`Payout for ${teacher.email}`}>
      <h2>Payout: {nameOf(teacher)}</h2>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {notice && <div className="alert alert-ok" role="status">{notice}</div>}
      <div className="row">
        <div className="field" style={{ maxWidth: 200 }}>
          <label htmlFor="payout-rate">Paid per credit</label>
          <input id="payout-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
        <div className="field" style={{ maxWidth: 100 }}>
          <label htmlFor="payout-currency">Currency</label>
          <input id="payout-currency" value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value)} />
        </div>
        <button type="button" className="btn" onClick={saveRate}>Save rate</button>
      </div>
      {info && (
        <p>
          <b>{info.unsettledCredits}</b> unpaid {info.unsettledCredits === 1 ? 'credit' : 'credits'}
          {info.rate && info.amountCents !== null ? <> at {money(info.rate.rateCents, info.rate.currency)} each = <b>{money(info.amountCents, info.rate.currency)}</b></> : <span className="muted"> (set a rate to see the amount)</span>}
        </p>
      )}
      {info && info.unsettledCredits > 0 && info.rate && (
        <form onSubmit={settle} className="row" noValidate>
          <div className="field">
            <label htmlFor="payout-ref">Payment reference</label>
            <input id="payout-ref" value={reference} maxLength={200} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="payout-notes">Notes (optional)</label>
            <input id="payout-notes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary">Mark as paid</button>
        </form>
      )}
      <div className="table-wrap">
        <table aria-label="Past payouts">
          <thead><tr><th>Date</th><th>Credits</th><th>Rate</th><th>Amount</th><th>Reference</th><th>By</th></tr></thead>
          <tbody>
            {info?.payouts.map((p) => (
              <tr key={p.id}><td>{day(p.paidAt)}</td><td>{p.credits}</td><td>{money(p.rateCents, p.currency)}</td><td>{money(p.amountCents, p.currency)}</td><td>{p.reference}{p.notes && <span className="muted small"> ({p.notes})</span>}</td><td>{p.paidBy ?? dash}</td></tr>
            ))}
            {info && info.payouts.length === 0 && <tr><td colSpan={6} className="muted">No payouts yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="actions"><button type="button" className="btn" onClick={onClose}>Close</button></div>
    </div>
  );
}
