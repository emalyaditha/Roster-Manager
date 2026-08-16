import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { RosterEntry, RosterStatusConfig, RosterChangeHistory, AppSettings } from '../types/roster';
import { formatDateDisplay } from './date';

export function prepareRosterExportData(entries: RosterEntry[], statuses: RosterStatusConfig[]) {
  const statusMap = new Map(statuses.map((s) => [s.code, s.displayName || s.code]));

  return entries.map((e) => {
    const isChanged = e.originalStatusId !== e.currentStatusId;
    return {
      Date: e.date,
      Day: e.day,
      'Formatted Date': formatDateDisplay(e.date),
      'Original Roster': e.originalStatusId,
      'Original Description': statusMap.get(e.originalStatusId) || e.originalStatusId,
      'Changed Roster': e.changedStatusId || '-',
      'Current Roster': e.currentStatusId,
      'Current Description': statusMap.get(e.currentStatusId) || e.currentStatusId,
      'Is Changed': isChanged ? 'YES' : 'NO',
      Action: e.action,
      OT: e.ot ? 'YES' : 'NO',
      'Google Calendar Sync': e.googleCalendarSyncStatus,
      Notes: e.notes || '',
      'Last Modified': e.updatedAt ? new Date(e.updatedAt).toLocaleString() : '',
    };
  });
}

export function exportToCSV(entries: RosterEntry[], statuses: RosterStatusConfig[], filename = 'em-roster-export.csv') {
  const data = prepareRosterExportData(entries, statuses);
  const csv = Papa.unparse(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportToExcel(entries: RosterEntry[], statuses: RosterStatusConfig[], filename = 'roster-export.xlsx') {
  const data = prepareRosterExportData(entries, statuses);
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Duty Roster');
  XLSX.writeFile(workbook, filename);
}

export function exportBackupData(
  entries: RosterEntry[],
  history: RosterChangeHistory[],
  statuses: RosterStatusConfig[],
  settings: AppSettings
) {
  const backupObj = {
    app: 'Roster Manager',
    version: '1.0.0',
    exportTimestamp: new Date().toISOString(),
    entries,
    history,
    statuses,
    settings,
  };

  const jsonStr = JSON.stringify(backupObj, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `em-roster-backup-${new Date().toISOString().substring(0, 10)}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
