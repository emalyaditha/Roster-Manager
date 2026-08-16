import React, { useState, useEffect } from 'react';
import { RosterStatusConfig } from '../types/roster';
import { api } from '../services/api';
import { getRosterCycleRange } from '../utils/date';
import { X, Sparkles, Calendar, CheckCircle2 } from 'lucide-react';

interface TemplateGeneratorModalProps {
  isOpen: boolean;
  statuses: RosterStatusConfig[];
  currentMonthYear: string;
  onClose: () => void;
  onGenerated: () => void;
}

export const TemplateGeneratorModal: React.FC<TemplateGeneratorModalProps> = ({
  isOpen,
  statuses,
  currentMonthYear,
  onClose,
  onGenerated,
}) => {
  const cycleRange = getRosterCycleRange(currentMonthYear);
  const [startDate, setStartDate] = useState(cycleRange.startDate || `${currentMonthYear}-16`);
  const [endDate, setEndDate] = useState(cycleRange.endDate || `${currentMonthYear}-15`);
  const [overwrite, setOverwrite] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    const range = getRosterCycleRange(currentMonthYear);
    if (range.startDate && range.endDate) {
      setStartDate(range.startDate);
      setEndDate(range.endDate);
    }
  }, [currentMonthYear]);

  // Weekly pattern mapping
  const [template, setTemplate] = useState<Record<string, string>>({
    Monday: 'RTD',
    Tuesday: 'RTD',
    Wednesday: 'RTD',
    Thursday: 'RTD',
    Friday: 'RTD',
    Saturday: 'HOL',
    Sunday: 'HOL',
  });

  if (!isOpen) return null;

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const handleDayStatusChange = (day: string, code: string) => {
    setTemplate((prev) => ({ ...prev, [day]: code }));
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsGenerating(true);
    try {
      await api.generateTemplate({
        startDate,
        endDate,
        template,
        overwrite,
      });
      onGenerated();
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden transition-all my-8">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-purple-50 dark:bg-purple-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-600 text-white">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-purple-950 dark:text-purple-100">
                Weekly Roster Pattern Generator
              </h3>
              <p className="text-xs text-purple-700 dark:text-purple-300">
                Generate default office rosters for a date range
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

        <form onSubmit={handleGenerate} className="p-6 space-y-4 text-xs">
          {/* Date Range Selection */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Start Date
              </label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                End Date
              </label>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Weekly Pattern Selectors */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="block font-bold text-slate-900 dark:text-white">
              Weekly Day Schedule Pattern
            </label>

            <div className="space-y-1.5">
              {daysOfWeek.map((day) => (
                <div key={day} className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 w-24">{day}</span>
                  <select
                    value={template[day]}
                    onChange={(e) => handleDayStatusChange(day, e.target.value)}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-bold"
                  >
                    {statuses.filter((s) => s.active).map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code} — {s.displayName}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-slate-300 pt-2 border-t border-slate-100 dark:border-slate-800">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(e) => setOverwrite(e.target.checked)}
              className="rounded border-slate-300 text-purple-600"
            />
            Overwrite existing roster entries in this date range
          </label>

          {/* Footer */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isGenerating}
              className="px-4 py-2 font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isGenerating}
              className="px-5 py-2 font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-sm flex items-center gap-1.5"
            >
              <Sparkles className="w-4 h-4" />
              {isGenerating ? 'Generating...' : 'Generate Roster Pattern'}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
);
};
