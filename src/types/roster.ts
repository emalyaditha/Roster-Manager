export type RosterStatusCode =
  | 'RTD'
  | 'OT'
  | 'DOS'
  | 'DOF'
  | 'Training'
  | 'WFH'
  | 'LEAVE'
  | 'Short Leave'
  | 'Leave(Half)'
  | 'ML'
  | string;

export interface RosterStatusConfig {
  code: RosterStatusCode;
  displayName: string;
  description: string;
  color: string; // Hex code or label color
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  active: boolean;
  isWorkDay: boolean;
  calendarEventConfig: {
    isAllDay: boolean;
    startTime?: string; // e.g. "10:15"
    endTime?: string;   // e.g. "19:30"
    titlePrefix?: string;
  };
}

export interface RosterEntry {
  id: string;
  date: string; // YYYY-MM-DD
  day: string; // e.g. "Monday"
  originalStatusId: string; // RTD, DOF, etc. MUST NEVER BE OVERWRITTEN
  changedStatusId: string | null; // New value if changed
  currentStatusId: string; // Active effective value
  action: string; // Action / Reason
  notes?: string;
  ot: boolean; // OT status
  clockIn?: string; // e.g. "08:00"
  clockOut?: string; // e.g. "18:00"
  otMorningHours?: number; // Morning OT hours
  otNightHours?: number; // Night OT hours
  googleCalendarSyncStatus: 'Synced' | 'Syncing' | 'Sync Failed' | 'Not Synced';
  googleCalendarEventId?: string;
  calendarSyncError?: string;
  createdAt: string;
  updatedAt: string;
  lastChangedBy?: string;
}

export interface RosterChangeHistory {
  id: string;
  rosterEntryId: string;
  date: string;
  previousStatusId: string;
  newStatusId: string;
  previousAction: string;
  newAction: string;
  reason: string;
  user: string;
  timestamp: string;
  googleCalendarEventId?: string;
  googleCalendarSyncResult?: string;
}

export interface GoogleCalendarInfo {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
}

export interface OtCalculationSettings {
  gracePeriodMinutes: number; // e.g., 15 mins
  minimumOtThresholdMinutes: number; // e.g., 30 mins
  roundingRule: 'down' | 'nearest' | 'up';
  roundingBlockMinutes: 15 | 30;
  wfhEligibleForOt: boolean;
  trainingEligibleForOt: boolean;
  hourlyOtRate?: number;
}

export interface DayClockRecord {
  clockIn?: string; // e.g. "08:00"
  clockOut?: string; // e.g. "18:00"
  notes?: string;
}

export interface OtDayResult {
  date: string;
  dayName: string;
  statusCode: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  actualClockIn?: string;
  actualClockOut?: string;
  earlyInMinutes: number;
  lateOutMinutes: number;
  rawOtMinutes: number;
  graceDeductionMinutes: number;
  billableOtMinutes: number;
  billableOtHours: number;
  statusType: 'STANDARD_SHIFT' | 'FULL_OT_DAY' | 'DOS_DAY' | 'LEAVE_DAY' | 'ANOMALY_DAY' | 'UNSCHEDULED';
  isDos: boolean;
  isDof: boolean;
  dofReferencedDate?: string;
  flags: string[];
}

export interface DosDofMatch {
  dosDate: string;
  dosCode: string;
  dofDate?: string;
  dofCode?: string;
  status: 'SETTLED' | 'PENDING' | 'ORPHANED_DOF';
  notes?: string;
}

export interface AppSettings {
  userName: string;
  timezone: string; // Default: 'Asia/Colombo'
  workingHours: {
    start: string; // '10:15'
    end: string;   // '19:30'
  };
  otCalculationSettings: OtCalculationSettings;
  googleCalendar: {
    connected: boolean;
    accountEmail?: string;
    selectedCalendarId?: string;
    selectedCalendarName?: string;
    autoSync: boolean;
    clientId?: string;
  };
  notifications: {
    enabled: boolean;
    rosterChanges: boolean;
    syncErrors: boolean;
    upcomingLeave: boolean;
  };
  theme: 'light' | 'dark' | 'system';
  allowedEmails?: string[];
}

export interface RosterFilterState {
  searchQuery: string;
  dateRange: {
    start: string;
    end: string;
  };
  currentStatus: string;
  originalStatus: string;
  changedOnly: boolean;
  otOnly: boolean;
  syncStatus: string;
  monthYear: string; // e.g. "2026-08"
}

export interface ImportPreviewItem {
  id: string;
  rowNumber: number;
  date: string;
  day: string;
  originalStatus: string;
  changedStatus: string;
  action: string;
  ot: boolean;
  isValid: boolean;
  errorMessages: string[];
}

export interface ImportHistoryRecord {
  id: string;
  filename: string;
  uploadTimestamp: string;
  user: string;
  rowCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  dateRange: string;
  fileHash: string;
  employeeName?: string;
  sheetName?: string;
  status: 'Successful' | 'Partial' | 'Failed';
}

export interface ImportOptions {
  replaceExistingOriginal?: boolean;
  preserveChangedRoster?: boolean;
  employeeName?: string;
  filename?: string;
  fileHash?: string;
}

export interface RosterSummary {
  totalDays: number;
  workingDays: number;
  offDays: number;
  holDays: number;
  leaveDays: number;
  otDays: number;
  otMorningHours: number;
  otNightHours: number;
  otTotalHours: number;
  changedDays: number;
  syncedCount: number;
  statusBreakdown: Record<string, number>;
}

export type MonthSummary = RosterSummary;

export interface LeaveRow {
  leaveType: string;
  entitlement: number | null;
  balance: number | null;
  utilized: number;
  openingUtilized?: number;
}

export interface LeaveBalanceResponse {
  year: number;
  rows: LeaveRow[];
}
