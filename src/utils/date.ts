/**
 * Helper utilities for strict date handling in Roster Manager.
 * Ensures dates never shift due to UTC conversions (e.g. 2026-08-10 stays 2026-08-10).
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Parses YYYY-MM-DD into a local Date without UTC offset shift
 */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Returns today's date string in YYYY-MM-DD format
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get day name ("Monday", "Tuesday", etc.) for YYYY-MM-DD
 */
export function getDayOfWeekName(dateStr: string): string {
  if (!dateStr || !dateStr.includes('-')) return '';
  const d = parseLocalDate(dateStr);
  return DAYS[d.getDay()] || '';
}

/**
 * Format YYYY-MM-DD to "10 Aug 2026" or "10 Aug"
 */
export function formatDateDisplay(dateStr: string, includeYear = true): string {
  if (!dateStr || !dateStr.includes('-')) return dateStr;
  const d = parseLocalDate(dateStr);
  const dayNum = d.getDate();
  const monthName = MONTHS[d.getMonth()].substring(0, 3);
  const year = d.getFullYear();
  return includeYear ? `${dayNum} ${monthName} ${year}` : `${dayNum} ${monthName}`;
}

/**
 * Get "YYYY-MM" string from date string or current date
 */
export function getMonthYearString(dateStr?: string): string {
  if (dateStr && dateStr.includes('-')) {
    const parts = dateStr.split('-');
    return `${parts[0]}-${parts[1]}`;
  }
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Returns the start and end dates for a monthly roster cycle (16th of month to 15th of next month).
 * e.g. "2026-08" -> Start: 2026-08-16, End: 2026-09-15.
 */
export function getRosterCycleRange(monthYearStr: string): { startDate: string; endDate: string; label: string } {
  if (!monthYearStr || !monthYearStr.includes('-')) {
    return { startDate: '', endDate: '', label: '' };
  }
  const [year, month] = monthYearStr.split('-').map(Number);

  const startYear = year;
  const startMonthStr = String(month).padStart(2, '0');
  const startDate = `${startYear}-${startMonthStr}-16`;

  const endObj = new Date(year, month, 15);
  const endYear = endObj.getFullYear();
  const endMonthStr = String(endObj.getMonth() + 1).padStart(2, '0');
  const endDate = `${endYear}-${endMonthStr}-15`;

  const label = `${formatDateDisplay(startDate, false)} – ${formatDateDisplay(endDate, true)}`;
  return { startDate, endDate, label };
}

/**
 * Format "2026-07" to "July - Aug 2026" or "July - Aug"
 */
export function formatRosterCycleTitle(monthYearStr: string, includeYear = true): string {
  if (!monthYearStr || !monthYearStr.includes('-')) return monthYearStr;
  const [year, month] = monthYearStr.split('-').map(Number);

  const startMonthName = MONTHS[month - 1]; // e.g. "April", "May", "June", "July"
  const endObj = new Date(year, month, 15);
  const endMonthName = MONTHS[endObj.getMonth()].substring(0, 3); // e.g. "May", "Jun", "Jul", "Aug"
  const endYear = endObj.getFullYear();

  const cycleMonths = `${startMonthName} - ${endMonthName}`;
  if (!includeYear) return cycleMonths;

  if (endYear !== year) {
    return `${startMonthName} ${year} - ${endMonthName} ${endYear}`;
  }
  return `${cycleMonths} ${year}`;
}

/**
 * Format "2026-07" to "July - Aug 2026 (16 Jul – 15 Aug)"
 */
export function formatMonthCycleDisplay(monthYearStr: string): string {
  if (!monthYearStr || !monthYearStr.includes('-')) return monthYearStr;
  const title = formatRosterCycleTitle(monthYearStr, true);
  const { label } = getRosterCycleRange(monthYearStr);
  return `${title} (${label})`;
}

/**
 * Format "2026-07" to "July - Aug 2026"
 */
export function formatMonthYearDisplay(monthYearStr: string): string {
  return formatRosterCycleTitle(monthYearStr, true);
}

/**
 * Shift month string by delta (-1 for prev month, +1 for next month)
 */
export function shiftMonthYear(monthYearStr: string, delta: number): string {
  const [year, month] = monthYearStr.split('-').map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  const newYear = d.getFullYear();
  const newMonth = String(d.getMonth() + 1).padStart(2, '0');
  return `${newYear}-${newMonth}`;
}

/**
 * Get all YYYY-MM-DD dates in a given roster cycle (16th to 15th of next month)
 */
export function getDatesInMonth(monthYearStr: string, useCycle = true): string[] {
  if (!useCycle) {
    const [year, month] = monthYearStr.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const dates: string[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const dayStr = String(i).padStart(2, '0');
      const monthStr = String(month).padStart(2, '0');
      dates.push(`${year}-${monthStr}-${dayStr}`);
    }
    return dates;
  }

  const { startDate, endDate } = getRosterCycleRange(monthYearStr);
  const dates: string[] = [];
  let curr = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);

  while (curr <= end) {
    const y = curr.getFullYear();
    const m = String(curr.getMonth() + 1).padStart(2, '0');
    const d = String(curr.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    curr.setDate(curr.getDate() + 1);
  }

  return dates;
}

/**
 * Format timestamp to readable string e.g. "09 Aug 2026, 10:42 AM"
 */
export function formatTimestamp(isoStr: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;

  const day = d.getDate();
  const month = MONTHS[d.getMonth()].substring(0, 3);
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
}

/**
 * Returns the roster cycle month ("YYYY-MM") that contains the given date.
 * If day is <= 15, it belongs to the previous month's cycle (16th of previous month to 15th of current).
 * If day is >= 16, it belongs to the current month's cycle (16th of current to 15th of next).
 */
export function getRosterCycleForDate(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-indexed
  const day = date.getDate();

  if (day <= 15) {
    // Belongs to the previous month's cycle
    const prev = new Date(year, month - 1, 1);
    const pYear = prev.getFullYear();
    const pMonth = String(prev.getMonth() + 1).padStart(2, '0');
    return `${pYear}-${pMonth}`;
  } else {
    // Belongs to the current month's cycle
    const cYear = year;
    const cMonth = String(month + 1).padStart(2, '0');
    return `${cYear}-${cMonth}`;
  }
}

/**
 * Safely extract local HH:MM time from an ISO timestamp, TIMESTAMPTZ, or time string in target timezone (default: 'Asia/Colombo').
 * Fixes timezone shift bugs (e.g. UTC 04:45 from Supabase is converted back to 10:15 in Asia/Colombo).
 */
export function extractTimeInTimezone(timeOrIsoStr?: string | null, targetTimeZone = 'Asia/Colombo'): string {
  if (!timeOrIsoStr) return '';
  const raw = String(timeOrIsoStr).trim();
  if (!raw) return '';

  // Case 1: Plain "HH:MM" or "HH:MM:SS" (without date or timezone offset)
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)) {
    return raw.substring(0, 5);
  }

  // Case 2: Full ISO timestamp or Date string (e.g., "2026-07-16T04:45:00+00:00" or "2026-07-16T04:45:00Z")
  if (raw.includes('T') || raw.includes('Z') || raw.includes('+') || (raw.includes('-') && raw.includes(':'))) {
    try {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) {
        const formatter = new Intl.DateTimeFormat('en-GB', {
          timeZone: targetTimeZone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        const parts = formatter.formatToParts(d);
        const hour = parts.find((p) => p.type === 'hour')?.value || '00';
        const minute = parts.find((p) => p.type === 'minute')?.value || '00';
        return `${hour}:${minute}`;
      }
    } catch {
      // Fallback
    }

    // Fallback if parsing fails but string has 'T'
    if (raw.includes('T')) {
      const timePart = raw.split('T')[1]?.substring(0, 5);
      if (timePart && timePart.includes(':')) return timePart;
    }
  }

  return raw;
}

