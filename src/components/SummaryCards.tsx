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
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
      {/* Today's Status Card */}
      <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-purple-500 to-indigo-600 text-white rounded-xl p-3.5 shadow-sm flex flex-col justify-between">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-purple-100 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            Today ({formatDateDisplay(todayStr, false)})
          </span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>
        <div className="mt-2">
          {todayEntry ? (
            <div className="flex items-center gap-2">
              <StatusBadge statusId={todayEntry.currentStatusId} statuses={statuses} size="md" />
              {todayEntry.originalStatusId !== todayEntry.currentStatusId && (
                <span className="text-[10px] bg-purple-900/60 text-purple-200 px-1.5 py-0.5 rounded border border-purple-400/40">
                  Changed from {todayEntry.originalStatusId}
                </span>
              )}
            </div>
          ) : (
            <span className="text-sm font-semibold text-purple-100">No roster set</span>
          )}
        </div>
      </div>

      {/* Working Days Card */}
      <div
        onClick={() => onFilterStatus('RTD')}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-2xs hover:border-purple-300 dark:hover:border-purple-700 cursor-pointer transition-all"
      >
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
          <span className="flex items-center gap-1">
            <Briefcase className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
            Working
          </span>
          <span className="text-[10px] text-slate-400">Days</span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="text-xl font-bold text-slate-900 dark:text-white">{workingDays}</span>
          <span className="text-xs text-slate-400 font-normal">/ {totalDays}</span>
        </div>
      </div>

      {/* Days Off Card */}
      <div
        onClick={() => onFilterStatus('DOF')}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-2xs hover:border-red-300 dark:hover:border-red-700 cursor-pointer transition-all"
      >
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-red-500" />
            Days Off
          </span>
          <span className="text-[10px] text-slate-400">DOF</span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="text-xl font-bold text-slate-900 dark:text-white">{daysOff}</span>
          <span className="text-xs text-slate-400 font-normal">days</span>
        </div>
      </div>

      {/* Holidays Card */}
      <div
        onClick={() => onFilterStatus('HOL')}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-2xs hover:border-amber-300 dark:hover:border-amber-700 cursor-pointer transition-all"
      >
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-amber-500" />
            Holidays
          </span>
          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">HOL</span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="text-xl font-bold text-amber-600 dark:text-amber-400">{holDays}</span>
          <span className="text-xs text-slate-400 font-normal">days</span>
        </div>
      </div>

      {/* WFH Days Card */}
      <div
        onClick={() => onFilterStatus('WFH')}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-2xs hover:border-purple-300 dark:hover:border-purple-700 cursor-pointer transition-all"
      >
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
          <span className="flex items-center gap-1">
            <Home className="w-3.5 h-3.5 text-purple-500" />
            WFH
          </span>
          <span className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold">Remote</span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="text-xl font-bold text-purple-600 dark:text-purple-400">{wfhDays}</span>
          <span className="text-xs text-slate-400 font-normal">days</span>
        </div>
      </div>

      {/* Leave Days Card */}
      <div
        onClick={() => onFilterStatus('LEAVE')}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-2xs hover:border-emerald-300 dark:hover:border-emerald-700 cursor-pointer transition-all"
      >
        <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-emerald-500" />
            Leave
          </span>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">All Leaves</span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{leaveDays}</span>
          <span className="text-xs text-slate-400 font-normal">days</span>
        </div>
      </div>

      {/* OT Card */}
      <div
        onClick={() => {
          if (onOpenOtCalculator) {
            onOpenOtCalculator();
          } else {
            onFilterStatus('OT');
          }
        }}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-2xs hover:border-orange-300 dark:hover:border-orange-700 cursor-pointer transition-all flex flex-col justify-between group"
      >
        <div>
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span className="flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-orange-500" />
              OT
            </span>
            <span className="text-[10px] text-orange-500 font-semibold group-hover:underline">Calculator</span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between">
            <span className="text-xl font-bold text-orange-600 dark:text-orange-400">{otDays}</span>
            <span className="text-xs text-slate-400 font-normal">days</span>
          </div>
        </div>
        {otTotalHours > 0 && (
          <div className="mt-1.5 text-[10px] text-slate-400 border-t border-slate-100 dark:border-slate-800/60 pt-1 leading-normal">
            <div className="flex justify-between items-center font-bold text-slate-700 dark:text-slate-300">
              <span>Total:</span>
              <span className="text-orange-600 dark:text-orange-400">{otTotalHours.toFixed(1)} hrs</span>
            </div>
            <div className="flex justify-between text-[8px] opacity-80 mt-0.5">
              <span>M: {otMorningHours.toFixed(1)}h | N: {otNightHours.toFixed(1)}h</span>
            </div>
          </div>
        )}
      </div>

      {/* Roster Changes Card */}
      <div
        onClick={onFilterChangedOnly}
        className="col-span-2 sm:col-span-1 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl p-3 shadow-2xs hover:border-amber-300 cursor-pointer transition-all"
      >
        <div className="flex items-center justify-between text-amber-800 dark:text-amber-300 text-xs font-medium">
          <span className="flex items-center gap-1">
            <FileSpreadsheet className="w-3.5 h-3.5 text-amber-600" />
            Roster Changes
          </span>
          <span className="text-[10px] bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 px-1 rounded font-bold">
            Diff
          </span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="text-xl font-bold text-amber-900 dark:text-amber-200">{changedCount}</span>
          <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">Original != Current</span>
        </div>
      </div>
    </div>
  );
};
