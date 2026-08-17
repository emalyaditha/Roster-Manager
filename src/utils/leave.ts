import { LeaveRow } from '../types/roster';

// Leave options shown in the leave picker. Lieu Leave is intentionally excluded —
// it is consumed via DOF entries, not by editing a working day.
export interface LeaveOption {
  code: string;
  label: string;
  colorDot: string;
  unit: number;
  subtitle?: string;
  noBalanceCheck?: boolean;
}

export const LEAVE_OPTIONS: LeaveOption[] = [
  {
    code: 'LEAVE',
    label: 'Annual Leave',
    colorDot: '#1565c0',
    unit: 1,
  },
  {
    code: 'Medical LEAVE',
    label: 'Medical Leave',
    colorDot: '#00838f',
    unit: 1,
  },
  {
    code: 'Casual Leave',
    label: 'Casual Leave',
    colorDot: '#558b2f',
    unit: 1,
  },
  {
    code: 'Short Leave',
    label: 'Short Leave',
    colorDot: '#E60023',
    unit: 1,
  },
  {
    code: 'Leave(Half)',
    label: 'Half Day Leave',
    colorDot: '#E60023',
    unit: 0.5,
    subtitle: 'Pick Annual or Casual pool',
  },
  {
    code: 'ML',
    label: 'Maternity Leave',
    colorDot: '#880e4f',
    unit: 1,
    subtitle: 'No balance cap',
    noBalanceCheck: true,
  },
];

// Pool choices for half-day leave
export const HALF_DAY_POOL_OPTIONS = [
  { key: 'annual', code: 'LEAVE(Half)-Annual', label: 'Annual Leave', colorDot: '#1565c0' },
  { key: 'casual', code: 'LEAVE(Half)-Casual', label: 'Casual Leave', colorDot: '#558b2f' },
] as const;

// Roster code -> leave type (as tracked in leave_entitlements / leave balance rows)
export const LEAVE_CODE_TO_TYPE: Record<string, string> = {
  LEAVE: 'Annual Leave',
  'Medical LEAVE': 'Medical Leave',
  'Casual Leave': 'Casual Leave',
  'Short Leave': 'Short Leave',
  'Leave(Half)': 'Short Leave', // legacy fallback
  'LEAVE(Half)-Annual': 'Annual Leave',
  'LEAVE(Half)-Casual': 'Casual Leave',
};

// Days on which the leave picker can be opened.
export const LEAVE_ELIGIBLE_CODES = ['NWD', 'RTD', 'WFH'];
// Training is allowed but requires confirmation (warn).
export const LEAVE_WARN_CODES = ['Training'];

// Current shift window context shown at the top of the picker.
export const SHIFT_CONTEXT: Record<string, { label: string; hours: string }> = {
  NWD: { label: 'NWD', hours: '08:15 – 17:30' },
  RTD: { label: 'RTD', hours: '10:15 – 19:30' },
  WFH: { label: 'WFH', hours: '10:15 – 19:30' },
  Training: { label: 'Training', hours: '09:00 – 17:00' },
};

// Roster codes that are already a leave state (leave applied or day off).
export const LEAVE_ALREADY_PREFIXES = [
  'LEAVE',
  'Medical LEAVE',
  'Casual Leave',
  'Short Leave',
  'Leave(Half)',
  'ML',
  'DOF',
];

// Map composite half-day codes back to the roster display code.
export function getDisplayCode(code: string): string {
  if (code === 'LEAVE(Half)-Annual' || code === 'LEAVE(Half)-Casual') return 'Leave(Half)';
  return code;
}

export function canApplyLeaveToCode(code: string): boolean {
  return LEAVE_ELIGIBLE_CODES.includes(code) || LEAVE_WARN_CODES.includes(code);
}

export function isAlreadyLeaveCode(code: string): boolean {
  if (!code) return false;
  return LEAVE_ALREADY_PREFIXES.some((c) => code.startsWith(c));
}

// Resolve the balance row that backs a given roster code (Short Leave pool for Leave(Half)).
export function getBalanceForCode(code: string, rows: LeaveRow[]): LeaveRow | undefined {
  const leaveType = LEAVE_CODE_TO_TYPE[code];
  if (!leaveType) return undefined;
  return rows.find((r) => r.leaveType === leaveType);
}

export type ValidationResult =
  | { ok: true; warn?: boolean; after?: number }
  | { ok: false; reason: 'no_balance' | 'blocked'; current?: number; message?: string };

export function validateLeaveApplication(
  selectedCode: string,
  currentBalances: LeaveRow[],
): ValidationResult {
  // Maternity Leave — no cap, always allow
  if (selectedCode === 'ML') return { ok: true };

  const leaveType = LEAVE_CODE_TO_TYPE[selectedCode];
  if (!leaveType) {
    return { ok: false, reason: 'blocked', message: 'Unknown leave type' };
  }

  const row = currentBalances.find((r) => r.leaveType === leaveType);

  // No entitlement row at all
  if (!row || row.entitlement === null) {
    return { ok: false, reason: 'blocked', message: `No ${leaveType} entitlement configured for this employee` };
  }

  // Balance is 0 or negative
  if (row.balance !== null && row.balance <= 0) {
    // Medical Leave should not be blocked by balance — warn but allow.
    if (leaveType === 'Medical Leave') {
      return { ok: true, warn: true, after: Math.max(0, row.balance - 1) };
    }
    return { ok: false, reason: 'no_balance', current: row.balance };
  }

  return { ok: true, after: (row.balance ?? 0) - 1 };
}