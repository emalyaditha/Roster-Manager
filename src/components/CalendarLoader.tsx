import React, { useMemo } from 'react';

interface CalendarLoaderProps {
  label?: string;
  /** compact = inline fallback for lazy views; default is a full-page loader */
  compact?: boolean;
}

/**
 * Calendar-themed loading screen: a mini month card whose day cells light up
 * in a rolling wave, with today's date pinned in the accent color.
 */
export const CalendarLoader: React.FC<CalendarLoaderProps> = ({
  label = 'Loading your roster days',
  compact = false,
}) => {
  const now = useMemo(() => new Date(), []);
  const days = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), []);
  const monthLabel = now.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const today = now.getDate();

  return (
    <div
      className={`cal-loader ${compact ? 'cal-loader-compact' : ''}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="cal-loader-card" aria-hidden>
        <span className="cal-ring cal-ring-l" />
        <span className="cal-ring cal-ring-r" />
        <div className="cal-loader-head">
          <span className="cal-loader-month">{monthLabel}</span>
          <span className="cal-loader-year">{now.getFullYear()}</span>
        </div>
        <div className="cal-loader-grid">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <span key={`wd-${i}`} className="cal-loader-weekday">
              {d}
            </span>
          ))}
          {days.map((d) => (
            <span
              key={d}
              className={`cal-loader-cell${d === today ? ' is-today' : ''}`}
              style={{ animationDelay: `${((d - 1) % 31) * 70}ms` }}
            >
              {d}
            </span>
          ))}
        </div>
      </div>
      <div className="cal-loader-text">
        {label}
        <span className="cal-loader-dots" aria-hidden>
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </div>
    </div>
  );
};
