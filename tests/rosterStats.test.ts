import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { computeRosterStats, isWorkDayStatus, hasOvertime, getStatusGroupCodes } from '../src/utils/rosterStats';
import type { RosterEntry, RosterStatusConfig } from '../src/types/roster';

const STATUSES: RosterStatusConfig[] = [
  { code: 'RTD', displayName: 'RTD - Work on Roster', description: '', color: '', badgeBg: '', badgeText: '', badgeBorder: '', active: true, isWorkDay: true, calendarEventConfig: { isAllDay: true } },
  { code: 'NWD', displayName: 'NWD - Normal Working Day', description: '', color: '', badgeBg: '', badgeText: '', badgeBorder: '', active: true, isWorkDay: true, calendarEventConfig: { isAllDay: true } },
  { code: 'DOF', displayName: 'DOF - Day Off', description: '', color: '', badgeBg: '', badgeText: '', badgeBorder: '', active: true, isWorkDay: false, calendarEventConfig: { isAllDay: true } },
  { code: 'HOL', displayName: 'HOL - Holiday', description: '', color: '', badgeBg: '', badgeText: '', badgeBorder: '', active: true, isWorkDay: false, calendarEventConfig: { isAllDay: true } },
  { code: 'LEAVE', displayName: 'LEAVE - Annual Leave', description: '', color: '', badgeBg: '', badgeText: '', badgeBorder: '', active: true, isWorkDay: false, calendarEventConfig: { isAllDay: true } },
];

function entry(partial: Partial<RosterEntry>): RosterEntry {
  return {
    id: partial.id ?? Math.random().toString(36).slice(2),
    date: '2026-08-01',
    day: 'Saturday',
    originalStatusId: 'RTD',
    changedStatusId: null,
    currentStatusId: 'RTD',
    action: '',
    ot: false,
    googleCalendarSyncStatus: 'Not Synced',
    createdAt: '2026-08-01T00:00:00Z',
    updatedAt: '2026-08-01T00:00:00Z',
    ...partial,
  };
}

describe('computeRosterStats', () => {
  test('counts working days via isWorkDay config', () => {
    const stats = computeRosterStats(
      [entry({}), entry({ currentStatusId: 'NWD' }), entry({ currentStatusId: 'DOF' })],
      STATUSES,
    );
    assert.equal(stats.workingDays, 2);
    assert.equal(stats.daysOff, 1);
  });

  test('counts holidays, leaves, totals and changed', () => {
    const stats = computeRosterStats(
      [
        entry({}),
        entry({ originalStatusId: 'HOL', currentStatusId: 'HOL' }),
        entry({ originalStatusId: 'LEAVE', currentStatusId: 'LEAVE' }),
        entry({ originalStatusId: 'RTD', currentStatusId: 'DOF' }),
      ],
      STATUSES,
    );
    assert.equal(stats.total, 4);
    assert.equal(stats.holidayDays, 1);
    assert.equal(stats.leaveDays, 1);
    assert.equal(stats.changedCount, 1);
  });

  test('detects OT from flag, status, or hours', () => {
    const stats = computeRosterStats(
      [
        entry({ ot: true }),
        entry({ currentStatusId: 'OT' }),
        entry({ otMorningHours: 1.5 }),
        entry({}),
      ],
      STATUSES,
    );
    assert.equal(stats.otShifts, 3);
    assert.equal(stats.otTotalHours, 1.5);
  });
});

describe('isWorkDayStatus', () => {
  test('uses config flag when available', () => {
    assert.equal(isWorkDayStatus('RTD', STATUSES), true);
    assert.equal(isWorkDayStatus('DOF', STATUSES), false);
  });

  test('falls back to known codes when config missing', () => {
    assert.equal(isWorkDayStatus('Training', []), true);
    assert.equal(isWorkDayStatus('WFH', []), true);
    assert.equal(isWorkDayStatus('DOS(10.00)', []), true);
    assert.equal(isWorkDayStatus('HOL', []), false);
  });
});

describe('hasOvertime', () => {
  test('matches all OT signals', () => {
    assert.equal(hasOvertime(entry({ ot: true })), true);
    assert.equal(hasOvertime(entry({ currentStatusId: 'OT' })), true);
    assert.equal(hasOvertime(entry({ otNightHours: 2 })), true);
    assert.equal(hasOvertime(entry({})), false);
  });
});

describe('getStatusGroupCodes', () => {
  test('duty group returns all work-day codes', () => {
    const codes = getStatusGroupCodes('duty', STATUSES);
    assert.deepEqual(codes.sort(), ['NWD', 'RTD']);
  });

  test('dof/hol/leave groups resolve from config', () => {
    assert.deepEqual(getStatusGroupCodes('dof', STATUSES), ['DOF']);
    assert.deepEqual(getStatusGroupCodes('hol', STATUSES), ['HOL']);
    assert.deepEqual(getStatusGroupCodes('leave', STATUSES), ['LEAVE']);
  });
});
