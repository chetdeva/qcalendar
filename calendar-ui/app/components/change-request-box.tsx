'use client';

import type { CalendarEvent } from '@/lib/calendar';

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** What a teacher needs to act on: a student's request to move a class (with Approve / Reject) and the notes students left when declining. */
export function ChangeRequestBox({ ev, busy, onDecide }: { ev: CalendarEvent; busy: boolean; onDecide: (ev: CalendarEvent, requestId: string, decision: 'approve' | 'reject') => void }) {
  const cr = ev.changeRequest?.status === 'pending' ? ev.changeRequest : null;
  const student = ev.participants[0];
  const declines = ev.participants.filter((p) => p.status === 'declined' && p.note);
  if (!cr && declines.length === 0) return null;
  return (
    <div className="req-box" onClick={(e) => e.stopPropagation()}>
      {cr && (
        <>
          <p><b>{student?.name ?? student?.email ?? 'A student'}</b> asks to move this class to <b>{when(cr.start)}</b>.{cr.note ? ` “${cr.note}”` : ''}</p>
          <div className="cc-actions">
            <button type="button" className="btn-accept" disabled={busy} onClick={() => onDecide(ev, cr.id, 'approve')}>Approve</button>
            <button type="button" className="btn-decline" disabled={busy} onClick={() => onDecide(ev, cr.id, 'reject')}>Reject</button>
          </div>
        </>
      )}
      {declines.map((p) => <p key={p.id} className="cc-note"><b>{p.name ?? p.email}</b> declined: “{p.note}”</p>)}
    </div>
  );
}
