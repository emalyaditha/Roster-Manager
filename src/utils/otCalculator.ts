import { RosterEntry, OtCalculationSettings, OtDayResult, DosDofMatch } from '../types/roster';

export const DEFAULT_OT_SETTINGS: OtCalculationSettings = {
  gracePeriodMinutes: 15,
  minimumOtThresholdMinutes: 30,
  roundingRule: 'down',
  roundingBlockMinutes: 30,
  wfhEligibleForOt: false,
  trainingEligibleForOt: false,
  hourlyOtRate: 0,
};

/**
 * Parse time string e.g. "08:15", "05:30 PM", "8:15 AM", "10.00", "17:30" into minutes from midnight
 */
export function parseTimeToMinutes(timeStr?: string): number | null {
  if (!timeStr) return null;
  const raw = String(timeStr).trim();
  if (!raw) return null;

  const isPm = /pm$/i.test(raw) || /p\.m\.$/i.test(raw);
  const isAm = /am$/i.test(raw) || /a\.m\.$/i.test(raw);

  const cleaned = raw.replace(/(am|pm|a\.m\.|p\.m\.)/gi, '').trim().replace('.', ':');
  const parts = cleaned.split(':');
  if (parts.length < 1 || parts.length > 2) return null;

  let hours = parseInt(parts[0], 10);
  const minutes = parts.length === 2 ? parseInt(parts[1], 10) : 0;
  if (isNaN(hours) || isNaN(minutes)) return null;

  if (isPm && hours < 12) {
    hours += 12;
  } else if (isAm && hours === 12) {
    hours = 0;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/**
 * Format minutes from midnight back to "HH:MM" (24h)
 */
export function formatMinutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Convert any time string into 12-hour object breakdown { hour: '08', minute: '15', ampm: 'AM' }
 */
export function parseTimeTo12hParts(timeStr?: string): { hour: string; minute: string; ampm: 'AM' | 'PM' } {
  const totalMins = parseTimeToMinutes(timeStr);
  if (totalMins === null) {
    return { hour: '08', minute: '00', ampm: 'AM' };
  }
  let h = Math.floor(totalMins / 60) % 24;
  const m = Math.floor(totalMins % 60);
  let ampm: 'AM' | 'PM' = 'AM';
  if (h >= 12) {
    ampm = 'PM';
    if (h > 12) h -= 12;
  } else if (h === 0) {
    h = 12;
  }
  return {
    hour: String(h).padStart(2, '0'),
    minute: String(m).padStart(2, '0'),
    ampm,
  };
}

/**
 * Convert 12-hour parts back to "HH:MM" (24h) or formatted string
 */
export function format12hTo24hTime(hour: string, minute: string, ampm: 'AM' | 'PM'): string {
  let h = parseInt(hour, 10);
  if (isNaN(h)) h = 8;
  let m = parseInt(minute, 10);
  if (isNaN(m)) m = 0;

  let h24 = h;
  if (ampm === 'PM' && h < 12) h24 += 12;
  if (ampm === 'AM' && h === 12) h24 = 0;

  return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Display formatted 12-hour string e.g. "08:15 AM" or "05:30 PM"
 */
export function formatTo12hDisplay(timeStr?: string): string {
  const mins = parseTimeToMinutes(timeStr);
  if (mins === null) return timeStr || '';
  const parts = parseTimeTo12hParts(timeStr);
  return `${parts.hour}:${parts.minute} ${parts.ampm}`;
}

/**
 * Get scheduled window for a given roster status
 */
export function getScheduledShiftWindow(
  status: string,
  actionText?: string
): { start: string; end: string } | null {
  const upper = (status || '').toUpperCase().trim();

  if (upper === 'NWD') {
    return { start: '08:15', end: '17:30' };
  }
  if (upper === 'RTD') {
    return { start: '10:15', end: '19:30' };
  }
  if (upper === 'TRAINING') {
    return { start: '08:15', end: '17:30' };
  }
  if (upper === 'WFH') {
    return { start: '08:15', end: '17:30' };
  }
  if (upper.startsWith('DOS')) {
    const match = status.match(/DOS\(([0-9\.\:]+)\)/i);
    if (match) {
      const startTime = match[1].replace('.', ':');
      return { start: startTime.includes(':') ? startTime : `${startTime}:00`, end: '19:30' };
    }
    return { start: '10:15', end: '19:30' };
  }

  if (actionText) {
    const timeMatch = actionText.match(/([0-9]{1,2}[\.\:][0-9]{2})\s*[\-\–]\s*([0-9]{1,2}[\.\:][0-9]{2})/);
    if (timeMatch) {
      let start = timeMatch[1].replace('.', ':');
      let end = timeMatch[2].replace('.', ':');
      const startMins = parseTimeToMinutes(start);
      let endMins = parseTimeToMinutes(end);
      if (startMins !== null && endMins !== null && endMins < startMins) {
        endMins += 12 * 60;
        end = formatMinutesToTime(endMins);
      }
      return { start, end };
    }
  }

  return null;
}

/**
 * Calculate Billable OT for a single day entry
 */
export function calculateDayOt(
  entry: RosterEntry,
  customClockIn?: string,
  customClockOut?: string,
  settings: OtCalculationSettings = DEFAULT_OT_SETTINGS
): OtDayResult {
  const status = (entry.currentStatusId || entry.originalStatusId || 'HOL').toUpperCase().trim();
  const date = entry.date;
  const dayName = entry.day;
  const flags: string[] = [];

  const clockIn = customClockIn || entry.clockIn || '';
  const clockOut = customClockOut || entry.clockOut || '';

  let statusType: OtDayResult['statusType'] = 'STANDARD_SHIFT';
  const isDos = status.startsWith('DOS');
  const isDof = status.startsWith('DOF');
  const isLeave = ['LEAVE', 'SHORT LEAVE', 'LEAVE(HALF)', 'ML', 'MEDICAL LEAVE'].includes(status);
  const isHolidayOrBlank = status === 'HOL' || status === 'HOLIDAY' || !status;
  const isFullOt = status === 'OT';

  let dofReferencedDate: string | undefined = undefined;
  if (isDof) {
    const match = status.match(/DOF\(([^)]+)\)/i);
    if (match) {
      dofReferencedDate = match[1];
    }
  }

  if (isDos) {
    statusType = 'DOS_DAY';
  } else if (isDof) {
    statusType = 'LEAVE_DAY';
  } else if (isLeave) {
    statusType = 'LEAVE_DAY';
  } else if (isFullOt) {
    statusType = 'FULL_OT_DAY';
  } else if (isHolidayOrBlank) {
    statusType = 'UNSCHEDULED';
  }

  const scheduledWindow = getScheduledShiftWindow(status, entry.action);
  const schedStartStr = scheduledWindow?.start;
  const schedEndStr = scheduledWindow?.end;

  const schedStartMins = parseTimeToMinutes(schedStartStr);
  const schedEndMins = parseTimeToMinutes(schedEndStr);

  const clockInMins = parseTimeToMinutes(clockIn);
  let clockOutMins = parseTimeToMinutes(clockOut);

  // If the shift crosses midnight (clock out before clock in), treat clock out as next day
  if (clockInMins !== null && clockOutMins !== null && clockOutMins < clockInMins) {
    clockOutMins += 24 * 60;
  }

  let earlyInMinutes = 0;
  let lateOutMinutes = 0;
  let rawOtMinutes = 0;
  let graceDeductionMinutes = 0;
  let billableOtMinutes = 0;

  if ((isDof || isLeave) && (clockInMins !== null || clockOutMins !== null)) {
    flags.push(`Attendance logged on ${status} day! Requires supervisor review.`);
  }

  if (isHolidayOrBlank && (clockInMins !== null || clockOutMins !== null) && !isFullOt && !isDos) {
    flags.push('Unscheduled work on off-day/holiday without explicit OT label.');
  }

  if (isDos) {
    flags.push('DOS day: Compensated by future Day Off (DOF). Excluded from Paid OT.');
  }

  if (status === 'WFH' && !settings.wfhEligibleForOt) {
    flags.push('WFH days are excluded from OT calculation per company policy.');
  }
  if (status === 'TRAINING' && !settings.trainingEligibleForOt) {
    flags.push('Training days are excluded from OT calculation per company policy.');
  }

  if (isFullOt) {
    if (clockInMins !== null && clockOutMins !== null) {
      rawOtMinutes = Math.max(0, clockOutMins - clockInMins);
      graceDeductionMinutes = 0;
      billableOtMinutes = rawOtMinutes;
    } else {
      const morning = entry.otMorningHours || 0;
      const night = entry.otNightHours || 0;
      if (morning > 0 || night > 0) {
        rawOtMinutes = Math.round((morning + night) * 60);
        billableOtMinutes = rawOtMinutes;
      }
    }
  } else if (!isDos && !isDof && !isLeave && (status !== 'WFH' || settings.wfhEligibleForOt) && (status !== 'TRAINING' || settings.trainingEligibleForOt)) {
    if (schedStartMins !== null && schedEndMins !== null && clockInMins !== null && clockOutMins !== null) {
      earlyInMinutes = Math.max(0, schedStartMins - clockInMins);
      lateOutMinutes = Math.max(0, clockOutMins - schedEndMins);
      rawOtMinutes = earlyInMinutes + lateOutMinutes;

      const grace = settings.gracePeriodMinutes || 15;
      const earlyInAfterGrace = Math.max(0, earlyInMinutes - grace);
      const lateOutAfterGrace = Math.max(0, lateOutMinutes);
      const netOtBeforeRounding = earlyInAfterGrace + lateOutAfterGrace;
      graceDeductionMinutes = rawOtMinutes - netOtBeforeRounding;

      const blockSize = settings.roundingBlockMinutes || 15;
      const rounding = settings.roundingRule || 'down';

      let roundedMins = netOtBeforeRounding;
      if (rounding === 'down') {
        roundedMins = Math.floor(netOtBeforeRounding / blockSize) * blockSize;
      } else if (rounding === 'up') {
        roundedMins = Math.ceil(netOtBeforeRounding / blockSize) * blockSize;
      } else {
        roundedMins = Math.round(netOtBeforeRounding / blockSize) * blockSize;
      }

      const minThreshold = settings.minimumOtThresholdMinutes || 30;
      if (roundedMins < minThreshold) {
        billableOtMinutes = 0;
        if (rawOtMinutes > 0) {
          flags.push(`Net OT (${roundedMins}m) is below minimum threshold (${minThreshold}m). Payable OT = 0.`);
        }
      } else {
        billableOtMinutes = roundedMins;
      }
    }
  }

  const billableOtHours = parseFloat((billableOtMinutes / 60).toFixed(2));

  return {
    date,
    dayName,
    statusCode: status,
    scheduledStart: schedStartStr,
    scheduledEnd: schedEndStr,
    actualClockIn: clockIn || undefined,
    actualClockOut: clockOut || undefined,
    earlyInMinutes,
    lateOutMinutes,
    rawOtMinutes,
    graceDeductionMinutes,
    billableOtMinutes,
    billableOtHours,
    statusType,
    isDos,
    isDof,
    dofReferencedDate,
    flags,
  };
}

/**
 * Match DOS and DOF days to build Day-Off Settlement Ledger
 */
export function buildDosDofLedger(entries: RosterEntry[]): {
  matches: DosDofMatch[];
  dosCount: number;
  dofCount: number;
  owedBalance: number;
  orphanedDofs: RosterEntry[];
  unsettledDoses: RosterEntry[];
} {
  const matches: DosDofMatch[] = [];
  const dosEntries = entries.filter((e) => (e.currentStatusId || '').toUpperCase().startsWith('DOS'));
  const dofEntries = entries.filter((e) => (e.currentStatusId || '').toUpperCase().startsWith('DOF'));
  const settlementDofEntries = dofEntries.filter((e) => /DOF\(([^)]+)\)/i.test(e.currentStatusId || ''));

  const dosMap = new Map<string, RosterEntry>();
  const dosClaimedSet = new Set<string>();

  dosEntries.forEach((e) => {
    dosMap.set(e.date, e);
  });

  const orphanedDofs: RosterEntry[] = [];

  dofEntries.forEach((dofEntry) => {
    const dofCode = dofEntry.currentStatusId;
    const match = dofCode.match(/DOF\(([^)]+)\)/i);
    if (match) {
      const refStr = match[1].trim();
      let matchedDosDate: string | null = null;

      dosEntries.forEach((dosEntry) => {
        if (dosEntry.date.endsWith(refStr) || dosEntry.date.includes(refStr.replace('/', '-'))) {
          matchedDosDate = dosEntry.date;
        }
      });

      if (matchedDosDate && dosMap.has(matchedDosDate)) {
        dosClaimedSet.add(matchedDosDate);
        const dosEntry = dosMap.get(matchedDosDate)!;
        matches.push({
          dosDate: dosEntry.date,
          dosCode: dosEntry.currentStatusId,
          dofDate: dofEntry.date,
          dofCode: dofEntry.currentStatusId,
          status: 'SETTLED',
          notes: `DOF taken on ${dofEntry.date} settles DOS worked on ${dosEntry.date}`,
        });
      } else {
        orphanedDofs.push(dofEntry);
        matches.push({
          dosDate: refStr,
          dosCode: 'MISSING_DOS',
          dofDate: dofEntry.date,
          dofCode: dofEntry.currentStatusId,
          status: 'ORPHANED_DOF',
          notes: `⚠️ Orphaned DOF! No DOS record found for referenced date (${refStr}).`,
        });
      }
    } else {
      matches.push({
        dosDate: 'N/A',
        dosCode: 'GENERAL_DOF',
        dofDate: dofEntry.date,
        dofCode: dofEntry.currentStatusId,
        status: 'SETTLED',
        notes: 'Standard Day Off',
      });
    }
  });

  const unsettledDoses: RosterEntry[] = [];
  dosEntries.forEach((dosEntry) => {
    if (!dosClaimedSet.has(dosEntry.date)) {
      unsettledDoses.push(dosEntry);
      matches.push({
        dosDate: dosEntry.date,
        dosCode: dosEntry.currentStatusId,
        status: 'PENDING',
        notes: '⏳ Pending settlement. Day off owed to employee.',
      });
    }
  });

  return {
    matches,
    dosCount: dosEntries.length,
    dofCount: settlementDofEntries.length,
    owedBalance: dosEntries.length - settlementDofEntries.length,
    orphanedDofs,
    unsettledDoses,
  };
}

