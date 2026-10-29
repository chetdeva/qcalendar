'use client';

import { useState } from 'react';
import type { Student } from '@/lib/calendar';
import { api } from '../api-client';

export interface TrialRequestRow { id: string; studentId: string; studentEmail: string | null; studentName: string | null; start: string | null; end: string | null }

const whenLabel = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * New students ask for their free trial class at a time they picked on their calendar. A teacher confirms it here (the
 * class is created for both of them) or uses "Change time", which opens the New lesson form with the student and the
 * asked-for time already filled in. The list is loaded by the calendar, which also draws each request as a dashed slot.
 */
export function FreeClassRequests({ requests, onChangeTime, onConfirmed, canConfirm }: {
  requests: TrialRequestRow[]; onChangeTime: (student: Student, start: Date | null) => void; onConfirmed: () => void; canConfirm: boolean;
}) {
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!requests.length) return null;

  async function confirm(r: TrialRequestRow) {
    setBusy(r.id);
    setError(null);
    try {
      await api(`/api/trial-requests/${r.id}/confirm`, { method: 'POST' });
      onConfirmed();
    } catch (e) {
      setError({ id: r.id, message: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="freereq" aria-label="Free trial class requests">
      <h3>Free trial class requests <span>{requests.length}</span></h3>
      <ul>
        {requests.map((r) => (
          <li key={r.id}>
            <div>
              <b>{r.studentName ?? r.studentEmail ?? 'A student'}</b>
              <small>{r.start ? whenLabel(r.start) : 'No time asked for'}</small>
              {error?.id === r.id && <small role="alert" className="freereq-err">{error.message}</small>}
            </div>
            <div className="freereq-btns">
              {canConfirm && r.start && <button type="button" disabled={busy === r.id} onClick={() => confirm(r)}>Confirm</button>}
              {r.studentEmail && <button type="button" className="alt" onClick={() => onChangeTime({ email: r.studentEmail!, name: r.studentName ?? undefined, userId: r.studentId }, r.start ? new Date(r.start) : null)}>Change time</button>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
