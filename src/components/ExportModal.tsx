import React, { useState } from 'react';
import { RosterEntry, RosterStatusConfig } from '../types/roster';
import { exportToCSV, exportToExcel } from '../utils/export';
import { X, Download, FileSpreadsheet, FileText, Printer } from 'lucide-react';

interface ExportModalProps {
  isOpen: boolean;
  entries: RosterEntry[];
  statuses: RosterStatusConfig[];
  onClose: () => void;
  onPrintClick: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  entries,
  statuses,
  onClose,
  onPrintClick,
}) => {
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx' | 'print'>('csv');
  const [changedOnlyFilter, setChangedOnlyFilter] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');

  if (!isOpen) return null;

  // Filter entries for export
  const filteredEntries = entries.filter((e) => {
    if (changedOnlyFilter && e.originalStatusId === e.currentStatusId) return false;
    if (statusFilter !== 'ALL' && e.currentStatusId !== statusFilter) return false;
    return true;
  });

  const handleExport = () => {
    if (exportFormat === 'csv') {
      exportToCSV(filteredEntries, statuses, `em-roster-${new Date().toISOString().substring(0, 10)}.csv`);
      onClose();
    } else if (exportFormat === 'xlsx') {
      exportToExcel(filteredEntries, statuses, `em-roster-${new Date().toISOString().substring(0, 10)}.xlsx`);
      onClose();
    } else if (exportFormat === 'print') {
      onClose();
      onPrintClick();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden transition-all my-8">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Export Roster
              </h3>
              <p className="text-xs text-slate-500">
                Export current view ({filteredEntries.length} entries)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4">
          
          {/* Export Format Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Select Export Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setExportFormat('csv')}
                className={`p-3 rounded-xl border text-center text-xs font-bold transition-all flex flex-col items-center gap-1.5 ${
                  exportFormat === 'csv'
                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-950 text-purple-900 dark:text-purple-100 ring-2 ring-purple-500/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                }`}
              >
                <FileText className="w-5 h-5 text-purple-600" />
                CSV Format
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('xlsx')}
                className={`p-3 rounded-xl border text-center text-xs font-bold transition-all flex flex-col items-center gap-1.5 ${
                  exportFormat === 'xlsx'
                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-950 text-purple-900 dark:text-purple-100 ring-2 ring-purple-500/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                }`}
              >
                <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                Excel (XLSX)
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('print')}
                className={`p-3 rounded-xl border text-center text-xs font-bold transition-all flex flex-col items-center gap-1.5 ${
                  exportFormat === 'print'
                    ? 'border-purple-600 bg-purple-50 dark:bg-purple-950 text-purple-900 dark:text-purple-100 ring-2 ring-purple-500/20'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 text-slate-700 dark:text-slate-300'
                }`}
              >
                <Printer className="w-5 h-5 text-indigo-600" />
                Print / PDF
              </button>
            </div>
          </div>

          {/* Export Filters */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={changedOnlyFilter}
                onChange={(e) => setChangedOnlyFilter(e.target.checked)}
                className="rounded border-slate-300 text-purple-600 focus:ring-purple-500"
              />
              Export only modified rosters (Original != Current)
            </label>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Filter by Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              >
                <option value="ALL">All Roster Statuses</option>
                {statuses.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.description || s.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            className="px-5 py-2 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-sm flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            Download Export
          </button>
        </div>
      </div>
    </div>
  </div>
);
};
