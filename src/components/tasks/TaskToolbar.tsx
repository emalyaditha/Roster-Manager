import React from 'react';
import { Kanban, LayoutTemplate, List, Plus, Search, Workflow, X } from 'lucide-react';
import { TaskCategory, TaskPriority } from '../../types/tasks';
import {
  TASK_CATEGORIES,
  TASK_CATEGORY_META,
  TASK_PRIORITIES,
  TASK_PRIORITY_META,
} from '../../data/taskDefaults';

export type TaskViewMode = 'board' | 'list' | 'viewer';

interface TaskToolbarProps {
  viewMode: TaskViewMode;
  onViewModeChange: (mode: TaskViewMode) => void;
  search: string;
  onSearchChange: (value: string) => void;
  priorityFilter: TaskPriority | '';
  onPriorityFilterChange: (value: TaskPriority | '') => void;
  categoryFilter: TaskCategory | '';
  onCategoryFilterChange: (value: TaskCategory | '') => void;
  allTags: string[];
  tagFilter: string[];
  onToggleTag: (tag: string) => void;
  onNewTask: () => void;
  onOpenTemplates: () => void;
  quickTitle: string;
  onQuickTitleChange: (value: string) => void;
  onQuickAdd: () => void;
}

export const TaskToolbar: React.FC<TaskToolbarProps> = ({
  viewMode,
  onViewModeChange,
  search,
  onSearchChange,
  priorityFilter,
  onPriorityFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  allTags,
  tagFilter,
  onToggleTag,
  onNewTask,
  onOpenTemplates,
  quickTitle,
  onQuickTitleChange,
  onQuickAdd,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        {/* Quick add */}
        <div className="flex-1 relative">
          <Plus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint" />
          <input
            type="text"
            value={quickTitle}
            onChange={(e) => onQuickTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && quickTitle.trim()) onQuickAdd();
            }}
            placeholder="Quick add a task and press Enter…"
            className="input-min !h-8 pl-9 pr-3 text-xs"
          />
        </div>

        {/* View toggle */}
        <div className="inline-flex card p-0.5 gap-0.5 rounded-lg shrink-0">
          {(
            [
              { key: 'board' as const, icon: Kanban, label: 'Board' },
              { key: 'list' as const, icon: List, label: 'List' },
              { key: 'viewer' as const, icon: Workflow, label: 'Viewer' },
            ]
          ).map((opt) => (
            <button
              key={opt.key}
              onClick={() => onViewModeChange(opt.key)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 h-7 text-xs font-medium transition-colors ${
                viewMode === opt.key ? 'bg-well text-fg' : 'text-muted hover:text-fg'
              }`}
            >
              <opt.icon className="w-3.5 h-3.5" />
              {opt.label}
            </button>
          ))}
        </div>

        <button
          onClick={onOpenTemplates}
          title="Start from a template"
          className="btn-min btn-secondary !h-8 text-xs shrink-0"
        >
          <LayoutTemplate className="w-4 h-4" />
          Templates
        </button>

        <button onClick={onNewTask} className="btn-min btn-primary !h-8 text-xs shrink-0">
          <Plus className="w-4 h-4" />
          New Task
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-faint" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search tasks…"
            className="input-min !h-8 w-48 pl-8 pr-3 text-[11px]"
          />
        </div>

        <select
          value={priorityFilter}
          onChange={(e) => onPriorityFilterChange(e.target.value as TaskPriority | '')}
          className="input-min !h-8 w-auto pr-8 text-[11px]"
        >
          <option value="">All priorities</option>
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {TASK_PRIORITY_META[p].label}
            </option>
          ))}
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => onCategoryFilterChange(e.target.value as TaskCategory | '')}
          className="input-min !h-8 w-auto pr-8 text-[11px]"
        >
          <option value="">All categories</option>
          {TASK_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {TASK_CATEGORY_META[c].label}
            </option>
          ))}
        </select>

        {allTags.map((tag) => {
          const active = tagFilter.includes(tag);
          return (
            <button
              key={tag}
              onClick={() => onToggleTag(tag)}
              className={`chip !text-[10px] cursor-pointer transition-colors ${
                active ? 'chip-accent font-semibold' : 'chip-neutral'
              }`}
            >
              #{tag}
            </button>
          );
        })}

        {(search || priorityFilter || categoryFilter || tagFilter.length > 0) && (
          <button
            onClick={() => {
              onSearchChange('');
              onPriorityFilterChange('');
              onCategoryFilterChange('');
              tagFilter.forEach(onToggleTag);
            }}
            className="btn-min btn-ghost !h-7 px-2 text-[10px]"
          >
            <X className="w-3 h-3" />
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
};
