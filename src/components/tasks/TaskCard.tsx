import React from 'react';
import { CalendarDays, GripVertical, Layers, Lock, Tag } from 'lucide-react';
import { Task, TaskGroup } from '../../types/tasks';
import { TASK_PRIORITY_META, isOverdue } from '../../data/taskDefaults';
import { getUnmetDependencies } from '../../data/taskDeps';
import { TaskCategoryChip } from './TaskCategoryChip';

interface TaskCardProps {
  task: Task;
  allTasks?: Task[]; // enables the blocked-from-completion chip
  groups?: TaskGroup[]; // enables the group chip
  draggable?: boolean;
  dragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onToggleDone?: () => void;
  onEdit?: () => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  allTasks,
  groups,
  draggable,
  dragging,
  onDragStart,
  onDragEnd,
  onToggleDone,
  onEdit,
}) => {
  const overdue = isOverdue(task);
  const prio = TASK_PRIORITY_META[task.priority];
  const unmetDeps = task.status !== 'done' && allTasks ? getUnmetDependencies(task, allTasks) : [];
  const group = task.groupId ? groups?.find((g) => g.id === task.groupId) : undefined;

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onEdit}
      style={overdue ? { borderLeft: '3px solid var(--danger)' } : undefined}
      className={`card p-3 group relative cursor-pointer transition-all duration-150 hover:shadow-[var(--shadow-md)] ${
        dragging ? 'opacity-40 scale-95' : task.status === 'done' ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={task.status === 'done'}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleDone?.()}
          className="mt-0.5 w-4 h-4 rounded accent-[var(--color-primary)] cursor-pointer shrink-0"
          title={
            unmetDeps.length > 0
              ? `Blocked by: ${unmetDeps.map((d) => d.title).join(', ')}`
              : task.status === 'done'
                ? 'Mark as not done'
                : 'Mark as done'
          }
        />
        <div className="flex-1 min-w-0">
          <p
            className={`text-xs font-semibold break-words leading-snug ${
              task.status === 'done' ? 'line-through text-faint' : 'text-fg'
            }`}
          >
            {task.sequence != null && task.groupId && (
              <span className="inline-flex items-center justify-center min-w-[1.25rem] h-4 px-1 mr-1.5 rounded-md bg-well text-muted text-[9px] font-bold align-middle tabular-nums">
                {task.sequence}
              </span>
            )}
            {task.title}
          </p>

          {!draggable && task.notes && (
            <p className="mt-1 text-[11px] text-muted line-clamp-2">{task.notes}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className={`${prio.chip} !text-[10px]`}>{prio.label}</span>
            {group && (
              <span className="chip chip-accent !text-[10px]" title={group.name}>
                <Layers
                  className="w-2.5 h-2.5"
                  style={group.color ? { color: group.color } : undefined}
                />
                {group.name}
              </span>
            )}
            {unmetDeps.length > 0 && (
              <span
                className="chip chip-warning !text-[10px] font-semibold"
                title={`Waiting on: ${unmetDeps.map((d) => d.title).join(', ')}`}
              >
                <Lock className="w-2.5 h-2.5" /> Blocked
              </span>
            )}
            {task.dueDate && (
              <span
                className={`chip !text-[10px] ${overdue ? 'chip-danger font-semibold' : 'chip-neutral'}`}
              >
                <CalendarDays className="w-3 h-3" />
                {task.dueDate}
                {overdue && ' · overdue'}
              </span>
            )}
            <TaskCategoryChip category={task.category} />
            {task.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="chip chip-neutral !text-[10px]">
                <Tag className="w-2.5 h-2.5" />
                {tag}
              </span>
            ))}
          </div>
        </div>
        {draggable && (
          <GripVertical className="w-3.5 h-3.5 text-faint opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        )}
      </div>
    </div>
  );
};
