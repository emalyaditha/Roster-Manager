import React, { useEffect, useState } from 'react';

interface AccessBadgeLoaderProps {
  messages?: string[];
}

/**
 * Access-verification loader: an ID badge with a sweeping scan beam and a
 * rotating verification ring — distinct from the calendar data loader.
 */
export const AccessBadgeLoader: React.FC<AccessBadgeLoaderProps> = ({ messages }) => {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    if (!messages || messages.length <= 1) return;
    const timer = setInterval(() => {
      setMsgIndex((i) => (i + 1) % messages.length);
    }, 1600);
    return () => clearInterval(timer);
  }, [messages]);

  const text = messages && messages.length > 0 ? messages[msgIndex % messages.length] : 'Verifying access';

  return (
    <div className="badge-loader" role="status" aria-live="polite" aria-label={text}>
      <div className="badge-loader-stage" aria-hidden>
        <span className="badge-orbit" />
        <div className="badge-card">
          <span className="badge-slot" />
          <span className="badge-avatar">E</span>
          <span className="badge-line badge-line-a" />
          <span className="badge-line badge-line-b" />
          <span className="badge-chip" />
          <span className="badge-scan" />
        </div>
        <span className="badge-tick badge-tick-a">✓</span>
        <span className="badge-tick badge-tick-b">✓</span>
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
