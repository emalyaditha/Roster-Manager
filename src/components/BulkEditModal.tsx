import React, { useState } from 'react';
import { RosterEntry, RosterStatusConfig } from '../types/roster';
import { StatusBadge } from './StatusBadge';
import { X, AlertCircle, Edit3, Check } from 'lucide-react';

interface BulkEditModalProps {
  isOpen: boolean;
  selectedEntries: RosterEntry[];
  statuses: RosterStatusConfig[];
  onClose: () => void;
  onApplyBulkChange: (data: {
    ids: string[];
    newStatusId: string;
    action: string;
    reason: string;
    updateCalendar: boolean;
  }) => Promise<void>;
}

export const BulkEditModal: React.FC<BulkEditModalProps> = ({
  isOpen,
  selectedEntries,
  statuses,
  onClose,
  onApplyBulkChange,
}) => {
  const [newStatusId, setNewStatusId] = useState('WFH');
  const [action, setAction] = useState('Work From Home');
  const [reason, setReason] = useState('Bulk update operation');
  const [updateCalendar, setUpdateCalendar] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || selectedEntries.length === 0) return null;

  const handleStatusSelect = (code: string) => {
    setNewStatusId(code);
    const selected = statuses.find((s) => s.code === code);
    if (selected) {
      setAction(selected.description || selected.displayName);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onApplyBulkChange({
        ids: selectedEntries.map((e) => e.id),
        newStatusId,
        action,
        reason,
        updateCalendar,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden transition-all my-8">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-purple-50 dark:bg-purple-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-600 text-white">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-purple-950 dark:text-purple-100">
                Bulk Change {selectedEntries.length} Roster Entries
              </h3>
              <p className="text-xs text-purple-700 dark:text-purple-300">
                Original office rosters will be preserved for each entry
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-purple-400 hover:text-purple-700 hover:bg-purple-100 dark:hover:bg-purple-900"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          
          {/* Warning Confirmation Box */}
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800/80 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block mb-0.5">Confirmation Warning</span>
              You are about to change <strong>{selectedEntries.length} roster entries</strong> from their current values to <strong className="font-extrabold">{newStatusId}</strong>.
              Every affected date will receive its own individual audit history record.
            </div>
          </div>

          {/* Target Status Grid */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Set New Status For All Selected Dates
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {statuses.filter((s) => s.active).map((s) => {
                const isSelected = newStatusId === s.code;
                return (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => handleStatusSelect(s.code)}
                    className={`p-2 rounded-xl border text-left text-xs transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/80 text-purple-950 dark:text-purple-100 ring-2 ring-purple-500/20 font-bold'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="font-extrabold text-[11px]">{s.code}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 truncate">{s.description || s.displayName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action / Reason */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Action Description
            </label>
            <input
              type="text"
              required
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Audit Change Reason
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-300 pt-2 border-t border-slate-100 dark:border-slate-800">
            <input
              type="checkbox"
              checked={updateCalendar}
              onChange={(e) => setUpdateCalendar(e.target.checked)}
              className="rounded border-slate-300 text-purple-600"
            />
            Synchronize Google Calendar for all {selectedEntries.length} entries
          </label>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-sm flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              {isSubmitting ? 'Applying Bulk Change...' : `Confirm Bulk Change (${selectedEntries.length})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
);
};
