import React, { useState, useEffect } from 'react';
import { RosterEntry, RosterStatusConfig } from '../types/roster';
import { StatusBadge } from './StatusBadge';
import { ClockTimePicker } from './ClockTimePicker';
import { formatDateDisplay } from '../utils/date';
import { X, ArrowRight, Calendar, AlertCircle, Calculator, Clock, CalendarDays } from 'lucide-react';
import { canApplyLeaveToCode, isAlreadyLeaveCode } from '../utils/leave';

interface RosterChangeModalProps {
  isOpen: boolean;
  entry: RosterEntry | null;
  statuses: RosterStatusConfig[];
  onClose: () => void;
  onSave: (data: {
    newStatusId: string;
    action: string;
    reason: string;
    notes: string;
    clockIn?: string;
    clockOut?: string;
    ot: boolean;
    otMorningHours?: number;
    otNightHours?: number;
    updateCalendar: boolean;
  }) => Promise<void>;
  onApplyLeave?: (entry: RosterEntry) => void;
}

export const RosterChangeModal: React.FC<RosterChangeModalProps> = ({
  isOpen,
  entry,
  statuses,
  onClose,
  onSave,
  onApplyLeave,
}) => {
  const [newStatusId, setNewStatusId] = useState(entry?.currentStatusId || '');
  const [action, setAction] = useState(entry?.action || '');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState(entry?.notes || '');
  const [clockIn, setClockIn] = useState(entry?.clockIn || '');
  const [clockOut, setClockOut] = useState(entry?.clockOut || '');
  const [ot, setOt] = useState(entry?.ot || false);
  const [otMorningHours, setOtMorningHours] = useState(entry?.otMorningHours !== undefined ? String(entry.otMorningHours) : '0');
  const [otNightHours, setOtNightHours] = useState(entry?.otNightHours !== undefined ? String(entry.otNightHours) : '0');
  const [updateCalendar, setUpdateCalendar] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (entry) {
      setNewStatusId(entry.currentStatusId || '');
      setAction(entry.action || '');
      setNotes(entry.notes || '');
      setClockIn(entry.clockIn || '');
      setClockOut(entry.clockOut || '');
      setOt(entry.ot || false);
      setOtMorningHours(entry.otMorningHours !== undefined ? String(entry.otMorningHours) : '0');
      setOtNightHours(entry.otNightHours !== undefined ? String(entry.otNightHours) : '0');
    }
  }, [entry]);

  // Time calculator state
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcMorningArrival, setCalcMorningArrival] = useState('08:15');
  const [calcNightDeparture, setCalcNightDeparture] = useState('21:30');
  const [calcNightNextDay, setCalcNightNextDay] = useState(false);

  const getExpectedTimes = () => {
    const config = statuses.find((s) => s.code === newStatusId);
    if (config?.calendarEventConfig && !config.calendarEventConfig.isAllDay) {
      const startTime = config.calendarEventConfig.startTime || '10:15';
      const endTime = config.calendarEventConfig.endTime || '19:30';
      
      const formatTimeLabel = (timeStr: string) => {
        const [hStr, mStr] = timeStr.split(':');
        const h = parseInt(hStr, 10);
        if (isNaN(h)) return timeStr;
        const ampm = h >= 12 ? 'PM' : 'AM';
        const displayH = h % 12 === 0 ? 12 : h % 12;
        return `${displayH}:${mStr} ${ampm}`;
      };

      return {
        start: startTime,
        end: endTime,
        startLabel: formatTimeLabel(startTime),
        endLabel: `${formatTimeLabel(endTime)} (${endTime})`
      };
    }
    
    if (newStatusId === 'NWD') {
      return { start: '08:15', end: '17:30', startLabel: '08:15 AM', endLabel: '05:30 PM (17:30)' };
    }
    return { start: '10:15', end: '19:30', startLabel: '10:15 AM', endLabel: '07:30 PM (19:30)' };
  };

  const calculateMorningOT = (arrivalTime: string): number => {
    const { start } = getExpectedTimes();
    const [h, m] = arrivalTime.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return 0;
    const arrivalMinutes = h * 60 + m;
    
    const [expH, expM] = start.split(':').map(Number);
    const expectedMinutes = expH * 60 + expM;
    
    if (arrivalMinutes < expectedMinutes) {
      const diffHours = (expectedMinutes - arrivalMinutes) / 60;
      return Math.max(0, parseFloat(diffHours.toFixed(1)));
    }
    return 0;
  };

  const calculateNightOT = (departureTime: string, nextDay = false): number => {
    const { end } = getExpectedTimes();
    const [h, m] = departureTime.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return 0;
    let departureMinutes = h * 60 + m;
    if (nextDay) departureMinutes += 24 * 60;
    
    const [expH, expM] = end.split(':').map(Number);
    const expectedMinutes = expH * 60 + expM;
    
    if (departureMinutes > expectedMinutes) {
      const diffHours = (departureMinutes - expectedMinutes) / 60;
      return Math.max(0, parseFloat(diffHours.toFixed(1)));
    }
    return 0;
  };

  useEffect(() => {
    if (entry) {
      setNewStatusId(entry.currentStatusId);
      setAction(entry.action || '');
      setReason('');
      setNotes(entry.notes || '');
      setOt(entry.ot || false);
      setOtMorningHours(entry.otMorningHours !== undefined ? String(entry.otMorningHours) : '0');
      setOtNightHours(entry.otNightHours !== undefined ? String(entry.otNightHours) : '0');
      setUpdateCalendar(true);
    }
  }, [entry]);

  if (!isOpen || !entry) return null;

  // When status selection changes, auto-suggest the standard description for action
  const handleStatusSelect = (code: string) => {
    setNewStatusId(code);
    const selected = statuses.find((s) => s.code === code);
    if (selected) {
      setAction(selected.description || selected.displayName);
      if (code === 'OT') setOt(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onSave({
        newStatusId,
        action,
        reason,
        notes,
        clockIn,
        clockOut,
        ot,
        otMorningHours: ot ? parseFloat(otMorningHours) || 0 : 0,
        otNightHours: ot ? parseFloat(otNightHours) || 0 : 0,
        updateCalendar,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeStatuses = statuses.filter((s) => s.active);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden transition-all my-8">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              Change Roster Entry
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatDateDisplay(entry.date)} ({entry.day})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Important Rule Banner */}
          <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/60 border border-purple-200 dark:border-purple-800/80 text-xs text-purple-900 dark:text-purple-200 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Original Roster Preserved</span>
              <span className="text-[11px] opacity-90">
                The office-provided roster (<strong className="font-semibold">{entry.originalStatusId}</strong>) will NEVER be overwritten.
              </span>
            </div>
          </div>

          {/* Apply Leave entry point */}
          {(() => {
            const currentCode = entry.currentStatusId || entry.originalStatusId || '';
            if (isAlreadyLeaveCode(currentCode)) {
              return (
                <button
                  type="button"
                  onClick={async () => {
                    if (!entry) return;
                    try {
                      await onSave({
                        newStatusId: entry.originalStatusId || 'NWD',
                        action: entry.action || 'Reverted to original roster status',
                        reason: 'Leave reverted by user',
                        notes: `Reverted from ${currentCode} back to ${entry.originalStatusId || 'NWD'}`,
                        clockIn: '',
                        clockOut: '',
                        ot: false,
                        otMorningHours: 0,
                        otNightHours: 0,
                        updateCalendar: true,
                      });
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-emerald-300 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20 text-left transition-colors flex items-center justify-between"
                >
                  <span className="flex items-center gap-2.5">
                    <CalendarDays className="w-4 h-4 text-emerald-600" />
                    <span>
                      <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">
                        Remove Leave / Revert to Original
                      </span>
                      <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                        Restore {entry.originalStatusId || 'NWD'} and credit the leave balance back
                      </span>
                    </span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </button>
              );
            }
            if (canApplyLeaveToCode(currentCode)) {
              return (
                <button
                  type="button"
                  onClick={() => onApplyLeave && onApplyLeave(entry)}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-red-300 hover:bg-red-50/60 dark:hover:bg-red-950/20 text-left transition-colors flex items-center justify-between"
                >
                  <span className="flex items-center gap-2.5">
                    <CalendarDays className="w-4 h-4 text-[#E60023]" />
                    <span>
                      <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">
                        Apply Leave
                      </span>
                      <span className="block text-[10px] text-slate-500 dark:text-slate-400">
                        Convert this working day to a leave type
                      </span>
                    </span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </button>
              );
            }
            return (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400">
                Leave cannot be applied to this day type ({currentCode}).
              </div>
            );
          })()}

          {/* Current vs Original Display */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Original Office Roster
              </span>
              <StatusBadge statusId={entry.originalStatusId} statuses={statuses} size="md" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Current Active Roster
              </span>
              <StatusBadge statusId={entry.currentStatusId} statuses={statuses} size="md" />
            </div>
          </div>

          {/* New Roster Status Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              New Roster Status <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {activeStatuses.map((s) => {
                const isSelected = newStatusId === s.code;
                return (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => handleStatusSelect(s.code)}
                    className={`p-2 rounded-xl border text-left text-xs transition-all flex flex-col justify-between ${
                      isSelected
                        ? 'border-purple-600 bg-purple-50/80 dark:bg-purple-950/80 text-purple-950 dark:text-purple-100 ring-2 ring-purple-500/20 font-bold'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="font-extrabold text-[11px]">{s.code}</span>
                    </div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                      {s.description || s.displayName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action / Reason */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Action Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="e.g. Work From Home, Full day leave, Training..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
            />
          </div>

          {/* Reason for Change (Audit record) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Reason for Change (Audit Record)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Approved by Manager / Personal errand / Home service..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
            />
          </div>

          {/* Clock In & Clock Out Times with AM/PM Clock Picker */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-purple-50/40 dark:bg-purple-950/20 rounded-xl border border-purple-100 dark:border-purple-900/40">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                Clock In (Arrival)
              </label>
              <ClockTimePicker
                value={clockIn}
                onChange={(val) => setClockIn(val)}
                placeholder="08:15 AM"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3 text-purple-600 dark:text-purple-400" />
                Clock Out (Departure)
              </label>
              <ClockTimePicker
                value={clockOut}
                onChange={(val) => setClockOut(val)}
                placeholder="05:30 PM"
                className="w-full"
              />
            </div>
          </div>

          {/* Notes / Remark */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Remark / Duty Note
              </label>
              <span className="text-[10px] text-purple-600 dark:text-purple-400 font-medium">
                Saved to Supabase DB
              </span>
            </div>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Swapped with John for emergency duty / OT approved for release deployment..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none resize-none"
            />
          </div>

          {/* Options: OT & Calendar */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={ot}
                onChange={(e) => setOt(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-700 text-purple-600 focus:ring-purple-500"
              />
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                Include Overtime (OT)
              </span>
            </label>

            {ot && (
              <div className="p-3 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/60 rounded-xl space-y-3 my-1">
                <p className="font-bold text-[11px] text-purple-900 dark:text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  OT Hours Breakdown (Same Day)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="24"
                      value={otMorningHours}
                      onChange={(e) => setOtMorningHours(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="24"
                      value={otNightHours}
                      onChange={(e) => setOtNightHours(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Shift-Time OT Helper */}
                <div className="pt-2 border-t border-purple-100/60 dark:border-purple-900/40">
                  <button
                    type="button"
                    onClick={() => setShowCalculator(!showCalculator)}
                    className="flex items-center gap-1.5 text-purple-700 dark:text-purple-400 font-bold text-[10px] uppercase tracking-wider hover:underline focus:outline-none cursor-pointer"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                    {showCalculator ? 'Hide Shift-Time Helper' : 'Calculate from shift times'}
                  </button>
                  
                  {showCalculator && (
                    <div className="mt-2.5 p-2.5 bg-white dark:bg-slate-900/60 rounded-lg border border-purple-100 dark:border-purple-950/80 space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">Morning (Early Arrival):</span>
                          <span>Expected Start: <strong className="text-purple-700 dark:text-purple-300">{getExpectedTimes().startLabel}</strong></span>
                        </div>
                        <div className="flex gap-2 items-center">
                          <span className="text-[10px] text-slate-400">Arrived:</span>
                          <input
                            type="time"
                            value={calcMorningArrival}
                            onChange={(e) => setCalcMorningArrival(e.target.value)}
                            className="px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const calculated = calculateMorningOT(calcMorningArrival);
                              setOtMorningHours(String(calculated));
                            }}
                            className="px-2 py-1 text-[10px] bg-purple-100 hover:bg-purple-200 dark:bg-purple-950/80 dark:hover:bg-purple-900/80 text-purple-700 dark:text-purple-300 rounded font-bold transition-colors cursor-pointer"
                          >
                            Apply ({calculateMorningOT(calcMorningArrival)}h)
                          </button>
                        </div>
                        <p className="text-[9px] text-slate-400 leading-normal">
                          Arriving before {getExpectedTimes().startLabel} earns morning OT. For example, arriving at 08:15 AM calculates {calculateMorningOT('08:15').toFixed(1)} hrs.
                        </p>
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                        <div className="flex items-center justify-between text-[10px] text-slate-500">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">Night (Late Departure):</span>
                          <span>Expected End: <strong className="text-purple-700 dark:text-purple-300">{getExpectedTimes().endLabel}</strong></span>
                        </div>
                        <div className="flex gap-2 items-center">
                          <span className="text-[10px] text-slate-400">Departed:</span>
                          <input
                            type="time"
                            value={calcNightDeparture}
                            onChange={(e) => setCalcNightDeparture(e.target.value)}
                            className="px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                          />
                          <label className="flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={calcNightNextDay}
                              onChange={(e) => setCalcNightNextDay(e.target.checked)}
                              className="rounded border-slate-300 dark:border-slate-700 text-purple-600 focus:ring-purple-500"
                            />
                            Next day (after midnight)
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const calculated = calculateNightOT(calcNightDeparture, calcNightNextDay);
                              setOtNightHours(String(calculated));
                            }}
                            className="px-2 py-1 text-[10px] bg-purple-100 hover:bg-purple-200 dark:bg-purple-950/80 dark:hover:bg-purple-900/80 text-purple-700 dark:text-purple-300 rounded font-bold transition-colors cursor-pointer"
                          >
                            Apply ({calculateNightOT(calcNightDeparture, calcNightNextDay)}h)
                          </button>
                        </div>
                        <p className="text-[9px] text-slate-400 leading-normal">
                          Departing after {getExpectedTimes().endLabel} earns night OT. Tick "Next day" when the shift finishes after midnight. For example, departing at 02:00 next day calculates {calculateNightOT('02:00', true).toFixed(1)} hrs.
                        </p>
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setOtMorningHours(String(calculateMorningOT(calcMorningArrival)));
                            setOtNightHours(String(calculateNightOT(calcNightDeparture, calcNightNextDay)));
                          }}
                          className="w-full px-2.5 py-1.5 text-[10px] bg-purple-600 hover:bg-purple-700 text-white font-bold rounded shadow-xs transition-colors cursor-pointer text-center"
                        >
                          Apply Both ({(calculateMorningOT(calcMorningArrival) + calculateNightOT(calcNightDeparture, calcNightNextDay)).toFixed(1)} hrs total)
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-purple-100/60 dark:border-purple-900/40 text-xs">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">Daily Total OT:</span>
                  <span className="font-extrabold text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-950/80 px-2 py-0.5 rounded-md">
                    {((parseFloat(otMorningHours) || 0) + (parseFloat(otNightHours) || 0)).toFixed(1)} hrs
                  </span>
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={updateCalendar}
                onChange={(e) => setUpdateCalendar(e.target.checked)}
                className="rounded border-slate-300 dark:border-slate-700 text-purple-600 focus:ring-purple-500"
              />
              <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                Update Google Calendar automatically
              </span>
            </label>
          </div>

          {/* Buttons */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white transition-colors shadow-sm flex items-center gap-1.5"
            >
              {isSubmitting ? 'Saving...' : 'Save Roster Change'}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
);
};
