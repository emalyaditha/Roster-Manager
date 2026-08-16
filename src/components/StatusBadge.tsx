import React from 'react';
import { RosterStatusConfig } from '../types/roster';

interface StatusBadgeProps {
  statusId: string;
  statuses: RosterStatusConfig[];
  size?: 'sm' | 'md' | 'lg';
  showDescription?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  statusId,
  statuses,
  size = 'md',
  showDescription = false,
}) => {
  const config = statuses.find((s) => s.code === statusId);

  const codeDisplay = config ? config.code : statusId;
  const descriptionDisplay = config ? config.description : '';

  // Size styling
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs font-semibold rounded-md',
    md: 'px-2.5 py-1 text-xs font-bold rounded-lg',
    lg: 'px-3 py-1.5 text-sm font-bold rounded-xl',
  }[size];

  // Fallback styling if status not found in config
  const bg = config?.badgeBg || 'bg-slate-100 dark:bg-slate-800';
  const text = config?.badgeText || 'text-slate-800 dark:text-slate-200';
  const border = config?.badgeBorder || 'border-slate-300 dark:border-slate-700';

  return (
    <span
      className={`inline-flex items-center gap-1.5 border ${bg} ${text} ${border} ${sizeClasses} whitespace-nowrap shadow-2xs transition-colors`}
      title={descriptionDisplay || codeDisplay}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: config?.color || '#64748b' }}
      />
      <span>{codeDisplay}</span>
      {showDescription && descriptionDisplay && (
        <span className="opacity-75 font-normal border-l border-current/20 pl-1.5 hidden sm:inline">
          {descriptionDisplay}
        </span>
      )}
    </span>
  );
};
