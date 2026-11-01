'use client';

import { useEffect } from 'react';

/**
 * Sends the browser's time zone to this app's /api/me/timezone once per tab, on the first signed-in page after sign-up or
 * sign-in. users-service only keeps it when the person has not set one, so the profile page always wins.
 */
export function TimezoneHint() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem('qt-tz-hint')) return;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (!timezone) return;
      sessionStorage.setItem('qt-tz-hint', '1');
      void fetch('/api/me/timezone', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ timezone }) }).catch(() => {});
    } catch {
      // storage or Intl unavailable: skip, the profile page still lets the person set it
    }
  }, []);
  return null;
}
