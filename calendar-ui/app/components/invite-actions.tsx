'use client';

import { useState } from 'react';
import type { CalendarEvent } from '@/lib/calendar';

const when = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** A <input type="datetime-local"> value for this moment in the person's own timezone. */
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

interface Props {
  c: CalendarEvent;
  busy: boolean;
  onAnswer: (c: CalendarEvent, response: 'accepted' | 'declined', note?: string) => Promise<void>;
  onRequest: (c: CalendarEvent, startIso: string, note?: string) => Promise<void>;
}

/** What a student can do with an invitation: accept, decline (with a note) and, for one-to-one classes, ask for another time. */
export function InviteActions({ c, busy, onAnswer, onRequest }: Props) {
  const status = c.myStatus ?? 'invited';
  const cr = c.changeRequest;
  const [mode, setMode] = useState<'decline' | 'move' | null>(null);
  const [note, setNote] = useState('');
  const [start, setStart] = useState('');
  const canMove = c.participantCount === 1 && status !== 'declined' && cr?.status !== 'pending';
  const mine = c.participants[0];

  const open = (m: 'decline' | 'move') => { setMode(m); setNote(m === 'decline' ? (mine?.note ?? '') : ''); };
  const done = () => { setMode(null); setNote(''); setStart(''); };
  const stop = (e: { stopPropagation(): void }) => e.stopPropagation();

  return (
    <div onClick={stop}>
      <div className="cc-actions" role="group" aria-label={`Answer for ${c.title}`}>
        <button type="button" className="btn-accept" aria-pressed={status === 'accepted'} disabled={busy} onClick={() => { done(); void onAnswer(c, 'accepted'); }}>Accept</button>
        <button type="button" className="btn-decline" aria-pressed={status === 'declined'} disabled={busy} onClick={() => open('decline')}>Decline</button>
        {canMove && <button type="button" disabled={busy} onClick={() => open('move')}>Request new time</button>}
      </div>

      {status === 'declined' && mine?.note && mode !== 'decline' && <p className="cc-note">Your note: “{mine.note}”</p>}
      {cr?.status === 'pending' && <p className="cc-note">You asked to move this to {when(cr.start)}. Waiting for your teacher.{cr.note ? ` Your note: “${cr.note}”` : ''}</p>}
      {cr?.status === 'rejected' && <p className="cc-note">Your teacher kept the class at its time (you asked for {when(cr.start)}).</p>}
      {cr?.status === 'approved' && <p className="cc-note">Your request was approved. The class has moved.</p>}

      {mode === 'decline' && (
        <form className="note-form" onSubmit={async (e) => { e.preventDefault(); await onAnswer(c, 'declined', note.trim() || undefined); done(); }}>
          <label>Note for your teacher (optional)
            <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Let your teacher know why" />
          </label>
          <div className="cc-actions">
            <button type="submit" className="btn-decline" disabled={busy}>Confirm decline</button>
            <button type="button" onClick={done}>Cancel</button>
          </div>
        </form>
      )}

      {mode === 'move' && (
        <form className="note-form" onSubmit={async (e) => { e.preventDefault(); await onRequest(c, new Date(start).toISOString(), note.trim() || undefined); done(); }}>
          <label>New time
            <input type="datetime-local" required value={start} min={localInput(new Date())} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>Note for your teacher (optional)
            <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why does the time not work?" />
          </label>
          <div className="cc-actions">
            <button type="submit" disabled={busy || !start}>Send request</button>
            <button type="button" onClick={done}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
