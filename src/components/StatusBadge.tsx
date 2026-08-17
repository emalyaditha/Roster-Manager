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

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[11px] font-semibold rounded-md',
    md: 'px-2 py-0.5 text-[11px] font-semibold rounded-lg',
    lg: 'px-2.5 py-1 text-xs font-semibold rounded-lg',
  }[size];

  const bg = config?.badgeBg || 'bg-slate-100 dark:bg-slate-800';
  const text = config?.badgeText || 'text-slate-800 dark:text-slate-200';
  const border = config?.badgeBorder || 'border-slate-300 dark:border-slate-700';

  const dotColor = config?.color || '#64748b';

  return (
    <span
      className={`inline-flex items-center gap-1.5 border ${bg} ${text} ${border} ${sizeClasses} whitespace-nowrap cursor-default`}
      title={descriptionDisplay || codeDisplay}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: dotColor }}
      />
      <span>{codeDisplay}</span>
      {showDescription && descriptionDisplay && (
        <span className="opacity-60 font-normal border-l border-current/20 pl-1.5 hidden sm:inline">
          {descriptionDisplay}
        </span>
      )}
    </span>
  );
};
