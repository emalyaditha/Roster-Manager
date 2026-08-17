import React from 'react';
import { RosterEntry, RosterStatusConfig } from '../types/roster';
import { StatusBadge } from './StatusBadge';
import { getTodayDateString, formatDateDisplay } from '../utils/date';
import {
  Calendar,
  Briefcase,
  Home,
  Clock,
  Award,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';

interface SummaryCardsProps {
  entries: RosterEntry[];
  statuses: RosterStatusConfig[];
  currentMonthYear: string;
  onFilterChangedOnly: () => void;
  onFilterStatus: (status: string) => void;
  onOpenOtCalculator?: () => void;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  entries,
  statuses,
  currentMonthYear,
  onFilterChangedOnly,
  onFilterStatus,
  onOpenOtCalculator,
}) => {
  const todayStr = getTodayDateString();
  const todayEntry = entries.find((e) => e.date === todayStr);

  // Month stats
  const totalDays = entries.length;

  const workingDays = entries.filter((e) => {
    const config = statuses.find((s) => s.code === e.currentStatusId);
    return config ? config.isWorkDay : ['RTD', 'NWD', 'Training', 'WFH', 'OT', 'DOS'].includes(e.currentStatusId);
  }).length;

  const daysOff = entries.filter((e) => e.currentStatusId === 'DOF').length;
  const holDays = entries.filter((e) => e.currentStatusId === 'HOL' || e.currentStatusId === 'HOLIDAY').length;
  const dosDays = entries.filter((e) => e.currentStatusId === 'DOS').length;
  const wfhDays = entries.filter((e) => e.currentStatusId === 'WFH').length;
  const leaveDays = entries.filter((e) => ['LEAVE', 'Short Leave', 'Leave(Half)', 'ML'].includes(e.currentStatusId)).length;
  const otDays = entries.filter((e) => e.ot || e.currentStatusId === 'OT').length;
  
  // Calculate OT hours for the month
  const otMorningHours = entries.reduce((acc, e) => acc + ((e.ot || e.currentStatusId === 'OT') ? e.otMorningHours || 0 : 0), 0);
  const otNightHours = entries.reduce((acc, e) => acc + ((e.ot || e.currentStatusId === 'OT') ? e.otNightHours || 0 : 0), 0);
  const otTotalHours = otMorningHours + otNightHours;

  const changedCount = entries.filter((e) => e.originalStatusId !== e.currentStatusId).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 mb-5">
      {/* Today's Status Card */}
      <div className="col-span-2 sm:col-span-1 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl p-3.5 flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-400 dark:text-slate-500 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            Today
          </span>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{formatDateDisplay(todayStr, false)}</span>
        </div>
        <div className="mt-2">
          {todayEntry ? (
            <div className="flex items-center gap-2">
              <StatusBadge statusId={todayEntry.currentStatusId} statuses={statuses} size="md" />
              {todayEntry.originalStatusId !== todayEntry.currentStatusId && (
                <span className="text-[10px] bg-white/10 dark:bg-black/10 text-slate-300 dark:text-slate-600 px-1.5 py-0.5 rounded">
                  Changed from {todayEntry.originalStatusId}
                </span>
              )}
            </div>
          ) : (
            <span className="text-sm font-semibold text-slate-400 dark:text-slate-500">No roster set</span>
          )}
        </div>
      </div>

      {/* Working Days */}
      <div
        onClick={() => onFilterStatus('RTD')}
        className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-3 hover:border-slate-300 dark:hover:border-zinc-700 cursor-pointer transition-colors"
      >
        <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 text-xs">
          <span className="flex items-center gap-1 font-medium">
            <Briefcase className="w-3.5 h-3.5" />
            Working
          </span>
          <span className="text-[10px]">Days</span>
        </div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">{workingDays}</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">/ {totalDays}</span>
        </div>
      </div>

      {/* Days Off */}
      <div
        onClick={() => onFilterStatus('DOF')}
        className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-3 hover:border-slate-300 dark:hover:border-zinc-700 cursor-pointer transition-colors"
      >
        <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 text-xs">
          <span className="flex items-center gap-1 font-medium">
            <Calendar className="w-3.5 h-3.5" />
            Days Off
          </span>
          <span className="text-[10px]">DOF</span>
        </div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">{daysOff}</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">days</span>
        </div>
      </div>

      {/* Holidays */}
      <div
        onClick={() => onFilterStatus('HOL')}
        className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-3 hover:border-amber-300 dark:hover:border-amber-700 cursor-pointer transition-colors"
      >
        <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 text-xs">
          <span className="flex items-center gap-1 font-medium">
            <Calendar className="w-3.5 h-3.5 text-amber-500" />
            Holidays
          </span>
          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">HOL</span>
        </div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">{holDays}</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">days</span>
        </div>
      </div>

      {/* WFH */}
      <div
        onClick={() => onFilterStatus('WFH')}
        className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-3 hover:border-slate-300 dark:hover:border-zinc-700 cursor-pointer transition-colors"
      >
        <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 text-xs">
          <span className="flex items-center gap-1 font-medium">
            <Home className="w-3.5 h-3.5" />
            WFH
          </span>
          <span className="text-[10px] font-medium">Remote</span>
        </div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">{wfhDays}</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">days</span>
        </div>
      </div>

      {/* Leave */}
      <div
        onClick={() => onFilterStatus('LEAVE')}
        className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-3 hover:border-slate-300 dark:hover:border-zinc-700 cursor-pointer transition-colors"
      >
        <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 text-xs">
          <span className="flex items-center gap-1 font-medium">
            <Clock className="w-3.5 h-3.5" />
            Leave
          </span>
          <span className="text-[10px] font-medium">All</span>
        </div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">{leaveDays}</span>
          <span className="text-xs text-slate-400 dark:text-slate-500">days</span>
        </div>
      </div>

      {/* OT */}
      <div
        onClick={() => {
          if (onOpenOtCalculator) {
            onOpenOtCalculator();
          } else {
            onFilterStatus('OT');
          }
        }}
        className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-3 hover:border-orange-300 dark:hover:border-orange-700 cursor-pointer transition-colors flex flex-col justify-between"
      >
        <div>
          <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 text-xs">
            <span className="flex items-center gap-1 font-medium">
              <Award className="w-3.5 h-3.5 text-orange-500" />
              OT
            </span>
            <span className="text-[10px] text-orange-500 font-medium">Calc</span>
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">{otDays}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">days</span>
          </div>
        </div>
        {otTotalHours > 0 && (
          <div className="mt-1.5 text-[10px] text-slate-400 border-t border-slate-100 dark:border-zinc-800/60 pt-1 leading-normal">
            <div className="flex justify-between items-center font-semibold text-slate-600 dark:text-slate-400">
              <span>Total</span>
              <span className="text-orange-600 dark:text-orange-400">{otTotalHours.toFixed(1)} hrs</span>
            </div>
            <div className="flex justify-between text-[9px] opacity-70 mt-0.5">
              <span>M: {otMorningHours.toFixed(1)}h | N: {otNightHours.toFixed(1)}h</span>
            </div>
          </div>
        )}
      </div>

      {/* Roster Changes */}
      <div
        onClick={onFilterChangedOnly}
        className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-3 hover:border-amber-300 dark:hover:border-amber-700 cursor-pointer transition-colors"
      >
        <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 text-xs">
          <span className="flex items-center gap-1 font-medium">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Changes
          </span>
          <span className="text-[10px] bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-slate-400 px-1.5 rounded font-medium">
            Diff
          </span>
        </div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">{changedCount}</span>
          <span className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">modified</span>
        </div>
      </div>
    </div>
  );
};
