'use client';

import { useState } from 'react';
import { api } from '../api-client';

export interface ClassRequestRow {
  id: string; status: 'requested' | 'scheduled' | 'declined' | 'cancelled'; note: string | null; declineNote: string | null;
  student: { id: string; name: string | null; email: string }; teacher: { id: string; name: string | null }; start: string; end: string;
}

export const whenLabel = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * Students with a plan ask a mentor for a class at a time they picked. The mentor approves it here (the class is created with a
 * meeting link and the student is invited) or declines with an optional note. Loaded by the calendar, which also draws each one as a dashed slot.
 */
export function ClassRequests({ requests, onAnswered }: { requests: ClassRequestRow[]; onAnswered: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [note, setNote] = useState('');
  if (!requests.length) return null;

  async function answer(r: ClassRequestRow, path: 'approve' | 'decline') {
    setBusy(r.id);
    setError(null);
    try {
      await api(`/api/class-requests/${r.id}/${path}`, { method: 'POST', body: path === 'decline' ? JSON.stringify(note.trim() ? { note: note.trim() } : {}) : undefined });
      setDeclining(null);
      setNote('');
      onAnswered();
    } catch (e) {
      setError({ id: r.id, message: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="freereq" aria-label="Class requests">
      <h3>Class requests <span>{requests.length}</span></h3>
      <ul>
        {requests.map((r) => (
          <li key={r.id} className="creq">
            <div>
              <b>{r.student.name ?? r.student.email}</b>
              <small>{whenLabel(r.start)}</small>
              {r.note && <small title={r.note}>“{r.note}”</small>}
              {error?.id === r.id && <small role="alert" className="freereq-err">{error.message}</small>}
              {declining === r.id && (
                <input aria-label="Note to the student (optional)" placeholder="Note to the student (optional)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
              )}
            </div>
            <div className="freereq-btns">
              {declining === r.id ? (
                <>
                  <button type="button" disabled={busy === r.id} onClick={() => answer(r, 'decline')}>Send decline</button>
                  <button type="button" className="alt" onClick={() => { setDeclining(null); setNote(''); }}>Back</button>
                </>
              ) : (
                <>
                  <button type="button" disabled={busy === r.id} onClick={() => answer(r, 'approve')}>Approve</button>
                  <button type="button" className="alt" onClick={() => setDeclining(r.id)}>Decline</button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
