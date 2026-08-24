import { TaskGroup, TaskTemplate } from '../src/types/tasks';

// Definition-stage seeds (BMC TMS: task templates + group templates).
// Passed as readJsonFile defaults, so first read materializes the files.

const now = new Date().toISOString();

export const DEFAULT_TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'tpl-shift-handover',
    name: 'Shift Handover',
    description: 'One-off handover checklist for a specific shift.',
    titleTemplate: 'Complete handover notes — {{shift}} shift ({{date}})',
    notesTemplate: 'Walk through open items, escalations and pending OT approvals before sign-off.',
    priority: 'high',
    tags: ['handover'],
    variables: [
      { key: 'shift', label: 'Shift', defaultValue: 'Day' },
      { key: 'date', label: 'Handover date' },
    ],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'tpl-joiner-week1',
    name: 'New Joiner Onboarding — Week 1',
    description: 'Group template: three sequenced onboarding steps with chained dependencies.',
    titleTemplate: '',
    priority: 'medium',
    tags: ['onboarding'],
    variables: [{ key: 'name', label: 'Joiner name' }],
    children: [
      {
        titleTemplate: 'Create accounts for {{name}}',
        notesTemplate: 'Email, roster system login, payroll record.',
        priority: 'high',
        dueOffsetDays: 0,
      },
      {
        titleTemplate: 'Schedule intro meetings for {{name}}',
        notesTemplate: 'Team lead, buddy, HR touchpoint.',
        dueOffsetDays: 1,
        dependsOnIndexes: [0],
      },
      {
        titleTemplate: 'Assign buddy & first-week rota for {{name}}',
        notesTemplate: 'Publish rota and confirm buddy availability.',
        dueOffsetDays: 2,
        dependsOnIndexes: [1],
      },
    ],
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'tpl-monthly-ot',
    name: 'Monthly OT Reconciliation',
    description: 'Reconcile overtime ledger entries for a month.',
    titleTemplate: 'Reconcile {{month}} overtime entries',
    notesTemplate: 'Compare OT engine shifts against approved DOS/ledger records.',
    priority: 'medium',
    tags: ['overtime'],
    variables: [{ key: 'month', label: 'Month', defaultValue: '' }],
    createdAt: now,
    updatedAt: now,
  },
];

export const DEFAULT_TASK_GROUPS: TaskGroup[] = [];
