import React, { useState } from 'react';
import { RosterEntry, RosterStatusConfig } from '../types/roster';
import { getDatesInMonth, parseLocalDate } from '../utils/date';
import { Calendar as CalendarIcon, Info, ChevronRight, MessageSquare, Clock } from 'lucide-react';

interface RosterCalendarViewProps {
  entries: RosterEntry[];
  statuses: RosterStatusConfig[];
  currentMonthYear: string;
  onMonthChange: (monthYear: string) => void;
  onEntryClick: (entry: RosterEntry) => void;
}

export const RosterCalendarView: React.FC<RosterCalendarViewProps> = ({
  entries,
  statuses,
  currentMonthYear,
  onEntryClick,
}) => {
  const [showLegend, setShowLegend] = useState<boolean>(false);

  // Month grid setup
  const monthDates = getDatesInMonth(currentMonthYear);
  const entryMap = new Map<string, RosterEntry>();
  entries.forEach((e) => entryMap.set(e.date, e));

  // Get leading empty days for month alignment
  const firstDateStr = monthDates[0];
  const firstDateObj = parseLocalDate(firstDateStr);
  const leadingBlankCount = firstDateObj.getDay(); // 0 = Sun, 1 = Mon ...
  const leadingBlanks = Array.from({ length: leadingBlankCount });

  return (
    <div className="bg-white dark:bg-zinc-900/90 border border-slate-200 dark:border-zinc-800/80 rounded-3xl shadow-sm overflow-hidden transition-all mb-24">
      {/* Calendar Bar */}
      <div className="p-4 border-b border-slate-200 dark:border-zinc-800/80 flex items-center justify-between gap-3 bg-slate-50/80 dark:bg-zinc-950/60">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
            <CalendarIcon className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white text-sm leading-tight">
              Duty Roster Calendar
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              Click any date tile to view or update shift details
            </p>
          </div>
        </div>

        {/* Legend Toggle Button */}
        <button
          onClick={() => setShowLegend(!showLegend)}
          className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-300 font-bold text-xs transition-colors flex items-center gap-1.5 shrink-0"
        >
          <Info className="w-3.5 h-3.5 text-purple-500" />
          <span>{showLegend ? 'Hide Legend' : 'Status Legend'}</span>
        </button>
      </div>

      {/* Expandable Legend Section */}
      {showLegend && (
        <div className="px-4 py-3 bg-slate-100/60 dark:bg-zinc-950/80 border-b border-slate-200 dark:border-zinc-800/80 animate-fadeIn">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {statuses.map((s) => (
              <div key={s.code} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                <span className="font-extrabold text-slate-900 dark:text-white">{s.code}</span>
                <span className="text-[11px] text-slate-500 dark:text-zinc-400">({s.displayName})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calendar Grid Container */}
      <div className="p-2 sm:p-4">
        {/* Day Name Headers */}
        <div className="grid grid-cols-7 gap-1 text-center font-extrabold text-slate-400 dark:text-zinc-500 text-[10px] sm:text-[11px] uppercase tracking-wider mb-2">
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
              className="min-h-[56px] sm:min-h-[88px] rounded-2xl bg-slate-50/40 dark:bg-zinc-950/20 border border-slate-100/60 dark:border-zinc-800/30 p-1 opacity-25"
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
                className={`group min-h-[60px] sm:min-h-[92px] rounded-2xl sm:rounded-3xl border p-1.5 sm:p-2.5 flex flex-col justify-between transition-all cursor-pointer relative overflow-hidden ${
                  isToday
                    ? 'border-purple-500 ring-2 ring-purple-500/20 bg-purple-500/5 dark:bg-purple-950/20 shadow-sm'
                    : isChanged
                    ? 'border-amber-400/50 dark:border-amber-700/60 bg-amber-500/5 dark:bg-amber-950/15 hover:border-amber-400'
                    : 'border-slate-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/60 hover:border-purple-500/50 dark:hover:border-purple-500/50 hover:shadow-md'
                }`}
              >
                {/* Date Header Row */}
                <div className="flex items-center justify-between">
                  <span
                    className={`font-black w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[11px] sm:text-xs transition-transform group-hover:scale-110 ${
                      isToday
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-800 dark:text-zinc-200'
                    }`}
                  >
                    {dayNum}
                  </span>

                  {/* Indicators (MOD & OT) */}
                  <div className="flex items-center gap-1">
                    {entry?.ot && (
                      <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-orange-500" title="Overtime Shift" />
                    )}
                    {isChanged && (
                      <span className="text-[8px] font-extrabold px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300">
                        MOD
                      </span>
                    )}
                  </div>
                </div>

                {/* Status Pill in Center */}
                {entry ? (
                  <div className="my-1">
                    <div
                      className="px-2 py-1 rounded-xl text-[10px] sm:text-xs font-extrabold flex items-center justify-between gap-1 shadow-2xs truncate"
                      style={{
                        backgroundColor: statusConfig ? `${statusConfig.color}20` : 'rgba(148, 163, 184, 0.2)',
                        color: statusConfig?.color || '#a1a1aa',
                        border: `1px solid ${statusConfig ? `${statusConfig.color}40` : 'rgba(148, 163, 184, 0.3)'}`,
                      }}
                    >
                      <div className="flex items-center gap-1 truncate">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: statusConfig?.color || '#a1a1aa' }} />
                        <span className="truncate">{entry.currentStatusId}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-300 dark:text-zinc-700 hidden sm:inline font-medium">Off</span>
                )}

                {/* Bottom Row Action Indicator */}
                {entry?.action && (
                  <div className="hidden sm:flex items-center gap-1 text-[9px] text-slate-400 dark:text-zinc-500 font-medium truncate">
                    <Clock className="w-2.5 h-2.5 shrink-0" />
                    <span className="truncate">{entry.action}</span>
                  </div>
                )}

                {entry?.ot && ((entry.otMorningHours || 0) + (entry.otNightHours || 0)) > 0 && (
                  <div className="flex items-center gap-1 text-[8px] font-semibold text-orange-600 dark:text-orange-400 mt-0.5 whitespace-nowrap overflow-hidden">
                    <span className="bg-orange-100 dark:bg-orange-950 px-1 py-0.2 rounded shrink-0">
                      OT: {((entry.otMorningHours || 0) + (entry.otNightHours || 0)).toFixed(1)}h
                    </span>
                    <span className="text-[7px] opacity-75 hidden md:inline">
                      (M:{(entry.otMorningHours || 0).toFixed(0)}/N:{(entry.otNightHours || 0).toFixed(0)})
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
};

