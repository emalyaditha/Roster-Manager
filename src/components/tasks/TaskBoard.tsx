import React from 'react';
import { Plus } from 'lucide-react';
import { Task, TaskGroup, TaskStatus } from '../../types/tasks';
import { TASK_STATUSES, TASK_STATUS_META, sortTasksForBoard } from '../../data/taskDefaults';
import { TaskCard } from './TaskCard';

interface TaskBoardProps {
  tasks: Task[];
  allTasks?: Task[];
  groups?: TaskGroup[];
  draggedId: string | null;
  dropTarget: TaskStatus | null;
  onDragStartTask: (id: string) => void;
  onDragEndTask: () => void;
  onDropOnColumn: (status: TaskStatus) => void;
  onSetDropTarget: (status: TaskStatus | null) => void;
  onToggleDone: (task: Task) => void;
  onEdit: (task: Task) => void;
  onAddInColumn: (status: TaskStatus) => void;
}

export const TaskBoard: React.FC<TaskBoardProps> = ({
  tasks,
  allTasks,
  groups,
  draggedId,
  dropTarget,
  onDragStartTask,
  onDragEndTask,
  onDropOnColumn,
  onSetDropTarget,
  onToggleDone,
  onEdit,
  onAddInColumn,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {TASK_STATUSES.map((status) => {
        const meta = TASK_STATUS_META[status];
        const columnTasks = sortTasksForBoard(tasks.filter((t) => t.status === status));
        const isTarget = dropTarget === status && draggedId !== null;
        return (
          <section
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              onSetDropTarget(status);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) onSetDropTarget(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              onDropOnColumn(status);
            }}
            className={`rounded-lg border p-2 min-h-[120px] transition-all duration-150 ${
              isTarget
                ? 'border-accent ring-1 ring-[var(--accent-soft)] bg-[var(--accent-soft)]'
                : 'border-line bg-page'
            }`}
          >
            <header className="flex items-center justify-between mb-2 px-0.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: meta.dot }} />
                <h3 className="text-xs font-medium text-muted">{meta.label}</h3>
                <span className="chip chip-neutral !px-1.5 tabular-nums">{columnTasks.length}</span>
              </div>
              <button
                onClick={() => onAddInColumn(status)}
                title={`New task in ${meta.label}`}
                className="p-1 rounded-md text-muted hover:text-fg hover:bg-well transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
            </header>

            <div className="space-y-2 min-h-[80px]">
              {columnTasks.length === 0 ? (
                <p className="text-[11px] text-faint text-center py-6 border border-dashed border-line rounded-lg">
                  Drop tasks here
                </p>
              ) : (
                columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    allTasks={allTasks}
                    groups={groups}
                    draggable
                    dragging={draggedId === task.id}
                    onDragStart={() => onDragStartTask(task.id)}
                    onDragEnd={onDragEndTask}
                    onToggleDone={() => onToggleDone(task)}
                    onEdit={() => onEdit(task)}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
};
