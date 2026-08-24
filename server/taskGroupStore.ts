import { loadTaskRows, saveTaskRows } from './supabaseTasks';
import { TaskGroup, TaskGroupInput } from '../src/types/tasks';
import { randomUUID } from 'crypto';
import { DEFAULT_TASK_GROUPS } from './defaultTaskData';

const GROUPS_FILE = 'task-groups.json';
const GROUPS_TABLE = 'task_groups';

async function readGroups(): Promise<TaskGroup[]> {
  return loadTaskRows<TaskGroup>(GROUPS_TABLE, GROUPS_FILE, () => DEFAULT_TASK_GROUPS);
}

let queue: Promise<void> = Promise.resolve();

export async function getTaskGroups(): Promise<TaskGroup[]> {
  return readGroups();
}

export function mutateTaskGroups<R>(fn: (groups: TaskGroup[]) => { next: TaskGroup[]; value: R }): Promise<R> {
  const run = queue.then(async () => {
    const current = await readGroups();
    const { next, value } = fn(current);
    await saveTaskRows<TaskGroup>(GROUPS_TABLE, 'id', next, GROUPS_FILE);
    return value;
  });
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export function createTaskGroup(input: TaskGroupInput): Promise<TaskGroup> {
  return mutateTaskGroups((groups) => {
    const group: TaskGroup = {
      id: randomUUID(),
      name: String(input.name || '').trim() || 'New group',
      description: input.description ? String(input.description) : undefined,
      color: input.color ? String(input.color) : undefined,
      createdAt: new Date().toISOString(),
    };
    return { next: [...groups, group], value: group };
  });
}
