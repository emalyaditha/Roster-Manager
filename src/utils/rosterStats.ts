import { RosterEntry, RosterStatusConfig } from '../types/roster';

const FALLBACK_WORK_CODES = ['RTD', 'NWD', 'Training', 'WFH', 'OT'];
export const LEAVE_CODES = ['LEAVE', 'Short Leave', 'Leave(Half)', 'ML'];
export const HOLIDAY_CODES = ['HOL', 'HOLIDAY'];

export interface RosterCycleStats {
  total: number;
  workingDays: number;
  daysOff: number;
  holidayDays: number;
  leaveDays: number;
  otShifts: number;
  otMorningHours: number;
  otNightHours: number;
  otTotalHours: number;
  changedCount: number;
}

export const isWorkDayStatus = (code: string, statuses: RosterStatusConfig[]): boolean => {
  const config = statuses.find((s) => s.code === code);
  if (config) return config.isWorkDay;
  return FALLBACK_WORK_CODES.includes(code) || (code || '').toUpperCase().startsWith('DOS');
};

export const hasOvertime = (e: RosterEntry): boolean =>
  e.ot || e.currentStatusId === 'OT' || (e.otMorningHours ?? 0) > 0 || (e.otNightHours ?? 0) > 0;

export function getStatusGroupCodes(
  group: 'duty' | 'dof' | 'hol' | 'leave',
  statuses: RosterStatusConfig[],
): string[] {
  switch (group) {
    case 'duty':
      return statuses.filter((s) => s.isWorkDay).map((s) => s.code);
    case 'dof':
      return statuses.filter((s) => s.code.toUpperCase().startsWith('DOF')).map((s) => s.code);
    case 'hol':
      return statuses.filter((s) => HOLIDAY_CODES.includes(s.code)).map((s) => s.code);
    case 'leave':
      return statuses.filter((s) => LEAVE_CODES.includes(s.code)).map((s) => s.code);
  }
}

export function computeRosterStats(
  entries: RosterEntry[],
  statuses: RosterStatusConfig[],
): RosterCycleStats {
  let workingDays = 0;
  let daysOff = 0;
  let holidayDays = 0;
  let leaveDays = 0;
  let otShifts = 0;
  let otMorningHours = 0;
  let otNightHours = 0;
  let changedCount = 0;

  entries.forEach((e) => {
    if (isWorkDayStatus(e.currentStatusId, statuses)) workingDays += 1;
    if ((e.currentStatusId || '').toUpperCase().startsWith('DOF')) daysOff += 1;
    if (HOLIDAY_CODES.includes(e.currentStatusId)) holidayDays += 1;
    if (LEAVE_CODES.includes(e.currentStatusId)) leaveDays += 1;
    if (hasOvertime(e)) otShifts += 1;
    otMorningHours += Number(e.otMorningHours ?? 0);
    otNightHours += Number(e.otNightHours ?? 0);
    if (e.originalStatusId !== e.currentStatusId) changedCount += 1;
  });

  return {
    total: entries.length,
    workingDays,
    daysOff,
    holidayDays,
    leaveDays,
    otShifts,
    otMorningHours,
    otNightHours,
    otTotalHours: otMorningHours + otNightHours,
    changedCount,
  };
}
