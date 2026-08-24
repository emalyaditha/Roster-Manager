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

export const RosterCardList = React.memo<RosterCardListProps>(({
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
    <div className="flex flex-col gap-2.5 md:hidden mb-20 relative z-10">
      {entries.map((entry, idx) => {
        const isChanged = !!entry.changedStatusId;
        const isSelected = selectedIds.includes(entry.id);
        const isToday = entry.date === todayStr;
        const totalOtHours = (entry.otMorningHours || 0) + (entry.otNightHours || 0);

        return (
          <div
            key={entry.id}
            className={`card p-3 space-y-2 ${idx < entries.length - 1 ? 'border-b border-line' : ''} ${
              isToday || isSelected ? 'bg-[var(--accent-soft)]' : ''
            }`}
          >
            {/* Top Row: Date, Day, Today Pill & Select */}
            <div className="flex items-center justify-between pb-2 border-b border-line">
              <div className="flex items-center gap-2.5">
                {onToggleSelect && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(entry.id)}
                    className="w-4 h-4 cursor-pointer"
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                )}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-fg tracking-tight">
                    {formatDateDisplay(entry.date)}
                  </span>
                  <span className="text-xs font-medium text-muted">
                    ({entry.day.substring(0, 3)})
                  </span>
                  {isToday && (
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold bg-fg text-page tracking-wide uppercase">
                      TODAY
                    </span>
                  )}
                </div>
              </div>

              {/* Sync Status Badge */}
              {entry.googleCalendarSyncStatus === 'Synced' ? (
                <span className="chip chip-success">
                  <CheckCircle2 className="w-3 h-3" />
                  Synced
                </span>
              ) : (
                <button
                  onClick={() => onSyncSingleClick(entry)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted hover:text-fg transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  Sync
                </button>
              )}
            </div>

            {/* Middle Content: Status & Times */}
            <div className="flex items-start justify-between gap-2">
              {/* Effective Status */}
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-[9px] font-semibold text-faint uppercase tracking-wider">
                  Roster Status
                </span>
                <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                  <CurrentEffectiveTooltip entry={entry} statuses={statuses} size="md" />
                  {isChanged && (
                    <span
                      className="text-[10px] font-medium flex items-center gap-1 truncate"
                      style={{ color: 'var(--warning)' }}
                    >
                      (Was {entry.originalStatusId})
                    </span>
                  )}
                </div>
              </div>

              {/* Clock Times / OT */}
              <div className="flex flex-col items-end gap-1 shrink-0">
                {entry.clockIn || entry.clockOut ? (
                  <div className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-fg bg-well px-2.5 py-1 rounded-lg border border-line">
                    <Clock className="w-3 h-3 text-muted shrink-0" />
                    <span>{entry.clockIn || '--:--'}</span>
                    <span>-</span>
                    <span>{entry.clockOut || '--:--'}</span>
                  </div>
                ) : (
                  <span className="text-xs text-faint italic">No times</span>
                )}

                {totalOtHours > 0 && (
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-md"
                    style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}
                  >
                    + {totalOtHours.toFixed(1)}h OT
                  </span>
                )}
              </div>
            </div>

            {/* Notes if present */}
            {entry.notes && (
              <div className="px-2.5 py-1.5 rounded-lg bg-well text-[11px] text-muted flex items-center gap-1.5 italic">
                <MessageSquare className="w-3.5 h-3.5 text-faint shrink-0" />
                <span className="truncate">{entry.notes}</span>
              </div>
            )}

            {/* Bottom Row: Quick Actions */}
            <div className="pt-2 border-t border-line flex items-center justify-between gap-2">
              <button
                onClick={() => onChangeRosterClick(entry)}
                className="btn-min btn-secondary flex-1"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Change Status
              </button>

              <button
                onClick={() => onHistoryClick(entry)}
                className="btn-icon w-7 h-7"
                title="Audit History"
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
          </div>
        );
      })}
    </div>
  );
});
