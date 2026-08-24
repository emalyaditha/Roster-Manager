import React, { useState, useEffect } from 'react';
import { RosterEntry, RosterChangeHistory, RosterStatusConfig } from '../types/roster';
import { StatusBadge } from './StatusBadge';
import { formatDateDisplay, formatTimestamp } from '../utils/date';
import { api } from '../services/api';
import { History, ArrowDown, CheckCircle2, User, Clock, Calendar, RefreshCw } from 'lucide-react';

interface AuditHistoryModalProps {
  isOpen: boolean;
  entry: RosterEntry | null;
  statuses: RosterStatusConfig[];
  onClose: () => void;
}

export const AuditHistoryModal: React.FC<AuditHistoryModalProps> = ({
  isOpen,
  entry,
  statuses,
  onClose,
}) => {
  const [historyList, setHistoryList] = useState<RosterChangeHistory[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && entry) {
      setLoading(true);
      api
        .getHistory(entry.id)
        .then((data) => {
          setHistoryList(data);
        })
        .catch((err) => console.error(err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, entry]);

  if (!isOpen || !entry) return null;

  const statusColor = (code: string | null) =>
    statuses.find((s) => s.code === code)?.color;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto py-6 sm:py-10 px-4">
      <div className="fixed inset-0 bg-black/40 dark:bg-black/60" />
      <div className="relative card shadow-[var(--shadow-md)] rounded-xl w-full max-w-lg md:max-h-[85vh] max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-accent text-on-accent">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-fg">
                Roster Audit History
              </h3>
              <p className="text-xs text-muted">
                {formatDateDisplay(entry.date)} ({entry.day})
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Close">
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="px-5 py-4 overflow-y-auto space-y-4 flex-1">
          {/* Current Roster Flow Summary Card */}
          <div className="bg-well rounded-lg p-4 border border-line">
            <h4 className="text-[11px] font-semibold uppercase tracking-wide text-faint mb-3">
              Roster Progression Overview
            </h4>

            <div className="flex flex-col items-center justify-center gap-2 text-center">
              {/* Office Roster */}
              <div className="w-full bg-surface p-2.5 rounded-md border border-line flex items-center justify-between">
                <span className="text-xs font-medium text-muted">
                  Office Roster:
                </span>
                <StatusBadge statusId={entry.originalStatusId} statuses={statuses} size="md" />
              </div>

              <ArrowDown className="w-4 h-4 text-faint" />

              {/* Changed To */}
              <div className="w-full bg-surface p-2.5 rounded-md border border-line flex items-center justify-between">
                <span className="text-xs font-medium text-muted">
                  Changed To:
                </span>
                {entry.changedStatusId ? (
                  <StatusBadge statusId={entry.changedStatusId} statuses={statuses} size="md" />
                ) : (
                  <span className="text-xs text-faint italic">No change (Matches Original)</span>
                )}
              </div>

              <ArrowDown className="w-4 h-4 text-accent" />

              {/* Current Active */}
              <div
                className="w-full p-2.5 rounded-md border flex items-center justify-between"
                style={{ background: 'var(--accent-soft)', borderColor: 'var(--color-border)' }}
              >
                <span className="text-xs font-semibold text-fg">
                  Current Active Roster:
                </span>
                <StatusBadge statusId={entry.currentStatusId} statuses={statuses} size="lg" />
              </div>
            </div>
          </div>

          {/* Audit History Timeline */}
          <div>
            <h4 className="text-xs font-semibold text-fg mb-3 flex items-center justify-between">
              <span>Audit Records Log ({historyList.length})</span>
              <span className="text-[10px] text-faint font-normal">Chronological order</span>
            </h4>

            {loading ? (
              <div className="py-8 text-center text-xs text-muted flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Loading history records...
              </div>
            ) : historyList.length === 0 ? (
              <div className="p-4 rounded-lg border border-dashed border-line text-center text-xs text-muted">
                No changes have been made yet. This roster entry remains in its original office state.
              </div>
            ) : (
              <div className="border-l border-line pl-4 space-y-3">
                {historyList.map((record) => (
                  <div key={record.id} className="card p-3 space-y-2 text-xs">
                    <div className="flex items-center justify-between text-[11px] pb-1.5 border-b border-line">
                      <span className="flex items-center gap-1 font-medium text-fg">
                        <User className="w-3 h-3 text-faint" />
                        {record.user || 'User'}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted tabular-nums">
                        <Clock className="w-3 h-3" />
                        {formatTimestamp(record.timestamp)}
                      </span>
                    </div>

                    {/* Status Transition */}
                    <div className="flex flex-wrap items-center gap-2 py-1">
                      <span className="text-muted">Changed:</span>
                      <span className="chip chip-neutral">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: statusColor(record.previousStatusId) || 'var(--color-text-faint)' }}
                        />
                        {record.previousStatusId}
                      </span>
                      <span className="text-faint">→</span>
                      <span className="chip chip-success">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: statusColor(record.newStatusId) || 'currentColor' }}
                        />
                        {record.newStatusId}
                      </span>
                    </div>

                    {/* Reason */}
                    <div className="bg-well p-2 rounded-md text-[11px] text-muted">
                      <span className="font-semibold text-fg block text-[10px] uppercase">Reason:</span>
                      {record.reason}
                    </div>

                    {/* Google Calendar sync result */}
                    <div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--success)' }}>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Google Calendar: {record.googleCalendarSyncResult || 'Updated'}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-line flex items-center justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">
            Close History
          </button>
        </div>
      </div>
    </div>
  );
};
