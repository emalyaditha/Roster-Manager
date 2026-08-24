// Notion-style task management types, extended with TMS concepts
// (templates, groups/container objects, sequencing, dependency flow).

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskSortKey = 'dueDate' | 'priority' | 'createdAt' | 'title';

export type TaskCategory = 'work' | 'personal' | 'projects';

export interface Task {
  id: string;
  title: string;
  notes?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string | null;
  tags: string[];
  user: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  groupId?: string | null;
  sequence?: number | null;
  dependsOn: string[];
  category: TaskCategory;
}

export interface TaskInput {
  title?: string;
  notes?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  tags?: string[];
  user?: string;
  groupId?: string | null;
  sequence?: number | null;
  dependsOn?: string[];
  category?: TaskCategory;
  force?: boolean; // bypass the dependency completion guard (server escape hatch)
}

// --- Definition-stage entities (BMC TMS: templates) ---

export interface TemplateVariable {
  key: string; // {{key}} placeholder name
  label: string; // human label in the instantiation form
  defaultValue?: string;
}

/** One child spec inside a GROUP template. Sequence derives from array order (1..N). */
export interface TaskTemplateChild {
  titleTemplate: string; // may contain {{var}}
  notesTemplate?: string;
  priority?: TaskPriority;
  dueOffsetDays?: number; // days after instantiate date
  dependsOnIndexes?: number[]; // indexes into siblings array -> resolved to real ids
}

export interface TaskTemplate {
  id: string;
  name: string;
  description?: string;
  titleTemplate: string; // single-task templates use this
  notesTemplate?: string;
  priority: TaskPriority;
  tags: string[];
  category?: TaskCategory; // stamped onto every instantiated task
  variables: TemplateVariable[];
  children?: TaskTemplateChild[]; // present => GROUP template
  createdAt: string;
  updatedAt: string;
}

// --- Runtime-stage container object (BMC TMS: task group) ---

export interface TaskGroup {
  id: string;
  name: string;
  description?: string;
  color?: string; // hex accent for chips/viewer border
  createdAt: string;
}

export interface TaskGroupInput {
  name?: string;
  description?: string;
  color?: string;
}

export interface InstantiateResult {
  group: TaskGroup | null;
  tasks: Task[];
}
