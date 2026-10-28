'use client';

import { useCallback, useEffect, useState } from 'react';
import { BillingNudge, type Prompt } from './billing-nudge';

/**
 * The free-class and subscribe cards for a signed-in student. Every app that shows it serves the same two routes:
 * GET /api/nudge -> { prompts, requested } and POST/DELETE /api/trial-requests. If either fails nothing is shown:
 * billing being down must never get in the way of the page.
 */
export function StudentNudge() {
  const [state, setState] = useState<{ prompts: Prompt[]; requested: boolean } | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/nudge', { cache: 'no-store' });
      setState(r.ok ? await r.json() : null);
    } catch {
      setState(null);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!state) return null;
  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px' }}>
      <BillingNudge
        prompts={state.prompts}
        requested={state.requested}
        onRequest={async (note) => { await fetch('/api/trial-requests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(note ? { note } : {}) }); await load(); }}
        onCancelRequest={async () => { await fetch('/api/trial-requests', { method: 'DELETE' }); await load(); }}
      />
    </div>
  );
}
