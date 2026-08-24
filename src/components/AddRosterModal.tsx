import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RosterStatusConfig } from '../types/roster';
import { StatusBadge } from './StatusBadge';
import { ClockTimePicker } from './ClockTimePicker';
import { getDayOfWeekName } from '../utils/date';
import { Calendar, PlusCircle, AlertCircle, Calculator, Clock } from 'lucide-react';
import { sortByStatusDisplayOrder } from '../utils/statusOrder';

interface AddRosterModalProps {
  isOpen: boolean;
  statuses: RosterStatusConfig[];
  onClose: () => void;
  onAddRoster: (data: {
    date: string;
    day: string;
    originalStatusId: string;
    changedStatusId: string;
    action: string;
    notes: string;
    clockIn?: string;
    clockOut?: string;
    ot: boolean;
    otMorningHours?: number;
    otNightHours?: number;
  }) => Promise<void>;
}

export const AddRosterModal: React.FC<AddRosterModalProps> = ({
  isOpen,
  statuses,
  onClose,
  onAddRoster,
}) => {
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [originalStatusId, setOriginalStatusId] = useState('RTD');
  const [changedStatusId, setChangedStatusId] = useState('');
  const [action, setAction] = useState('Roster To Duty');
  const [notes, setNotes] = useState('');
  const [clockIn, setClockIn] = useState('08:15');
  const [clockOut, setClockOut] = useState('17:30');
  const [ot, setOt] = useState(false);
  const [otMorningHours, setOtMorningHours] = useState('0');
  const [otNightHours, setOtNightHours] = useState('0');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Time calculator state
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcMorningArrival, setCalcMorningArrival] = useState('08:15');
  const [calcNightDeparture, setCalcNightDeparture] = useState('21:30');
  const [calcNightNextDay, setCalcNightNextDay] = useState(false);

  const getExpectedTimes = () => {
    const config = statuses.find((s) => s.code === originalStatusId);
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
    
    if (originalStatusId === 'NWD') {
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

  if (!isOpen) return null;

  const dayName = getDayOfWeekName(date);

  const handleOriginalStatusSelect = (code: string) => {
    setOriginalStatusId(code);
    const config = statuses.find((s) => s.code === code);
    if (config) {
      setAction(config.description || config.displayName);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onAddRoster({
        date,
        day: dayName,
        originalStatusId,
        changedStatusId: changedStatusId || originalStatusId,
        action,
        notes,
        clockIn,
        clockOut,
        ot,
        otMorningHours: ot ? parseFloat(otMorningHours) || 0 : 0,
        otNightHours: ot ? parseFloat(otNightHours) || 0 : 0,
      });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
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
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-accent text-on-accent">
              <PlusCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-fg">
                Add Manual Roster Entry
              </h3>
              <p className="text-xs text-muted">
                Add office roster date and optional changes
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Close">
            ✕
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit}>
          <div className="px-5 py-4 space-y-4 text-xs">

          {/* Date Picker */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1 block">
              Select Date <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input-min !w-auto flex-1 text-xs"
              />
              <span className="font-semibold text-accent text-sm">
                ({dayName})
              </span>
            </div>
          </div>

          {/* Original Office Roster Status */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1 block">
              Original Office Provided Roster Status <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {sortByStatusDisplayOrder(statuses.filter((s) => s.active)).map((s) => {
                const isSelected = originalStatusId === s.code;
                return (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => handleOriginalStatusSelect(s.code)}
                    className={`chip chip-neutral w-full justify-between p-2 rounded-md border transition-colors ${
                      isSelected ? 'border-[var(--color-primary)]' : 'border-line hover:bg-well'
                    }`}
                    style={isSelected && s.color ? { background: `${s.color}1f` } : undefined}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="font-bold">{s.code}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Description */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1 block">
              Action Title / Shift Description <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="text"
              required
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="e.g. Regular Duty / Training / Leave..."
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
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1 block">
              Remark / Duty Note
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Swapped with team member / Overtime justification / Special duty notes..."
              className="input-min text-xs resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer pt-1 font-medium text-fg">
              <input
                type="checkbox"
                checked={ot}
                onChange={(e) => setOt(e.target.checked)}
                className="rounded border-line accent-[var(--color-primary)] cursor-pointer"
              />
              Includes Overtime (OT)
            </label>

            {ot && (
              <div className="p-3 bg-well border border-line rounded-lg space-y-3 my-1 text-xs">
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
              className="btn-primary"
            >
              {isSubmitting ? 'Adding...' : 'Add Roster Entry'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )}
  </AnimatePresence>
);
};
