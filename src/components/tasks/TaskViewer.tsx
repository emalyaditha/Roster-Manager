import React from 'react';
import { ArrowRight, Check, Lock } from 'lucide-react';
import { Task, TaskGroup } from '../../types/tasks';
import { TASK_PRIORITY_META, TASK_STATUS_META } from '../../data/taskDefaults';
import { TaskCategoryChip } from './TaskCategoryChip';

interface TaskViewerProps {
  tasks: Task[];
  groups: TaskGroup[];
  onEditTask: (task: Task) => void;
}

interface ViewerSection {
  key: string;
  name: string;
  color: string;
  tasks: Task[];
}

function sortFlowTasks(a: Task, b: Task): number {
  const seqA = a.sequence ?? null;
  const seqB = b.sequence ?? null;
  if (seqA !== null && seqB !== null && seqA !== seqB) return seqA - seqB;
  if (seqA === null && seqB !== null) return 1;
  if (seqA !== null && seqB === null) return -1;
  return (a.createdAt || '').localeCompare(b.createdAt || '');
}

export function TaskViewer({ tasks, groups, onEditTask }: TaskViewerProps) {
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  const sections: ViewerSection[] = [
    ...[...groups]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((group) => ({
        key: group.id,
        name: group.name,
        color: group.color || 'var(--color-primary)',
        tasks: tasks.filter((t) => t.groupId === group.id).sort(sortFlowTasks),
      })),
    {
      key: '__ungrouped__',
      name: 'Ungrouped',
      color: 'var(--color-primary)',
      tasks: tasks.filter((t) => !t.groupId).sort(sortFlowTasks),
    },
  ];

  if (tasks.length === 0) {
    return (
      <div className="py-10 text-center text-xs text-faint">
        No tasks yet
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((section) => {
        const doneCount = section.tasks.filter((t) => t.status === 'done').length;
        return (
          <section key={section.key} className="card p-3">
            <div className="flex items-center justify-between mb-2.5 pl-2">
              <div
                className="border-l-[3px] pl-2"
                style={{ borderLeftColor: section.color }}
              >
                <h4 className="text-xs font-semibold text-fg">{section.name}</h4>
              </div>
              <span className="chip chip-neutral !text-[10px] tabular-nums">
                {doneCount}/{section.tasks.length} done
              </span>
            </div>

            {section.tasks.length > 0 ? (
              <div className="relative pl-6 space-y-2">
                <div className="absolute left-[11px] top-2 bottom-2 border-l border-dashed border-line" />
                {section.tasks.map((task) => {
                  const prio = TASK_PRIORITY_META[task.priority];
                  const statusMeta = TASK_STATUS_META[task.status];
                  const deps = (task.dependsOn ?? [])
                    .map((id) => taskById.get(id))
                    .filter((t): t is Task => Boolean(t));
                  const unmetTitles = deps
                    .filter((d) => d.status !== 'done')
                    .map((d) => d.title);

                  return (
                    <button
                      key={task.id}
                      onClick={() => onEditTask(task)}
                      className={`relative w-full text-left rounded-lg border border-line bg-surface p-3 transition-colors duration-150 hover:border-[var(--color-text-faint)] cursor-pointer ${
                        task.status === 'done' ? 'opacity-60' : ''
                      }`}
                    >
                      <span className="absolute -left-6 top-3 z-[1]">
                        <span className="chip chip-neutral !px-1.5 !py-0 !text-[9px] font-bold tabular-nums rounded-full border border-line bg-surface">
                          {task.sequence != null ? `#${task.sequence}` : '\u2022'}
                        </span>
                      </span>

                      <div className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: statusMeta.dot }}
                          title={statusMeta.label}
                        />
                        <p
                          className={`flex-1 min-w-0 text-xs font-semibold break-words leading-snug ${
                            task.status === 'done'
                              ? 'line-through text-faint'
                              : 'text-fg'
                          }`}
                        >
                          {task.title}
                        </p>
                        <span className={`${prio.chip} !text-[10px]`}>{prio.label}</span>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <TaskCategoryChip category={task.category} />
                        {deps.length > 0 &&
                          deps.map((dep, i) => (
                            <React.Fragment key={dep.id}>
                              {i > 0 && <ArrowRight className="w-3 h-3 text-faint shrink-0" />}
                              {dep.status === 'done' ? (
                                <span className="chip chip-success !text-[10px]">
                                  <Check className="w-2.5 h-2.5" />
                                  {dep.title}
                                </span>
                              ) : (
                                <span
                                  className="chip chip-danger !text-[10px]"
                                  title={
                                    unmetTitles.length > 0
                                      ? `Waiting on: ${unmetTitles.join(', ')}`
                                      : undefined
                                  }
                                >
                                  <Lock className="w-2.5 h-2.5" />
                                  {dep.title}
                                </span>
                              )}
                            </React.Fragment>
                          ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="pl-6 text-[11px] text-faint">No tasks in this group yet.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
