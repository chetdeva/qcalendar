import { kvGet, type DB } from './db.ts';

export interface Interval {
  start: number;
  end: number;
}

export const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Window = [string, string];
export interface Settings {
  timezone: string;
  workingHours: Record<(typeof DAYS)[number], Window[]>;
  bufferMinutes: number;
  slotStepMinutes: number;
  webhookUrl: string;
}

export function defaultSettings(timezone = 'UTC'): Settings {
  const weekday: Window[] = [['09:00', '17:00']];
  return {
    timezone,
    workingHours: { sun: [], mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday, sat: [] },
    bufferMinutes: 0,
    slotStepMinutes: 30,
    webhookUrl: '',
  };
}

export function isValidTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function tzOffsetMs(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(ms);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Converts a wall-clock time in `tz` ("2030-01-07", "09:00") to UTC epoch ms. */
export function zonedTimeToUtcMs(date: string, hhmm: string, tz: string): number {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  const guess = naive - tzOffsetMs(naive, tz);
  return naive - tzOffsetMs(guess, tz);
}

function localDate(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}

function nextDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

export function computeSlots(opts: {
  fromMs: number;
  toMs: number;
  nowMs: number;
  durationMin: number;
  settings: Settings;
  busy: Interval[];
}): Interval[] {
  const { settings, durationMin } = opts;
  const tz = settings.timezone;
  const durMs = durationMin * 60_000;
  const stepMs = settings.slotStepMinutes * 60_000;
  const bufMs = settings.bufferMinutes * 60_000;
  const busy = opts.busy.map((b) => ({ start: b.start - bufMs, end: b.end + bufMs }));
  const earliest = Math.max(opts.fromMs, opts.nowMs);
  const slots: Interval[] = [];

  let date = localDate(opts.fromMs, tz);
  for (let i = 0; i < 70; i++, date = nextDate(date)) {
    if (zonedTimeToUtcMs(date, '00:00', tz) >= opts.toMs) break;
    const [y, m, d] = date.split('-').map(Number);
    const day = DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    for (const [ws, we] of settings.workingHours[day]) {
      const winStart = zonedTimeToUtcMs(date, ws, tz);
      const winEnd = zonedTimeToUtcMs(date, we, tz);
      for (let t = winStart; t + durMs <= winEnd; t += stepMs) {
        const slot = { start: t, end: t + durMs };
        if (slot.start < earliest || slot.end > opts.toMs) continue;
        if (busy.some((b) => overlaps(slot, b))) continue;
        slots.push(slot);
      }
    }
  }
  return slots;
}

export function loadSettings(db: DB, defaultTimezone?: string): Settings {
  return { ...defaultSettings(defaultTimezone), ...(kvGet<Partial<Settings>>(db, 'settings') ?? {}) };
}
