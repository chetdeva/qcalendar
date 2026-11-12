'use client';

import { useState } from 'react';
import { api } from '../api-client';
import { whenLabel, type ClassRequestRow } from './class-requests';

/** A student's own requests to mentors: waiting ones (which they can withdraw) and any declined this week, with the mentor's note. */
export function MyClassRequests({ requests, onChanged }: { requests: ClassRequestRow[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  if (!requests.length) return null;

  async function withdraw(r: ClassRequestRow) {
    setBusy(r.id);
    setError('');
    try {
      await api(`/api/class-requests/${r.id}`, { method: 'DELETE' });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="freereq" aria-label="Your class requests">
      <h3>Your class requests <span>{requests.length}</span></h3>
      {error && <p role="alert" className="freereq-err">{error}</p>}
      <ul>
        {requests.map((r) => (
          <li key={r.id}>
            <div>
              <b>{r.teacher.name ?? 'Your mentor'}</b>
              <small>{whenLabel(r.start)} · {r.status === 'declined' ? 'Declined' : 'Waiting for approval'}</small>
              {r.status === 'declined' && r.declineNote && <small title={r.declineNote}>“{r.declineNote}”</small>}
            </div>
            {r.status === 'requested' && (
              <div className="freereq-btns"><button type="button" className="alt" disabled={busy === r.id} onClick={() => withdraw(r)}>Withdraw</button></div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
