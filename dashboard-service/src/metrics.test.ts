import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AQ_TAG, aq, dueLabel, gradedLabel, growth, letter, mastery, points, startsIn, streak, tier } from './metrics.ts';

const NOW = new Date('2030-03-15T10:00:00Z');

test('streak counts consecutive active days back from today, or from yesterday when today is still empty', () => {
  assert.equal(streak(['2030-03-15', '2030-03-14', '2030-03-13'], NOW), 3);
  assert.equal(streak(['2030-03-14', '2030-03-13'], NOW), 2); // nothing yet today: yesterday still counts
  assert.equal(streak(['2030-03-12', '2030-03-11'], NOW), 0); // a gap of a full day breaks it
  assert.equal(streak(['2030-03-15', '2030-03-13'], NOW), 1); // a missing middle day ends the run
  assert.equal(streak([], NOW), 0);
  const lateUtc = new Date('2030-03-15T23:30:00Z'); // already 16 March in India
  assert.equal(streak(['2030-03-16'], lateUtc, 'Asia/Kolkata'), 1);
  assert.equal(streak(['2030-03-16'], lateUtc, 'UTC'), 0); // the same day list means nothing in UTC, where it is still the 15th
});

test('points add up the XP of graded tasks', () => {
  assert.equal(points([{ xp: 120 }, { xp: 60 }]), 180);
  assert.equal(points([]), 0);
});

test('mastery averages the last ten scores only, and is null with none', () => {
  assert.equal(mastery([100, 90, 80]), 90);
  assert.equal(mastery([]), null);
  assert.equal(mastery([...Array(10).fill(100), 0, 0]), 100); // the two older zeros are outside the window
});

test('AQ is half resilience tags, half hand-in rate, over the last ten', () => {
  assert.equal(aq([], []), null); // nothing assigned yet
  assert.equal(aq([[AQ_TAG], [AQ_TAG]], [true, true]), 100);
  assert.equal(aq([[AQ_TAG], []], [true, true]), 75); // half tagged, all handed in
  assert.equal(aq([], [true, false, false, false]), 13); // nothing graded yet: only the hand-in half counts (0.5 x 0.25)
  assert.equal(aq([[]], [false]), 0);
  assert.equal(aq(Array(10).fill([AQ_TAG]).concat(Array(5).fill([])), Array(10).fill(true).concat(Array(5).fill(false))), 100); // only the newest ten
});

test('tiers: 80+, 60 to 79, below 60, and a friendly start', () => {
  assert.equal(tier(80).label, 'High Resilience');
  assert.equal(tier(79).label, 'Growing Steadily');
  assert.equal(tier(60).label, 'Growing Steadily');
  assert.equal(tier(59).label, 'Building Confidence');
  assert.equal(tier(null).label, 'Just getting started');
});

test('letter grades and growth', () => {
  assert.deepEqual([98, 95, 91, 85, 82, 75, 40].map(letter), ['A+', 'A', 'A-', 'B', 'B-', 'C', 'D']);
  assert.equal(growth([80, 90], [70, 70]), 15);
  assert.equal(growth([], [70]), null);
  assert.equal(growth([70], []), null);
});

test('labels: graded, due and starts-in', () => {
  const ago = (ms: number) => new Date(NOW.getTime() - ms);
  assert.equal(gradedLabel(ago(60_000), NOW), 'Graded just now');
  assert.equal(gradedLabel(ago(5 * 3_600_000), NOW), 'Graded today');
  assert.equal(gradedLabel(ago(30 * 3_600_000), NOW), 'Graded yesterday');
  assert.equal(gradedLabel(ago(3 * 86_400_000), NOW), 'Graded 3 days ago');
  assert.equal(gradedLabel(ago(9 * 86_400_000), NOW), 'Graded last week');
  assert.equal(gradedLabel(ago(21 * 86_400_000), NOW), 'Graded 3 weeks ago');
  assert.deepEqual(dueLabel('2030-03-14', NOW), { label: 'Overdue', tone: 'warn' });
  assert.deepEqual(dueLabel('2030-03-15', NOW), { label: 'Due Today', tone: 'warn' });
  assert.deepEqual(dueLabel('2030-03-16', NOW), { label: 'Due Tomorrow', tone: 'warn' });
  assert.deepEqual(dueLabel('2030-03-28', NOW), { label: 'Due Mar 28', tone: 'plain' });
  assert.equal(startsIn(new Date('2030-03-15T10:25:00Z'), NOW), 'Live in 25 mins');
  assert.equal(startsIn(new Date('2030-03-15T10:00:00Z'), NOW), 'Live now');
  assert.equal(startsIn(new Date('2030-03-15T11:35:00Z'), NOW), 'In 1 hr 35 mins');
  assert.equal(startsIn(new Date('2030-03-16T09:00:00Z'), NOW), 'Tomorrow');
  assert.equal(startsIn(new Date('2030-03-19T09:00:00Z'), NOW), 'Tuesday');
});
