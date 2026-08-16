import React from 'react';
import { RosterEntry, RosterStatusConfig } from '../types/roster';
import { StatusBadge } from './StatusBadge';
import { CurrentEffectiveTooltip } from './CurrentEffectiveTooltip';
import { formatDateDisplay, getTodayDateString } from '../utils/date';
import {
  Edit3,
  History,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  Calendar,
  MessageSquare,
  CheckSquare,
  Square,
  Sparkles,
} from 'lucide-react';

interface RosterTableProps {
  entries: RosterEntry[];
  statuses: RosterStatusConfig[];
  selectedIds: string[];
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: () => void;
  onChangeRosterClick: (entry: RosterEntry) => void;
  onHistoryClick: (entry: RosterEntry) => void;
  onSyncSingleClick: (entry: RosterEntry) => void;
  onDeleteClick: (entry: RosterEntry) => void;
  onBulkEditClick: () => void;
}

export const RosterTable: React.FC<RosterTableProps> = ({
  entries,
  statuses,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onChangeRosterClick,
  onHistoryClick,
  onSyncSingleClick,
  onDeleteClick,
  onBulkEditClick,
}) => {
  const isAllSelected = entries.length > 0 && selectedIds.length === entries.length;

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Bulk Action Top Header Bar when items are selected */}
      {selectedIds.length > 0 && (
        <div className="bg-purple-500/10 dark:bg-purple-950/80 px-4 py-3 border border-purple-500/30 flex items-center justify-between text-xs animate-fadeIn rounded-2xl shadow-sm">
          <div className="flex items-center gap-2.5 font-bold text-purple-900 dark:text-purple-200">
            <span className="w-5 h-5 rounded-full bg-purple-600 text-white flex items-center justify-center text-[10px] font-black shadow-xs">
              {selectedIds.length}
            </span>
            <span>Selected {selectedIds.length} roster entries</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onBulkEditClick}
              className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold transition-all flex items-center gap-1.5 shadow-md shadow-purple-600/30 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Bulk Change Selected
            </button>
          </div>
        </div>
      )}

      {/* Main Roster Schedule Table */}
      <div className="w-full overflow-hidden rounded-3xl border border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/90 shadow-sm backdrop-blur-md">
        {entries.length === 0 ? (
          <div className="py-16 text-center text-slate-500 dark:text-zinc-400">
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-zinc-800/80 text-slate-400">
                <Calendar className="w-8 h-8" />
              </div>
              <p className="font-extrabold text-sm text-slate-800 dark:text-zinc-200">No roster entries found</p>
              <p className="text-xs text-slate-400 dark:text-zinc-500 max-w-sm">
                Try adjusting your search query, status filters, or import a new monthly roster file.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/80 dark:bg-zinc-950/80 border-b border-slate-200 dark:border-zinc-800/80 text-slate-500 dark:text-zinc-400 uppercase tracking-wider text-[10px] font-black select-none">
                  <th className="py-3.5 pl-4 pr-2 w-10 text-center">
                    <button
                      type="button"
                      onClick={onToggleSelectAll}
                      className="text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors cursor-pointer"
                      title={isAllSelected ? "Deselect All" : "Select All"}
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="py-3.5 px-3 font-extrabold min-w-[130px]">Date & Day</th>
                  <th className="py-3.5 px-3 font-extrabold min-w-[140px]">Effective Roster</th>
                  <th className="py-3.5 px-3 font-extrabold min-w-[120px]">Original Status</th>
                  <th className="py-3.5 px-3 font-extrabold min-w-[130px]">Clock Times</th>
                  <th className="py-3.5 px-3 font-extrabold min-w-[120px]">OT & Shift</th>
                  <th className="py-3.5 px-3 font-extrabold min-w-[160px]">Action & Notes</th>
                  <th className="py-3.5 px-3 font-extrabold min-w-[110px]">Google Sync</th>
                  <th className="py-3.5 pr-4 pl-2 font-extrabold text-right min-w-[120px]">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/60 font-medium text-slate-800 dark:text-zinc-200">
                {entries.map((entry) => {
                  const isChanged = !!entry.changedStatusId;
                  const isSelected = selectedIds.includes(entry.id);
                  const isToday = entry.date === getTodayDateString();
                  const totalOtHours = (entry.otMorningHours || 0) + (entry.otNightHours || 0);

                  return (
                    <tr
                      key={entry.id}
                      className={`group transition-colors relative ${
                        isToday
                          ? 'bg-purple-50/50 dark:bg-purple-950/20 hover:bg-purple-50 dark:hover:bg-purple-950/30'
                          : isChanged
                          ? 'bg-amber-50/40 dark:bg-amber-950/15 hover:bg-amber-50/70 dark:hover:bg-amber-950/25'
                          : isSelected
                          ? 'bg-purple-50/30 dark:bg-purple-950/20 hover:bg-purple-50/50'
                          : 'hover:bg-slate-50/80 dark:hover:bg-zinc-800/40'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 pl-4 pr-2 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => onToggleSelect(entry.id)}
                          className="text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                          ) : (
                            <Square className="w-4 h-4 opacity-50 group-hover:opacity-100" />
                          )}
                        </button>
                      </td>

                      {/* Date & Day */}
                      <td className="py-3.5 px-3 align-middle">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-slate-900 dark:text-white tracking-tight text-xs">
                                {formatDateDisplay(entry.date)}
                              </span>
                              {isToday && (
                                <span className="px-1.5 py-0.2 bg-purple-600 text-white font-black text-[9px] rounded-md tracking-wider uppercase shadow-2xs">
                                  TODAY
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400">
                              {entry.day}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Effective Roster Badge */}
                      <td className="py-3.5 px-3 align-middle">
                        <div className="flex items-center gap-1.5">
                          <CurrentEffectiveTooltip entry={entry} statuses={statuses} size="md" />
                          {isChanged && (
                            <span
                              className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0"
                              title="Roster Modified from Original"
                            />
                          )}
                        </div>
                      </td>

                      {/* Original Status */}
                      <td className="py-3.5 px-3 align-middle">
                        <StatusBadge statusId={entry.originalStatusId} statuses={statuses} size="sm" />
                      </td>

                      {/* Clock In / Out Times */}
                      <td className="py-3.5 px-3 align-middle">
                        {entry.clockIn || entry.clockOut ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100/80 dark:bg-zinc-800/80 border border-slate-200/80 dark:border-zinc-700/80 text-[11px] font-mono font-bold text-slate-700 dark:text-zinc-300">
                            <Clock className="w-3 h-3 text-purple-500 shrink-0" />
                            <span>{entry.clockIn || '--:--'}</span>
                            <span className="text-slate-400 dark:text-zinc-500">&rarr;</span>
                            <span>{entry.clockOut || '--:--'}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-zinc-500 text-[11px] italic">--</span>
                        )}
                      </td>

                      {/* OT & Shift Details */}
                      <td className="py-3.5 px-3 align-middle">
                        {entry.ot || totalOtHours > 0 ? (
                          <div className="inline-flex flex-col gap-0.5">
                            <span className="px-2 py-0.5 rounded-lg bg-orange-500/10 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 font-extrabold text-[10px] border border-orange-500/30 w-fit">
                              + OT {totalOtHours > 0 ? `${totalOtHours.toFixed(1)}h` : 'Shift'}
                            </span>
                            {totalOtHours > 0 && (
                              <span className="text-[9px] font-medium text-slate-500 dark:text-zinc-400">
                                M:{entry.otMorningHours || 0}h | N:{entry.otNightHours || 0}h
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-zinc-500 text-[11px]">Standard</span>
                        )}
                      </td>

                      {/* Action & Notes */}
                      <td className="py-3.5 px-3 align-middle">
                        <div className="flex flex-col gap-0.5 max-w-[200px]">
                          {entry.action && (
                            <span className="font-semibold text-slate-800 dark:text-zinc-200 text-xs truncate">
                              {entry.action}
                            </span>
                          )}
                          {entry.notes ? (
                            <span className="text-[11px] text-slate-500 dark:text-zinc-400 italic flex items-center gap-1 truncate" title={entry.notes}>
                              <MessageSquare className="w-3 h-3 shrink-0 text-slate-400" />
                              <span className="truncate">{entry.notes}</span>
                            </span>
                          ) : !entry.action ? (
                            <span className="text-slate-400 dark:text-zinc-500 text-[11px] italic">No notes</span>
                          ) : null}
                        </div>
                      </td>

                      {/* Google Calendar Sync */}
                      <td className="py-3.5 px-3 align-middle">
                        {entry.googleCalendarSyncStatus === 'Synced' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold text-[10px] border border-emerald-500/20">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Synced
                          </span>
                        ) : entry.googleCalendarSyncStatus === 'Sync Failed' ? (
                          <button
                            onClick={() => onSyncSingleClick(entry)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 font-extrabold text-[10px] border border-red-500/20 hover:bg-red-500/20 transition-all cursor-pointer"
                            title="Click to retry calendar sync"
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Retry
                          </button>
                        ) : (
                          <button
                            onClick={() => onSyncSingleClick(entry)}
                            className="inline-flex items-center gap-1 text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 text-[11px] font-semibold transition-colors cursor-pointer"
                            title="Sync to Google Calendar"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Sync
                          </button>
                        )}
                      </td>

                      {/* Row Actions */}
                      <td className="py-3.5 pr-4 pl-2 align-middle text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onChangeRosterClick(entry)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-all cursor-pointer"
                            title="Edit Roster Status"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onHistoryClick(entry)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/40 transition-all cursor-pointer"
                            title="View Audit History"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onDeleteClick(entry)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all cursor-pointer"
                            title="Delete Entry"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
