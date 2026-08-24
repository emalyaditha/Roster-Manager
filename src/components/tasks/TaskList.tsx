import React from 'react';
import { ArrowDown, ArrowUp, Lock } from 'lucide-react';
import { Task, TaskSortKey } from '../../types/tasks';
import { TASK_STATUS_META, compareTasks, isOverdue } from '../../data/taskDefaults';
import { getUnmetDependencies } from '../../data/taskDeps';
import { TaskCategoryChip } from './TaskCategoryChip';

interface TaskListProps {
  tasks: Task[];
  allTasks?: Task[];
  sortKey: TaskSortKey;
  sortDir: 'asc' | 'desc';
  onSortChange: (key: TaskSortKey) => void;
  onToggleDone: (task: Task) => void;
  onEdit: (task: Task) => void;
}

const COLUMNS: { key: TaskSortKey; label: string; className: string }[] = [
  { key: 'title', label: 'Task', className: 'flex-1 min-w-0' },
  { key: 'priority', label: 'Priority', className: 'w-24 hidden sm:flex' },
  { key: 'dueDate', label: 'Due', className: 'w-28 hidden md:flex' },
];

export const TaskList: React.FC<TaskListProps> = ({
  tasks,
  allTasks,
  sortKey,
  sortDir,
  onSortChange,
  onToggleDone,
  onEdit,
}) => {
  const sorted = [...tasks].sort((a, b) => compareTasks(a, b, sortKey, sortDir));

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-2.5 bg-page border-b border-line">
        {COLUMNS.map((col) => (
          <button
            key={col.key}
            onClick={() => onSortChange(col.key)}
            className={`${col.className} flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted hover:text-fg transition-colors`}
          >
            {col.label}
            {sortKey === col.key &&
              (sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />)}
          </button>
        ))}
        <span className="w-24 text-[10px] font-medium uppercase tracking-wider text-muted">Status</span>
      </div>

      <div className="divide-y divide-line">
        {sorted.map((task) => {
          const overdue = isOverdue(task);
          const unmet = task.status !== 'done' && allTasks ? getUnmetDependencies(task, allTasks) : [];
          return (
            <div
              key={task.id}
              onClick={() => onEdit(task)}
              style={overdue ? { borderLeft: '3px solid var(--danger)' } : undefined}
              className={`flex items-center gap-3 px-4 py-2.5 hover:bg-well/50 cursor-pointer transition-colors ${
                task.status === 'done' ? 'opacity-60' : ''
              }`}
            >
              <div className="flex-1 min-w-0 flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={task.status === 'done'}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => onToggleDone(task)}
                  className="w-4 h-4 rounded accent-[var(--color-primary)] cursor-pointer shrink-0"
                />
                <div className="min-w-0">
                  <p
                    className={`text-xs font-semibold truncate ${
                      task.status === 'done' ? 'line-through text-faint' : 'text-fg'
                    }`}
                    style={
                      overdue && task.status !== 'done'
                        ? { color: 'var(--danger)' }
                        : undefined
                    }
                  >
                    {task.sequence != null && task.groupId && (
                      <span className="mr-1.5 inline-flex items-center justify-center min-w-[1.1rem] h-4 px-1 rounded-md bg-well text-[9px] font-bold text-muted tabular-nums align-middle">
                        {task.sequence}
                      </span>
                    )}
                    {task.title}
                    {unmet.length > 0 && (
                      <Lock
                        className="inline w-3 h-3 ml-1.5"
                        style={{ color: 'var(--warning)' }}
                        title={`Waiting on: ${unmet.map((d) => d.title).join(', ')}`}
                      />
                    )}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate">
                    <TaskCategoryChip category={task.category} />
                    {task.tags.length > 0 && (
                      <span className="text-[10px] text-faint truncate">
                        {task.tags.map((t) => `#${t}`).join(' ')}
                      </span>
                    )}
                  </p>
                </div>
              </div>

              <span
                className={`hidden sm:block w-24 shrink-0 text-[10px] font-semibold ${
                  overdue ? '' : 'text-faint'
                }`}
                style={overdue ? { color: 'var(--danger)' } : undefined}
              >
                {overdue ? 'Overdue' : ''}
              </span>
              <span
                className={`hidden md:block w-28 shrink-0 text-[11px] font-medium ${
                  overdue ? '' : 'text-muted'
                }`}
                style={overdue ? { color: 'var(--danger)' } : undefined}
              >
                {task.dueDate ?? '—'}
              </span>
              <span className="w-24 shrink-0">
                <span className={`${TASK_STATUS_META[task.status].chip} !text-[10px]`}>
                  {TASK_STATUS_META[task.status].label}
                </span>
              </span>
            </div>
          );
        })}
        {sorted.length === 0 && (
          <p className="text-xs text-faint text-center py-10">No tasks match the current filters.</p>
        )}
      </div>
    </div>
  );
};
