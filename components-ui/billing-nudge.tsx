'use client';

import { useState } from 'react';
import { usersUiUrl } from './links';
import './billing-nudge.css';

export type Prompt = 'book_trial' | 'trial_booked' | 'subscribe';

/**
 * What to say to a student about the free class and subscribing. `prompts` comes from billing-service (GET /v1/billing/me),
 * `requested` is whether they already asked for the free class. One card per prompt: a new student sees both
 * "book your free class" and "subscribe"; after the free class only "subscribe".
 */
export function BillingNudge({ prompts, requested, onRequest, onCancelRequest }: {
  prompts: Prompt[]; requested: boolean;
  onRequest: (note: string) => Promise<void>; onCancelRequest: () => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  if (!prompts.length) return null;
  const firstTime = prompts.includes('book_trial');

  return (
    <section className="qn" aria-label="Get started">
      {firstTime && (requested ? (
        <div className="qn-card">
          <h2>Free class requested</h2>
          <p>A teacher will schedule it and send you an invite. It will show up under My classes.</p>
          <button type="button" className="qn-link" disabled={busy} onClick={() => run(onCancelRequest)}>Cancel request</button>
        </div>
      ) : (
        <div className="qn-card">
          <h2>Book your free first class</h2>
          <p>Meet a teacher before you decide. Tell us when suits you and a teacher will schedule it.</p>
          <input aria-label="Preferred times" maxLength={500} placeholder="e.g. weekdays after 4pm (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" className="qn-btn" disabled={busy} onClick={() => run(() => onRequest(note))}>Request my free class</button>
        </div>
      ))}
      {prompts.includes('trial_booked') && (
        <div className="qn-card">
          <h2>Your free class is booked</h2>
          <p>Check My classes for the time and the join link.</p>
        </div>
      )}
      {prompts.includes('subscribe') && (
        <div className="qn-card qn-strong">
          <h2>{firstTime ? 'Ready to start? Subscribe' : 'Loved your class? Keep going'}</h2>
          <p>{firstTime ? 'Already know you want classes? Pick a plan now: 15 one-to-one classes every month. Your free class stays available.' : 'Pick a plan to book more classes: 15 one-to-one classes every month, monthly or annual.'}</p>
          <a className="qn-btn" href={`${usersUiUrl}/billing`}>See plans and prices</a>
        </div>
      )}
    </section>
  );
}
