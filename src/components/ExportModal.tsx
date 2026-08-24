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

  const formatCard = (
    selected: boolean
  ) => `card p-3 cursor-pointer transition-colors text-center text-xs font-medium flex flex-col items-center gap-1.5 ${
    selected
      ? 'border-accent bg-[var(--accent-soft)] text-fg'
      : 'text-muted hover:border-[var(--color-text-faint)] hover:text-fg'
  }`;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto py-6 sm:py-10 px-4">
      <div className="fixed inset-0 bg-black/40 dark:bg-black/60" />
      <div className="relative card shadow-[var(--shadow-md)] rounded-xl w-full max-w-md overflow-hidden animate-scaleIn">

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-line flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-[var(--accent-soft)] text-accent shrink-0">
              <Download className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-fg truncate">
                Export Roster
              </h3>
              <p className="text-xs text-muted truncate">
                Export current view ({filteredEntries.length} entries)
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon shrink-0" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="px-5 py-4 space-y-4">

          {/* Export Format Selector */}
          <div>
            <label className="block text-xs font-medium text-fg mb-2">
              Select Export Format
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setExportFormat('csv')}
                className={formatCard(exportFormat === 'csv')}
              >
                <FileText className="w-5 h-5 text-accent" />
                CSV Format
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('xlsx')}
                className={formatCard(exportFormat === 'xlsx')}
              >
                <FileSpreadsheet className="w-5 h-5 text-accent" />
                Excel (XLSX)
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('print')}
                className={formatCard(exportFormat === 'print')}
              >
                <Printer className="w-5 h-5 text-accent" />
                Print / PDF
              </button>
            </div>
          </div>

          {/* Export Filters */}
          <div className="pt-2 border-t border-line space-y-3">
            <label className="flex items-center gap-2 text-xs font-medium text-fg cursor-pointer">
              <input
                type="checkbox"
                checked={changedOnlyFilter}
                onChange={(e) => setChangedOnlyFilter(e.target.checked)}
                className="rounded border-line accent-[var(--color-primary)]"
              />
              Export only modified rosters (Original != Current)
            </label>

            <div>
              <label className="block text-xs font-medium text-fg mb-1">
                Filter by Status
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="input-min"
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
        <div className="px-5 py-3.5 border-t border-line flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-min btn-secondary">
            Cancel
          </button>
          <button onClick={handleExport} className="btn-min btn-primary">
            <Download className="w-3.5 h-3.5" />
            Download Export
          </button>
        </div>
      </div>
    </div>
  );
};
