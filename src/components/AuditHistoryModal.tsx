import React, { useState, useEffect } from 'react';
import { RosterEntry, RosterChangeHistory, RosterStatusConfig } from '../types/roster';
import { StatusBadge } from './StatusBadge';
import { formatDateDisplay, formatTimestamp } from '../utils/date';
import { api } from '../services/api';
import { X, History, ArrowDown, CheckCircle2, User, Clock, Calendar, RefreshCw } from 'lucide-react';

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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full md:max-h-[85vh] max-h-[90vh] flex flex-col overflow-hidden transition-all my-8">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Roster Audit History
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {formatDateDisplay(entry.date)} ({entry.day})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Current Roster Flow Summary Card */}
          <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
              Roster Progression Overview
            </h4>

            <div className="flex flex-col items-center justify-center gap-2 text-center">
              {/* Office Roster */}
              <div className="w-full bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Office Roster:
                </span>
                <StatusBadge statusId={entry.originalStatusId} statuses={statuses} size="md" />
              </div>

              <ArrowDown className="w-4 h-4 text-slate-400" />

              {/* Changed To */}
              <div className="w-full bg-white dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  Changed To:
                </span>
                {entry.changedStatusId ? (
                  <StatusBadge statusId={entry.changedStatusId} statuses={statuses} size="md" />
                ) : (
                  <span className="text-xs text-slate-400 italic">No change (Matches Original)</span>
                )}
              </div>

              <ArrowDown className="w-4 h-4 text-purple-500" />

              {/* Current Active */}
              <div className="w-full bg-purple-50 dark:bg-purple-950/60 p-2.5 rounded-lg border border-purple-200 dark:border-purple-800 flex items-center justify-between">
                <span className="text-xs font-bold text-purple-900 dark:text-purple-200">
                  Current Active Roster:
                </span>
                <StatusBadge statusId={entry.currentStatusId} statuses={statuses} size="lg" />
              </div>
            </div>
          </div>

          {/* Audit History Timeline */}
          <div>
            <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-3 flex items-center justify-between">
              <span>Audit Records Log ({historyList.length})</span>
              <span className="text-[10px] text-slate-400 font-normal">Chronological order</span>
            </h4>

            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                Loading history records...
              </div>
            ) : historyList.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                No changes have been made yet. This roster entry remains in its original office state.
              </div>
            ) : (
              <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
                {historyList.map((record) => (
                  <div key={record.id} className="relative pl-8 text-xs">
                    <span className="absolute left-2 top-1.5 w-3 h-3 rounded-full bg-purple-600 ring-4 ring-white dark:ring-slate-900" />
                    
                    <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 shadow-2xs space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pb-1.5 border-b border-slate-100 dark:border-slate-700">
                        <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                          <User className="w-3 h-3 text-purple-500" />
                          {record.user || 'User'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTimestamp(record.timestamp)}
                        </span>
                      </div>

                      {/* Status Transition */}
                      <div className="flex flex-wrap items-center gap-2 py-1">
                        <span className="text-slate-500">Changed:</span>
                        <StatusBadge statusId={record.previousStatusId} statuses={statuses} size="sm" />
                        <span className="text-slate-400">→</span>
                        <StatusBadge statusId={record.newStatusId} statuses={statuses} size="sm" />
                      </div>

                      {/* Reason */}
                      <div className="bg-slate-50 dark:bg-slate-900/60 p-2 rounded-lg text-[11px] text-slate-700 dark:text-slate-300">
                        <span className="font-semibold text-slate-500 block text-[10px] uppercase">Reason:</span>
                        {record.reason}
                      </div>

                      {/* Google Calendar sync result */}
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        Google Calendar: {record.googleCalendarSyncResult || 'Updated'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-right">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 transition-colors"
          >
            Close History
          </button>
        </div>
      </div>
    </div>
  </div>
);
};
