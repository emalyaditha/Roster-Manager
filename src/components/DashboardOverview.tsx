import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, RefreshCw, Square } from 'lucide-react';
import { api } from '../services/api';
import { LeaveRow, RosterEntry, RosterStatusConfig } from '../types/roster';
import { computeRosterStats } from '../utils/rosterStats';
import { Task, TaskCategory, TaskGroup } from '../types/tasks';

interface DashboardOverviewProps {
  entries: RosterEntry[];
  statuses: RosterStatusConfig[];
  currentMonthYear: string;
  leaveRows: LeaveRow[];
  leaveLoading: boolean;
  onSyncLeave: () => Promise<void>;
  onOpenTasks?: () => void;
  onOpenRoster?: () => void;
}

const TASK_CATEGORY_META: Record<TaskCategory, { label: string; dot: string }> = {
  work: { label: 'Work', dot: 'var(--color-primary)' },
  personal: { label: 'Personal', dot: 'var(--success)' },
  projects: { label: 'Projects', dot: 'var(--warning)' },
};

const CARD_TITLE = 'text-xs font-semibold uppercase tracking-wide text-muted';

function localToday(): string {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

function formatDueChip(due: string | null | undefined, today: string): { label: string; cls: string } | null {
  if (!due) return null;
  const [y, m, d] = due.split('-').map(Number);
  const label = new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  if (due < today) return { label, cls: 'chip-danger' };
  if (due === today) return { label, cls: 'chip-accent' };
  return { label, cls: 'chip-neutral' };
}

function formatDateShort(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

const SkeletonRows: React.FC<{ rows: number }> = ({ rows }) => (
  <div className="space-y-2.5">
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        className="h-4 rounded bg-well animate-pulse"
        style={{ width: `${92 - i * 14}%` }}
      />
    ))}
  </div>
);

