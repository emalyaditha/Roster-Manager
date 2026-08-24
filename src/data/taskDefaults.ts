import { Task, TaskCategory, TaskPriority, TaskSortKey, TaskStatus } from '../types/tasks';

export const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done'];

export const TASK_CATEGORIES: TaskCategory[] = ['work', 'personal', 'projects'];

export const TASK_CATEGORY_META: Record<TaskCategory, { label: string }> = {
  work: { label: 'Work' },
  personal: { label: 'Personal' },
  projects: { label: 'Projects' },
};

/** Tiny-dot color for each category chip (rendered on .chip-neutral base). */
export const TASK_CATEGORY_DOT: Record<TaskCategory, string> = {
  work: 'var(--color-primary)',
  personal: 'var(--success)',
  projects: 'var(--warning)',
};

export interface TaskStatusMeta {
  label: string;
  dot: string; // accent color
  chip: string; // badge classes
}

export const TASK_STATUS_META: Record<TaskStatus, TaskStatusMeta> = {
  todo: {
    label: 'To do',
    dot: 'var(--color-text-faint)',
    chip: 'chip chip-neutral',
  },
  in_progress: {
    label: 'In progress',
    dot: 'var(--color-primary)',
    chip: 'chip chip-accent',
  },
  blocked: {
    label: 'Blocked',
    dot: 'var(--danger)',
    chip: 'chip chip-danger',
  },
  done: {
    label: 'Done',
    dot: 'var(--success)',
    chip: 'chip chip-success',
  },
};

export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

// Higher number = more urgent. Drives priority-desc sorting and badges.
export const TASK_PRIORITY_META: Record<TaskPriority, { label: string; rank: number; chip: string }> = {
  low: {
    label: 'Low',
    rank: 1,
    chip: 'chip chip-neutral',
  },
  medium: {
    label: 'Medium',
    rank: 2,
    chip: 'chip chip-accent',
  },
  high: {
    label: 'High',
    rank: 3,
    chip: 'chip chip-warning',
  },
  urgent: {
    label: 'Urgent',
    rank: 4,
    chip: 'chip chip-danger',
  },
};

/** Local (timezone-safe) YYYY-MM-DD for "today". */
export function todayLocalISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function isOverdue(task: Task): boolean {
  return Boolean(task.dueDate) && task.status !== 'done' && task.dueDate! < todayLocalISO();
}

/**
 * Board column ordering:
 * - not-done first: dueDate ascending (nulls last), then priority desc, then newest first
 * - done tasks sink to the bottom, most recently completed first
 */
export function sortTasksForBoard(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if ((a.status === 'done') !== (b.status === 'done')) {
      return a.status === 'done' ? 1 : -1;
    }
    if (a.status === 'done' && b.status === 'done') {
      return (b.completedAt || '').localeCompare(a.completedAt || '');
    }
    const dueA = a.dueDate ?? '9999-12-31';
    const dueB = b.dueDate ?? '9999-12-31';
    if (dueA !== dueB) return dueA.localeCompare(dueB);
    const pr = TASK_PRIORITY_META[b.priority].rank - TASK_PRIORITY_META[a.priority].rank;
    if (pr !== 0) return pr;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
}

export type TaskSortDir = 'asc' | 'desc';

/** List-view comparison for a given sort key/direction (done always sinks). */
export function compareTasks(
  a: Task,
  b: Task,
  key: TaskSortKey,
  dir: TaskSortDir
): number {
  if ((a.status === 'done') !== (b.status === 'done')) {
    return a.status === 'done' ? 1 : -1;
  }
  let cmp = 0;
  if (key === 'dueDate') {
    cmp = (a.dueDate ?? '9999-12-31').localeCompare(b.dueDate ?? '9999-12-31');
  } else if (key === 'priority') {
    cmp = TASK_PRIORITY_META[a.priority].rank - TASK_PRIORITY_META[b.priority].rank;
  } else if (key === 'createdAt') {
    cmp = (a.createdAt || '').localeCompare(b.createdAt || '');
  } else {
    cmp = a.title.localeCompare(b.title);
  }
  return dir === 'asc' ? cmp : -cmp;
}
