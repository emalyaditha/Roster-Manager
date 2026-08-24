import { loadTaskRows, saveTaskRows } from './supabaseTasks';
import { Task, TaskInput, TaskCategory } from '../src/types/tasks';
import { randomUUID } from 'crypto';

const VALID_TASK_CATEGORIES: TaskCategory[] = ['work', 'personal', 'projects'];

/** Backfill fields added after initial rollout (e.g., category on pre-TMS rows). */
function normalizeTaskRow(t: Task): Task {
  return t.category && VALID_TASK_CATEGORIES.includes(t.category)
    ? t
    : { ...t, category: 'work' };
}

const TASKS_FILE = 'tasks.json';
const TASKS_TABLE = 'tasks';

async function readTasks(): Promise<Task[]> {
  return loadTaskRows<Task>(TASKS_TABLE, TASKS_FILE, () => []);
}

async function writeTasks(tasks: Task[]): Promise<void> {
  await saveTaskRows<Task>(TASKS_TABLE, 'id', tasks, TASKS_FILE);
}

// Serialize whole-file read-modify-write cycles so rapid PUTs never clobber each other.
let saveQueue: Promise<void> = Promise.resolve();

/** HTTP-aware abort signal for mutateTasks callbacks. */
export class TaskRouteError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}

/**
 * Atomic read-modify-write: fn runs inside saveQueue, so concurrent requests
 * can never interleave read/compute/write phases.
 * Throw TaskRouteError from fn to abort with an HTTP status (no write happens).
 */
export function mutateTasks<R>(fn: (tasks: Task[]) => { next: Task[]; value: R }): Promise<R> {
  const run = saveQueue.then(async () => {
    const current = (await readTasks()).map(normalizeTaskRow);
    const { next, value } = fn(current);
    await writeTasks(next);
    return value;
  });
  saveQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function getTasks(): Promise<Task[]> {
  return (await readTasks()).map(normalizeTaskRow);
}

export async function findTask(id: string): Promise<Task | undefined> {
  return (await getTasks()).find((t) => t.id === id);
}

export function normalizeDependsOn(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((d) => String(d).trim()).filter(Boolean))];
}

/** Dependencies that are still unfinished (missing ids count as met). */
export function getUnmetDependencies(task: Task, all: Task[]): Task[] {
  const byId = new Map(all.map((t) => [t.id, t]));
  return (task.dependsOn ?? [])
    .map((id) => byId.get(id))
    .filter((t): t is Task => Boolean(t) && t!.status !== 'done');
}

/** True if making taskId depend on nextDependsOn would close a cycle. */
export function wouldCreateCycle(all: Task[], taskId: string, nextDependsOn: string[]): boolean {
  const edges = new Map(all.map((t) => [t.id, t.dependsOn ?? []]));
  edges.set(taskId, nextDependsOn);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const dfs = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const dep of edges.get(id) ?? []) {
      if (dfs(dep)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return dfs(taskId);
}

function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  return [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))];
}

/**
 * Apply a partial input to a task. Centralizes the status->completedAt
 * transition so client and server can never drift.
 */
export function applyTaskInput(task: Task, input: TaskInput): Task {
  const next: Task = {
    ...task,
    notes: input.notes !== undefined ? String(input.notes) : task.notes,
    priority: input.priority ?? task.priority,
    dueDate: input.dueDate !== undefined ? input.dueDate : task.dueDate,
    tags: input.tags !== undefined ? normalizeTags(input.tags) : task.tags,
    user: input.user ?? task.user,
    updatedAt: new Date().toISOString(),
  };
  if (input.title !== undefined && String(input.title).trim()) {
    next.title = String(input.title).trim();
  }
  if (input.status !== undefined && input.status !== task.status) {
    next.status = input.status;
    next.completedAt = input.status === 'done' ? new Date().toISOString() : null;
  }
  // Leaving a group clears its sequence slot too â€” no orphaned numbers.
  if (input.groupId !== undefined) {
    next.groupId = input.groupId || null;
    if (!next.groupId) next.sequence = null;
  }
  if (input.sequence !== undefined) {
    next.sequence = input.sequence === null ? null : Number(input.sequence);
  }
  if (input.dependsOn !== undefined) {
    next.dependsOn = normalizeDependsOn(input.dependsOn);
  }
  if (input.category !== undefined && VALID_TASK_CATEGORIES.includes(input.category)) {
    next.category = input.category;
  }
  return next;
}

export interface CreateTaskSpec extends TaskInput {
  id?: string; // allows pre-allocated sibling ids for template fan-out
}

export function createTaskFromSpec(spec: CreateTaskSpec, allExisting: Task[]): Task {
  const now = new Date().toISOString();
  const status = spec.status ?? 'todo';
  const groupId = spec.groupId ? String(spec.groupId) : null;
  let sequence = spec.sequence === undefined || spec.sequence === null ? null : Number(spec.sequence);
  if (groupId && sequence === null) {
    // Append at end of the group's current order.
    const siblings = allExisting.filter((t) => t.groupId === groupId);
    sequence = siblings.reduce((max, t) => Math.max(max, t.sequence ?? 0), 0) + 1;
  }
  const task: Task = {
    id: spec.id || randomUUID(),
    title: String(spec.title || '').trim() || 'Untitled task',
    notes: String(spec.notes || ''),
    status,
    priority: spec.priority ?? 'medium',
    dueDate: spec.dueDate ?? null,
    tags: normalizeTags(spec.tags),
    createdAt: now,
    updatedAt: now,
    completedAt: status === 'done' ? now : null,
    user: spec.user || 'User',
    groupId,
    sequence,
    dependsOn: normalizeDependsOn(spec.dependsOn),
    category: spec.category && VALID_TASK_CATEGORIES.includes(spec.category) ? spec.category : 'work',
  };
  return task;
}

/** Back-compat single-task creation used by POST /api/tasks. The optional
 *  factory runs inside the write queue (for validations that need current state). */
export async function createTask(
  inputOrFactory: TaskInput | ((tasks: Task[]) => TaskInput)
): Promise<Task> {
  return mutateTasks((tasks) => {
    const spec = typeof inputOrFactory === 'function' ? inputOrFactory(tasks) : inputOrFactory;
    const task = createTaskFromSpec(spec, tasks);
    return { next: [...tasks, task], value: task };
  });
}
