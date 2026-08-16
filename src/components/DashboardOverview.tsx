import React, { useState, useEffect } from 'react';
import { RosterEntry, RosterStatusConfig, RosterChangeHistory, AppSettings, OtDayResult } from '../types/roster';
import { api } from '../services/api';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { formatMonthYearDisplay } from '../utils/date';
import { LayoutDashboard, BarChart2, TrendingUp, PieChart as PieIcon } from 'lucide-react';
import { calculateDayOt, DEFAULT_OT_SETTINGS, formatTo12hDisplay } from '../utils/otCalculator';
import { LeaveBalanceCard } from './LeaveBalanceCard';
import { LeaveRow } from '../types/roster';
import { DosDofLedger } from './DosDofLedger';
import { useIsMobile } from '../hooks/useIsMobile';

interface DashboardOverviewProps {
  entries: RosterEntry[];
  statuses: RosterStatusConfig[];
  currentMonthYear: string;
  settings?: AppSettings;
  leaveRows: LeaveRow[];
  leaveLoading: boolean;
  onSyncLeave: () => Promise<void>;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  entries,
  statuses,
  currentMonthYear,
  settings,
  leaveRows,
  leaveLoading,
  onSyncLeave,
}) => {
  const [history, setHistory] = useState<RosterChangeHistory[]>([]);
  const isMobile = useIsMobile(640);

  useEffect(() => {
    let active = true;
    const fetchHistory = async () => {
      try {
        const data = await api.getHistory();
        if (active) {
          setHistory(data);
        }
      } catch (err) {
        console.error('Failed to fetch roster change history for dashboard:', err);
      }
    };
    fetchHistory();
    return () => {
      active = false;
    };
  }, [entries]);

  // Status Distribution Data
  const statusCounts = new Map<string, number>();
  entries.forEach((e) => {
    statusCounts.set(e.currentStatusId, (statusCounts.get(e.currentStatusId) || 0) + 1);
  });

  const pieData = Array.from(statusCounts.entries()).map(([code, count]) => {
    const config = statuses.find((s) => s.code === code);
    return {
      name: code,
      value: count,
      color: config?.color || '#94a3b8',
    };
  });

  const totalDays = pieData.reduce((sum, item) => sum + item.value, 0);

  // Original vs Changed Comparison Data
  let originalCounts = new Map<string, number>();
  let currentCounts = new Map<string, number>();

  entries.forEach((e) => {
    originalCounts.set(e.originalStatusId, (originalCounts.get(e.originalStatusId) || 0) + 1);
    currentCounts.set(e.currentStatusId, (currentCounts.get(e.currentStatusId) || 0) + 1);
  });

  const allStatusKeys = Array.from(new Set([...originalCounts.keys(), ...currentCounts.keys()]));

  const comparisonData = allStatusKeys.map((code) => ({
    status: code,
    Original: originalCounts.get(code) || 0,
    Current: currentCounts.get(code) || 0,
  }));

  // Changed Breakdown
  const changedEntries = entries.filter((e) => e.originalStatusId !== e.currentStatusId);

  // Overtime Breakdown (All entries with OT) using the compliant calculateDayOt
  const otSettings = settings?.otCalculationSettings || DEFAULT_OT_SETTINGS;
  const calculatedOtEntries = entries.map((entry) => {
    const res = calculateDayOt(entry, entry.clockIn, entry.clockOut, otSettings);
    return {
      entry,
      res,
    };
  }).filter(({ entry, res }) => {
    return (entry.otMorningHours || 0) > 0 || (entry.otNightHours || 0) > 0 || res.billableOtMinutes > 0 || res.rawOtMinutes > 0;
  });

  const allOtEntries = [...calculatedOtEntries]
    .sort((a, b) => new Date(a.entry.date).getTime() - new Date(b.entry.date).getTime());

  const formatHoursMinutes = (hours: number): string => {
    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}min`;
  };

  const breakdownFor = (item: { entry: RosterEntry; res: OtDayResult }) => {
    const { entry, res } = item;
    const rawMorning = (entry.otMorningHours || 0) > 0
      ? entry.otMorningHours as number
      : res.earlyInMinutes > 0 ? parseFloat((res.earlyInMinutes / 60).toFixed(2)) : 0;
    const rawNight = (entry.otNightHours || 0) > 0
      ? entry.otNightHours as number
      : res.lateOutMinutes > 0 ? parseFloat((res.lateOutMinutes / 60).toFixed(2)) : 0;
    const rawTotal = rawMorning + rawNight;
    const billable = res.billableOtMinutes / 60;
    const morning = rawTotal > 0 ? parseFloat((billable * (rawMorning / rawTotal)).toFixed(2)) : 0;
    const night = rawTotal > 0 ? parseFloat((billable * (rawNight / rawTotal)).toFixed(2)) : 0;
    const total = parseFloat(billable.toFixed(2));
    return { morning, night, total };
  };

  const otTotals = allOtEntries.reduce(
    (acc, item) => {
      const b = breakdownFor(item);
      acc.morning += b.morning;
      acc.night += b.night;
      acc.total += b.total;
      return acc;
    },
    { morning: 0, night: 0, total: 0 },
  );

  return (
    <div className="space-y-6 mb-24">
      {/* Leave Balance Card */}
      <LeaveBalanceCard
        year={parseInt(currentMonthYear.split('-')[0], 10)}
        rows={leaveRows}
        loading={leaveLoading}
        onSync={onSyncLeave}
      />

      {/* Day-Off Settlement Ledger */}
      <DosDofLedger entries={entries} />

      {/* Dashboard Section Title */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-zinc-800/80">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <LayoutDashboard className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            Roster Analytics & Trends — {formatMonthYearDisplay(currentMonthYear)}
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
            Real-time analytics comparing original office assignments vs actual roster modifications
          </p>
        </div>
      </div>

      {/* Analytics Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Chart 1: Roster Distribution */}
        <div className="bg-white dark:bg-zinc-900/90 p-5 rounded-3xl border border-slate-200 dark:border-zinc-800/80 shadow-xs">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
            <PieIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            Current Roster Distribution
          </h3>

          {pieData.length === 0 ? (
            <div className="py-16 text-center text-xs text-slate-400 dark:text-zinc-500 border border-dashed border-slate-200 dark:border-zinc-800 rounded-2xl">
              No roster data to display.
            </div>
          ) : (
            <div className="flex flex-col items-center gap-5">
              <div className="relative h-44 w-full max-w-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={62}
                      outerRadius={86}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: '1px solid #ebebeb',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-extrabold text-slate-900 dark:text-white leading-none">
                    {totalDays}
                  </span>
                  <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                    days
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-6 gap-y-2 w-full">
                {pieData.map((item) => {
                  const pct = totalDays > 0 ? Math.round((item.value / totalDays) * 100) : 0;
                  return (
                    <div
                      key={item.name}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ background: item.color }}
                        />
                        <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                          {item.name}
                        </span>
                      </span>
                      <span className="font-bold text-slate-900 dark:text-white whitespace-nowrap">
                        {item.value}
                        <span className="text-slate-400 dark:text-zinc-500 font-medium ml-1">
                          {pct}%
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Chart 2: Original vs Current Comparison */}
        <div className="bg-white dark:bg-zinc-900/90 p-5 rounded-3xl border border-slate-200 dark:border-zinc-800/80 shadow-xs">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
            <BarChart2 className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            Original Office Roster vs Current Active
          </h3>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonData}>
                <XAxis dataKey="status" stroke="#a1a1aa" fontSize={11} />
                <YAxis stroke="#a1a1aa" fontSize={11} />
                <Tooltip />
                <Bar dataKey="Original" fill="#71717a" radius={[6, 6, 0, 0]} name="Original Office" />
                <Bar dataKey="Current" fill="#a855f7" radius={[6, 6, 0, 0]} name="Current Active" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Roster Change Audit Table in Dashboard */}
      <div className="bg-white dark:bg-zinc-900/90 p-5 rounded-3xl border border-slate-200 dark:border-zinc-800/80 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-500" />
              Roster Modifications Breakdown ({changedEntries.length} entries changed)
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
              List of all days where Changed Roster diverges from Original Roster
            </p>
          </div>
        </div>

        {changedEntries.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 dark:text-zinc-500 border border-dashed border-slate-200 dark:border-zinc-800 rounded-2xl">
            No roster changes recorded for this month.
          </div>
        ) : isMobile ? (
          <div className="space-y-3">
            {changedEntries.map((e) => {
              const entryHistory = history
                .filter((h) => h.rosterEntryId === e.id || h.date === e.date)
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
              const reason = entryHistory[0]?.reason || e.notes || e.action || 'Roster status changed';

              return (
                <div key={e.id} className="border border-slate-200 dark:border-zinc-800 rounded-xl p-3.5 space-y-2">
                  <div className="font-extrabold text-slate-900 dark:text-white text-xs">
                    {e.date} ({e.day})
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-slate-500 dark:text-zinc-400 font-medium">Original: {e.originalStatusId}</span>
                    <span className="text-slate-300 dark:text-zinc-700">→</span>
                    <span className="font-extrabold text-purple-600 dark:text-purple-400">{e.currentStatusId}</span>
                  </div>
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-relaxed">{reason}</div>
                  {e.notes && <div className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">{e.notes}</div>}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-800 text-slate-400 dark:text-zinc-500 font-extrabold text-[10px] uppercase">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Original</th>
                  <th className="py-2.5 px-3">Current</th>
                  <th className="py-2.5 px-3">Reason for Change</th>
                  <th className="py-2.5 px-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
                {changedEntries.map((e) => {
                  const entryHistory = history
                    .filter((h) => h.rosterEntryId === e.id || h.date === e.date)
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                  const reason = entryHistory[0]?.reason || e.notes || e.action || 'Roster status changed';

                  return (
                    <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-extrabold text-slate-900 dark:text-white">{e.date} ({e.day})</td>
                      <td className="py-2.5 px-3 text-slate-500 dark:text-zinc-400 font-medium">{e.originalStatusId}</td>
                      <td className="py-2.5 px-3 font-extrabold text-purple-600 dark:text-purple-400">{e.currentStatusId}</td>
                      <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300">{reason}</td>
                      <td className="py-2.5 px-3 text-slate-500 dark:text-zinc-400">{e.notes || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Overtime Modifications Breakdown */}
      <div className="bg-white dark:bg-zinc-900/90 p-5 rounded-3xl border border-slate-200 dark:border-zinc-800/80 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              Overtime Modifications Breakdown (All entries with OT)
            </h3>
            <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
              Detailed list of overtime allocations, clock timings, and calculated morning/night OT hours with a monthly total
            </p>
          </div>
        </div>

        {calculatedOtEntries.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 dark:text-zinc-500 border border-dashed border-slate-200 dark:border-zinc-800 rounded-2xl">
            No overtime entries recorded for this month.
          </div>
        ) : isMobile ? (
          <div className="space-y-3">
            {allOtEntries.map((item) => {
              const { entry, res } = item;
              const { total } = breakdownFor(item);
              const hasEarlyOt = res.earlyInMinutes > 0;
              const hasLateOt = res.lateOutMinutes > 0;

              return (
                <div key={entry.id} className="border border-slate-200 dark:border-zinc-800 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-slate-900 dark:text-white text-xs">
                      {entry.date} ({entry.day})
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 shrink-0">
                      {entry.currentStatusId}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="bg-slate-50 dark:bg-zinc-800/60 rounded-lg py-1.5">
                      <div className="text-[9px] font-bold uppercase text-slate-400 dark:text-zinc-500 tracking-wider">In Time</div>
                      <div className="text-xs font-mono font-medium text-slate-600 dark:text-slate-300 mt-0.5">
                        {res.actualClockIn ? formatTo12hDisplay(res.actualClockIn) : '-'}
                      </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-zinc-800/60 rounded-lg py-1.5">
                      <div className="text-[9px] font-bold uppercase text-slate-400 dark:text-zinc-500 tracking-wider">Out Time</div>
                      <div className="text-xs font-mono font-medium text-slate-600 dark:text-slate-300 mt-0.5">
                        {res.actualClockOut ? formatTo12hDisplay(res.actualClockOut) : '-'}
                      </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-zinc-800/60 rounded-lg py-1.5">
                      <div className="text-[9px] font-bold uppercase text-slate-400 dark:text-zinc-500 tracking-wider">OT Start</div>
                      <div className="text-xs font-mono font-medium text-slate-600 dark:text-slate-300 mt-0.5">
                        {hasEarlyOt && formatTo12hDisplay(res.actualClockIn)}
                        {hasEarlyOt && hasLateOt && <br />}
                        {hasLateOt && formatTo12hDisplay(res.scheduledEnd)}
                        {!hasEarlyOt && !hasLateOt && '-'}
                      </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-zinc-800/60 rounded-lg py-1.5">
                      <div className="text-[9px] font-bold uppercase text-slate-400 dark:text-zinc-500 tracking-wider">OT End</div>
                      <div className="text-xs font-mono font-medium text-slate-600 dark:text-slate-300 mt-0.5">
                        {hasEarlyOt && formatTo12hDisplay(res.scheduledStart)}
                        {hasEarlyOt && hasLateOt && <br />}
                        {hasLateOt && formatTo12hDisplay(res.actualClockOut)}
                        {!hasEarlyOt && !hasLateOt && '-'}
                      </div>
                    </div>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-950/40 rounded-lg py-1.5 text-center">
                    <div className="text-[9px] font-bold uppercase text-purple-500 dark:text-purple-400 tracking-wider">Total H</div>
                    <div className="text-xs font-mono font-extrabold text-purple-600 dark:text-purple-400 mt-0.5">
                      {total > 0 ? formatHoursMinutes(total) : '-'}
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center justify-between border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-800/60 rounded-xl px-4 py-3">
              <span className="font-extrabold text-slate-900 dark:text-white text-xs">Total OT (All Dates)</span>
              <span className="font-extrabold text-purple-600 dark:text-purple-400 font-mono text-sm">
                {formatHoursMinutes(otTotals.total)}
              </span>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-zinc-800 text-slate-400 dark:text-zinc-500 font-extrabold text-[10px] uppercase">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">In Time</th>
                  <th className="py-2.5 px-3">Out Time</th>
                  <th className="py-2.5 px-3">OT Start Time</th>
                  <th className="py-2.5 px-3">OT End Time</th>
                  <th className="py-2.5 px-3 text-right">Total H</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
                {allOtEntries.map((item) => {
                  const { entry, res } = item;
                  const { total } = breakdownFor(item);
                  const hasEarlyOt = res.earlyInMinutes > 0;
                  const hasLateOt = res.lateOutMinutes > 0;

                  return (
                    <tr key={entry.id} className="hover:bg-slate-50 dark:hover:bg-zinc-800/40 transition-colors">
                      <td className="py-2.5 px-3 font-extrabold text-slate-900 dark:text-white">
                        {entry.date} ({entry.day})
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 font-medium font-mono">
                        {res.actualClockIn ? formatTo12hDisplay(res.actualClockIn) : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 font-medium font-mono">
                        {res.actualClockOut ? formatTo12hDisplay(res.actualClockOut) : '-'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 font-medium font-mono leading-relaxed">
                        {hasEarlyOt && formatTo12hDisplay(res.actualClockIn)}
                        {hasEarlyOt && hasLateOt && <br />}
                        {hasLateOt && formatTo12hDisplay(res.scheduledEnd)}
                        {!hasEarlyOt && !hasLateOt && '-'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 font-medium font-mono leading-relaxed">
                        {hasEarlyOt && formatTo12hDisplay(res.scheduledStart)}
                        {hasEarlyOt && hasLateOt && <br />}
                        {hasLateOt && formatTo12hDisplay(res.actualClockOut)}
                        {!hasEarlyOt && !hasLateOt && '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-extrabold text-purple-600 dark:text-purple-400 font-mono">
                        {total > 0 ? formatHoursMinutes(total) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800/60">
                  <td colSpan={5} className="py-3 px-3 font-extrabold text-slate-900 dark:text-white">
                    Total OT (All Dates)
                  </td>
                  <td className="py-3 px-3 text-right font-extrabold text-purple-600 dark:text-purple-400 font-mono">
                    {formatHoursMinutes(otTotals.total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
