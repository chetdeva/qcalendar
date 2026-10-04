import type { CalendarEvent, CalendarSettings, EventCategory } from './calendar';

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const clock = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export const timeLabel = (iso: string) => clock(new Date(iso));

/** "9:00 – 10:30 AM", or "11:30 AM – 1:00 PM" when the meridiem changes. */
export function rangeLabel(startIso: string, endIso: string): string {
  const [s, e] = [clock(new Date(startIso)), clock(new Date(endIso))];
  const [sm, em] = [s.slice(-2), e.slice(-2)];
  return sm === em ? `${s.slice(0, -3)} – ${e}` : `${s} – ${e}`;
}

export const minutesBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 60000);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function parseEmails(raw: string) {
  const all = raw.split(/[,\s;]+/).filter(Boolean);
  return { valid: all.filter((e) => EMAIL.test(e)), invalid: all.filter((e) => !EMAIL.test(e)) };
}

export function nameFromEmail(email: string): string {
  return email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';

/** Merges overlapping/adjacent slots into continuous free ranges for display. */
export function mergeSlots(slots: { start: string; end: string }[]): { start: string; end: string }[] {
  const out: { start: number; end: number }[] = [];
  for (const s of [...slots].sort((a, b) => a.start.localeCompare(b.start))) {
    const start = Date.parse(s.start);
    const end = Date.parse(s.end);
    const last = out[out.length - 1];
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else out.push({ start, end });
  }
  return out.map((r) => ({ start: new Date(r.start).toISOString(), end: new Date(r.end).toISOString() }));
}

export const CATEGORIES: Record<EventCategory, { label: string; short: string; badge: string; icon: string; color: string }> = {
  tutoring: { label: 'Tutoring', short: 'Tutoring', badge: 'STUDENT', icon: 'student-badge', color: '#732de4' },
  office_hours: { label: 'Office Hr', short: 'Office hours', badge: 'OFFICE HOURS', icon: 'gcal-badge', color: '#005bbf' },
  personal: { label: 'Personal', short: 'Personal', badge: 'PERSONAL', icon: 'restaurant', color: '#727785' },
};
export const CATEGORY_ORDER: EventCategory[] = ['tutoring', 'office_hours', 'personal'];

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** Bookable hours in [start, end) according to the service's working hours. */
export function capacityHours(settings: CalendarSettings | null, start: Date, end: Date): number {
  if (!settings) return 0;
  let total = 0;
  for (let d = new Date(start); d < end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    for (const [a, b] of settings.workingHours[DAYS[d.getDay()]]) {
      const [ah, am] = a.split(':').map(Number);
      const [bh, bm] = b.split(':').map(Number);
      total += (bh * 60 + bm - (ah * 60 + am)) / 60;
    }
  }
  return total;
}

export function hoursByCategory(events: CalendarEvent[]): Record<EventCategory, number> {
  const out: Record<EventCategory, number> = { tutoring: 0, office_hours: 0, personal: 0 };
  for (const e of events) out[e.category] += minutesBetween(e.start, e.end) / 60;
  return out;
}

export const hoursLabel = (h: number) => `${Math.round(h * 10) / 10}`;
