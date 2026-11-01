'use client';

import { useEffect, useId, useRef, useState } from 'react';

/** Month first (MM/DD/YYYY) in the US and its territories; everywhere else day first (DD/MM/YYYY). Decided from a time zone, not from the browser's language. */
const US_ZONES = /^(America\/(New_York|Detroit|Chicago|Menominee|Denver|Boise|Phoenix|Los_Angeles|Anchorage|Juneau|Sitka|Nome|Yakutat|Adak|Metlakatla|Indiana\/.*|Kentucky\/.*|North_Dakota\/.*)|Pacific\/(Honolulu|Guam|Saipan|Pago_Pago)|US\/.*|EST5EDT|CST6CDT|MST7MDT|PST8PDT)$/;
export const monthFirst = (timeZone: string) => US_ZONES.test(timeZone);

const pad = (n: number) => String(n).padStart(2, '0');
/** "2026-11-04" as "04/11/2026" (day first) or "11/04/2026" (month first). */
export function showDate(iso: string, mf: boolean) {
  const [y, m, d] = iso.split('-');
  return y && m && d ? (mf ? `${m}/${d}/${y}` : `${d}/${m}/${y}`) : '';
}
/** Reads what a person typed (in their format, or as 2026-11-04) back to "2026-11-04"; '' when it is not a real date. */
export function readDate(text: string, mf: boolean) {
  const t = text.trim();
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const loc = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(t);
  if (iso) [y, m, d] = [+iso[1], +iso[2], +iso[3]];
  else if (loc) [y, m, d] = mf ? [+loc[3], +loc[1], +loc[2]] : [+loc[3], +loc[2], +loc[1]];
  else return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : '';
}

/**
 * A date box written the way the person's time zone writes dates, with the browser's own calendar behind the icon.
 * The value is always "YYYY-MM-DD".
 */
export function DateField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (iso: string) => void; disabled?: boolean }) {
  const id = useId();
  const [mf, setMf] = useState(true); // set from the browser's time zone after the first render, so server and browser markup agree
  const [text, setText] = useState<string | null>(null); // what is being typed; null = show the value
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => { setMf(monthFirst(Intl.DateTimeFormat().resolvedOptions().timeZone)); }, []);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="datefield">
        <input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          placeholder={mf ? 'MM/DD/YYYY' : 'DD/MM/YYYY'}
          value={text ?? showDate(value, mf)}
          disabled={disabled}
          onChange={(e) => { setText(e.target.value); const iso = readDate(e.target.value, mf); if (iso) onChange(iso); else if (!e.target.value.trim()) onChange(''); }}
          onBlur={() => setText(null)}
        />
        <button type="button" className="df-btn" aria-label="Pick a date" disabled={disabled} onClick={() => picker.current?.showPicker?.()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#414754" strokeWidth="1.4" strokeLinecap="round" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2" /><path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" /></svg>
        </button>
        <input ref={picker} className="df-native" type="date" tabIndex={-1} aria-hidden="true" value={value} onChange={(e) => { setText(null); if (e.target.value) onChange(e.target.value); }} />
      </div>
    </div>
  );
}
