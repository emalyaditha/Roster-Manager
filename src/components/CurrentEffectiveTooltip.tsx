import React, { useState } from 'react';
import { RosterEntry, RosterChangeHistory, RosterStatusConfig } from '../types/roster';
import { StatusBadge } from './StatusBadge';
import { api } from '../services/api';
import { formatTimestamp } from '../utils/date';
import { Clock, User, AlertCircle, HelpCircle, Loader2 } from 'lucide-react';

interface CurrentEffectiveTooltipProps {
  entry: RosterEntry;
  statuses: RosterStatusConfig[];
  size?: 'sm' | 'md' | 'lg';
}

export const CurrentEffectiveTooltip: React.FC<CurrentEffectiveTooltipProps> = ({
  entry,
  statuses,
  size = 'md',
}) => {
  const isChanged = !!entry.changedStatusId;
  const [isHovered, setIsHovered] = useState(false);
  const [historyRecord, setHistoryRecord] = useState<RosterChangeHistory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleMouseEnter = async () => {
    setIsHovered(true);
    if (!isChanged || historyRecord || loading) return;

    setLoading(true);
    setError(false);
    try {
      const records = await api.getHistory(entry.id);
      if (records && records.length > 0) {
        // Since store sorts history descending by timestamp, the first element is the latest change record.
        setHistoryRecord(records[0]);
      } else {
        // Fallback if no history record is found (e.g. if updated but logs were cleared)
        setHistoryRecord({
          id: 'fallback',
          rosterEntryId: entry.id,
          date: entry.date,
          previousStatusId: entry.originalStatusId,
          newStatusId: entry.currentStatusId,
          previousAction: 'Original',
          newAction: entry.action,
          reason: entry.action || 'Roster status changed',
          user: entry.lastChangedBy || 'User',
          timestamp: entry.updatedAt || new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn('Failed to load roster change history for hover tooltip:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  if (!isChanged) {
    return <StatusBadge statusId={entry.currentStatusId} statuses={statuses} size={size} />;
  }

  return (
    <div
      className="relative inline-block cursor-help"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Target element to hover */}
      <div className="hover:scale-[1.02] active:scale-[0.98] transition-all duration-150">
        <StatusBadge statusId={entry.currentStatusId} statuses={statuses} size={size} />
      </div>

      {/* Tooltip Popup container */}
      {isHovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 z-50 w-64 md:w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3.5 animate-fadeIn text-left text-xs pointer-events-none">
          {/* Arrow indicator */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-x-6 border-x-transparent border-t-6 border-t-white dark:border-t-slate-800"></div>
          
          <h4 className="font-extrabold text-slate-900 dark:text-white mb-2 flex items-center justify-between text-[11px] uppercase tracking-wider pb-1.5 border-b border-slate-100 dark:border-slate-700/50">
            <span>Reason for Change</span>
            <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold normal-case">Audit Record</span>
          </h4>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-3 text-slate-500 dark:text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin text-purple-600 dark:text-purple-400" />
              <span>Fetching audit details...</span>
            </div>
          ) : error ? (
            <div className="flex items-center gap-1.5 py-1.5 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Failed to load change history.</span>
            </div>
          ) : historyRecord ? (
            <div className="space-y-2.5">
              {/* Transition flow */}
              <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                <span className="font-semibold">Workflow:</span>
                <span className="bg-slate-100 dark:bg-slate-900 px-1 py-0.5 rounded text-slate-700 dark:text-slate-300 font-bold">
                  {historyRecord.previousStatusId}
                </span>
                <span>→</span>
                <span className="bg-purple-100 dark:bg-purple-950 px-1 py-0.5 rounded text-purple-700 dark:text-purple-300 font-bold">
                  {historyRecord.newStatusId}
                </span>
              </div>

              {/* Main Reason text */}
              <div className="bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-lg text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-slate-800">
                <p className="font-medium leading-relaxed break-words whitespace-normal text-slate-800 dark:text-slate-200">
                  {historyRecord.reason}
                </p>
              </div>

              {/* Timestamp and author */}
              <div className="flex flex-col gap-1 text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700/50 pt-2">
                <div className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                  <span className="truncate">Changed by: <strong className="text-slate-700 dark:text-slate-300 font-semibold">{historyRecord.user}</strong></span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{formatTimestamp(historyRecord.timestamp)}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 py-1.5 text-slate-500 dark:text-slate-400">
              <HelpCircle className="w-4 h-4 shrink-0" />
              <span>No audit records found.</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
