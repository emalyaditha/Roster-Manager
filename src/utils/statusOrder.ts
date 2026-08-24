import { RosterStatusConfig } from '../types/roster';

/**
 * Canonical display order for roster status buttons in pickers/grids.
 * Work statuses first (NWD, RTD, ...), day-off types next, leaves last.
 */
export const STATUS_DISPLAY_ORDER = [
  'NWD',
  'RTD',
  'OT',
  'WFH',
  'Training',
  'DOS',
  'DOS(10.00)',
  'HOL',
  'DOF',
  'LEAVE',
  'Short Leave',
  'Leave(Half)',
  'ML',
] as const;

function orderIndex(code: string): number {
  const upper = (code || '').toUpperCase();
  const idx = STATUS_DISPLAY_ORDER.findIndex((c) => c.toUpperCase() === upper);
  return idx === -1 ? STATUS_DISPLAY_ORDER.length : idx;
}

/** Returns a new array sorted by the canonical display order (stable for unknown codes). */
export function sortByStatusDisplayOrder<T extends RosterStatusConfig>(statuses: T[]): T[] {
  return [...statuses]
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      const diff = orderIndex(a.s.code) - orderIndex(b.s.code);
      return diff !== 0 ? diff : a.i - b.i;
    })
    .map(({ s }) => s);
}
