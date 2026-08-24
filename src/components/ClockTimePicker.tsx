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
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">
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
          className="input-min !h-auto py-1 pr-7 pl-2.5 text-xs font-mono font-medium disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className="absolute right-1.5 p-1 text-faint hover:text-accent transition-colors rounded cursor-pointer disabled:opacity-50"
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
          className="card shadow-[var(--shadow-md)] rounded-xl p-3 w-72 sm:w-80 text-fg max-h-[calc(100vh-32px)] overflow-y-auto animate-fadeIn select-none"
        >
          {/* Header Preview & AM/PM Toggle */}
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-line">
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-accent" />
              <span className="font-mono text-base font-bold text-fg tabular-nums">
                {selectedHour}:{selectedMinute}
              </span>
              <span className="chip chip-accent font-semibold">{selectedAmpm}</span>
            </div>

            {/* AM / PM Selector Toggle */}
            <div className="flex bg-well p-0.5 rounded-lg border border-line">
              <button
                type="button"
                onClick={() => {
                  handleApply(selectedHour, selectedMinute, 'AM');
                }}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors flex items-center gap-1 ${
                  selectedAmpm === 'AM'
                    ? 'bg-accent text-on-accent'
                    : 'text-muted hover:text-fg'
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
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors flex items-center gap-1 ${
                  selectedAmpm === 'PM'
                    ? 'bg-accent text-on-accent'
                    : 'text-muted hover:text-fg'
                }`}
              >
                <Sunset className="w-3 h-3" />
                PM
              </button>
            </div>
          </div>

          {/* Hour Grid (01 to 12) */}
          <div className="mb-3">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-faint block mb-1">
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
                    className={`py-1 text-sm font-mono rounded-md transition-colors ${
                      isSelected
                        ? 'bg-accent text-on-accent font-semibold'
                        : 'text-muted hover:bg-well hover:text-fg'
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
            <span className="text-[10px] font-semibold uppercase tracking-wide text-faint block mb-1">
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
                    className={`py-1 text-sm font-mono rounded-md transition-colors ${
                      isSelected
                        ? 'bg-accent text-on-accent font-semibold'
                        : 'text-muted hover:bg-well hover:text-fg'
                    }`}
                  >
                    :{m}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Shift Quick Presets */}
          <div className="pt-2 border-t border-line">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-faint block mb-1">
              Shift Presets
            </span>
            <div className="grid grid-cols-2 gap-1 mb-2">
              <button
                type="button"
                onClick={() => handlePreset('08:15')}
                className="px-2 py-1 text-[10px] font-medium rounded-md border border-line text-muted hover:bg-well hover:text-fg transition-colors"
              >
                08:15 AM (NWD In)
              </button>
              <button
                type="button"
                onClick={() => handlePreset('17:30')}
                className="px-2 py-1 text-[10px] font-medium rounded-md border border-line text-muted hover:bg-well hover:text-fg transition-colors"
              >
                05:30 PM (NWD Out)
              </button>
              <button
                type="button"
                onClick={() => handlePreset('10:15')}
                className="px-2 py-1 text-[10px] font-medium rounded-md border border-line text-muted hover:bg-well hover:text-fg transition-colors"
              >
                10:15 AM (RTD In)
              </button>
              <button
                type="button"
                onClick={() => handlePreset('19:30')}
                className="px-2 py-1 text-[10px] font-medium rounded-md border border-line text-muted hover:bg-well hover:text-fg transition-colors"
              >
                07:30 PM (RTD Out)
              </button>
            </div>

            {/* Footer Action Controls */}
            <div className="flex items-center justify-between pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setIsOpen(false);
                }}
                className="btn-danger-min h-7 px-2 rounded-md text-[11px] font-medium"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  handleApply(selectedHour, selectedMinute, selectedAmpm);
                  setIsOpen(false);
                }}
                className="btn-primary h-7 px-2.5 rounded-md text-xs font-semibold flex items-center gap-1 cursor-pointer"
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
