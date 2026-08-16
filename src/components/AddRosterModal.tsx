import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RosterStatusConfig } from '../types/roster';
import { StatusBadge } from './StatusBadge';
import { ClockTimePicker } from './ClockTimePicker';
import { getDayOfWeekName } from '../utils/date';
import { X, Calendar, PlusCircle, AlertCircle, Calculator, Clock } from 'lucide-react';

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
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden transition-all my-8"
            >
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-purple-50 dark:bg-purple-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-600 text-white">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-purple-950 dark:text-purple-100">
                Add Manual Roster Entry
              </h3>
              <p className="text-xs text-purple-700 dark:text-purple-300">
                Add office roster date and optional changes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-purple-400 hover:text-purple-700 hover:bg-purple-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {/* Date Picker */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Select Date <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500"
              />
              <span className="font-bold text-purple-700 dark:text-purple-300 text-sm">
                ({dayName})
              </span>
            </div>
          </div>

          {/* Original Office Roster Status */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Original Office Provided Roster Status <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {statuses.filter((s) => s.active).map((s) => {
                const isSelected = originalStatusId === s.code;
                return (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => handleOriginalStatusSelect(s.code)}
                    className={`p-2 rounded-xl border text-left text-xs transition-all ${
                      isSelected
                        ? 'border-purple-600 bg-purple-50 dark:bg-purple-950/80 text-purple-900 dark:text-purple-100 font-bold'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="font-extrabold">{s.code}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Description */}
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Action Title / Shift Description <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="e.g. Regular Duty / Training / Leave..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
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
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Remark / Duty Note
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Swapped with team member / Overtime justification / Special duty notes..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white resize-none"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer pt-1 font-semibold text-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={ot}
                onChange={(e) => setOt(e.target.checked)}
                className="rounded border-slate-300 text-purple-600"
              />
              Includes Overtime (OT)
            </label>

            {ot && (
              <div className="p-3 bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/60 rounded-xl space-y-3 my-1 text-xs">
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
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-500">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">Morning (Early Arrival):</span>
                          <span>Expected Start: <strong className="text-purple-700 dark:text-purple-300">{getExpectedTimes().startLabel}</strong></span>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
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
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-500">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">Night (Late Departure):</span>
                          <span>Expected End: <strong className="text-purple-700 dark:text-purple-300">{getExpectedTimes().endLabel}</strong></span>
                        </div>
                        <div className="flex flex-wrap gap-2 items-center">
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
          </div>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
            >
              {isSubmitting ? 'Adding...' : 'Add Roster Entry'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  </motion.div>
  )}
  </AnimatePresence>
);
};
