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

  const statusChipClass = (statusCode: string) =>
    statusCode === 'NWD'
      ? 'chip chip-success'
      : statusCode === 'RTD'
      ? 'chip chip-accent'
      : statusCode === 'OT'
      ? 'chip chip-warning'
      : statusCode.startsWith('DOF')
      ? 'chip chip-danger'
      : statusCode.startsWith('DOS')
      ? 'chip'
      : 'chip chip-neutral';

  const statusChipStyle = (statusCode: string): React.CSSProperties | undefined =>
    statusCode.startsWith('DOS') ? { background: 'var(--info-bg)', color: 'var(--info)' } : undefined;

  const tabButtonClass = (tab: 'timesheet' | 'ledger' | 'audit' | 'settings') =>
    `flex items-center gap-1.5 rounded-md px-3 h-8 text-xs font-medium transition-colors ${
      activeTab === tab ? 'bg-surface text-fg shadow-[var(--shadow-xs)]' : 'text-muted hover:text-fg'
    }`;

  const thClass = 'text-left text-[11px] font-medium uppercase tracking-wide text-muted border-b border-line px-3 py-2';
  const tdClass = 'px-3 py-2 text-sm border-b border-line';

  const compactInputClass =
    'h-8 rounded-md border border-line bg-surface px-2 text-xs text-fg placeholder:text-faint outline-none transition-colors focus:border-accent';

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto py-6 sm:py-10 px-4">
      <div className="fixed inset-0 bg-black/40 dark:bg-black/60" />
      <div className="relative card shadow-[var(--shadow-md)] rounded-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-scaleIn">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-line flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-[var(--accent-soft)] text-accent shrink-0">
              <Calculator className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-fg flex items-center gap-2 flex-wrap">
                OT Calculation & Day-Off Settlement Engine
                <span className="chip chip-warning">Payroll Specification Compliant</span>
              </h2>
              <p className="text-xs text-muted truncate">
                Grace period, minimum thresholds, rounding rules & DOS/DOF ledger audit
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon shrink-0" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-5 border-b border-line flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex flex-wrap gap-1 bg-well p-1 rounded-lg my-2">
            <button onClick={() => setActiveTab('timesheet')} className={tabButtonClass('timesheet')}>
              <Clock className="w-3.5 h-3.5" />
              OT Timesheet ({totalBillableOtHours} hrs)
            </button>

            <button onClick={() => setActiveTab('ledger')} className={tabButtonClass('ledger')}>
              <Calendar className="w-3.5 h-3.5" />
              Day Off Settlement Ledger ({ledger.owedBalance > 0 ? `+${ledger.owedBalance}` : ledger.owedBalance} Days)
            </button>

            <button onClick={() => setActiveTab('audit')} className={tabButtonClass('audit')}>
              <ShieldCheck className="w-3.5 h-3.5" />
              Compliance Audit ({audit.passCount}/{audit.items.length} Passed)
            </button>

            <button onClick={() => setActiveTab('settings')} className={tabButtonClass('settings')}>
              <Settings className="w-3.5 h-3.5" />
              OT Rules & Config
            </button>
          </div>

          <div className="flex items-center gap-2 my-2 shrink-0">
            <button onClick={handleExportCsv} className="btn-min btn-secondary text-xs">
              <Download className="w-3.5 h-3.5 text-accent" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Notice Message */}
        {saveMessage && (
          <div
            className="px-5 py-2 text-xs font-medium flex items-center justify-between border-b border-line"
            style={{ background: 'var(--success-bg)', color: 'var(--success)' }}
          >
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {saveMessage}
            </span>
          </div>
        )}

        {/* Tab Contents */}
        <div className="px-5 py-4 overflow-y-auto flex-1">
          {/* TAB 1: TIMESHEET */}
          {activeTab === 'timesheet' && (
            <div className="space-y-4">
              {/* Summary Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="stat-tile">
                  <div className="stat-tile-label">Total Billable OT</div>
                  <div className="stat-tile-value" style={{ color: 'var(--color-primary)' }}>
                    {totalBillableOtHours}{' '}
                    <span className="text-sm font-normal text-muted">hrs</span>
                  </div>
                  <div className="text-[11px] text-faint mt-0.5">
                    ({totalBillableOtMinutes} billable mins)
                  </div>
                </div>

                <div className="stat-tile">
                  <div className="stat-tile-label">Raw OT Before Rules</div>
                  <div className="stat-tile-value">
                    {totalRawOtHours}{' '}
                    <span className="text-sm font-normal text-muted">hrs</span>
                  </div>
                  <div className="text-[11px] text-faint mt-0.5">
                    Grace deducted: {totalRawOtMinutes - totalBillableOtMinutes} mins
                  </div>
                </div>

                <div className="stat-tile">
                  <div className="stat-tile-label">Rules Applied</div>
                  <div className="text-xs font-medium text-fg mt-1.5">
                    Grace: {localOtSettings.gracePeriodMinutes}m | Min: {localOtSettings.minimumOtThresholdMinutes}m
                  </div>
                  <div className="text-[11px] text-faint mt-0.5 capitalize">
                    Round: {localOtSettings.roundingRule} ({localOtSettings.roundingBlockMinutes}m block)
                  </div>
                </div>

                <div className="stat-tile">
                  <div className="stat-tile-label">Est. Overtime Pay</div>
                  <div className="stat-tile-value" style={{ color: 'var(--color-primary)' }}>
                    {estimatedPayout > 0 ? `$${estimatedPayout.toFixed(2)}` : 'N/A'}
                  </div>
                  <div className="text-[11px] text-faint mt-0.5">
                    {localOtSettings.hourlyOtRate ? `@ $${localOtSettings.hourlyOtRate}/hr` : 'Set rate in Settings'}
                  </div>
                </div>
              </div>

              {/* OT Breakdown */}
              <div className="card p-4 space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <h3 className="text-sm font-medium text-fg flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" style={{ color: 'var(--warning)' }} />
                      Overtime Modifications Breakdown ({entriesWithOt.length} entries with OT)
                    </h3>
                    <p className="text-xs text-muted mt-1">
                      List of all days where Raw or Billable Overtime was recorded
                    </p>
                  </div>
                </div>
                {entriesWithOt.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted border border-dashed border-line rounded-lg">
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
                        <div key={i} className="border border-line rounded-lg p-3.5 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-fg text-xs">{e.date}</span>
                            <span
                              className={statusChipClass(e.statusCode)}
                              style={statusChipStyle(e.statusCode)}
                            >
                              {e.statusCode}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs gap-2">
                            <span className="text-muted">
                              In: <span className="font-mono font-medium text-fg">{formatTimeAMPM(e.actualClockIn)}</span>
                            </span>
                            <span className="text-muted">
                              Out: <span className="font-mono font-medium text-fg">{formatTimeAMPM(e.actualClockOut)}</span>
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs border-t border-line pt-2">
                            <span className="text-muted">Raw OT</span>
                            <span className="font-mono font-semibold text-fg">{formatDuration(e.rawOtMinutes)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-well">
                          <th className={thClass}>Date</th>
                          <th className={thClass}>Status</th>
                          <th className={thClass}>In Time</th>
                          <th className={thClass}>Out Time</th>
                          <th className={thClass}>Raw OT</th>
                        </tr>
                      </thead>
                      <tbody>
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
                            <tr key={i} className="hover:bg-well transition-colors">
                              <td className={`${tdClass} font-medium text-fg`}>
                                {e.date}
                              </td>
                              <td className={`${tdClass} text-muted`}>
                                {e.statusCode}
                              </td>
                              <td className={`${tdClass} text-fg`}>
                                {formatTimeAMPM(e.actualClockIn)}
                              </td>
                              <td className={`${tdClass} text-fg`}>
                                {formatTimeAMPM(e.actualClockOut)}
                              </td>
                              <td className={`${tdClass} text-fg font-mono`}>
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
                <div className="text-xs text-muted flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-accent shrink-0" />
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
                    className="btn-min btn-secondary"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    Sync Clock & OT
                  </button>
                  {onUpdateEntryClockTimes && (
                    <button
                      onClick={handleSaveClockTimes}
                      className="btn-min btn-primary"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save Clock Times
                    </button>
                  )}
                </div>
              </div>

              {/* Calculation Table */}
              {isMobile ? (
                <div className="border border-line rounded-lg overflow-hidden bg-surface divide-y divide-line">
                  {entries.map((entry, idx) => {
                    const result = dayResults[idx];
                    const clock = clockTimes[entry.id] || { clockIn: '', clockOut: '' };

                    return (
                      <div
                        key={entry.id}
                        className={`p-3.5 space-y-3 ${
                          result.billableOtMinutes > 0 ? 'bg-[var(--accent-soft)]' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-fg text-xs">{entry.date}</div>
                            <div className="text-[10px] text-faint">{entry.day}</div>
                          </div>
                          <span
                            className={`shrink-0 ${statusChipClass(result.statusCode)}`}
                            style={statusChipStyle(result.statusCode)}
                          >
                            {entry.currentStatusId}
                          </span>
                        </div>

                        <div className="text-[11px] text-muted font-mono">
                          Scheduled: {result.scheduledStart && result.scheduledEnd ? (
                            `${result.scheduledStart} - ${result.scheduledEnd}`
                          ) : (
                            <span className="text-faint italic">No scheduled window</span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="min-w-0">
                            <label className="block text-[9px] font-medium uppercase tracking-wide text-muted mb-1">
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
                            <label className="block text-[9px] font-medium uppercase tracking-wide text-muted mb-1">
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

                        <div className="text-[11px] text-muted">
                          {result.earlyInMinutes > 0 && <div>Early In: -{result.earlyInMinutes}m</div>}
                          {result.lateOutMinutes > 0 && <div>Late Out: +{result.lateOutMinutes}m</div>}
                          {result.earlyInMinutes === 0 && result.lateOutMinutes === 0 && '-'}
                        </div>

                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-muted">
                            Raw OT: <span className="font-mono text-fg">
                              {result.rawOtMinutes > 0 ? `${result.rawOtMinutes}m` : '-'}
                            </span>
                          </span>
                          <span className="font-semibold font-mono text-right" style={{ color: 'var(--color-primary)' }}>
                            {result.billableOtMinutes > 0 ? (
                              `${result.billableOtHours} hrs (${result.billableOtMinutes}m)`
                            ) : (
                              <span className="text-faint font-normal">Billable: 0</span>
                            )}
                          </span>
                        </div>

                        <input
                          type="text"
                          placeholder="Type remark..."
                          value={entryRemarks[entry.id] ?? (entry.notes || '')}
                          onChange={(e) => handleRemarkChange(entry.id, e.target.value)}
                          className={`${compactInputClass} w-full`}
                        />

                        {result.flags.length > 0 ? (
                          <div className="space-y-1">
                            {result.flags.map((flag, fIdx) => (
                              <div key={fIdx} className="text-[10px] flex items-center gap-1" style={{ color: 'var(--warning)' }}>
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                {flag}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-faint text-[10px]">OK</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
              <div className="border border-line rounded-lg overflow-hidden bg-surface">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-well">
                      <th className={thClass}>Date / Day</th>
                      <th className={thClass}>Status</th>
                      <th className={thClass}>Scheduled Shift</th>
                      <th className={thClass}>Clock In</th>
                      <th className={thClass}>Clock Out</th>
                      <th className={thClass}>Early/Late</th>
                      <th className={thClass}>Raw OT</th>
                      <th className={thClass}>Billable OT</th>
                      <th className={thClass}>Remark / Note</th>
                      <th className={thClass}>Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, idx) => {
                      const result = dayResults[idx];
                      const clock = clockTimes[entry.id] || { clockIn: '', clockOut: '' };

                      return (
                        <tr
                          key={entry.id}
                          className={`hover:bg-well ${
                            result.billableOtMinutes > 0 ? 'bg-[var(--accent-soft)]' : ''
                          }`}
                        >
                          <td className={`${tdClass} font-medium text-fg whitespace-nowrap`}>
                            <div>{entry.date}</div>
                            <div className="text-[10px] text-faint">{entry.day}</div>
                          </td>

                          <td className={tdClass}>
                            <span
                              className={statusChipClass(result.statusCode)}
                              style={statusChipStyle(result.statusCode)}
                            >
                              {entry.currentStatusId}
                            </span>
                          </td>

                          <td className={`${tdClass} text-muted font-mono text-[11px]`}>
                            {result.scheduledStart && result.scheduledEnd ? (
                              `${result.scheduledStart} - ${result.scheduledEnd}`
                            ) : (
                              <span className="text-faint italic">No scheduled window</span>
                            )}
                          </td>

                          <td className={tdClass}>
                            <ClockTimePicker
                              value={clock.clockIn}
                              onChange={(val) => handleClockChange(entry.id, 'clockIn', val)}
                              placeholder="08:15 AM"
                              className="w-28 sm:w-32"
                            />
                          </td>

                          <td className={tdClass}>
                            <ClockTimePicker
                              value={clock.clockOut}
                              onChange={(val) => handleClockChange(entry.id, 'clockOut', val)}
                              placeholder="05:30 PM"
                              className="w-28 sm:w-32"
                            />
                          </td>

                          <td className={`${tdClass} text-muted text-[11px]`}>
                            {result.earlyInMinutes > 0 && <div>In: -{result.earlyInMinutes}m</div>}
                            {result.lateOutMinutes > 0 && <div>Out: +{result.lateOutMinutes}m</div>}
                            {result.earlyInMinutes === 0 && result.lateOutMinutes === 0 && '-'}
                          </td>

                          <td className={`${tdClass} font-mono text-muted`}>
                            {result.rawOtMinutes > 0 ? `${result.rawOtMinutes}m` : '-'}
                          </td>

                          <td className={`${tdClass} font-semibold font-mono`} style={{ color: 'var(--color-primary)' }}>
                            {result.billableOtMinutes > 0 ? (
                              <span>
                                {result.billableOtHours} hrs ({result.billableOtMinutes}m)
                              </span>
                            ) : (
                              <span className="text-faint font-normal">0</span>
                            )}
                          </td>

                          <td className={tdClass}>
                            <input
                              type="text"
                              placeholder="Type remark..."
                              value={entryRemarks[entry.id] ?? (entry.notes || '')}
                              onChange={(e) => handleRemarkChange(entry.id, e.target.value)}
                              className={`${compactInputClass} w-32 sm:w-40`}
                            />
                          </td>

                          <td className={tdClass}>
                            {result.flags.map((flag, fIdx) => (
                              <div key={fIdx} className="text-[10px] flex items-center gap-1" style={{ color: 'var(--warning)' }}>
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                {flag}
                              </div>
                            ))}
                            {result.flags.length === 0 && <span className="text-faint text-[10px]">OK</span>}
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
            <div className="space-y-4">
              {/* Ledger Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="stat-tile">
                  <div className="stat-tile-label">DOS Days Worked</div>
                  <div className="stat-tile-value" style={{ color: 'var(--info)' }}>
                    {ledger.dosCount}{' '}
                    <span className="text-sm font-normal text-muted">days</span>
                  </div>
                  <div className="text-[11px] text-faint mt-0.5">
                    Off-days worked for future settlement
                  </div>
                </div>

                <div className="stat-tile">
                  <div className="stat-tile-label">DOF Days Taken</div>
                  <div className="stat-tile-value" style={{ color: 'var(--danger)' }}>
                    {ledger.dofCount}{' '}
                    <span className="text-sm font-normal text-muted">days</span>
                  </div>
                  <div className="text-[11px] text-faint mt-0.5">
                    Day-off settlements cashed in
                  </div>
                </div>

                <div className="stat-tile">
                  <div className="stat-tile-label">Day Off Owed Balance</div>
                  <div className="stat-tile-value" style={{ color: 'var(--color-primary)' }}>
                    {ledger.owedBalance > 0 ? `+${ledger.owedBalance}` : ledger.owedBalance}{' '}
                    <span className="text-sm font-normal text-muted">days</span>
                  </div>
                  <div className="text-[11px] text-faint mt-0.5">
                    Net days owed to employee by company
                  </div>
                </div>
              </div>

              {/* Ledger Match Table */}
              <div className="border border-line rounded-lg overflow-hidden bg-surface">
                <div className="p-3 bg-well border-b border-line flex items-center justify-between gap-3 flex-wrap">
                  <h3 className="text-xs font-medium text-fg flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-accent" />
                    Day Off Settlement Lineage & Verification
                  </h3>
                  <span className="text-[10px] text-faint">DOS = Work | DOF = Settled Off</span>
                </div>

                {isMobile ? (
                  <div className="divide-y divide-line">
                    {ledger.matches.length === 0 && (
                      <div className="py-6 text-center text-muted text-xs">
                        No DOS or DOF entries found in this roster cycle.
                      </div>
                    )}
                    {ledger.matches.map((item, idx) => (
                      <div key={idx} className="p-3.5 space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[9px] font-medium uppercase tracking-wide text-muted">
                              DOS Worked Date
                            </div>
                            <div className="font-medium text-fg font-mono text-xs mt-0.5">
                              {item.dosDate}{' '}
                              <span className="font-semibold" style={{ color: 'var(--info)' }}>({item.dosCode})</span>
                            </div>
                          </div>
                          <div className="shrink-0">
                            {item.status === 'SETTLED' && (
                              <span className="chip chip-success">
                                <CheckCircle2 className="w-3 h-3" />
                                SETTLED
                              </span>
                            )}
                            {item.status === 'PENDING' && (
                              <span className="chip chip-warning">
                                <Clock className="w-3 h-3" />
                                PENDING
                              </span>
                            )}
                            {item.status === 'ORPHANED_DOF' && (
                              <span className="chip chip-danger">
                                <XCircle className="w-3 h-3" />
                                ORPHANED DOF
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="border-t border-line pt-2">
                          <div className="text-[9px] font-medium uppercase tracking-wide text-muted">
                            DOF Cashing Date
                          </div>
                          <div className="font-medium text-fg font-mono text-xs mt-0.5">
                            {item.dofDate || '—'}{' '}
                            {item.dofCode ? <span className="font-semibold" style={{ color: 'var(--danger)' }}>({item.dofCode})</span> : null}
                          </div>
                        </div>
                        {item.notes && (
                          <div className="text-[11px] text-muted leading-relaxed">{item.notes}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-well">
                      <th className={thClass}>DOS Worked Date</th>
                      <th className={thClass}>DOS Code</th>
                      <th className={thClass}>DOF Cashing Date</th>
                      <th className={thClass}>DOF Code</th>
                      <th className={thClass}>Settlement Status</th>
                      <th className={thClass}>Audit Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.matches.map((item, idx) => (
                      <tr key={idx} className="hover:bg-well">
                        <td className={`${tdClass} font-medium text-fg font-mono`}>
                          {item.dosDate}
                        </td>
                        <td className={`${tdClass} font-mono font-semibold`} style={{ color: 'var(--info)' }}>
                          {item.dosCode}
                        </td>
                        <td className={`${tdClass} font-medium text-fg font-mono`}>
                          {item.dofDate || '—'}
                        </td>
                        <td className={`${tdClass} font-mono font-semibold`} style={{ color: 'var(--danger)' }}>
                          {item.dofCode || '—'}
                        </td>
                        <td className={tdClass}>
                          {item.status === 'SETTLED' && (
                            <span className="chip chip-success">
                              <CheckCircle2 className="w-3 h-3" />
                              SETTLED
                            </span>
                          )}
                          {item.status === 'PENDING' && (
                            <span className="chip chip-warning">
                              <Clock className="w-3 h-3" />
                              PENDING
                            </span>
                          )}
                          {item.status === 'ORPHANED_DOF' && (
                            <span className="chip chip-danger">
                              <XCircle className="w-3 h-3" />
                              ORPHANED DOF
                            </span>
                          )}
                        </td>
                        <td className={`${tdClass} text-muted text-xs`}>
                          {item.notes}
                        </td>
                      </tr>
                    ))}

                    {ledger.matches.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-muted px-3 text-sm">
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
            <div className="space-y-4">
              {/* Audit Header Banner */}
              <div className="card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <ShieldCheck className="w-5 h-5 text-accent shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-fg">
                      Roster & OT Compliance Scanner
                    </h3>
                    <p className="text-xs text-muted">
                      Automated verification against HR payroll controls & validation checklists
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <span className="chip chip-success">
                    {audit.passCount} Passed
                  </span>
                  {audit.warningCount > 0 && (
                    <span className="chip chip-warning">
                      {audit.warningCount} Warnings
                    </span>
                  )}
                  {audit.failCount > 0 && (
                    <span className="chip chip-danger">
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
                    className="card p-4 flex items-start justify-between gap-4"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      {item.status === 'PASS' && <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" style={{ color: 'var(--success)' }} />}
                      {item.status === 'WARNING' && <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: 'var(--warning)' }} />}
                      {item.status === 'FAIL' && <XCircle className="w-5 h-5 mt-0.5 shrink-0" style={{ color: 'var(--danger)' }} />}

                      <div>
                        <h4 className="text-xs font-semibold text-fg flex items-center gap-2">
                          {item.title}
                        </h4>
                        <p className="text-xs text-muted mt-0.5">{item.description}</p>
                        <p className="text-[11px] text-faint mt-1 font-mono">{item.details}</p>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-semibold px-2.5 py-1 rounded-md uppercase shrink-0 ${
                        item.status === 'PASS'
                          ? 'chip chip-success'
                          : item.status === 'WARNING'
                          ? 'chip chip-warning'
                          : 'chip chip-danger'
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
            <div className="space-y-4 max-w-2xl mx-auto">
              <div className="card p-4">
                <h3 className="text-sm font-medium text-fg flex items-center gap-2">
                  <Settings className="w-4 h-4 text-accent" />
                  Payroll OT Controls & Rules Configuration
                </h3>
                <p className="text-xs text-muted mt-1">
                  Adjust company policy values for grace periods, minimum thresholds, and rounding rules.
                </p>
              </div>

              <div className="space-y-3">
                {/* Grace Period */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border border-line rounded-lg bg-surface">
                  <div>
                    <label className="font-medium text-fg">Grace Period (Minutes)</label>
                    <p className="text-[11px] text-muted">
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
                    style={{ width: '5rem' }}
                    className="input-min text-center font-mono"
                  />
                </div>

                {/* Minimum Threshold */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border border-line rounded-lg bg-surface">
                  <div>
                    <label className="font-medium text-fg">Minimum OT Threshold (Minutes)</label>
                    <p className="text-[11px] text-muted">
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
                    style={{ width: '5rem' }}
                    className="input-min text-center font-mono"
                  />
                </div>

                {/* Rounding Rule */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border border-line rounded-lg bg-surface">
                  <div>
                    <label className="font-medium text-fg">Rounding Direction</label>
                    <p className="text-[11px] text-muted">
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
                    style={{ width: '12rem' }}
                    className="input-min"
                  >
                    <option value="down">Round Down (Strict)</option>
                    <option value="nearest">Nearest Block</option>
                    <option value="up">Round Up</option>
                  </select>
                </div>

                {/* Rounding Block Size */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border border-line rounded-lg bg-surface">
                  <div>
                    <label className="font-medium text-fg">Rounding Block Interval</label>
                    <p className="text-[11px] text-muted">
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
                    style={{ width: '8rem' }}
                    className="input-min font-mono"
                  >
                    <option value={15}>15 Minutes</option>
                    <option value={30}>30 Minutes</option>
                  </select>
                </div>

                {/* Hourly OT Rate */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border border-line rounded-lg bg-surface">
                  <div>
                    <label className="font-medium text-fg">Hourly OT Pay Rate ($ / LKR)</label>
                    <p className="text-[11px] text-muted">
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
                    style={{ width: '6rem' }}
                    className="input-min text-center font-mono"
                  />
                </div>

                {/* WFH OT Eligibility */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border border-line rounded-lg bg-surface">
                  <div>
                    <label className="font-medium text-fg">WFH Eligible for OT</label>
                    <p className="text-[11px] text-muted">
                      Allow Work From Home days to generate payable OT
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localOtSettings.wfhEligibleForOt}
                    onChange={(e) => setLocalOtSettings({ ...localOtSettings, wfhEligibleForOt: e.target.checked })}
                    className="w-4 h-4 accent-[var(--color-primary)] rounded"
                  />
                </div>

                {/* Training OT Eligibility */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 border border-line rounded-lg bg-surface">
                  <div>
                    <label className="font-medium text-fg">Training Eligible for OT</label>
                    <p className="text-[11px] text-muted">
                      Allow Training days to generate payable OT
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={localOtSettings.trainingEligibleForOt}
                    onChange={(e) => setLocalOtSettings({ ...localOtSettings, trainingEligibleForOt: e.target.checked })}
                    className="w-4 h-4 accent-[var(--color-primary)] rounded"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="btn-min btn-primary"
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
