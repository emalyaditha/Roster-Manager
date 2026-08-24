import { loadTaskRows, saveTaskRows } from './supabaseTasks';
import { TaskTemplate } from '../src/types/tasks';
import { randomUUID } from 'crypto';
import { DEFAULT_TASK_TEMPLATES } from './defaultTaskData';

const TEMPLATES_FILE = 'task-templates.json';
const TEMPLATES_TABLE = 'task_templates';

async function readTemplates(): Promise<TaskTemplate[]> {
  return loadTaskRows<TaskTemplate>(TEMPLATES_TABLE, TEMPLATES_FILE, () => DEFAULT_TASK_TEMPLATES);
}

let queue: Promise<void> = Promise.resolve();

export async function getTaskTemplates(): Promise<TaskTemplate[]> {
  return readTemplates();
}

export function mutateTaskTemplates<R>(
  fn: (templates: TaskTemplate[]) => { next: TaskTemplate[]; value: R }
): Promise<R> {
  const run = queue.then(async () => {
    const current = await readTemplates();
    const { next, value } = fn(current);
    await saveTaskRows<TaskTemplate>(TEMPLATES_TABLE, 'id', next, TEMPLATES_FILE);
    return value;
  });
  queue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export interface TaskTemplatePayload {
  name?: string;
  description?: string;
  titleTemplate?: string;
  notesTemplate?: string;
  priority?: TaskTemplate['priority'];
  tags?: string[];
  category?: TaskTemplate['category'];
  variables?: TaskTemplate['variables'];
  children?: TaskTemplate['children'];
}

export function buildTemplate(id: string | null, payload: TaskTemplatePayload, existing?: TaskTemplate): TaskTemplate {
  const now = new Date().toISOString();
  return {
    id: id ?? existing?.id ?? randomUUID(),
    name: String(payload.name ?? existing?.name ?? 'Untitled template').trim() || 'Untitled template',
    description: payload.description !== undefined ? String(payload.description) : existing?.description,
    titleTemplate: String(payload.titleTemplate ?? existing?.titleTemplate ?? ''),
    notesTemplate:
      payload.notesTemplate !== undefined ? String(payload.notesTemplate) : existing?.notesTemplate,
    priority: payload.priority ?? existing?.priority ?? 'medium',
    tags: Array.isArray(payload.tags)
      ? [...new Set(payload.tags.map((t) => String(t).trim()).filter(Boolean))]
      : existing?.tags ?? [],
    category: payload.category ?? existing?.category ?? 'work',
    variables: Array.isArray(payload.variables) ? payload.variables : existing?.variables ?? [],
    children: Array.isArray(payload.children) ? payload.children : existing?.children,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}