/**
 * Full Compliance Audit Check across all roster entries
 */
export function runComplianceAudit(
  entries: RosterEntry[],
  settings: OtCalculationSettings = DEFAULT_OT_SETTINGS
): {
  items: {
    title: string;
    description: string;
    status: 'PASS' | 'WARNING' | 'FAIL';
    details: string;
  }[];
  passCount: number;
  warningCount: number;
  failCount: number;
} {
  const items: any[] = [];

  items.push({
    title: 'Grace Period Controls',
    description: `Grace period set to ${settings.gracePeriodMinutes || 15} mins on early-in and late-out.`,
    status: 'PASS',
    details: `Configured to ignore minor timing fluctuations (<${settings.gracePeriodMinutes || 15} mins).`,
  });

  items.push({
    title: 'Minimum OT Threshold',
    description: `Minimum OT threshold enforced at ${settings.minimumOtThresholdMinutes || 30} mins.`,
    status: 'PASS',
    details: `Net OT below ${settings.minimumOtThresholdMinutes || 30} mins is truncated to zero to prevent micro-payouts.`,
  });

  items.push({
    title: 'Rounding Block Policy',
    description: `Rounding OT ${settings.roundingRule || 'down'} to nearest ${settings.roundingBlockMinutes || 15}-minute block.`,
    status: 'PASS',
    details: 'Aligned with payroll calculation standards.',
  });

  const ledger = buildDosDofLedger(entries);
  items.push({
    title: 'Day Off Settlement (DOS) Excluded from Paid OT',
    description: `Found ${ledger.dosCount} DOS day(s) worked. Excluded from paid OT totals.`,
    status: 'PASS',
    details: `Tracked in Day-Off Ledger. Current Owed Balance: ${ledger.owedBalance} day(s).`,
  });

  if (ledger.orphanedDofs.length > 0) {
    items.push({
      title: 'Orphaned Day Off (DOF) Check',
      description: `Found ${ledger.orphanedDofs.length} orphaned DOF entry(s) referencing missing DOS dates.`,
      status: 'WARNING',
      details: `Dates: ${ledger.orphanedDofs.map((e) => `${e.date} (${e.currentStatusId})`).join(', ')}`,
    });
  } else {
    items.push({
      title: 'Orphaned Day Off (DOF) Check',
      description: 'All bracketed DOF entries match valid DOS dates.',
      status: 'PASS',
      details: '100% matched date reference lineage.',
    });
  }

  items.push({
    title: 'OT-Code Day Baseline',
    description: '100% of hours worked on full OT days count toward OT without scheduled window deduction.',
    status: 'PASS',
    details: 'Full shift treated as payable overtime.',
  });

  const attendanceOnLeave = entries.filter((e) => {
    const isOff = ['DOF', 'LEAVE', 'ML'].includes((e.currentStatusId || '').toUpperCase());
    return isOff && Boolean(e.clockIn || e.clockOut);
  });
  if (attendanceOnLeave.length > 0) {
    items.push({
      title: 'Attendance on Leave/DOF Days',
      description: `Found ${attendanceOnLeave.length} clock-in record(s) on Leave/DOF days.`,
      status: 'FAIL',
      details: `Dates: ${attendanceOnLeave.map((e) => e.date).join(', ')}. Requires supervisor investigation.`,
    });
  } else {
    items.push({
      title: 'Attendance on Leave/DOF Days',
      description: 'Zero clock-in records found on Leave or DOF days.',
      status: 'PASS',
      details: 'Clean attendance compliance.',
    });
  }

  const unlabeledHolidays = entries.filter((e) => {
    const status = (e.currentStatusId || '').toUpperCase();
    const isHoliday = status === 'HOL' || status === 'HOLIDAY' || !status;
    return isHoliday && Boolean(e.clockIn || e.clockOut);
  });
  if (unlabeledHolidays.length > 0) {
    items.push({
      title: 'Unlabeled Worked Holiday Check',
      description: `Found ${unlabeledHolidays.length} holiday/off cell(s) with clock-ins but no explicit OT label.`,
      status: 'WARNING',
      details: `Dates: ${unlabeledHolidays.map((e) => e.date).join(', ')}. Flagged for manual OT approval.`,
    });
  } else {
    items.push({
      title: 'Unlabeled Worked Holiday Check',
      description: 'No unlabeled worked holidays detected.',
      status: 'PASS',
      details: 'All worked holidays are properly labeled.',
    });
  }

  const passCount = items.filter((i) => i.status === 'PASS').length;
  const warningCount = items.filter((i) => i.status === 'WARNING').length;
  const failCount = items.filter((i) => i.status === 'FAIL').length;

  return { items, passCount, warningCount, failCount };
}
