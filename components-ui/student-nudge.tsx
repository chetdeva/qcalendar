'use client';

import { useCallback, useEffect, useState } from 'react';
import { BillingNudge, type Prompt, type TrialRequest } from './billing-nudge';

/**
 * The free-class and subscribe cards for a signed-in student. Every app that shows it serves the same two routes:
 * GET /api/nudge -> { prompts, request } and DELETE /api/trial-requests (the request itself is made by the calendar, which
 * calls POST /api/trial-requests with the slot the student picked; pass `reloadKey` to refresh the bar after that). If either fails nothing is shown:
 * billing being down must never get in the way of the page.
 */
export function StudentNudge({ onPickTime, reloadKey }: { onPickTime?: () => void; reloadKey?: unknown }) {
  const [state, setState] = useState<{ prompts: Prompt[]; request: TrialRequest | null } | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/nudge', { cache: 'no-store' });
      setState(r.ok ? await r.json() : null);
    } catch {
      setState(null);
    }
  }, []);
  useEffect(() => { void load(); }, [load, reloadKey]);
  if (!state) return null;
  return (
    <BillingNudge
      prompts={state.prompts}
      request={state.request}
      onPickTime={onPickTime}
      onCancelRequest={async () => { await fetch('/api/trial-requests', { method: 'DELETE' }); await load(); }}
    />
  );
}
