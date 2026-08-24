import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseLocalDate,
  getDayOfWeekName,
  shiftMonthYear,
  getRosterCycleRange,
  getRosterCycleForDate,
} from '../src/utils/date';

describe('parseLocalDate', () => {
  test('parses YYYY-MM-DD as local midnight (no UTC shift)', () => {
    const d = parseLocalDate('2026-08-24');
    assert.equal(d.getFullYear(), 2026);
    assert.equal(d.getMonth(), 7); // August
    assert.equal(d.getDate(), 24);
  });
});

describe('getDayOfWeekName', () => {
  test('returns correct weekday names', () => {
    assert.equal(getDayOfWeekName('2026-08-24'), 'Monday');
    assert.equal(getDayOfWeekName('2026-08-01'), 'Saturday');
  });
});

describe('shiftMonthYear', () => {
  test('moves forward and backward across year boundaries', () => {
    assert.equal(shiftMonthYear('2026-01', -1), '2025-12');
    assert.equal(shiftMonthYear('2026-12', 1), '2027-01');
    assert.equal(shiftMonthYear('2026-08', -6), '2026-02');
  });
});

describe('getRosterCycleRange', () => {
  test('cycle labeled YYYY-MM runs 16th of that month to 15th of next', () => {
    const range = getRosterCycleRange('2026-08');
    assert.equal(range.startDate, '2026-08-16');
    assert.equal(range.endDate, '2026-09-15');
  });
});

describe('getRosterCycleForDate', () => {
  test('date on the 16th belongs to the current month cycle', () => {
    assert.equal(getRosterCycleForDate(new Date(2026, 7, 16)), '2026-08');
  });

  test('date on the 15th belongs to the previous month cycle', () => {
    assert.equal(getRosterCycleForDate(new Date(2026, 7, 15)), '2026-07');
  });
});
