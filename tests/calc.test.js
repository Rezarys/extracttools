'use strict';
const test = require('node:test');
const assert = require('node:assert');
const C = require('../docs/calc.js');

const NOW = new Date(2026, 9, 3, 12, 0); // October 3, 2026, local time

test('number parsing accepts separators and rejects junk', () => {
  assert.strictEqual(C.num('250,000'), 250000);
  assert.strictEqual(C.num('250 000'), 250000);
  assert.strictEqual(C.num('2.5'), 2.5);
  assert.ok(Number.isNaN(C.num('12abc')));
  assert.ok(Number.isNaN(C.num('')));
});

test('days left counts calendar days before the wipe day', () => {
  assert.strictEqual(C.daysLeft(NOW, new Date(2026, 9, 15)), 12);
  assert.strictEqual(C.daysLeft(new Date(2026, 9, 14, 23, 59), new Date(2026, 9, 15)), 1);
  assert.strictEqual(C.daysLeft(new Date(2026, 9, 15, 0, 1), new Date(2026, 9, 15)), 0);
});

test('parseDay rejects impossible dates', () => {
  assert.ok(C.parseDay('2026-10-15'));
  assert.strictEqual(C.parseDay('2026-02-31'), null);
  assert.strictEqual(C.parseDay('15/10/2026'), null);
});

test('by XP: the review arithmetic, 15 matches of 5,000 XP', () => {
  const r = C.byXp({ currentXp: '0', targetXp: '75000', xpPerMatch: '5000', matchMinutes: '60',
    hoursPerDay: '2', wipeDay: '2026-10-15', now: NOW });
  assert.strictEqual(r.matches, 15);
  assert.strictEqual(r.hours, 15);
  assert.strictEqual(r.playDays, 8);
  assert.strictEqual(r.daysLeft, 12);
  assert.strictEqual(r.beforeWipe, true);
  assert.strictEqual(C.fmtDay(r.reachDay), 'Oct 10, 2026');
});

test('by XP: a partial match still counts as a whole match', () => {
  const r = C.byXp({ currentXp: '1', targetXp: '10001', xpPerMatch: '3000', matchMinutes: '45',
    hoursPerDay: '1', wipeDay: '2026-10-15', now: NOW });
  assert.strictEqual(r.matches, 4);
  assert.strictEqual(r.hours, 3);
});

test('by XP: already there means zero time', () => {
  const r = C.byXp({ currentXp: '90000', targetXp: '75000', xpPerMatch: '5000', matchMinutes: '60',
    hoursPerDay: '2', wipeDay: '2026-10-15', now: NOW });
  assert.strictEqual(r.xpLeft, 0);
  assert.strictEqual(r.hours, 0);
  assert.strictEqual(r.beforeWipe, true);
});

test('by pace: halfway after 40 hours, not before the wipe at 2 hours a day', () => {
  const r = C.byPace({ hoursPlayed: '40', percentDone: '50', hoursPerDay: '2', wipeDay: '2026-10-15', now: NOW });
  assert.strictEqual(r.hours, 40);
  assert.strictEqual(r.totalHours, 80);
  assert.strictEqual(r.beforeWipe, false);
  assert.ok(Math.abs(r.hoursPerDayNeeded - 40 / 12) < 1e-9);
  const lines = C.describe(r);
  assert.match(lines[lines.length - 1], /^Not before the wipe at this rate: 12 days left give you 24 h\. You would need 3\.3 h per day\.$/);
});

test('by pace: enough hours per day makes it', () => {
  const r = C.byPace({ hoursPlayed: '40', percentDone: '55', hoursPerDay: '4', wipeDay: '2026-10-15', now: NOW });
  assert.strictEqual(r.beforeWipe, true);
  assert.strictEqual(r.playDays, 9);
});

test('a past wipe date says so instead of a verdict', () => {
  const r = C.byPace({ hoursPlayed: '10', percentDone: '50', hoursPerDay: '2', wipeDay: '2026-10-01', now: NOW });
  assert.strictEqual(r.beforeWipe, false);
  assert.strictEqual(r.daysLeft, 0);
  assert.match(C.describe(r).join(' '), /today or past/);
});

test('every invalid field gets its own message', () => {
  const base = { currentXp: '0', targetXp: '1000', xpPerMatch: '100', matchMinutes: '30', hoursPerDay: '2',
    wipeDay: '2026-10-15', now: NOW };
  const bad = { currentXp: 'x', targetXp: '-1', xpPerMatch: '0', matchMinutes: '0', hoursPerDay: '25',
    wipeDay: 'soon' };
  for (const k of Object.keys(bad)) {
    const r = C.byXp(Object.assign({}, base, { [k]: bad[k] }));
    assert.strictEqual(r.error, k);
    assert.ok(C.describe(r)[0].length > 10);
  }
  assert.strictEqual(C.byPace({ hoursPlayed: '10', percentDone: '0', hoursPerDay: '2', wipeDay: '2026-10-15' }).error,
    'percentDone');
  assert.strictEqual(C.byPace({ hoursPlayed: '0', percentDone: '10', hoursPerDay: '2', wipeDay: '2026-10-15' }).error,
    'hoursPlayed');
});

test('hours format', () => {
  assert.strictEqual(C.fmtHours(0.5), '30 min');
  assert.strictEqual(C.fmtHours(33.333), '33.3 h');
  assert.strictEqual(C.fmtHours(1234), '1,234 h');
});
