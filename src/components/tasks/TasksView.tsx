import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { KanbanSquare } from 'lucide-react';
import { api } from '../../services/api';
import {
  Task,
  TaskCategory,
  TaskGroup,
  TaskInput,
  TaskPriority,
  TaskSortKey,
  TaskStatus,
  TaskTemplate,
} from '../../types/tasks';
import { todayLocalISO } from '../../data/taskDefaults';
import { getUnmetDependencies } from '../../data/taskDeps';
import { TaskBoard } from './TaskBoard';
import { TaskList } from './TaskList';
import { TaskViewer } from './TaskViewer';
import { TaskToolbar, TaskViewMode } from './TaskToolbar';
import { TaskModal } from './TaskModal';
import { TemplatePickerModal } from './TemplatePickerModal';

interface TasksViewProps {
  userName?: string;
  onToast?: (type: 'success' | 'error', title: string, message?: string) => void;
}

export const TasksView: React.FC<TasksViewProps> = ({ userName = 'User', onToast }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<TaskViewMode>('board');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<TaskCategory | ''>('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<TaskSortKey>('dueDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [initialStatus, setInitialStatus] = useState<TaskStatus>('todo');

  const [pickerOpen, setPickerOpen] = useState(false);
  const [instantiating, setInstantiating] = useState(false);

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null);

  const [quickTitle, setQuickTitle] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [taskData, groupData, templateData] = await Promise.all([
          api.getTasks(),
          api.getTaskGroups(),
          api.getTaskTemplates(),
        ]);
        if (!cancelled) {
          setTasks(taskData);
          setGroups(groupData);
          setTemplates(templateData);
        }
      } catch (err: any) {
        if (!cancelled) setLoadError(err?.message || 'Failed to load tasks.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const notify = useCallback(
    (type: 'success' | 'error', title: string, message?: string) => {
      onToast?.(type, title, message);
    },
    [onToast]
  );

  /** Optimistic mutation: apply locally, sync to server, roll back on failure.
   *  Returns false when the action failed (callers use this to keep modals open). */
  const mutate = useCallback(
    async (
      snapshot: Task[],
      next: Task[],
      action: () => Promise<unknown>,
      errorTitle: string
    ): Promise<boolean> => {
      setTasks(next);
      try {
        await action();
        return true;
      } catch (err: any) {
        // Resync from the server so any concurrent successful updates survive;
        // fall back to the pre-mutation snapshot if the refetch itself fails.
        try {
          setTasks(await api.getTasks());
        } catch {
          setTasks(snapshot);
        }
        notify('error', errorTitle, err?.message || 'Please try again.');
        return false;
      }
    },
    [notify]
  );

  const handleCreate = useCallback(
    async (input: TaskInput) => {
      const snapshot = tasks;
      const temp: Task = {
        id: `temp-${Date.now()}`,
        title: input.title?.trim() || 'Untitled task',
        notes: input.notes || '',
        status: input.status || 'todo',
        priority: input.priority || 'medium',
        dueDate: input.dueDate ?? null,
        tags: input.tags || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: null,
        user: userName,
        groupId: input.groupId ?? null,
        sequence: input.sequence ?? null,
        dependsOn: input.dependsOn ?? [],
        category: input.category ?? 'work',
      };
      await mutate(
        snapshot,
        [...snapshot, temp],
        async () => {
          const created = await api.createTask({ ...input, user: userName });
          setTasks((cur) => cur.map((t) => (t.id === temp.id ? created : t)));
          notify('success', 'Task created', created.title);
        },
        'Failed to create task'
      );
    },
    [tasks, mutate, notify, userName]
  );

  const handleUpdate = useCallback(
    async (task: Task, input: TaskInput): Promise<boolean> => {
      const snapshot = tasks;
      const optimisticNext: Task = {
        ...task,
        ...input,
        status: input.status ?? task.status,
        completedAt:
          input.status && input.status !== task.status
            ? input.status === 'done'
              ? new Date().toISOString()
              : null
            : task.completedAt,
        updatedAt: new Date().toISOString(),
      };
      return mutate(
        snapshot,
        snapshot.map((t) => (t.id === task.id ? optimisticNext : t)),
        () => api.updateTask(task.id, input),
        'Failed to update task'
      );
    },
    [tasks, mutate]
  );

  const handleDelete = useCallback(
    async (task: Task) => {
      const snapshot = tasks;
      await mutate(
        snapshot,
        snapshot.filter((t) => t.id !== task.id),
        () => api.deleteTask(task.id),
        'Failed to delete task'
      );
      notify('success', 'Task deleted', task.title);
    },
    [tasks, mutate, notify]
  );

  const guardBlocked = useCallback(
    (task: Task): boolean => {
      const unmet = getUnmetDependencies(task, tasks);
      if (unmet.length > 0) {
        notify('error', 'Task is blocked', `Finish first: ${unmet.map((d) => d.title).join(', ')}`);
        return true;
      }
      return false;
    },
    [tasks, notify]
  );

  const toggleDone = useCallback(
    (task: Task) => {
      const nextStatus: TaskStatus = task.status === 'done' ? 'todo' : 'done';
      if (nextStatus === 'done' && guardBlocked(task)) return;
      handleUpdate(task, { status: nextStatus });
    },
    [handleUpdate, guardBlocked]
  );

  const moveToStatus = useCallback(
    (taskId: string, status: TaskStatus) => {
      const task = tasks.find((t) => t.id === taskId);
      if (!task || task.status === status) return;
      if (status === 'done' && guardBlocked(task)) return;
      handleUpdate(task, { status });
    },
    [tasks, handleUpdate, guardBlocked]
  );

  const handleQuickAdd = useCallback(() => {
    if (!quickTitle.trim()) return;
    handleCreate({ title: quickTitle.trim(), status: 'todo' });
    setQuickTitle('');
  }, [quickTitle, handleCreate]);

  const handleInstantiate = useCallback(
    async (template: TaskTemplate, variableValues: Record<string, string>, dueDate: string | null) => {
      setInstantiating(true);
      try {
        const result = await api.createTaskFromTemplate({
          templateId: template.id,
          variableValues,
          dueDate,
          user: userName,
        });
        setTasks((cur) => [...cur, ...result.tasks]);
        if (result.group && !groups.some((g) => g.id === result.group!.id)) {
          setGroups((cur) => [...cur, result.group!]);
        }
        const count = result.tasks.length;
        notify('success', count > 1 ? `${count} tasks created` : 'Task created', `from "${template.name}"`);
      } catch (err: any) {
        notify('error', 'Template failed', err?.message || 'Could not create tasks from template.');
        throw err;
      } finally {
        setInstantiating(false);
      }
    },
    [groups, notify, userName]
  );

  // Drag & drop handlers
  const handleDropOnColumn = useCallback(
    (status: TaskStatus) => {
      if (draggedId) moveToStatus(draggedId, status);
      setDraggedId(null);
      setDropTarget(null);
    },
    [draggedId, moveToStatus]
  );

  const allTags = useMemo(
    () => [...new Set<string>(tasks.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b)),
    [tasks]
  );

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (
        q &&
        !t.title.toLowerCase().includes(q) &&
        !(t.notes || '').toLowerCase().includes(q)
      ) {
        return false;
      }
      if (priorityFilter && t.priority !== priorityFilter) return false;
      if (categoryFilter && t.category !== categoryFilter) return false;
      if (tagFilter.length > 0 && !tagFilter.every((tag) => t.tags.includes(tag))) return false;
      return true;
    });
  }, [tasks, search, priorityFilter, categoryFilter, tagFilter]);

  const stats = useMemo(() => {
    const open = tasks.filter((t) => t.status !== 'done').length;
    const overdue = tasks.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < todayLocalISO()).length;
    const done = tasks.length - open;
    return `${open} open · ${overdue} overdue · ${done} done`;
  }, [tasks]);

  const openEdit = (task: Task | null, status: TaskStatus) => {
    setEditingTask(task);
    setInitialStatus(status);
    setModalOpen(true);
  };

  const handleSortChange = (key: TaskSortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl card flex items-center justify-center shrink-0">
          <KanbanSquare className="w-5 h-5 text-accent" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-fg tracking-tight">Task Manager</h1>
          <p className="text-sm text-muted truncate">{stats}</p>
        </div>
      </div>

      <TaskToolbar
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        search={search}
        onSearchChange={setSearch}
        priorityFilter={priorityFilter}
        onPriorityFilterChange={setPriorityFilter}
        categoryFilter={categoryFilter}
        onCategoryFilterChange={setCategoryFilter}
        allTags={allTags}
        tagFilter={tagFilter}
        onToggleTag={(tag) =>
          setTagFilter((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]))
        }
        onNewTask={() => openEdit(null, 'todo')}
        onOpenTemplates={() => setPickerOpen(true)}
        quickTitle={quickTitle}
        onQuickTitleChange={setQuickTitle}
        onQuickAdd={handleQuickAdd}
      />

      {loading ? (
        <p className="text-xs text-faint text-center py-16">Loading tasks…</p>
      ) : loadError ? (
        <p className="text-xs font-semibold text-center py-16" style={{ color: 'var(--danger)' }}>
          {loadError}
        </p>
      ) : viewMode === 'board' ? (
        <TaskBoard
          tasks={filteredTasks}
          allTasks={tasks}
          groups={groups}
          draggedId={draggedId}
          dropTarget={dropTarget}
          onDragStartTask={setDraggedId}
          onDragEndTask={() => {
            setDraggedId(null);
            setDropTarget(null);
          }}
          onDropOnColumn={handleDropOnColumn}
          onSetDropTarget={setDropTarget}
          onToggleDone={toggleDone}
          onEdit={(task) => openEdit(task, task.status)}
          onAddInColumn={(status) => openEdit(null, status)}
        />
      ) : viewMode === 'list' ? (
        <TaskList
          tasks={filteredTasks}
          allTasks={tasks}
          sortKey={sortKey}
          sortDir={sortDir}
          onSortChange={handleSortChange}
          onToggleDone={toggleDone}
          onEdit={(task) => openEdit(task, task.status)}
        />
      ) : (
        <TaskViewer
          tasks={filteredTasks}
          groups={groups}
          onEditTask={(task) => openEdit(task, task.status)}
        />
      )}

      <TaskModal
        isOpen={modalOpen}
        task={editingTask}
        initialStatus={initialStatus}
        groups={groups}
        allTasks={tasks}
        onClose={() => setModalOpen(false)}
        onSave={async (data) => {
          if (editingTask) {
            const ok = await handleUpdate(editingTask, data);
            if (!ok) throw new Error('Save failed — task was reverted.');
            notify('success', 'Task updated', data.title);
          } else {
            await handleCreate({ ...data, status: initialStatus });
          }
        }}
        onDelete={handleDelete}
      />

      <TemplatePickerModal
        isOpen={pickerOpen}
        templates={templates}
        onClose={() => setPickerOpen(false)}
        onInstantiate={handleInstantiate}
      />
    </div>
  );
};
