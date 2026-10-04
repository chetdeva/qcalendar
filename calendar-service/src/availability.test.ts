import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeSlots, defaultSettings, zonedTimeToUtcMs } from './availability.ts';

test('wall-clock times convert across daylight saving changes', () => {
  assert.equal(zonedTimeToUtcMs('2026-03-07', '09:00', 'America/New_York'), Date.UTC(2026, 2, 7, 14)); // EST, UTC-5
  assert.equal(zonedTimeToUtcMs('2026-03-08', '09:00', 'America/New_York'), Date.UTC(2026, 2, 8, 13)); // the day clocks spring forward: EDT, UTC-4
  assert.equal(zonedTimeToUtcMs('2026-11-01', '09:00', 'America/New_York'), Date.UTC(2026, 10, 1, 14)); // the day clocks fall back
  assert.equal(zonedTimeToUtcMs('2030-01-07', '09:00', 'Asia/Kolkata'), Date.UTC(2030, 0, 7, 3, 30));
});

test('slots follow working hours and keep a buffer around busy time', () => {
  const settings = { ...defaultSettings('America/New_York'), slotStepMinutes: 60, bufferMinutes: 30 };
  const nine = zonedTimeToUtcMs('2030-01-07', '09:00', settings.timezone);
  const slots = computeSlots({ fromMs: nine - 3_600_000, toMs: nine + 86_400_000, nowMs: 0, durationMin: 60, settings, busy: [{ start: nine + 3_600_000, end: nine + 7_200_000 }] });
  assert.equal(slots.length, 5);
  assert.equal(slots[0].start, nine + 3 * 3_600_000, 'the buffer removes 9:00, 10:00 and 11:00');
});

test('weekends and days with no hours produce no slots; the past is never offered', () => {
  const s = defaultSettings('UTC');
  const sat = Date.UTC(2030, 0, 5);
  assert.equal(computeSlots({ fromMs: sat, toMs: sat + 2 * 86_400_000, nowMs: 0, durationMin: 60, settings: s, busy: [] }).length, 0);
  const mon = Date.UTC(2030, 0, 7);
  assert.equal(computeSlots({ fromMs: mon, toMs: mon + 86_400_000, nowMs: mon + 16.5 * 3_600_000, durationMin: 60, settings: s, busy: [] }).length, 0, 'at 16:30 no one-hour slot fits before 17:00');
  assert.equal(computeSlots({ fromMs: mon, toMs: mon + 86_400_000, nowMs: mon + 16 * 3_600_000, durationMin: 60, settings: s, busy: [] }).length, 1, 'a slot starting right now is still offered');
  assert.equal(computeSlots({ fromMs: mon, toMs: mon + 86_400_000, nowMs: 0, durationMin: 60, settings: s, busy: [] }).length, 15);
});
