'use client';

import { useEffect, useRef, useState } from 'react';
import { calendarUrl, usersUiUrl } from './links';
import './billing-nudge.css';

export type Prompt = 'book_trial' | 'trial_booked' | 'subscribe';
/** The slot a student asked for their free class in (ISO times). */
export interface TrialRequest { start: string | null; end: string | null }

const whenLabel = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/**
 * What to say to a student about the free class and subscribing, in a menu in the header. `prompts` comes
 * from billing-service (GET /v1/billing/me); `request` is the free class they already asked for, if any. One card per
 * prompt: a new student sees "book your free class" and "subscribe"; after the free class only "subscribe".
 * `onPickTime` starts picking a slot on the calendar; where there is no calendar the button links to it instead.
 */
export function BillingNudge({ prompts, request, onPickTime, onCancelRequest }: {
  prompts: Prompt[]; request: TrialRequest | null;
  onPickTime?: () => void; onCancelRequest: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false); // always starts closed
  const [busy, setBusy] = useState(false);
  const root = useRef<HTMLDetailsElement>(null);
  // Closes on a click elsewhere or Escape, like a menu.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  if (!prompts.length) return null;
  const firstTime = prompts.includes('book_trial');
  const title = firstTime ? 'Get started: your free trial class and plans' : prompts.includes('subscribe') ? 'Keep learning: choose a plan' : 'Your free trial class';
  const pick = onPickTime
    ? <button type="button" className="qn-btn" onClick={() => { setOpen(false); onPickTime(); }}>{request ? 'Change time' : 'Pick a time on the calendar'}</button>
    : <a className="qn-btn" href={`${calendarUrl}?pick=1`}>{request ? 'Change time' : 'Pick a time on the calendar'}</a>;

  return (
    <details className="qn-pop" ref={root} open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary><span>{title}</span><span className="qn-badge" aria-label={`${prompts.length} to do`}>{prompts.length}</span></summary>
      <section className="qn qn-panel" aria-label="Get started">
        {firstTime && (request ? (
          <div className="qn-card">
            <h2>Trial class requested</h2>
            <p>{request.start ? `You asked for ${whenLabel(request.start)}. ` : ''}A teacher will confirm it and it will appear on your calendar.</p>
            <div className="qn-row">{pick}<button type="button" className="qn-link" disabled={busy} onClick={async () => { setBusy(true); try { await onCancelRequest(); } finally { setBusy(false); } }}>Cancel request</button></div>
          </div>
        ) : (
          <div className="qn-card">
            <h2>Book your free trial class</h2>
            <p>Meet a teacher before you decide. Pick the day and time you would like on the calendar for a 30-minute trial class and a teacher will confirm it.</p>
            {pick}
          </div>
        ))}
        {prompts.includes('trial_booked') && (
          <div className="qn-card">
            <h2>Your free trial class is booked</h2>
            <p>Check My classes for the time and the join link.</p>
          </div>
        )}
        {prompts.includes('subscribe') && (
          <div className="qn-card qn-strong">
            <h2>{firstTime ? 'Ready to start? Subscribe' : 'Loved your class? Keep going'}</h2>
            <p>{firstTime ? 'Already know you want classes? Pick a plan now: 15 one-to-one classes every month. Your free trial class stays available.' : 'Pick a plan to book more classes: 15 one-to-one classes every month, monthly or annual.'}</p>
            <a className="qn-btn" href={`${usersUiUrl}/billing`}>See plans and prices</a>
          </div>
        )}
      </section>
    </details>
  );
}