const StatTile: React.FC<{ label: string; value: number; tone?: string; sub?: string; onClick?: () => void }> = ({ label, value, tone, sub, onClick }) => (
  <div className={`stat-tile ${onClick ? 'clickable cursor-pointer' : ''}`} onClick={onClick}>
    <div className="stat-tile-label">{label}</div>
    <div className="stat-tile-value" style={tone ? { color: tone } : undefined}>
      {value}
    </div>
    {sub && <div className="text-[11px] text-faint tabular-nums -mt-0.5">{sub}</div>}
  </div>
);

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  entries,
  statuses,
  currentMonthYear,
  leaveRows,
  leaveLoading,
  onSyncLeave,
  onOpenTasks,
  onOpenRoster,
}) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [taskList, groupList] = await Promise.all([api.getTasks(), api.getTaskGroups()]);
        if (active) {
          setTasks(taskList);
          setGroups(groupList);
        }
      } catch {
        /* dashboard stays usable without task data */
      } finally {
        if (active) setTasksLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const today = useMemo(() => localToday(), []);

  const [yearNum, monthNum] = currentMonthYear.split('-').map(Number);
  const monthLabel =
    Number.isFinite(yearNum) && Number.isFinite(monthNum)
      ? `${new Date(yearNum, monthNum - 1, 1).toLocaleString('en-US', { month: 'long' })} ${yearNum}`
      : currentMonthYear;

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.code, s])), [statuses]);

  const rosterStats = useMemo(() => {
    // App passes entries already scoped to the active roster cycle — no re-filtering
    const stats = computeRosterStats(entries, statuses);

    const effCount = new Map<string, number>();
    entries.forEach((e) => {
      // Count on the effective status so distribution matches the KPI tiles and roster filters
      const effId = e.currentStatusId;
      effCount.set(effId, (effCount.get(effId) ?? 0) + 1);
    });

    const distRows = Array.from(effCount.entries())
      .map(([code, count]) => ({
        code,
        count,
        color: statusById.get(code)?.color || 'var(--color-text-faint)',
      }))
      .sort((a, b) => b.count - a.count);

    // Next 7 days starting today: status dot per day from the roster.
    const weekStrip = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      const entry = entries.find((e) => e.date === dateStr);
      const effId = entry ? entry.changedStatusId ?? entry.currentStatusId : undefined;
      return {
        dateStr,
        weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
        dayNum: d.getDate(),
        isToday: i === 0,
        color: effId ? statusById.get(effId)?.color : undefined,
        name: effId ? statusById.get(effId)?.displayName : undefined,
        entry,
      };
    });

    const todayEntry = entries.find((e) => e.date === localToday());
    const todayEffId = todayEntry ? todayEntry.changedStatusId ?? todayEntry.currentStatusId : undefined;
    const todayStatus = todayEffId
      ? {
          code: todayEffId,
          name: statusById.get(todayEffId)?.displayName ?? '',
          color: statusById.get(todayEffId)?.color ?? 'var(--color-text-faint)',
        }
      : null;

    const activity = entries
      .filter(
        (e) =>
          Boolean(e.notes && e.notes.trim()) ||
          Boolean(e.changedStatusId && e.changedStatusId !== e.originalStatusId),
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5);

    return {
      total: stats.total,
      dutyDays: stats.workingDays,
      daysOff: stats.daysOff,
      leaveDays: stats.leaveDays,
      otShifts: stats.otShifts,
      otMorning: stats.otMorningHours,
      otNight: stats.otNightHours,
      changedCount: stats.changedCount,
      distRows,
      activity,
      weekStrip,
      todayEntry,
      todayStatus,
    };
  }, [entries, statuses, currentMonthYear, statusById]);

  const taskStats = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'done');
    const overdue = open.filter((t) => t.dueDate && t.dueDate < today).length;
    const done = tasks.length - open.length;
    const completion = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;

    const openByCategory: Record<TaskCategory, number> = { work: 0, personal: 0, projects: 0 };
    open.forEach((t) => {
      if (t.category in openByCategory) openByCategory[t.category] += 1;
    });

    const upcoming = [...open]
      .sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate);
      })
      .slice(0, 6);

    return { openCount: open.length, overdue, done, completion, openByCategory, upcoming };
  }, [tasks, today]);

  return (
    <div className="space-y-2.5">
      {/* Page header */}
      <div className="flex items-end justify-between gap-3 pb-1">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-fg">Dashboard</h1>
          <p className="text-sm text-muted">{monthLabel} overview</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" className="btn-min btn-secondary shrink-0" onClick={() => onOpenRoster?.()}>
            Open Roster Manager
          </button>
          <button type="button" className="btn-min btn-secondary shrink-0 hidden sm:inline-flex" onClick={() => onOpenTasks?.()}>
            Task Manager
          </button>
        </div>
      </div>

      {/* Hero — today at a glance */}
      <div className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Today</div>
          <div className="text-xl sm:text-2xl font-semibold tracking-tight text-fg mt-0.5">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </div>
          {rosterStats.todayEntry?.notes?.trim() && (
            <p className="text-xs text-muted mt-1 truncate max-w-md" title={rosterStats.todayEntry.notes}>
              {rosterStats.todayEntry.notes.trim()}
            </p>
          )}
        </div>
        {rosterStats.todayStatus ? (
          <div className="flex items-center gap-3 shrink-0">
            {rosterStats.todayEntry?.clockIn && (
              <div className="text-right hidden sm:block">
                <div className="stat-tile-label">Clock</div>
                <div className="text-sm font-medium text-fg tabular-nums mt-0.5">
                  {rosterStats.todayEntry.clockIn}
                  {rosterStats.todayEntry?.clockOut ? ` – ${rosterStats.todayEntry.clockOut}` : ''}
                </div>
              </div>
            )}
            <span
              className="chip !text-sm !px-3 !py-1.5 font-semibold"
              style={{ background: `${rosterStats.todayStatus.color}1f`, color: rosterStats.todayStatus.color }}
              title={rosterStats.todayStatus.name}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: rosterStats.todayStatus.color }} />
              {rosterStats.todayStatus.code}
            </span>
          </div>
        ) : (
          <span className="chip chip-neutral shrink-0">No entry for today</span>
        )}
      </div>

      {/* Week strip */}
      <div className="grid grid-cols-7 gap-1.5">
        {rosterStats.weekStrip.map((d) => (
          <div
            key={d.dateStr}
            title={d.name ?? d.dateStr}
            className={`rounded-lg border p-1.5 sm:p-2 text-center transition-colors ${
              d.isToday ? 'border-accent bg-[var(--accent-soft)]' : 'border-line bg-surface'
            }`}
          >
            <div className={`text-[9px] sm:text-[10px] font-medium uppercase ${d.isToday ? 'text-accent' : 'text-faint'}`}>
              {d.isToday ? 'TODAY' : d.weekday}
            </div>
            <div className="text-xs sm:text-sm font-semibold text-fg tabular-nums">{d.dayNum}</div>
            <div className="mt-1 h-1.5 rounded-full mx-auto w-4" style={{ background: d.color ?? 'var(--color-border)' }} />
          </div>
        ))}
      </div>

      {/* Row A — KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <StatTile label="Total days" value={rosterStats.total} />
        <StatTile label="Duty / Working" value={rosterStats.dutyDays} tone="var(--success)" />
        <StatTile label="Days off" value={rosterStats.daysOff} />
        <StatTile label="Leaves" value={rosterStats.leaveDays} tone="var(--info)" />
        <StatTile
          label="Overtime shifts"
          value={rosterStats.otShifts}
          tone="var(--warning)"
          sub={`${Math.round(rosterStats.otMorning * 10) / 10}h AM · ${Math.round(rosterStats.otNight * 10) / 10}h PM`}
        />
        <StatTile label="Changed entries" value={rosterStats.changedCount} tone="var(--color-primary)" />
      </div>

      {/* Row B — distribution + task health */}
      <div className="grid lg:grid-cols-3 gap-2.5">
        <div className="card p-4 lg:col-span-2 flex flex-col">
          <h2 className={CARD_TITLE}>Status distribution</h2>
          <div className="mt-3 flex-1">
            {rosterStats.distRows.length === 0 ? (
              <p className="text-xs text-muted py-4 text-center">No roster data this cycle.</p>
            ) : (
              <div className="space-y-2.5">
                {rosterStats.distRows.map((row) => {
                  const pct = rosterStats.total > 0 ? Math.round((row.count / rosterStats.total) * 100) : 0;
                  return (
                    <div key={row.code} className="flex items-center gap-2.5">
                      <span className="w-20 shrink-0 truncate text-xs font-medium text-fg">{row.code}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-well overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: row.color }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted">{row.count}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="mt-auto pt-3 border-t border-line">
            <button
              type="button"
              onClick={() => onOpenRoster?.()}
              className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
              style={{ color: 'var(--color-primary)' }}
            >
              Open Roster Manager
              <ArrowRight className="w-3 h-3" aria-hidden />
            </button>
          </div>
        </div>

        <div className="card p-4 flex flex-col">
          <h2 className={CARD_TITLE}>Task health</h2>
          {tasksLoading ? (
            <div className="mt-3 flex-1">
              <SkeletonRows rows={4} />
            </div>
          ) : (
            <div className="mt-3 flex-1">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="stat-tile-label">Open</div>
                  <div className="text-lg font-semibold tabular-nums">{taskStats.openCount}</div>
                </div>
                <div>
                  <div className="stat-tile-label">Overdue</div>
                  <div className="text-lg font-semibold tabular-nums" style={{ color: 'var(--danger)' }}>
                    {taskStats.overdue}
                  </div>
                </div>
                <div>
                  <div className="stat-tile-label">Done</div>
                  <div className="text-lg font-semibold tabular-nums">{taskStats.done}</div>
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-well overflow-hidden mt-3">
                <div className="h-full rounded-full bg-accent" style={{ width: `${taskStats.completion}%` }} />
              </div>
              <p className="text-[11px] text-faint mt-1 mb-3 tabular-nums">{taskStats.completion}% complete</p>
              <div className="space-y-1.5">
                {(Object.keys(TASK_CATEGORY_META) as TaskCategory[]).map((cat) => (
                  <div key={cat} className="flex items-center gap-2 text-xs">
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: TASK_CATEGORY_META[cat].dot }}
                    />
                    <span className="text-muted flex-1">{TASK_CATEGORY_META[cat].label}</span>
                    <span className="font-medium text-fg tabular-nums">{taskStats.openByCategory[cat]}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mt-auto pt-3 border-t border-line">
            <button
              type="button"
              onClick={() => onOpenTasks?.()}
              className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
              style={{ color: 'var(--color-primary)' }}
            >
              Open Task Manager
              <ArrowRight className="w-3 h-3" aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {/* Row C — upcoming tasks + leave balance */}
      <div className="grid lg:grid-cols-2 gap-2.5">
        <div className="card p-4 flex flex-col">
          <h2 className={CARD_TITLE}>Upcoming tasks</h2>
          <div className="mt-3 flex-1">
            {tasksLoading ? (
              <SkeletonRows rows={4} />
            ) : taskStats.upcoming.length === 0 ? (
              <p className="text-xs text-muted py-4 text-center">No open tasks</p>
            ) : (
              <ul className="space-y-2">
                {taskStats.upcoming.map((t) => {
                  const chip = formatDueChip(t.dueDate, today);
                  return (
                    <li key={t.id} className="flex items-center gap-2 min-w-0">
                      <Square className="w-3.5 h-3.5 shrink-0 text-faint" aria-hidden />
                      <span className="flex-1 truncate text-sm text-fg">{t.title}</span>
                      {chip && (
                        <span className={`chip ${chip.cls} shrink-0 tabular-nums`} title={t.dueDate ?? undefined}>
                          {chip.label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="mt-auto pt-3 border-t border-line">
            <button
              type="button"
              onClick={() => onOpenTasks?.()}
              className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
              style={{ color: 'var(--color-primary)' }}
            >
              Open Task Manager
              <ArrowRight className="w-3 h-3" aria-hidden />
            </button>
          </div>
        </div>

        <div className="card p-4 flex flex-col">
          <h2 className={CARD_TITLE}>Leave balance</h2>
          {leaveLoading ? (
            <div className="flex-1 flex items-center justify-center py-10">
              <RefreshCw className="w-5 h-5 animate-spin" style={{ color: 'var(--color-primary)' }} />
            </div>
          ) : leaveRows.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-8">
              <p className="text-xs text-muted">No leave data</p>
              <button type="button" className="btn-min btn-secondary !h-7 !px-3 !text-xs" onClick={() => void onSyncLeave()}>
                Sync balance
              </button>
            </div>
          ) : (
            <table className="w-full text-left mt-2">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase text-faint">
                  <th className="py-1.5 pr-2 font-medium">Code</th>
                  <th className="py-1.5 px-2 font-medium text-right">Used</th>
                  <th className="py-1.5 pl-2 font-medium text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {leaveRows.map((r) => {
                  const isShort = r.leaveType.toLowerCase().includes('short');
                  return (
                    <tr
                      key={r.leaveType}
                      style={isShort ? { background: 'var(--danger-bg)' } : undefined}
                    >
                      <td className="py-1.5 pr-2 text-xs font-medium text-fg">{r.leaveType}</td>
                      <td className="py-1.5 px-2 text-right">
                        <span className="chip chip-neutral tabular-nums">{r.utilized}</span>
                      </td>
                      <td className="py-1.5 pl-2 text-right">
                        {r.balance === null ? (
                          <span className="text-xs text-faint">—</span>
                        ) : (
                          <span className={`chip tabular-nums ${r.balance <= 0 ? 'chip-danger' : 'chip-success'}`}>
                            {r.balance}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Row D — recent activity */}
      <div className="card p-4">
        <h2 className={CARD_TITLE}>Recent activity</h2>
        {rosterStats.activity.length === 0 ? (
          <p className="text-xs text-muted mt-3">No recent changes this cycle.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {rosterStats.activity.map((e) => {
              const isChange = Boolean(e.changedStatusId && e.changedStatusId !== e.originalStatusId);
              const detail = e.notes && e.notes.trim()
                ? e.notes.trim()
                : `${e.originalStatusId} → ${e.changedStatusId}`;
              return (
                <li key={e.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="w-24 shrink-0 text-xs text-muted tabular-nums">{formatDateShort(e.date)}</span>
                  <span className="flex-1 min-w-0 truncate text-sm text-fg">{detail}</span>
                  {isChange && !e.notes?.trim() && (
                    <span className="chip chip-accent shrink-0 hidden sm:inline-flex">changed</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};
