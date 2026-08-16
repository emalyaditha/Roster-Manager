import React, { useState, useEffect } from 'react';
import { RosterEntry, AppSettings, OtCalculationSettings } from '../types/roster';
import { ClockTimePicker } from './ClockTimePicker';
import { api } from '../services/api';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  calculateDayOt,
  buildDosDofLedger,
  runComplianceAudit,
  getScheduledShiftWindow,
  DEFAULT_OT_SETTINGS,
} from '../utils/otCalculator';
import {
  Calculator,
  X,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  FileSpreadsheet,
  Settings,
  Clock,
  ShieldCheck,
  Calendar,
  Save,
  Download,
  Info,
  TrendingUp,
} from 'lucide-react';

interface OtCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: RosterEntry[];
  settings: AppSettings;
  statuses?: any[];
  currentMonthYear?: string;
  onUpdateSettings: (newSettings: AppSettings) => Promise<void>;
  onUpdateEntryClockTimes?: (entryId: string, clockIn: string, clockOut: string, remark?: string) => Promise<void>;
  onBulkUpdateClockTimes?: (updates: Array<{ id: string; clockIn: string; clockOut: string; remark?: string }>) => Promise<void>;
  onSyncComplete?: () => Promise<void>;
}

export const OtCalculatorModal: React.FC<OtCalculatorModalProps> = ({
  isOpen,
  onClose,
  entries,
  settings,
  onUpdateSettings,
  onUpdateEntryClockTimes,
  onBulkUpdateClockTimes,
  onSyncComplete,
}) => {
  const [activeTab, setActiveTab] = useState<'timesheet' | 'ledger' | 'audit' | 'settings'>('timesheet');
  const isMobile = useIsMobile(640);

  // OT Settings state
  const otSettings: OtCalculationSettings = settings.otCalculationSettings || DEFAULT_OT_SETTINGS;
  const [localOtSettings, setLocalOtSettings] = useState<OtCalculationSettings>(otSettings);
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Local Clock Time edits per entry ID
  const [clockTimes, setClockTimes] = useState<Record<string, { clockIn: string; clockOut: string }>>(() => {
    const initial: Record<string, { clockIn: string; clockOut: string }> = {};
    entries.forEach((e) => {
      const sched = getScheduledShiftWindow(e.currentStatusId || e.originalStatusId, e.action);
      initial[e.id] = {
        clockIn: e.clockIn || (sched ? sched.start : ''),
        clockOut: e.clockOut || (sched ? sched.end : ''),
      };
    });
    return initial;
  });

  // Local Remarks per entry ID
  const [entryRemarks, setEntryRemarks] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    entries.forEach((e) => {
      initial[e.id] = e.notes || '';
    });
    return initial;
  });

  // Stabilized key for entries changes
  const entriesHash = entries.map((e) => `${e.id}:${e.clockIn || ''}:${e.clockOut || ''}:${e.notes || ''}`).join('|');

  // Sync internal clock state when entries prop updates (e.g. after refresh or initial load)
  useEffect(() => {
    setClockTimes((prev) => {
      let changed = false;
      const next = { ...prev };
      entries.forEach((e) => {
        const sched = getScheduledShiftWindow(e.currentStatusId || e.originalStatusId, e.action);
        const defaultIn = sched ? sched.start : '';
        const defaultOut = sched ? sched.end : '';
        const targetIn = e.clockIn || prev[e.id]?.clockIn || defaultIn;
        const targetOut = e.clockOut || prev[e.id]?.clockOut || defaultOut;

        if (!prev[e.id] || prev[e.id].clockIn !== targetIn || prev[e.id].clockOut !== targetOut) {
          next[e.id] = { clockIn: targetIn, clockOut: targetOut };
          changed = true;
        }
      });
      return changed ? next : prev;
    });

    setEntryRemarks((prev) => {
      let changed = false;
      const next = { ...prev };
      entries.forEach((e) => {
        const targetRemark = e.notes || prev[e.id] || '';
        if (prev[e.id] === undefined || prev[e.id] !== targetRemark) {
          next[e.id] = targetRemark;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [entriesHash]);

  const handleClockChange = (entryId: string, field: 'clockIn' | 'clockOut', value: string) => {
    setClockTimes((prev) => ({
      ...prev,
      [entryId]: {
        ...prev[entryId],
        [field]: value,
      },
    }));
  };

  const handleRemarkChange = (entryId: string, value: string) => {
    setEntryRemarks((prev) => ({
      ...prev,
      [entryId]: value,
    }));
  };

  const handleSaveClockTimes = async () => {
    try {
      const changedUpdates: Array<{ id: string; clockIn: string; clockOut: string; remark?: string }> = [];
      for (const entry of entries) {
        const time = clockTimes[entry.id];
        const remark = entryRemarks[entry.id];
        if (
          time &&
          (time.clockIn !== (entry.clockIn || '') ||
            time.clockOut !== (entry.clockOut || '') ||
            (remark !== undefined && remark !== (entry.notes || '')))
        ) {
          changedUpdates.push({
            id: entry.id,
            clockIn: time.clockIn,
            clockOut: time.clockOut,
            remark,
          });
        }
      }

      if (changedUpdates.length > 0) {
        if (onBulkUpdateClockTimes) {
          await onBulkUpdateClockTimes(changedUpdates);
        } else if (onUpdateEntryClockTimes) {
          for (const u of changedUpdates) {
            await onUpdateEntryClockTimes(u.id, u.clockIn, u.clockOut, u.remark);
          }
        } else {
          await api.bulkUpdateClockTimes(changedUpdates);
        }
      }

      // Save OT calculations directly to Supabase ot_calculations table
      const updatedEntriesWithTimes = entries.map((e) => ({
        ...e,
        clockIn: clockTimes[e.id]?.clockIn !== undefined ? clockTimes[e.id]?.clockIn : e.clockIn,
        clockOut: clockTimes[e.id]?.clockOut !== undefined ? clockTimes[e.id]?.clockOut : e.clockOut,
        notes: entryRemarks[e.id] !== undefined ? entryRemarks[e.id] : e.notes,
      }));
      await api.saveOtCalculations(updatedEntriesWithTimes, { otCalculationSettings: localOtSettings });
      if (onSyncComplete) {
        await onSyncComplete();
      }
      setSaveMessage('Clock times, remarks, and OT calculations saved successfully to Supabase!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setSaveMessage('Failed to save clock times and OT calculations.');
    }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const updatedAppSettings: AppSettings = {
        ...settings,
        otCalculationSettings: localOtSettings,
      };
      await onUpdateSettings(updatedAppSettings);
      await api.saveOtCalculations(entries, updatedAppSettings);
      setSaveMessage('OT calculation rules and OT values saved successfully to Supabase!');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error(err);
      setSaveMessage('Failed to save OT settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  // Run Calculations
  const dayResults = entries.map((entry) => {
    const times = clockTimes[entry.id] || { clockIn: '', clockOut: '' };
    return calculateDayOt(entry, times.clockIn, times.clockOut, localOtSettings);
  });

  const totalBillableOtMinutes = dayResults.reduce((acc, curr) => acc + curr.billableOtMinutes, 0);
  const totalBillableOtHours = parseFloat((totalBillableOtMinutes / 60).toFixed(2));
  const totalRawOtMinutes = dayResults.reduce((acc, curr) => acc + curr.rawOtMinutes, 0);
  const totalRawOtHours = parseFloat((totalRawOtMinutes / 60).toFixed(2));
  const estimatedPayout = (localOtSettings.hourlyOtRate || 0) * totalBillableOtHours;

  const entriesWithOt = dayResults.filter((r) => r.billableOtMinutes > 0 || r.rawOtMinutes > 0);

  const ledger = buildDosDofLedger(entries);
  const audit = runComplianceAudit(entries, localOtSettings);

  const handleExportCsv = () => {
    const headers = [
      'Date',
      'Day',
      'Roster Status',
      'Scheduled Start',
      'Scheduled End',
      'Clock In',
      'Clock Out',
      'Early In (min)',
      'Late Out (min)',
      'Raw OT (min)',
      'Grace Deducted (min)',
      'Billable OT (min)',
      'Billable OT (hrs)',
      'Flags',
    ];

    const rows = dayResults.map((r) => [
      r.date,
      r.dayName,
      r.statusCode,
      r.scheduledStart || 'N/A',
      r.scheduledEnd || 'N/A',
      r.actualClockIn || '',
      r.actualClockOut || '',
      r.earlyInMinutes,
      r.lateOutMinutes,
      r.rawOtMinutes,
      r.graceDeductionMinutes,
      r.billableOtMinutes,
      r.billableOtHours,
      r.flags.join('; '),
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((row) => row.map((cell) => `"${cell}"`).join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `OT_Calculation_Timesheet_${entries[0]?.date || 'export'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden my-8 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400 shrink-0">
              <Calculator className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                OT Calculation & Day-Off Settlement Engine
                <span className="hidden sm:inline-block text-xs px-2 py-0.5 rounded-full bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-300 font-medium">
                  Payroll Specification Compliant
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Grace period, minimum thresholds, rounding rules & DOS/DOF ledger audit
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 py-2">
            <button
              onClick={() => setActiveTab('timesheet')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'timesheet'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Clock className="w-4 h-4" />
              OT Timesheet ({totalBillableOtHours} hrs)
            </button>

            <button
              onClick={() => setActiveTab('ledger')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'ledger'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Day Off Settlement Ledger ({ledger.owedBalance > 0 ? `+${ledger.owedBalance}` : ledger.owedBalance} Days)
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'audit'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              Compliance Audit ({audit.passCount}/{audit.items.length} Passed)
            </button>

            <button
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'settings'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Settings className="w-4 h-4" />
              OT Rules & Config
            </button>
          </div>

          <div className="flex items-center gap-2 py-2 shrink-0">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Download className="w-3.5 h-3.5 text-purple-500" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Notice Message */}
        {saveMessage && (
          <div className="bg-emerald-50 dark:bg-emerald-950/60 border-b border-emerald-200 dark:border-emerald-800 px-6 py-2 text-xs font-medium text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              {saveMessage}
            </span>
          </div>
        )}

        {/* Tab Contents */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* TAB 1: TIMESHEET */}
          {activeTab === 'timesheet' && (
            <div className="space-y-6">
              {/* Summary Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/50 rounded-xl p-4">
                  <div className="text-xs font-medium text-orange-700 dark:text-orange-400">Total Billable OT</div>
                  <div className="text-2xl font-bold text-orange-900 dark:text-orange-200 mt-1">
                    {totalBillableOtHours} <span className="text-sm font-normal text-orange-700">hrs</span>
                  </div>
                  <div className="text-[11px] text-orange-600/80 dark:text-orange-400/80 mt-0.5">
                    ({totalBillableOtMinutes} billable mins)
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Raw OT Before Rules</div>
                  <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                    {totalRawOtHours} <span className="text-sm font-normal text-slate-500">hrs</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Grace deducted: {totalRawOtMinutes - totalBillableOtMinutes} mins
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 rounded-xl p-4">
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Rules Applied</div>
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mt-1">
                    Grace: {localOtSettings.gracePeriodMinutes}m | Min: {localOtSettings.minimumOtThresholdMinutes}m
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5 capitalize">
                    Round: {localOtSettings.roundingRule} ({localOtSettings.roundingBlockMinutes}m block)
                  </div>
                </div>

                <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/50 rounded-xl p-4">
                  <div className="text-xs font-medium text-purple-700 dark:text-purple-400">Est. Overtime Pay</div>
                  <div className="text-2xl font-bold text-purple-900 dark:text-purple-200 mt-1">
                    {estimatedPayout > 0 ? `$${estimatedPayout.toFixed(2)}` : 'N/A'}
                  </div>
                  <div className="text-[11px] text-purple-600/80 dark:text-purple-400/80 mt-0.5">
                    {localOtSettings.hourlyOtRate ? `@ $${localOtSettings.hourlyOtRate}/hr` : 'Set rate in Settings'}
                  </div>
                </div>
              </div>

              {/* OT Breakdown */}
              <div className="bg-white dark:bg-zinc-900/90 p-5 rounded-2xl border border-slate-200 dark:border-zinc-800/80 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-orange-500" />
                      Overtime Modifications Breakdown ({entriesWithOt.length} entries with OT)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium mt-1">
                      List of all days where Raw or Billable Overtime was recorded
                    </p>
                  </div>
                </div>
                {entriesWithOt.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400 dark:text-zinc-500 border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl">
                    No overtime records found for this period.
                  </div>
                ) : isMobile ? (
                  <div className="space-y-2.5">
                    {entriesWithOt.map((e, i) => {
                      const formatDuration = (totalMinutes: number) => {
                        if (!totalMinutes || totalMinutes <= 0) return '0 min';
                        const hrs = Math.floor(totalMinutes / 60);
                        const mins = totalMinutes % 60;
                        if (hrs > 0 && mins > 0) return `${hrs}h ${mins}min`;
                        if (hrs > 0) return `${hrs}h`;
                        return `${mins}min`;
                      };

                      const formatTimeAMPM = (timeStr?: string) => {
                        if (!timeStr) return '-';
                        const parts = timeStr.split(':');
                        if (parts.length < 2) return timeStr;
                        let h = parseInt(parts[0], 10);
                        const m = parseInt(parts[1], 10);
                        if (isNaN(h) || isNaN(m)) return timeStr;
                        const ampm = h >= 12 ? 'PM' : 'AM';
                        h = h % 12;
                        h = h ? h : 12;
                        return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
                      };

                      return (
                        <div key={i} className="border border-slate-200 dark:border-zinc-800 rounded-xl p-3.5 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-extrabold text-slate-900 dark:text-white text-xs">{e.date}</span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                              {e.statusCode}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs gap-2">
                            <span className="text-slate-400 dark:text-zinc-500">
                              In: <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{formatTimeAMPM(e.actualClockIn)}</span>
                            </span>
                            <span className="text-slate-400 dark:text-zinc-500">
                              Out: <span className="font-mono font-medium text-slate-700 dark:text-slate-300">{formatTimeAMPM(e.actualClockOut)}</span>
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs border-t border-slate-100 dark:border-zinc-800 pt-2">
                            <span className="text-slate-400 dark:text-zinc-500">Raw OT</span>
                            <span className="font-mono font-bold text-orange-600 dark:text-orange-400">{formatDuration(e.rawOtMinutes)}</span>
                          </div>
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
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">In Time</th>
                          <th className="py-2.5 px-3">Out Time</th>
                          <th className="py-2.5 px-3">Raw OT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-zinc-800/80">
                        {entriesWithOt.map((e, i) => {
                          const formatDuration = (totalMinutes: number) => {
                            if (!totalMinutes || totalMinutes <= 0) return '0 min';
                            const hrs = Math.floor(totalMinutes / 60);
                            const mins = totalMinutes % 60;
                            if (hrs > 0 && mins > 0) return `${hrs}h ${mins}min`;
                            if (hrs > 0) return `${hrs}h`;
                            return `${mins}min`;
                          };

                          const formatTimeAMPM = (timeStr?: string) => {
                            if (!timeStr) return '-';
                            const parts = timeStr.split(':');
                            if (parts.length < 2) return timeStr;
                            let h = parseInt(parts[0], 10);
                            const m = parseInt(parts[1], 10);
                            if (isNaN(h) || isNaN(m)) return timeStr;
                            const ampm = h >= 12 ? 'PM' : 'AM';
                            h = h % 12;
                            h = h ? h : 12;
                            return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
                          };

                          return (
                            <tr key={i} className="hover:bg-slate-50/80 dark:hover:bg-zinc-800/50 transition-colors">
                              <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                                {e.date}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-slate-600 dark:text-slate-300">
                                {e.statusCode}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300">
                                {formatTimeAMPM(e.actualClockIn)}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300">
                                {formatTimeAMPM(e.actualClockOut)}
                              </td>
                              <td className="py-2.5 px-3 font-medium text-slate-700 dark:text-slate-300">
                                {formatDuration(e.rawOtMinutes)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Table Toolbar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-purple-500 shrink-0" />
                  Enter actual clock-in/out times to evaluate OT. Early-In and Late-Out are calculated against scheduled window baselines.
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={async () => {
                      try {
                        const startDate = entries[0]?.date;
                        const endDate = entries[entries.length - 1]?.date;
                        await api.syncClockEvents(startDate, endDate);
                        await api.saveOtCalculations(entries, { otCalculationSettings: localOtSettings });
                        if (onSyncComplete) {
                          await onSyncComplete();
                        }
                        setSaveMessage('Clock events re-synced with 3-day rolling backfill & OT saved to Supabase!');
                        setTimeout(() => setSaveMessage(null), 3500);
                      } catch (err) {
                        console.error(err);
                        setSaveMessage('Clock sync failed.');
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Sync Clock & OT
                  </button>
                  {onUpdateEntryClockTimes && (
                    <button
                      onClick={handleSaveClockTimes}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs transition-colors"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save Clock Times
                    </button>
                  )}
                </div>
              </div>

              {/* Calculation Table */}
              {isMobile ? (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800/60">
                  {entries.map((entry, idx) => {
                    const result = dayResults[idx];
                    const clock = clockTimes[entry.id] || { clockIn: '', clockOut: '' };

                    return (
                      <div
                        key={entry.id}
                        className={`p-3.5 space-y-3 ${
                          result.billableOtMinutes > 0 ? 'bg-orange-50/20 dark:bg-orange-950/10' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 dark:text-white text-xs">{entry.date}</div>
                            <div className="text-[10px] text-slate-400">{entry.day}</div>
                          </div>
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                              result.statusCode === 'NWD'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200'
                                : result.statusCode === 'RTD'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-200'
                                : result.statusCode === 'OT'
                                ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/80 dark:text-orange-200'
                                : result.statusCode.startsWith('DOS')
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-200'
                                : result.statusCode.startsWith('DOF')
                                ? 'bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-200'
                                : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                            }`}
                          >
                            {entry.currentStatusId}
                          </span>
                        </div>

                        <div className="text-[11px] text-slate-600 dark:text-slate-300 font-mono">
                          Scheduled: {result.scheduledStart && result.scheduledEnd ? (
                            `${result.scheduledStart} - ${result.scheduledEnd}`
                          ) : (
                            <span className="text-slate-400 italic">No scheduled window</span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="min-w-0">
                            <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-1">
                              Clock In
                            </label>
                            <ClockTimePicker
                              value={clock.clockIn}
                              onChange={(val) => handleClockChange(entry.id, 'clockIn', val)}
                              placeholder="08:15 AM"
                              className="w-full"
                            />
                          </div>
                          <div className="min-w-0">
                            <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-1">
                              Clock Out
                            </label>
                            <ClockTimePicker
                              value={clock.clockOut}
                              onChange={(val) => handleClockChange(entry.id, 'clockOut', val)}
                              placeholder="05:30 PM"
                              className="w-full"
                            />
                          </div>
                        </div>

                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {result.earlyInMinutes > 0 && <div>Early In: -{result.earlyInMinutes}m</div>}
                          {result.lateOutMinutes > 0 && <div>Late Out: +{result.lateOutMinutes}m</div>}
                          {result.earlyInMinutes === 0 && result.lateOutMinutes === 0 && '-'}
                        </div>

                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-400 dark:text-zinc-500">
                            Raw OT: <span className="font-mono text-slate-600 dark:text-slate-400">
                              {result.rawOtMinutes > 0 ? `${result.rawOtMinutes}m` : '-'}
                            </span>
                          </span>
                          <span className="font-bold text-orange-600 dark:text-orange-400 font-mono text-right">
                            {result.billableOtMinutes > 0 ? (
                              `${result.billableOtHours} hrs (${result.billableOtMinutes}m)`
                            ) : (
                              <span className="text-slate-400 font-normal">Billable: 0</span>
                            )}
                          </span>
                        </div>

                        <input
                          type="text"
                          placeholder="Type remark..."
                          value={entryRemarks[entry.id] ?? (entry.notes || '')}
                          onChange={(e) => handleRemarkChange(entry.id, e.target.value)}
                          className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400"
                        />

                        {result.flags.length > 0 ? (
                          <div className="space-y-1">
                            {result.flags.map((flag, fIdx) => (
                              <div key={fIdx} className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                {flag}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-[10px]">OK</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs bg-white dark:bg-slate-900">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Date / Day</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Scheduled Shift</th>
                      <th className="py-2.5 px-3">Clock In</th>
                      <th className="py-2.5 px-3">Clock Out</th>
                      <th className="py-2.5 px-3">Early/Late</th>
                      <th className="py-2.5 px-3">Raw OT</th>
                      <th className="py-2.5 px-3">Billable OT</th>
                      <th className="py-2.5 px-3">Remark / Note</th>
                      <th className="py-2.5 px-3">Flags</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {entries.map((entry, idx) => {
                      const result = dayResults[idx];
                      const clock = clockTimes[entry.id] || { clockIn: '', clockOut: '' };

                      return (
                        <tr
                          key={entry.id}
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                            result.billableOtMinutes > 0 ? 'bg-orange-50/20 dark:bg-orange-950/10' : ''
                          }`}
                        >
                          <td className="py-2 px-3 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                            <div>{entry.date}</div>
                            <div className="text-[10px] text-slate-400">{entry.day}</div>
                          </td>

                          <td className="py-2 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                result.statusCode === 'NWD'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-200'
                                  : result.statusCode === 'RTD'
                                  ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-200'
                                  : result.statusCode === 'OT'
                                  ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/80 dark:text-orange-200'
                                  : result.statusCode.startsWith('DOS')
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-200'
                                  : result.statusCode.startsWith('DOF')
                                  ? 'bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-200'
                                  : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                              }`}
                            >
                              {entry.currentStatusId}
                            </span>
                          </td>

                          <td className="py-2 px-3 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                            {result.scheduledStart && result.scheduledEnd ? (
                              `${result.scheduledStart} - ${result.scheduledEnd}`
                            ) : (
                              <span className="text-slate-400 italic">No scheduled window</span>
                            )}
                          </td>

                          <td className="py-2 px-3">
                            <ClockTimePicker
                              value={clock.clockIn}
                              onChange={(val) => handleClockChange(entry.id, 'clockIn', val)}
                              placeholder="08:15 AM"
                              className="w-28 sm:w-32"
                            />
                          </td>

                          <td className="py-2 px-3">
                            <ClockTimePicker
                              value={clock.clockOut}
                              onChange={(val) => handleClockChange(entry.id, 'clockOut', val)}
                              placeholder="05:30 PM"
                              className="w-28 sm:w-32"
                            />
                          </td>

                          <td className="py-2 px-3 text-slate-500 dark:text-slate-400 text-[11px]">
                            {result.earlyInMinutes > 0 && <div>In: -{result.earlyInMinutes}m</div>}
                            {result.lateOutMinutes > 0 && <div>Out: +{result.lateOutMinutes}m</div>}
                            {result.earlyInMinutes === 0 && result.lateOutMinutes === 0 && '-'}
                          </td>

                          <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">
                            {result.rawOtMinutes > 0 ? `${result.rawOtMinutes}m` : '-'}
                          </td>

                          <td className="py-2 px-3 font-bold text-orange-600 dark:text-orange-400 font-mono">
                            {result.billableOtMinutes > 0 ? (
                              <span>
                                {result.billableOtHours} hrs ({result.billableOtMinutes}m)
                              </span>
                            ) : (
                              <span className="text-slate-400 font-normal">0</span>
                            )}
                          </td>

                          <td className="py-2 px-3">
                            <input
                              type="text"
                              placeholder="Type remark..."
                              value={entryRemarks[entry.id] ?? (entry.notes || '')}
                              onChange={(e) => handleRemarkChange(entry.id, e.target.value)}
                              className="w-32 sm:w-40 px-2 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400"
                            />
                          </td>

                          <td className="py-2 px-3">
                            {result.flags.map((flag, fIdx) => (
                              <div key={fIdx} className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                {flag}
                              </div>
                            ))}
                            {result.flags.length === 0 && <span className="text-slate-400 text-[10px]">OK</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          )}

          {/* TAB 2: LEDGER */}
          {activeTab === 'ledger' && (
            <div className="space-y-6">
              {/* Ledger Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl p-4">
                  <div className="text-xs font-medium text-blue-700 dark:text-blue-400">DOS Days Worked</div>
                  <div className="text-2xl font-bold text-blue-900 dark:text-blue-200 mt-1">
                    {ledger.dosCount} <span className="text-sm font-normal text-blue-700">days</span>
                  </div>
                  <div className="text-[11px] text-blue-600/80 dark:text-blue-400/80 mt-0.5">
                    Off-days worked for future settlement
                  </div>
                </div>

                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl p-4">
                  <div className="text-xs font-medium text-red-700 dark:text-red-400">DOF Days Taken</div>
                  <div className="text-2xl font-bold text-red-900 dark:text-red-200 mt-1">
                    {ledger.dofCount} <span className="text-sm font-normal text-red-700">days</span>
                  </div>
                  <div className="text-[11px] text-red-600/80 dark:text-red-400/80 mt-0.5">
                    Day-off settlements cashed in
                  </div>
                </div>

                <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/50 rounded-xl p-4">
                  <div className="text-xs font-medium text-purple-700 dark:text-purple-400">Day Off Owed Balance</div>
                  <div className="text-2xl font-bold text-purple-900 dark:text-purple-200 mt-1">
                    {ledger.owedBalance > 0 ? `+${ledger.owedBalance}` : ledger.owedBalance}{' '}
                    <span className="text-sm font-normal text-purple-700">days</span>
                  </div>
                  <div className="text-[11px] text-purple-600/80 dark:text-purple-400/80 mt-0.5">
                    Net days owed to employee by company
                  </div>
                </div>
              </div>

              {/* Ledger Match Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-2xs bg-white dark:bg-slate-900">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-purple-500" />
                    Day Off Settlement Lineage & Verification
                  </h3>
                  <span className="text-[10px] text-slate-500">DOS = Work | DOF = Settled Off</span>
                </div>

                {isMobile ? (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {ledger.matches.length === 0 && (
                      <div className="py-6 text-center text-slate-400 text-xs">
                        No DOS or DOF entries found in this roster cycle.
                      </div>
                    )}
                    {ledger.matches.map((item, idx) => (
                      <div key={idx} className="p-3.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                              DOS Worked Date
                            </div>
                            <div className="font-medium text-slate-900 dark:text-white font-mono text-xs mt-0.5">
                              {item.dosDate}{' '}
                              <span className="font-bold text-blue-600 dark:text-blue-400">({item.dosCode})</span>
                            </div>
                          </div>
                          <div className="shrink-0">
                            {item.status === 'SETTLED' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-950/80 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                SETTLED
                              </span>
                            )}
                            {item.status === 'PENDING' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-950/80 dark:text-amber-300 px-2 py-0.5 rounded-full">
                                <Clock className="w-3 h-3 text-amber-500" />
                                PENDING
                              </span>
                            )}
                            {item.status === 'ORPHANED_DOF' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 dark:bg-red-950/80 dark:text-red-300 px-2 py-0.5 rounded-full">
                                <XCircle className="w-3 h-3 text-red-500" />
                                ORPHANED DOF
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="border-t border-slate-100 dark:border-zinc-800 pt-2">
                          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">
                            DOF Cashing Date
                          </div>
                          <div className="font-medium text-slate-900 dark:text-white font-mono text-xs mt-0.5">
                            {item.dofDate || '—'}{' '}
                            {item.dofCode ? <span className="font-bold text-red-600 dark:text-red-400">({item.dofCode})</span> : null}
                          </div>
                        </div>
                        {item.notes && (
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{item.notes}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-4">DOS Worked Date</th>
                      <th className="py-2.5 px-4">DOS Code</th>
                      <th className="py-2.5 px-4">DOF Cashing Date</th>
                      <th className="py-2.5 px-4">DOF Code</th>
                      <th className="py-2.5 px-4">Settlement Status</th>
                      <th className="py-2.5 px-4">Audit Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {ledger.matches.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white font-mono">
                          {item.dosDate}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-blue-600 dark:text-blue-400 font-bold">
                          {item.dosCode}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-white font-mono">
                          {item.dofDate || '—'}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-red-600 dark:text-red-400 font-bold">
                          {item.dofCode || '—'}
                        </td>
                        <td className="py-2.5 px-4">
                          {item.status === 'SETTLED' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 dark:bg-emerald-950/80 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              SETTLED
                            </span>
                          )}
                          {item.status === 'PENDING' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-950/80 dark:text-amber-300 px-2 py-0.5 rounded-full">
                              <Clock className="w-3 h-3 text-amber-500" />
                              PENDING
                            </span>
                          )}
                          {item.status === 'ORPHANED_DOF' && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 dark:bg-red-950/80 dark:text-red-300 px-2 py-0.5 rounded-full">
                              <XCircle className="w-3 h-3 text-red-500" />
                              ORPHANED DOF
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400 text-[11px]">
                          {item.notes}
                        </td>
                      </tr>
                    ))}

                    {ledger.matches.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400">
                          No DOS or DOF entries found in this roster cycle.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: COMPLIANCE AUDIT */}
          {activeTab === 'audit' && (
            <div className="space-y-6">
              {/* Audit Header Banner */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3 min-w-0">
                  <ShieldCheck className="w-6 h-6 text-purple-600 dark:text-purple-400 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Roster & OT Compliance Scanner
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Automated verification against HR payroll controls & validation checklists
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs font-bold">
                    {audit.passCount} Passed
                  </span>
                  {audit.warningCount > 0 && (
                    <span className="px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-xs font-bold">
                      {audit.warningCount} Warnings
                    </span>
                  )}
                  {audit.failCount > 0 && (
                    <span className="px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300 text-xs font-bold">
                      {audit.failCount} Failed
                    </span>
                  )}
                </div>
              </div>

              {/* Checklist Items */}
              <div className="grid grid-cols-1 gap-3">
                {audit.items.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border flex items-start justify-between gap-4 transition-all ${
                      item.status === 'PASS'
                        ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50'
                        : item.status === 'WARNING'
                        ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/50'
                        : 'bg-red-50/40 dark:bg-red-950/20 border-red-200 dark:border-red-900/50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {item.status === 'PASS' && <CheckCircle2 className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />}
                      {item.status === 'WARNING' && <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />}
                      {item.status === 'FAIL' && <XCircle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />}

                      <div>
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                          {item.title}
                        </h4>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{item.description}</p>
                        <p className="text-[11px] text-slate-400 mt-1 font-mono">{item.details}</p>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-md uppercase shrink-0 ${
                        item.status === 'PASS'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                          : item.status === 'WARNING'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
                          : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="space-y-6 max-w-2xl mx-auto">
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Settings className="w-4 h-4 text-purple-500" />
                  Payroll OT Controls & Rules Configuration
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Adjust company policy values for grace periods, minimum thresholds, and rounding rules.
                </p>
              </div>

              <div className="space-y-4 text-xs">
                {/* Grace Period */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border border-slate-200 dark:border-slate-800 rounded-xl">
                  <div>
                    <label className="font-bold text-slate-900 dark:text-white">Grace Period (Minutes)</label>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Minutes ignored on early-in swipes; late-out OT is counted in full (default: 15 mins)
                    </p>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    value={localOtSettings.gracePeriodMinutes}
                    onChange={(e) =>
                      setLocalOtSettings({ ...localOtSettings, gracePeriodMinutes: parseInt(e.target.value) || 0 })
                    }
                    className="w-20 px-2 py-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-center"
                  />
                </div>

                {/* Minimum Threshold */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border border-slate-200 dark:border-slate-800 rounded-xl">
                  <div>
                    <label className="font-bold text-slate-900 dark:text-white">Minimum OT Threshold (Minutes)</label>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Minimum net OT required to be billable (default: 30 mins)
                    </p>
                  </div>
                  <input
                    type="number"
                    min={0}
                    max={120}
                    value={localOtSettings.minimumOtThresholdMinutes}
                    onChange={(e) =>
                      setLocalOtSettings({
                        ...localOtSettings,
                        minimumOtThresholdMinutes: parseInt(e.target.value) || 0,
                      })
                    }
                    className="w-20 px-2 py-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-center"
                  />
                </div>

                {/* Rounding Rule */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border border-slate-200 dark:border-slate-800 rounded-xl">
                  <div>
                    <label className="font-bold text-slate-900 dark:text-white">Rounding Direction</label>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      How billable OT minutes are rounded
                    </p>
                  </div>
                  <select
                    value={localOtSettings.roundingRule}
                    onChange={(e) =>
                      setLocalOtSettings({
                        ...localOtSettings,
                        roundingRule: e.target.value as 'down' | 'nearest' | 'up',
                      })
                    }
                    className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="down">Round Down (Strict)</option>
                    <option value="nearest">Nearest Block</option>
                    <option value="up">Round Up</option>
                  </select>
                </div>

                {/* Rounding Block Size */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border border-slate-200 dark:border-slate-800 rounded-xl">
                  <div>
                    <label className="font-bold text-slate-900 dark:text-white">Rounding Block Interval</label>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Pay block size in minutes (15 or 30)
                    </p>
                  </div>
                  <select
                    value={localOtSettings.roundingBlockMinutes}
                    onChange={(e) =>
                      setLocalOtSettings({
                        ...localOtSettings,
                        roundingBlockMinutes: parseInt(e.target.value) as 15 | 30,
                      })
                    }
                    className="px-2 py-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes</option>
                  </select>
                </div>

                {/* Hourly OT Rate */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border border-slate-200 dark:border-slate-800 rounded-xl">
                  <div>
                    <label className="font-bold text-slate-900 dark:text-white">Hourly OT Pay Rate ($ / LKR)</label>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Optional rate multiplier for payout calculation
                    </p>
                  </div>
                  <input
                    type="number"
                    min={0}
                    step={0.5}
                    value={localOtSettings.hourlyOtRate || 0}
                    onChange={(e) =>
                      setLocalOtSettings({ ...localOtSettings, hourlyOtRate: parseFloat(e.target.value) || 0 })
                    }
                    className="w-24 px-2 py-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-center"
                  />
                </div>

                {/* WFH OT Eligibility */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border border-slate-200 dark:border-slate-800 rounded-xl">
                  <div>
                    <label className="font-bold text-slate-900 dark:text-white">WFH Eligible for OT</label>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Allow Work From Home days to generate payable OT
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localOtSettings.wfhEligibleForOt}
                    onChange={(e) => setLocalOtSettings({ ...localOtSettings, wfhEligibleForOt: e.target.checked })}
                    className="w-4 h-4 accent-purple-600 rounded"
                  />
                </div>

                {/* Training OT Eligibility */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border border-slate-200 dark:border-slate-800 rounded-xl">
                  <div>
                    <label className="font-bold text-slate-900 dark:text-white">Training Eligible for OT</label>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Allow Training days to generate payable OT
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localOtSettings.trainingEligibleForOt}
                    onChange={(e) => setLocalOtSettings({ ...localOtSettings, trainingEligibleForOt: e.target.checked })}
                    className="w-4 h-4 accent-purple-600 rounded"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs shadow-md transition-colors"
                >
                  <Save className="w-4 h-4" />
                  {savingSettings ? 'Saving...' : 'Save OT Rules'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
