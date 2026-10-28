'use client';

import { useEffect, useState } from 'react';
import type { Student } from '@/lib/calendar';
import { api } from '../api-client';

interface Request { id: string; studentId: string; studentEmail: string | null; studentName: string | null; note: string | null }

/**
 * New students ask for their free first class; teachers (and admins) schedule it from here. "Schedule" opens the New
 * lesson form with the student already chosen. The list reloads whenever `reloadOn` changes (the class list refreshed).
 */
export function FreeClassRequests({ onSchedule, reloadOn }: { onSchedule: (student: Student) => void; reloadOn: unknown }) {
  const [requests, setRequests] = useState<Request[]>([]);
  useEffect(() => {
    api<{ requests: Request[] }>('/api/trial-requests').then((r) => setRequests(r.requests), () => setRequests([]));
  }, [reloadOn]);
  if (!requests.length) return null;
  return (
    <section className="freereq" aria-label="Free class requests">
      <h3>Free class requests <span>{requests.length}</span></h3>
      <ul>
        {requests.map((r) => (
          <li key={r.id}>
            <div>
              <b>{r.studentName ?? r.studentEmail ?? 'A student'}</b>
              {r.note && <small>{r.note}</small>}
            </div>
            {r.studentEmail && <button type="button" onClick={() => onSchedule({ email: r.studentEmail!, name: r.studentName ?? undefined, userId: r.studentId })}>Schedule</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}
