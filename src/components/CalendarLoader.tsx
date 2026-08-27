import React, { useEffect, useMemo, useState } from 'react';

interface CalendarLoaderProps {
  label?: string;
  /** Optional list of messages cycled while loading (overrides label). */
  messages?: string[];
  /** compact = inline fallback for lazy views; default is a full-page loader */
  compact?: boolean;
}

/**
 * Calendar-themed loading screen: a mini month card whose day cells light up
 * in a rolling wave, with today's date pinned in the accent color.
 */
export const CalendarLoader: React.FC<CalendarLoaderProps> = ({
  label = 'Loading your roster days',
  messages,
  compact = false,
}) => {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    if (!messages || messages.length <= 1) return;
    const timer = setInterval(() => {
      setMsgIndex((i) => (i + 1) % messages.length);
    }, 1600);
    return () => clearInterval(timer);
  }, [messages]);

  const text = messages && messages.length > 0 ? messages[msgIndex % messages.length] : label;
  const now = useMemo(() => new Date(), []);
  // Only 14 cells (2 weeks) for compact animation — 31 cells + 70ms stagger caused 2.1s jank on low-end
  const days = useMemo(() => compact ? Array.from({ length: 14 }, (_, i) => i + 1) : Array.from({ length: 21 }, (_, i) => i + 1), [compact]);
  const monthLabel = now.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  const today = now.getDate();

  return (
      <div
        className={`cal-loader ${compact ? 'cal-loader-compact' : ''}`}
        role="status"
        aria-live="polite"
        aria-label={text}
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
              style={{ animationDelay: `${((d - 1) % 14) * 40}ms` }}
            >
              {d}
            </span>
          ))}
        </div>
      </div>
      <div className="cal-loader-text">
        {text}
        <span className="cal-loader-dots" aria-hidden>
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </span>
      </div>
    </div>
  );
};
