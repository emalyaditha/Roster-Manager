import React, { useMemo } from 'react';
import { RosterEntry, RosterStatusConfig } from '../types/roster';
import {
  computeRosterStats,
  getStatusGroupCodes,
  hasOvertime,
} from '../utils/rosterStats';
import {
  CalendarDays,
  Briefcase,
  Home,
  CalendarOff,
  PlaneTakeoff,
  Timer,
  GitCompareArrows,
} from 'lucide-react';

interface SummaryCardsProps {
  entries: RosterEntry[];
  statuses: RosterStatusConfig[];
  onFilterChangedOnly?: () => void;
  onFilterStatus?: (codes: string[], label: string) => void;
  onOpenOtCalculator?: () => void;
}

interface CardSpec {
  key: string;
  label: string;
  subLabel: string;
  value: number;
  tone?: string;
  icon: React.ReactNode;
  onClick?: () => void;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  entries,
  statuses,
  onFilterChangedOnly,
  onFilterStatus,
  onOpenOtCalculator,
}) => {
  const cards = useMemo<CardSpec[]>(() => {
    const stats = computeRosterStats(entries, statuses);
    const otHours = Math.round(stats.otTotalHours * 10) / 10;
    const groupClick = (group: 'duty' | 'dof' | 'hol' | 'leave', label: string) => () =>
      onFilterStatus?.(getStatusGroupCodes(group, statuses), label);

    return [
      {
        key: 'total',
        label: 'Total Days',
        subLabel: 'days',
        value: stats.total,
        icon: <CalendarDays className="w-3.5 h-3.5" />,
      },
      {
        key: 'duty',
        label: 'Duty / Working',
        subLabel: 'days',
        value: stats.workingDays,
        tone: 'var(--success)',
        icon: <Briefcase className="w-3.5 h-3.5" />,
        onClick: groupClick('duty', 'Working days'),
      },
      {
        key: 'dof',
        label: 'Days Off',
        subLabel: 'days',
        value: stats.daysOff,
        icon: <Home className="w-3.5 h-3.5" />,
        onClick: groupClick('dof', 'Days off'),
      },
      {
        key: 'hol',
        label: 'Holidays',
        subLabel: 'days',
        value: stats.holidayDays,
        tone: 'var(--warning)',
        icon: <CalendarOff className="w-3.5 h-3.5" />,
        onClick: groupClick('hol', 'Holidays'),
      },
      {
        key: 'leave',
        label: 'Leaves',
        subLabel: stats.leaveDays === 1 ? 'day' : 'days',
        value: stats.leaveDays,
        tone: 'var(--info)',
        icon: <PlaneTakeoff className="w-3.5 h-3.5" />,
        onClick: groupClick('leave', 'Leave types'),
      },
      {
        key: 'ot',
        label: 'Overtime',
        subLabel: otHours > 0 ? `shifts · ${otHours} hrs` : 'shifts · Engine',
        value: entries.filter(hasOvertime).length,
        tone: 'var(--warning)',
        icon: <Timer className="w-3.5 h-3.5" />,
        onClick: () => (onOpenOtCalculator ? onOpenOtCalculator() : onFilterStatus?.(['OT'], 'Overtime')),
      },
      {
        key: 'changed',
        label: 'Changed',
        subLabel: 'modified',
        value: stats.changedCount,
        tone: 'var(--color-primary)',
        icon: <GitCompareArrows className="w-3.5 h-3.5" />,
        onClick: () => onFilterChangedOnly?.(),
      },
    ];
  }, [entries, statuses, onFilterChangedOnly, onFilterStatus, onOpenOtCalculator]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
      {cards.map((card) => (
        <div
          key={card.key}
          role={card.onClick ? 'button' : undefined}
          tabIndex={card.onClick ? 0 : undefined}
          onClick={card.onClick}
          onKeyDown={(e) => {
            if (!card.onClick) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              card.onClick();
            }
          }}
          className={`stat-tile ${card.onClick ? 'clickable cursor-pointer' : ''}`}
        >
          <div className="stat-tile-label flex items-center gap-1.5">
            {card.icon}
            <span className="truncate">{card.label}</span>
          </div>
          <div className="stat-tile-value tabular-nums" style={card.tone ? { color: card.tone } : undefined}>
            {card.value}
          </div>
          <div className="text-[11px] text-faint tabular-nums -mt-0.5 truncate" title={card.subLabel}>
            {card.subLabel}
          </div>
        </div>
      ))}
    </div>
  );
};
