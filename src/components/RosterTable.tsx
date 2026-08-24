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
  Calendar,
  MessageSquare,
  CheckSquare,
  Square,
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

export const RosterTable = React.memo<RosterTableProps>(({
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
        <div className="bg-[var(--accent-soft)] px-4 py-3 border border-line flex items-center justify-between text-xs animate-fadeIn rounded-lg">
          <div className="flex items-center gap-2.5 font-semibold text-fg">
            <span className="w-5 h-5 rounded-md bg-accent text-on-accent flex items-center justify-center text-[10px] font-bold">
              {selectedIds.length}
            </span>
            <span>{selectedIds.length} roster entries selected</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onBulkEditClick}
              className="btn-min btn-primary"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Bulk Change
            </button>
          </div>
        </div>
      )}

      {/* Main Roster Schedule Table */}
      <div className="card overflow-hidden w-full relative">
        {entries.length === 0 ? (
          <div className="py-20 text-center text-muted">
            <div className="flex flex-col items-center justify-center gap-4">
              <div className="p-4 rounded-lg bg-well text-faint">
                <Calendar className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-sm text-fg">No roster entries found</p>
                <p className="text-xs text-muted max-w-sm leading-relaxed">
                  Try adjusting your search query, status filters, or import a new monthly roster file.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr>
                  <th className="py-2.5 pl-4 pr-2 w-10 text-center text-[11px] font-medium uppercase tracking-wide text-muted border-b border-line bg-well/50 select-none">
                    <button
                      type="button"
                      onClick={onToggleSelectAll}
                      className="text-faint hover:text-accent transition-colors cursor-pointer"
                      title={isAllSelected ? "Deselect All" : "Select All"}
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-4 h-4 text-accent" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                   <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted border-b border-line bg-well/50 min-w-[130px]">Date &amp; Day</th>
                   <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted border-b border-line bg-well/50 min-w-[140px]">Effective Roster</th>
                   <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted border-b border-line bg-well/50 min-w-[120px]">Original Status</th>
                   <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted border-b border-line bg-well/50 min-w-[130px]">Clock Times</th>
                   <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted border-b border-line bg-well/50 min-w-[120px]">OT &amp; Shift</th>
                   <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted border-b border-line bg-well/50 min-w-[160px]">Action &amp; Notes</th>
                   <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted border-b border-line bg-well/50 min-w-[120px]">Google Sync</th>
                   <th className="py-2.5 pr-4 pl-2 text-right text-[11px] font-medium uppercase tracking-wide text-muted border-b border-line bg-well/50 min-w-[120px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const isChanged = !!entry.changedStatusId;
                  const isSelected = selectedIds.includes(entry.id);
                  const isToday = entry.date === getTodayDateString();
                  const totalOtHours = (entry.otMorningHours || 0) + (entry.otNightHours || 0);

                  return (
                    <tr
                      key={entry.id}
                      className={`group border-b border-line hover:bg-well/60 transition-colors ${
                        isToday
                          ? 'bg-[var(--accent-soft)]'
                          : isSelected
                          ? 'bg-[var(--accent-soft)]'
                          : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-2.5 pl-4 pr-2 text-center align-middle text-sm text-fg">
                        <button
                          type="button"
                          onClick={() => onToggleSelect(entry.id)}
                          className="text-faint hover:text-accent transition-colors cursor-pointer"
                        >
                          {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-accent" />
                          ) : (
                            <Square className="w-4 h-4 opacity-50 group-hover:opacity-100" />
                          )}
                        </button>
                      </td>

                      {/* Date & Day */}
                      <td className="px-3 py-2.5 text-sm text-fg align-middle">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-fg tracking-tight text-xs">
                                {formatDateDisplay(entry.date)}
                              </span>
                              {isToday && (
                                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold bg-fg text-page tracking-wide uppercase">
                                  TODAY
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] font-medium text-muted">
                              {entry.day}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Effective Roster Badge */}
                      <td className="px-3 py-2.5 text-sm text-fg align-middle">
                        <div className="flex items-center gap-1.5">
                          <CurrentEffectiveTooltip entry={entry} statuses={statuses} size="md" />
                          {isChanged && (
                            <span
                              className="w-2 h-2 rounded-full animate-pulse shrink-0"
                              style={{ background: 'var(--warning)' }}
                              title="Roster Modified from Original"
                            />
                          )}
                        </div>
                      </td>

                      {/* Original Status */}
                      <td className="px-3 py-2.5 text-sm text-fg align-middle">
                        <StatusBadge statusId={entry.originalStatusId} statuses={statuses} size="sm" />
                      </td>

                      {/* Clock In / Out Times */}
                      <td className="px-3 py-2.5 text-sm text-fg align-middle">
                        {entry.clockIn || entry.clockOut ? (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-well border border-line text-[11px] font-mono font-semibold text-fg">
                             <Clock className="w-3 h-3 text-muted shrink-0" />
                            <span>{entry.clockIn || '--:--'}</span>
                            <span className="text-faint">&rarr;</span>
                            <span>{entry.clockOut || '--:--'}</span>
                          </div>
                        ) : (
                          <span className="text-faint text-[11px] italic">--</span>
                        )}
                      </td>

                      {/* OT & Shift Details */}
                      <td className="px-3 py-2.5 text-sm text-fg align-middle">
                        {entry.ot || totalOtHours > 0 ? (
                          <div className="inline-flex flex-col gap-0.5">
                            <span
                              className="px-2 py-0.5 rounded-md font-bold text-[10px] w-fit"
                              style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}
                            >
                              + OT {totalOtHours > 0 ? `${totalOtHours.toFixed(1)}h` : 'Shift'}
                            </span>
                            {totalOtHours > 0 && (
                              <span className="text-[9px] font-medium text-muted">
                                M:{entry.otMorningHours || 0}h | N:{entry.otNightHours || 0}h
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-faint text-[11px]">Standard</span>
                        )}
                      </td>

                      {/* Action & Notes */}
                      <td className="px-3 py-2.5 text-sm text-fg align-middle">
                        <div className="flex flex-col gap-0.5 max-w-[200px]">
                          {entry.action && (
                            <span className="font-medium text-fg text-xs truncate">
                              {entry.action}
                            </span>
                          )}
                          {entry.notes ? (
                            <span className="text-[11px] text-muted italic flex items-center gap-1 truncate" title={entry.notes}>
                              <MessageSquare className="w-3 h-3 shrink-0 text-faint" />
                              <span className="truncate">{entry.notes}</span>
                            </span>
                          ) : !entry.action ? (
                            <span className="text-faint text-[11px] italic">No notes</span>
                          ) : null}
                        </div>
                      </td>

                      {/* Google Calendar Sync */}
                      <td className="px-3 py-2.5 text-sm text-fg align-middle">
                        {entry.googleCalendarSyncStatus === 'Synced' ? (
                          <span className="chip chip-success">
                            <CheckCircle2 className="w-3 h-3" />
                            Synced
                          </span>
                        ) : entry.googleCalendarSyncStatus === 'Sync Failed' ? (
                          <button
                            onClick={() => onSyncSingleClick(entry)}
                            className="chip chip-danger cursor-pointer"
                            title="Click to retry calendar sync"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            Retry
                          </button>
                        ) : (
                          <button
                            onClick={() => onSyncSingleClick(entry)}
                            className="chip chip-neutral cursor-pointer"
                            title="Sync to Google Calendar"
                          >
                            <RefreshCw className="w-3 h-3" />
                            Sync
                          </button>
                        )}
                      </td>

                      {/* Row Actions */}
                      <td className="py-2.5 pr-4 pl-2 align-middle text-right text-sm text-fg">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onChangeRosterClick(entry)}
                            className="btn-icon w-7 h-7"
                            title="Edit Roster Status"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onHistoryClick(entry)}
                            className="btn-icon w-7 h-7"
                            title="View Audit History"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onDeleteClick(entry)}
                            className="btn-icon w-7 h-7"
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
});
