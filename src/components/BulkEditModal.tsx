import React, { useState } from 'react';
import { RosterEntry, RosterStatusConfig } from '../types/roster';
import { StatusBadge } from './StatusBadge';
import { X, AlertCircle, Edit3, Check } from 'lucide-react';
import { sortByStatusDisplayOrder } from '../utils/statusOrder';

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
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto py-6 sm:py-10 px-4">
      <div className="fixed inset-0 bg-black/40 dark:bg-black/60" />
      <div className="relative card shadow-[var(--shadow-md)] rounded-xl w-full max-w-lg overflow-hidden animate-scaleIn">

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-line flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-[var(--accent-soft)] text-accent shrink-0">
              <Edit3 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-fg truncate">
                Bulk Change {selectedEntries.length} Roster Entries
              </h3>
              <p className="text-xs text-muted truncate">
                Original office rosters will be preserved for each entry
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon shrink-0" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">

          {/* Warning Confirmation Box */}
          <div
            className="p-3 rounded-lg text-xs flex items-start gap-2"
            style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}
          >
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block mb-0.5">Confirmation Warning</span>
              You are about to change <strong>{selectedEntries.length} roster entries</strong> from their current values to <strong>{newStatusId}</strong>.
              Every affected date will receive its own individual audit history record.
            </div>
          </div>

          {/* Target Status Grid */}
          <div>
            <label className="block text-xs font-medium text-fg mb-1.5">
              Set New Status For All Selected Dates
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {sortByStatusDisplayOrder(statuses.filter((s) => s.active)).map((s) => {
                const isSelected = newStatusId === s.code;
                return (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => handleStatusSelect(s.code)}
                    className={`p-2 rounded-lg border text-left text-xs transition-colors flex flex-col justify-between ${
                      isSelected
                        ? 'border-accent bg-[var(--accent-soft)] text-fg font-medium'
                        : 'border-line bg-surface text-fg hover:border-[var(--color-text-faint)]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="font-semibold text-[11px]">{s.code}</span>
                    </div>
                    <span className="text-[10px] text-muted truncate">{s.description || s.displayName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action / Reason */}
          <div>
            <label className="block text-xs font-medium text-fg mb-1">
              Action Description
            </label>
            <input
              type="text"
              required
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="input-min"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-fg mb-1">
              Audit Change Reason
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="input-min"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-fg pt-3 border-t border-line">
            <input
              type="checkbox"
              checked={updateCalendar}
              onChange={(e) => setUpdateCalendar(e.target.checked)}
              className="rounded border-line accent-[var(--color-primary)]"
            />
            Synchronize Google Calendar for all {selectedEntries.length} entries
          </label>

          {/* Footer */}
          <div className="pt-4 border-t border-line flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn-min btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-min btn-primary"
            >
              <Check className="w-4 h-4" />
              {isSubmitting ? 'Applying Bulk Change...' : `Confirm Bulk Change (${selectedEntries.length})`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
