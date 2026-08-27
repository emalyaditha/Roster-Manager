import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RosterEntry, RosterStatusConfig } from '../types/roster';
import { StatusBadge } from './StatusBadge';
import { ClockTimePicker } from './ClockTimePicker';
import { formatDateDisplay } from '../utils/date';
import { ArrowRight, Calendar, AlertCircle, Calculator, Clock, CalendarDays, History } from 'lucide-react';
import { canApplyLeaveToCode, isAlreadyLeaveCode } from '../utils/leave';
import { sortByStatusDisplayOrder } from '../utils/statusOrder';
import { api } from '../services/api';
import { RosterChangeHistory } from '../types/roster';
import { formatTimestamp } from '../utils/date';

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
  const [lastHistory, setLastHistory] = useState<RosterChangeHistory | null>(null);

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
      // Fetch last audit record to show Original vs Last Updated
      api.getHistory(entry.id).then((list) => {
        if (list.length > 0) {
          const sorted = [...list].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setLastHistory(sorted[0]);
        } else {
          setLastHistory(null);
        }
      }).catch(() => setLastHistory(null));
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

  const activeStatuses = sortByStatusDisplayOrder(statuses.filter((s) => s.active));

  return (
    <AnimatePresence>
      {isOpen && entry && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto py-6 sm:py-10 px-4"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 dark:bg-black/60"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="relative card shadow-[var(--shadow-md)] rounded-xl w-full max-w-lg overflow-hidden"
          >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
              Change Roster Entry
            </h3>
            <p className="text-xs text-muted">
              {formatDateDisplay(entry.date)} ({entry.day})
            </p>
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-5 py-4 space-y-4 text-xs">

          {/* Important Rule Banner */}
          <div
            className="p-3 rounded-lg border text-xs text-fg flex items-start gap-2.5"
            style={{ background: 'var(--accent-soft)', borderColor: 'var(--color-border)' }}
          >
            <AlertCircle className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold block">Original Roster Preserved</span>
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
                    const origCode = entry.originalStatusId || 'NWD';
                    const origStatus = statuses.find((s) => s.code === origCode);
                    try {
                      await onSave({
                        newStatusId: origCode,
                        action: origStatus?.description || origStatus?.displayName || 'Reverted to original roster status',
                        reason: 'Leave reverted by user',
                        notes: `Reverted from ${currentCode} back to ${origCode}`,
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
                  className="w-full p-3 rounded-lg border border-line hover:border-[var(--success)] transition-colors flex items-center justify-between text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <CalendarDays className="w-4 h-4" style={{ color: 'var(--success)' }} />
                    <span>
                      <span className="block text-xs font-semibold text-fg">
                        Remove Leave / Revert to Original
                      </span>
                      <span className="block text-[10px] text-muted">
                        Restore {entry.originalStatusId || 'NWD'} and credit the leave balance back
                      </span>
                    </span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-faint" />
                </button>
              );
            }
            if (canApplyLeaveToCode(currentCode)) {
              return (
                <button
                  type="button"
                  onClick={() => onApplyLeave && onApplyLeave(entry)}
                  className="w-full p-3 rounded-lg border border-line hover:border-[var(--danger)] transition-colors flex items-center justify-between text-left cursor-pointer"
                >
                  <span className="flex items-center gap-2.5">
                    <CalendarDays className="w-4 h-4" style={{ color: 'var(--danger)' }} />
                    <span>
                      <span className="block text-xs font-semibold text-fg">
                        Apply Leave
                      </span>
                      <span className="block text-[10px] text-muted">
                        Convert this working day to a leave type
                      </span>
                    </span>
                  </span>
                  <ArrowRight className="w-4 h-4 text-faint" />
                </button>
              );
            }
            return (
              <div className="p-3 bg-well border border-line rounded-lg text-[11px] text-muted">
                Leave cannot be applied to this day type ({currentCode}).
              </div>
            );
          })()}

          {/* Current vs Original vs Last Updated */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-well rounded-lg border border-line text-xs">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-faint block mb-1">
                Original Office Roster
              </span>
              <StatusBadge statusId={entry.originalStatusId} statuses={statuses} size="md" />
              <span className="text-[9px] text-faint block mt-1">Never overwritten — sacred</span>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-faint block mb-1">
                Current Active Roster
              </span>
              <StatusBadge statusId={entry.currentStatusId} statuses={statuses} size="md" />
              {entry.changedStatusId && (
                <span className="text-[9px] text-faint block mt-1">Changed from {entry.originalStatusId} → {entry.currentStatusId}</span>
              )}
              {!entry.changedStatusId && (
                <span className="text-[9px] text-faint block mt-1">Matches original</span>
              )}
            </div>
          </div>
          {lastHistory && (
            <div className="p-2.5 bg-surface rounded-lg border border-line text-[11px] flex items-start gap-2">
              <History className="w-3.5 h-3.5 text-faint mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-fg block text-[10px] uppercase">Last Updated</span>
                <span className="text-muted">{lastHistory.previousStatusId} → {lastHistory.newStatusId} • {formatTimestamp(lastHistory.timestamp)} • {lastHistory.user}</span>
                <span className="text-faint block text-[10px] truncate">{lastHistory.reason}</span>
              </div>
            </div>
          )}
          <p className="text-[10px] text-muted text-center">You can change this day as many times as you want. Original is always preserved; hit the History icon in the table to see full trail.</p>

          {/* New Roster Status Selection */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1 block">
              New Roster Status <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {activeStatuses.map((s) => {
                const isSelected = newStatusId === s.code;
                return (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => handleStatusSelect(s.code)}
                    className={`chip chip-neutral w-full !whitespace-normal flex-col !items-start justify-between p-2 rounded-md border transition-colors ${
                      isSelected ? 'border-[var(--color-primary)]' : 'border-line hover:bg-well'
                    }`}
                    style={isSelected && s.color ? { background: `${s.color}1f` } : undefined}
                  >
                    <span className="flex items-center justify-between w-full mb-1">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="font-bold text-[11px]">{s.code}</span>
                    </span>
                    <span className="text-[10px] text-muted truncate w-full">
                      {s.description || s.displayName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action / Reason */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1 block">
              Action Title <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              required
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="e.g. Work From Home, Full day leave, Training..."
              className="input-min text-xs"
            />
          </div>

          {/* Reason for Change (Audit record) */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1 block">
              Reason for Change (Audit Record)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Approved by Manager / Personal errand / Home service..."
              className="input-min text-xs"
            />
          </div>

          {/* Clock In & Clock Out Times with AM/PM Clock Picker */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-well rounded-lg border border-line">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3 text-faint" />
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
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3 text-faint" />
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
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted">
                Remark / Duty Note
              </label>
              <span className="text-[10px] text-faint font-medium">
                Saved to Supabase DB
              </span>
            </div>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Swapped with John for emergency duty / OT approved for release deployment..."
              className="input-min text-xs resize-none"
            />
          </div>

          {/* Options: OT & Calendar */}
          <div className="pt-2 border-t border-line space-y-2 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={ot}
                onChange={(e) => setOt(e.target.checked)}
                className="rounded border-line accent-[var(--color-primary)] cursor-pointer"
              />
              <span className="font-medium text-fg">
                Include Overtime (OT)
              </span>
            </label>

            {ot && (
              <div className="p-3 bg-well border border-line rounded-lg space-y-3 my-1">
                <p className="font-semibold text-[11px] text-fg uppercase tracking-wide flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-accent" />
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
                      className="input-min !h-auto py-1.5 text-xs"
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
                      className="input-min !h-auto py-1.5 text-xs"
                    />
                  </div>
                </div>

                {/* Shift-Time OT Helper */}
                <div className="pt-2 border-t border-line">
                  <button
                    type="button"
                    onClick={() => setShowCalculator(!showCalculator)}
                    className="flex items-center gap-1.5 text-accent font-semibold text-[10px] uppercase tracking-wide hover:underline focus:outline-none cursor-pointer"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                    {showCalculator ? 'Hide Shift-Time Helper' : 'Calculate from shift times'}
                  </button>
                  
                  {showCalculator && (
                    <div className="mt-2.5 p-2.5 bg-surface rounded-lg border border-line space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-muted">
                          <span className="font-semibold">Morning (Early Arrival):</span>
                          <span>Expected Start: <strong className="text-accent">{getExpectedTimes().startLabel}</strong></span>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <span className="text-[10px] text-faint">Arrived:</span>
                          <input
                            type="time"
                            value={calcMorningArrival}
                            onChange={(e) => setCalcMorningArrival(e.target.value)}
                            className="input-min !h-7 !w-auto px-2 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const calculated = calculateMorningOT(calcMorningArrival);
                              setOtMorningHours(String(calculated));
                            }}
                            className="chip chip-accent font-semibold cursor-pointer hover:opacity-90"
                          >
                            Apply ({calculateMorningOT(calcMorningArrival)}h)
                          </button>
                        </div>
                        <p className="text-[9px] text-faint leading-normal">
                          Arriving before {getExpectedTimes().startLabel} earns morning OT. For example, arriving at 08:15 AM calculates {calculateMorningOT('08:15').toFixed(1)} hrs.
                        </p>
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-line">
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-muted">
                          <span className="font-semibold">Night (Late Departure):</span>
                          <span>Expected End: <strong className="text-accent">{getExpectedTimes().endLabel}</strong></span>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
                          <span className="text-[10px] text-faint">Departed:</span>
                          <input
                            type="time"
                            value={calcNightDeparture}
                            onChange={(e) => setCalcNightDeparture(e.target.value)}
                            className="input-min !h-7 !w-auto px-2 text-xs"
                          />
                          <label className="flex items-center gap-1 text-[10px] text-muted cursor-pointer">
                            <input
                              type="checkbox"
                              checked={calcNightNextDay}
                              onChange={(e) => setCalcNightNextDay(e.target.checked)}
                              className="rounded border-line accent-[var(--color-primary)] cursor-pointer"
                            />
                            Next day (after midnight)
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const calculated = calculateNightOT(calcNightDeparture, calcNightNextDay);
                              setOtNightHours(String(calculated));
                            }}
                            className="chip chip-accent font-semibold cursor-pointer hover:opacity-90"
                          >
                            Apply ({calculateNightOT(calcNightDeparture, calcNightNextDay)}h)
                          </button>
                        </div>
                        <p className="text-[9px] text-faint leading-normal">
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
                          className="btn-primary w-full h-7 text-[10px] font-semibold rounded-md cursor-pointer text-center"
                        >
                          Apply Both ({(calculateMorningOT(calcMorningArrival) + calculateNightOT(calcNightDeparture, calcNightNextDay)).toFixed(1)} hrs total)
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-line text-xs">
                  <span className="text-muted font-medium">Daily Total OT:</span>
                  <span className="chip chip-accent font-bold tabular-nums">
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
                className="rounded border-line accent-[var(--color-primary)] cursor-pointer"
              />
              <span className="font-medium text-fg flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-faint" />
                Update Google Calendar automatically
              </span>
            </label>
          </div>

          </div>

          {/* Footer */}
          <div className="px-5 py-3.5 border-t border-line flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary flex items-center gap-1.5"
            >
              {isSubmitting ? 'Saving...' : 'Save Roster Change'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )}
  </AnimatePresence>
);
};
