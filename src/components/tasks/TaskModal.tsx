import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, Layers, Link2, Tag, Trash2, X } from 'lucide-react';
import { Task, TaskCategory, TaskGroup, TaskPriority, TaskStatus } from '../../types/tasks';
import {
  TASK_CATEGORIES,
  TASK_CATEGORY_META,
  TASK_PRIORITIES,
  TASK_PRIORITY_META,
  TASK_STATUSES,
  TASK_STATUS_META,
  todayLocalISO,
} from '../../data/taskDefaults';
import { wouldCreateCycle } from '../../data/taskDeps';

interface TaskModalProps {
  isOpen: boolean;
  task: Task | null; // null = create mode
  initialStatus?: TaskStatus;
  groups?: TaskGroup[];
  allTasks?: Task[];
  onClose: () => void;
  onSave: (data: {
    title: string;
    notes: string;
    status: TaskStatus;
    priority: TaskPriority;
    category: TaskCategory;
    dueDate: string | null;
    tags: string[];
    groupId?: string | null;
    dependsOn?: string[];
  }) => Promise<void>;
  onDelete?: (task: Task) => Promise<void>;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  task,
  initialStatus,
  groups = [],
  allTasks = [],
  onClose,
  onSave,
  onDelete,
}) => {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [category, setCategory] = useState<TaskCategory>('work');
  const [dueDate, setDueDate] = useState<string>('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [depError, setDepError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(task?.title || '');
    setNotes(task?.notes || '');
    setStatus(task?.status || initialStatus || 'todo');
    setPriority(task?.priority || 'medium');
    setCategory(task?.category || 'work');
    setDueDate(task?.dueDate || '');
    setTags(task?.tags || []);
    setGroupId(task?.groupId ?? null);
    setDependsOn(task?.dependsOn ?? []);
    setTagInput('');
    setDepError(null);
    setConfirmDelete(false);
    setError(null);
  }, [isOpen, task, initialStatus]);

  if (!isOpen) return null;

  const otherTasks = allTasks.filter((t) => t.id !== task?.id);

  const toggleDep = (id: string) => {
    setDepError(null);
    if (dependsOn.includes(id)) {
      setDependsOn(dependsOn.filter((d) => d !== id));
      return;
    }
    const next = [...dependsOn, id];
    if (wouldCreateCycle(allTasks, task?.id ?? '__new__', next)) {
      setDepError('This would create a circular dependency.');
      return;
    }
    setDependsOn(next);
  };

  const addTag = () => {
    const t = tagInput.trim().replace(/^#/, '');
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        title: title.trim(),
        notes,
        status,
        priority,
        category,
        dueDate: dueDate || null,
        tags,
        groupId,
        dependsOn,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save task.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task || !onDelete) return;
    setSaving(true);
    try {
      await onDelete(task);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to delete task.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/40 dark:bg-black/60 animate-fadeIn">
      <div className="flex min-h-full items-start justify-center px-4 py-6 sm:py-10">
        <div className="card shadow-[var(--shadow-md)] rounded-xl w-full max-w-lg relative overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
            <div>
              <h3 className="text-sm font-semibold text-fg">{task ? 'Edit Task' : 'New Task'}</h3>
              {task && (
                <p className="text-[11px] text-faint mt-0.5">
                  Created {new Date(task.createdAt).toLocaleDateString()} · {task.user}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              disabled={saving}
              className="p-1 rounded-md text-muted hover:text-fg hover:bg-well transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-4">
            {/* Title */}
            <div>
              <label className="block text-[11px] font-medium text-muted mb-1.5">Title *</label>
              <input
                autoFocus
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                className="input-min text-xs"
              />
            </div>

            {/* Status + Priority + Category */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-muted mb-1.5">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  className="input-min !h-auto py-2 px-2 text-xs capitalize"
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {TASK_STATUS_META[s].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-muted mb-1.5">Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="input-min !h-auto py-2 px-2 text-xs"
                >
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {TASK_PRIORITY_META[p].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-muted mb-1.5">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TaskCategory)}
                  className="input-min !h-auto py-2 px-2 text-xs"
                >
                  {TASK_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {TASK_CATEGORY_META[c].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Due date */}
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted mb-1.5">
                <CalendarDays className="w-3 h-3" /> Due date
              </label>
              <input
                type="date"
                value={dueDate}
                min={task?.dueDate && task.dueDate < todayLocalISO() ? undefined : todayLocalISO()}
                onChange={(e) => setDueDate(e.target.value)}
                className="input-min text-xs"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted mb-1.5">
                <Tag className="w-3 h-3" /> Tags
              </label>
              {tags.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                  {tags.map((t) => (
                    <span key={t} className="chip chip-accent !text-[10px]">
                      #{t}
                      <button onClick={() => setTags(tags.filter((x) => x !== t))} className="hover:text-fg">
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag();
                  }
                }}
                onBlur={addTag}
                placeholder="Add tag + Enter…"
                className="input-min text-xs"
              />
            </div>

            {/* Group (TMS container object) */}
            {groups.length > 0 && (
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted mb-1.5">
                  <Layers className="w-3 h-3" /> Group
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={groupId ?? ''}
                    onChange={(e) => setGroupId(e.target.value || null)}
                    className="input-min text-xs"
                  >
                    <option value="">No group</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                  {task?.sequence != null && task.groupId && (
                    <span
                      className="chip chip-neutral shrink-0 tabular-nums"
                      title="Position within group"
                    >
                      #{task.sequence}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Depends on (TMS flow mechanism, simplified) */}
            {otherTasks.length > 0 && (
              <div>
                <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted mb-1.5">
                  <Link2 className="w-3 h-3" /> Depends on
                </label>
                <p className="text-[10px] text-faint mb-1.5">
                  This task cannot be completed while selected dependencies are unfinished.
                </p>
                <div className="max-h-28 overflow-y-auto rounded-lg border border-line divide-y divide-line">
                  {otherTasks.map((t) => (
                    <label
                      key={t.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 cursor-pointer hover:bg-well/50 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={dependsOn.includes(t.id)}
                        onChange={() => toggleDep(t.id)}
                        className="w-3.5 h-3.5 rounded accent-[var(--color-primary)] cursor-pointer shrink-0"
                      />
                      <span
                        className={`flex-1 min-w-0 truncate text-[11px] ${
                          t.status === 'done' ? 'line-through text-faint' : 'text-fg'
                        }`}
                      >
                        {t.title}
                      </span>
                      <span className={`${TASK_STATUS_META[t.status].chip} !text-[9px]`}>
                        {TASK_STATUS_META[t.status].label}
                      </span>
                    </label>
                  ))}
                </div>
                {depError && (
                  <p className="mt-1 text-[11px] font-semibold" style={{ color: 'var(--danger)' }}>
                    {depError}
                  </p>
                )}
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-[11px] font-medium text-muted mb-1.5">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Extra details…"
                className="input-min text-xs resize-none"
              />
            </div>

            {error && (
              <p className="text-[11px] font-semibold" style={{ color: 'var(--danger)' }}>
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-line">
            {task && onDelete ? (
              confirmDelete ? (
                <button
                  onClick={handleDelete}
                  disabled={saving}
                  className="btn-min btn-danger-min !h-8 mr-auto text-[11px]"
                >
                  <Check className="w-3.5 h-3.5" /> Confirm delete?
                </button>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  disabled={saving}
                  className="btn-min btn-danger-min !h-8 mr-auto text-[11px]"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              )
            ) : (
              <span className="mr-auto" />
            )}
            <button
              onClick={onClose}
              disabled={saving}
              className="btn-min btn-secondary !h-8 text-[11px]"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="btn-min btn-primary !h-8 text-[11px] disabled:opacity-50"
            >
              {saving ? 'Saving…' : task ? 'Save changes' : 'Create task'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
