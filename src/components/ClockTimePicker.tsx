import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Clock, Check, X, Sunset, Sun } from 'lucide-react';
import {
  useFloating,
  offset,
  flip,
  shift,
  autoUpdate,
} from '@floating-ui/react';
import {
  parseTimeTo12hParts,
  format12hTo24hTime,
  parseTimeToMinutes,
  formatMinutesToTime,
  formatTo12hDisplay,
} from '../utils/otCalculator';

interface ClockTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
}

const HOURS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

export const ClockTimePicker: React.FC<ClockTimePickerProps> = ({
  value,
  onChange,
  placeholder = 'Select time...',
  label,
  className = '',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { refs, floatingStyles } = useFloating({
    placement: 'bottom-start',
    open: isOpen,
    onOpenChange: setIsOpen,
    middleware: [
      offset(8),
      flip({
        fallbackAxisSideDirection: 'end',
        padding: 12,
        altBoundary: true,
      }),
      shift({
        padding: 12,
        altBoundary: true,
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  // Derive 12h parts from value
  const parts = parseTimeTo12hParts(value);
  const selectedHour = parts.hour;
  const selectedMinute = parts.minute;
  const selectedAmpm = parts.ampm;

  const [typedText, setTypedText] = useState<string | null>(null);

  // Handle outside click to close popover
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current?.contains(target) ||
        (refs.floating.current && (refs.floating.current as HTMLElement).contains(target))
      ) {
        return;
      }
      setIsOpen(false);
      setTypedText(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, refs.floating]);

  const handleApply = (h: string, m: string, ampm: 'AM' | 'PM') => {
    const time24 = format12hTo24hTime(h, m, ampm);
    onChange(time24);
    setTypedText(null);
  };

  const handlePreset = (time24: string) => {
    onChange(time24);
    setTypedText(null);
    setIsOpen(false);
  };

  const handleInputChange = (text: string) => {
    setTypedText(text);
    const parsedMins = parseTimeToMinutes(text);
    if (parsedMins !== null) {
      const time24 = formatMinutesToTime(parsedMins);
      onChange(time24);
    } else if (text.trim() === '') {
      onChange('');
    }
  };

  const handleInputBlur = () => {
    if (typedText !== null) {
      setTypedText(null);
    }
  };

  const displayString = typedText !== null ? typedText : (value ? formatTo12hDisplay(value) : '');

  return (
    <div className={`relative inline-block ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
          {label}
        </label>
      )}

      {/* Main Input Control */}
      <div className="relative flex items-center" ref={refs.setReference}>
        <input
          type="text"
          disabled={disabled}
          placeholder={placeholder}
          value={displayString}
          onChange={(e) => handleInputChange(e.target.value)}
          onBlur={handleInputBlur}
          onClick={() => !disabled && setIsOpen(true)}
          className="w-full pr-7 pl-2.5 py-1 text-xs font-mono font-medium rounded-lg border border-slate-200 dark:border-zinc-700/80 bg-white dark:bg-zinc-900 text-slate-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className="absolute right-1.5 p-1 text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors rounded cursor-pointer disabled:opacity-50"
          title="Open Clock Time Picker"
        >
          <Clock className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Floating Popover Picker via Portal */}
      {isOpen && createPortal(
        <div
          ref={refs.setFloating}
          style={{ ...floatingStyles, zIndex: 9999 }}
          className="w-72 sm:w-80 p-4 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl text-slate-900 dark:text-zinc-100 max-h-[calc(100vh-32px)] overflow-y-auto animate-fadeIn select-none backdrop-blur-md"
        >
          {/* Header Preview & AM/PM Toggle */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100 dark:border-zinc-800">
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span className="font-mono text-base font-extrabold text-slate-900 dark:text-white">
                {selectedHour}:{selectedMinute}
              </span>
              <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                {selectedAmpm}
              </span>
            </div>

            {/* AM / PM Selector Toggle */}
            <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => {
                  handleApply(selectedHour, selectedMinute, 'AM');
                }}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all flex items-center gap-1 ${
                  selectedAmpm === 'AM'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Sun className="w-3 h-3" />
                AM
              </button>
              <button
                type="button"
                onClick={() => {
                  handleApply(selectedHour, selectedMinute, 'PM');
                }}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all flex items-center gap-1 ${
                  selectedAmpm === 'PM'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Sunset className="w-3 h-3" />
                PM
              </button>
            </div>
          </div>

          {/* Hour Grid (01 to 12) */}
          <div className="mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Select Hour
            </span>
            <div className="grid grid-cols-6 gap-1">
              {HOURS.map((h) => {
                const isSelected = selectedHour === h;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => {
                      handleApply(h, selectedMinute, selectedAmpm);
                    }}
                    className={`py-1 text-xs font-mono font-bold rounded-lg transition-all ${
                      isSelected
                        ? 'bg-purple-600 text-white ring-2 ring-purple-400'
                        : 'bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {h}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Minute Grid (00 to 55) */}
          <div className="mb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Select Minute
            </span>
            <div className="grid grid-cols-6 gap-1">
              {MINUTES.map((m) => {
                const isSelected = selectedMinute === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      handleApply(selectedHour, m, selectedAmpm);
                    }}
                    className={`py-1 text-xs font-mono font-bold rounded-lg transition-all ${
                      isSelected
                        ? 'bg-purple-600 text-white ring-2 ring-purple-400'
                        : 'bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    :{m}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Shift Quick Presets */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
              Shift Presets
            </span>
            <div className="grid grid-cols-2 gap-1 mb-2">
              <button
                type="button"
                onClick={() => handlePreset('08:15')}
                className="px-2 py-1 text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-md hover:bg-emerald-100"
              >
                08:15 AM (NWD In)
              </button>
              <button
                type="button"
                onClick={() => handlePreset('17:30')}
                className="px-2 py-1 text-[10px] font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-md hover:bg-indigo-100"
              >
                05:30 PM (NWD Out)
              </button>
              <button
                type="button"
                onClick={() => handlePreset('10:15')}
                className="px-2 py-1 text-[10px] font-semibold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-100"
              >
                10:15 AM (RTD In)
              </button>
              <button
                type="button"
                onClick={() => handlePreset('19:30')}
                className="px-2 py-1 text-[10px] font-semibold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 rounded-md hover:bg-purple-100"
              >
                07:30 PM (RTD Out)
              </button>
            </div>

            {/* Footer Action Controls */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                }}
                className="px-2 py-1 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 rounded"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  handleApply(selectedHour, selectedMinute, selectedAmpm);
                  setIsOpen(false);
                }}
                className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs flex items-center gap-1 shadow-md shadow-purple-600/30 transition-all cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                Set Time
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
