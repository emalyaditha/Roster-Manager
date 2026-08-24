import React, { useState } from 'react';
import { RosterEntry, RosterStatusConfig } from '../types/roster';
import { getDatesInMonth, parseLocalDate } from '../utils/date';
import { Calendar as CalendarIcon, Info, Clock, ArrowRight } from 'lucide-react';

interface RosterCalendarViewProps {
  entries: RosterEntry[];
  statuses: RosterStatusConfig[];
  currentMonthYear: string;
  onMonthChange: (monthYear: string) => void;
  onEntryClick: (entry: RosterEntry) => void;
}

const formatTimeShort = (time?: string): string => {
  if (!time) return '';
  const raw = time.trim();
  const isPm = /pm$/i.test(raw);
  const isAm = /am$/i.test(raw);
  const cleaned = raw.replace(/(am|pm|a\.m\.|p\.m\.)/gi, '').trim().replace('.', ':');
  const parts = cleaned.split(':');
  if (parts.length < 1) return raw;
  let hours = parseInt(parts[0], 10);
  const minutes = parts.length === 2 ? parts[1] : '00';
  if (isNaN(hours)) return raw;
  if (isPm && hours < 12) hours += 12;
  if (isAm && hours === 12) hours = 0;
  const h12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  const ampm = hours >= 12 ? 'pm' : 'am';
  return `${h12}:${minutes} ${ampm}`;
};

export const RosterCalendarView = React.memo<RosterCalendarViewProps>(({
  entries,
  statuses,
  currentMonthYear,
  onEntryClick,
}) => {
  const [showLegend, setShowLegend] = useState<boolean>(false);

  const monthDates = getDatesInMonth(currentMonthYear);
  const entryMap = new Map<string, RosterEntry>();
  entries.forEach((e) => entryMap.set(e.date, e));

  const firstDateStr = monthDates[0];
  const firstDateObj = parseLocalDate(firstDateStr);
  const leadingBlankCount = firstDateObj.getDay();
  const leadingBlanks = Array.from({ length: leadingBlankCount });

  return (
    <div className="card overflow-hidden transition-all mb-24">
      {/* Calendar Bar */}
      <div className="p-4 border-b border-line flex flex-wrap items-center justify-between gap-3 bg-well/50">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-[var(--accent-soft)] text-accent">
            <CalendarIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-semibold text-fg text-sm leading-tight">
              Duty Roster Calendar
            </h3>
            <p className="text-[11px] text-muted">
              Click any date tile to view or update shift details
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowLegend(!showLegend)}
          className="btn-min btn-secondary shrink-0"
        >
          <Info className="w-3.5 h-3.5 text-accent" />
          <span>{showLegend ? 'Hide Legend' : 'Status Legend'}</span>
        </button>
      </div>

      {/* Expandable Legend Section */}
      {showLegend && (
        <div className="px-4 py-3 bg-well/50 border-b border-line animate-fadeIn">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
            {statuses.map((s) => (
              <div key={s.code} className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-surface border border-line">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="font-semibold text-fg">{s.code}</span>
                <span className="text-[11px] text-muted hidden sm:inline">({s.displayName})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendar Grid Container */}
      <div className="p-1.5 sm:p-4">
        {/* Day Name Headers */}
        <div className="grid grid-cols-7 gap-1 text-center font-medium text-muted text-[9px] sm:text-[11px] uppercase tracking-wide mb-1.5 sm:mb-2">
          <div>Sun</div>
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div>Sat</div>
        </div>

        {/* Days Grid */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 auto-rows-fr">
          {leadingBlanks.map((_, idx) => (
            <div
              key={`blank-${idx}`}
              className="min-h-[64px] sm:min-h-[84px] rounded-lg bg-well/40 border border-line p-1 opacity-40"
            />
          ))}

          {monthDates.map((dateStr) => {
            const entry = entryMap.get(dateStr);
            const dayNum = parseInt(dateStr.split('-')[2], 10);
            const isToday = new Date().toISOString().substring(0, 10) === dateStr;
            const isChanged = entry && entry.originalStatusId !== entry.currentStatusId;
            const statusConfig = entry ? statuses.find((s) => s.code === entry.currentStatusId) : null;

            return (
              <div
                key={dateStr}
                onClick={() => entry && onEntryClick(entry)}
                className={`group min-h-[64px] sm:min-h-[84px] rounded-lg border border-line bg-surface p-1.5 flex flex-col justify-between transition-colors cursor-pointer relative overflow-hidden hover:border-[var(--color-text-faint)] ${
                  isToday ? 'ring-1 ring-accent bg-[var(--accent-soft)]' : ''
                }`}
              >
                {/* Date Header Row */}
                <div className="flex items-center justify-between">
                  <span
                    className={`font-semibold w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[10px] sm:text-xs ${
                      isToday
                        ? 'bg-accent text-on-accent'
                        : 'text-fg'
                    }`}
                  >
                    {dayNum}
                  </span>

                  <div className="flex items-center gap-0.5 sm:gap-1">
                    {entry?.ot && (
                      <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full" style={{ background: 'var(--warning)' }} title="Overtime" />
                    )}
                    {isChanged && (
                      <span
                        className="text-[7px] sm:text-[8px] font-bold px-1 sm:px-1.5 py-0.5 rounded-full"
                        style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}
                      >
                        MOD
                      </span>
                    )}
                  </div>
                </div>

                {/* Status Pill */}
                {entry ? (
                  <div className="my-0.5 sm:my-1">
                    <div
                      className="px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-[9px] sm:text-xs font-semibold flex items-center justify-center sm:justify-between gap-1 truncate"
                      style={{
                        backgroundColor: statusConfig ? `${statusConfig.color}20` : 'var(--color-surface-alt)',
                        color: statusConfig?.color || 'var(--color-text-faint)',
                        border: `1px solid ${statusConfig ? `${statusConfig.color}40` : 'var(--color-border)'}`,
                      }}
                    >
                      <div className="flex items-center gap-0.5 sm:gap-1 truncate">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: statusConfig?.color || 'var(--color-text-faint)' }} />
                        <span className="truncate">{entry.currentStatusId}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <span className="text-[9px] sm:text-[10px] text-faint font-medium text-center">Off</span>
                )}

                {/* Clock Times - Mobile */}
                {entry && (entry.clockIn || entry.clockOut) && (
                  <div className="sm:hidden flex items-center justify-center gap-0.5 text-[8px] font-mono text-muted mt-0.5">
                    {entry.clockIn && <span>{formatTimeShort(entry.clockIn)}</span>}
                    {entry.clockIn && entry.clockOut && <ArrowRight className="w-2 h-2 shrink-0 text-faint" />}
                    {entry.clockOut && <span>{formatTimeShort(entry.clockOut)}</span>}
                  </div>
                )}

                {/* Action Text - Desktop */}
                {entry?.action && (
                  <div className="hidden sm:flex items-center gap-1 text-[10px] text-muted truncate">
                    <Clock className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">{entry.action}</span>
                  </div>
                )}

                {/* OT Badge */}
                {entry?.ot && ((entry.otMorningHours || 0) + (entry.otNightHours || 0)) > 0 && (
                  <div className="flex items-center justify-center sm:justify-start gap-1 mt-0.5 whitespace-nowrap overflow-hidden">
                    <span
                      className="px-1 py-0.5 rounded shrink-0 text-[8px] font-semibold"
                      style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}
                    >
                      OT {((entry.otMorningHours || 0) + (entry.otNightHours || 0)).toFixed(1)}h
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});
