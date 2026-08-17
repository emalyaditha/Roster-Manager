import React from 'react';
import { RosterEntry, RosterStatusConfig } from '../types/roster';
import { StatusBadge } from './StatusBadge';
import { CurrentEffectiveTooltip } from './CurrentEffectiveTooltip';
import { formatDateDisplay, getTodayDateString } from '../utils/date';
import { Edit3, History, Trash2, CheckCircle2, RefreshCw, Clock, MessageSquare } from 'lucide-react';

interface RosterCardListProps {
  entries: RosterEntry[];
  statuses: RosterStatusConfig[];
  selectedIds?: string[];
  onToggleSelect?: (id: string) => void;
  onChangeRosterClick: (entry: RosterEntry) => void;
  onHistoryClick: (entry: RosterEntry) => void;
  onDeleteClick: (entry: RosterEntry) => void;
  onSyncSingleClick: (entry: RosterEntry) => void;
}

export const RosterCardList: React.FC<RosterCardListProps> = ({
  entries,
  statuses,
  selectedIds = [],
  onToggleSelect,
  onChangeRosterClick,
  onHistoryClick,
  onDeleteClick,
  onSyncSingleClick,
}) => {
  if (entries.length === 0) return null;

  const todayStr = getTodayDateString();

  return (
    <div className="flex flex-col gap-2.5 md:hidden mb-20">
      {entries.map((entry, idx) => {
        const isChanged = !!entry.changedStatusId;
        const isSelected = selectedIds.includes(entry.id);
        const isToday = entry.date === todayStr;
        const totalOtHours = (entry.otMorningHours || 0) + (entry.otNightHours || 0);

        return (
          <div
            key={entry.id}
            className={`p-4 rounded-xl border transition-colors ${
              isToday
                ? 'bg-blue-50/60 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/60'
                : isChanged
                ? 'bg-amber-50/40 dark:bg-amber-950/15 border-amber-200 dark:border-amber-800/60'
                : isSelected
                ? 'bg-blue-50/30 dark:bg-blue-950/15 border-blue-300 dark:border-blue-700'
                : 'bg-white dark:bg-zinc-950 border-slate-200 dark:border-zinc-800'
            }`}
          >
            {/* Top Row: Date, Day, Today Pill & Select */}
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-zinc-800/60">
              <div className="flex items-center gap-2.5">
                {onToggleSelect && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(entry.id)}
                    className="w-4 h-4 rounded border-slate-300 dark:border-zinc-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                )}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white tracking-tight">
                    {formatDateDisplay(entry.date)}
                  </span>
                  <span className="text-xs font-medium text-slate-500 dark:text-zinc-400">
                    ({entry.day.substring(0, 3)})
                  </span>
                  {isToday && (
                    <span className="px-1.5 py-0.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold text-[9px] rounded tracking-wide uppercase">
                      TODAY
                    </span>
                  )}
                </div>
              </div>

              {/* Sync Status Badge */}
              {entry.googleCalendarSyncStatus === 'Synced' ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                  <CheckCircle2 className="w-3 h-3" />
                  Synced
                </span>
              ) : (
                <button
                  onClick={() => onSyncSingleClick(entry)}
                  className="inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 dark:text-zinc-400 hover:text-blue-600 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Sync
                </button>
              )}
            </div>

            {/* Middle Content: Status & Times */}
            <div className="py-3 flex items-center justify-between gap-2">
              {/* Effective Status */}
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-[9px] font-semibold text-slate-400 dark:text-zinc-500 uppercase tracking-wider">
                  Roster Status
                </span>
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <CurrentEffectiveTooltip entry={entry} statuses={statuses} size="md" />
                  {isChanged && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1 truncate">
                      (Was {entry.originalStatusId})
                    </span>
                  )}
                </div>
              </div>

              {/* Clock Times / OT */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                {entry.clockIn || entry.clockOut ? (
                  <div className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-slate-800 dark:text-zinc-200 bg-slate-100 dark:bg-zinc-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-zinc-700">
                    <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                    <span>{entry.clockIn || '--:--'}</span>
                    <span>-</span>
                    <span>{entry.clockOut || '--:--'}</span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400 dark:text-zinc-500 italic">No times</span>
                )}

                {totalOtHours > 0 && (
                  <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-md border border-orange-500/20">
                    + {totalOtHours.toFixed(1)}h OT
                  </span>
                )}
              </div>
            </div>

            {/* Notes if present */}
            {entry.notes && (
              <div className="mb-2.5 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-zinc-900 text-[11px] text-slate-600 dark:text-zinc-400 flex items-center gap-1.5 italic">
                <MessageSquare className="w-3.5 h-3.5 text-slate-400 dark:text-zinc-500 shrink-0" />
                <span className="truncate">{entry.notes}</span>
              </div>
            )}

            {/* Bottom Row: Quick Actions */}
            <div className="pt-2 border-t border-slate-100 dark:border-zinc-800/60 flex items-center justify-between gap-2">
              <button
                onClick={() => onChangeRosterClick(entry)}
                className="flex-1 py-2 px-3 rounded-lg bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Change Status
              </button>

              <button
                onClick={() => onHistoryClick(entry)}
                className="p-2 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 transition-colors cursor-pointer"
                title="Audit History"
              >
                <History className="w-4 h-4" />
              </button>

              <button
                onClick={() => onDeleteClick(entry)}
                className="p-2 rounded-lg bg-slate-100 dark:bg-zinc-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                title="Delete Entry"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
