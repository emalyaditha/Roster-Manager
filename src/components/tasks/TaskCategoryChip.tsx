import React from 'react';
import { TaskCategory } from '../../types/tasks';
import { TASK_CATEGORY_DOT, TASK_CATEGORY_META } from '../../data/taskDefaults';

interface TaskCategoryChipProps {
  category: TaskCategory;
  className?: string;
}

/** Small neutral chip with a tiny category dot (work=accent, personal=success, projects=warning). */
export const TaskCategoryChip: React.FC<TaskCategoryChipProps> = ({ category, className = '' }) => {
  // Legacy rows may predate the category field — fall back to 'work'.
  const cat: TaskCategory =
    category && TASK_CATEGORY_META[category] ? category : 'work';
  return (
    <span className={`chip chip-neutral !text-[10px] ${className}`} title="Category">
      <span
        className="h-1.5 w-1.5 rounded-full shrink-0"
        style={{ backgroundColor: TASK_CATEGORY_DOT[cat] }}
      />
      {TASK_CATEGORY_META[cat].label}
    </span>
  );
};
