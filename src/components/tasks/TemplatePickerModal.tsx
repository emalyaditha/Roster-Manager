import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, X } from 'lucide-react';
import { TaskTemplate } from '../../types/tasks';

interface TemplatePickerModalProps {
  isOpen: boolean;
  templates: TaskTemplate[];
  onClose: () => void;
  onInstantiate: (
    template: TaskTemplate,
    variableValues: Record<string, string>,
    dueDate: string | null
  ) => Promise<void>;
}

export const TemplatePickerModal: React.FC<TemplatePickerModalProps> = ({
  isOpen,
  templates,
  onClose,
  onInstantiate,
}) => {
  const [selected, setSelected] = useState<TaskTemplate | null>(null);
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setSelected(null);
    setVariableValues({});
    setDueDate('');
    setSubmitting(false);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const selectTemplate = (template: TaskTemplate) => {
    const initial: Record<string, string> = {};
    template.variables.forEach((v) => {
      initial[v.key] = v.defaultValue ?? '';
    });
    setVariableValues(initial);
    setSelected(template);
  };

  const handleSubmit = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    try {
      await onInstantiate(selected, variableValues, dueDate || null);
      onClose();
    } catch {
      // Errors already surfaced via toast by the caller; stay open for retry.
    } finally {
      setSubmitting(false);
    }
  };

  const taskCount =
    selected && selected.children?.length ? selected.children.length : 1;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] overflow-y-auto bg-black/40 dark:bg-black/60 animate-fadeIn"
    >
      <div className="flex min-h-full items-start justify-center px-4 py-6 sm:py-10">
        <div
          onClick={(e) => e.stopPropagation()}
          className="card shadow-[var(--shadow-md)] rounded-xl w-full max-w-md relative overflow-hidden"
        >
          {!selected ? (
            <>
              {/* Step 1: template gallery */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
                <h3 className="text-sm font-semibold text-fg">Start from a template</h3>
                <button
                  onClick={onClose}
                  className="p-1 rounded-md text-muted hover:text-fg hover:bg-well transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-5 py-4">
                {templates.length === 0 ? (
                  <p className="py-8 text-center text-xs text-faint">No templates available</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => selectTemplate(template)}
                        className="card p-3 flex flex-col text-left hover:border-[var(--color-text-faint)] transition-colors cursor-pointer"
                      >
                        <p className="text-xs font-semibold text-fg break-words">{template.name}</p>
                        {template.description && (
                          <p className="mt-1 text-[11px] text-muted line-clamp-2">
                            {template.description}
                          </p>
                        )}
                        {template.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {template.tags.map((tag) => (
                              <span key={tag} className="chip chip-neutral !text-[10px]">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="mt-auto pt-2 flex flex-wrap items-center gap-1">
                          {template.variables.length > 0 && (
                            <span className="chip chip-neutral !text-[10px]">
                              {template.variables.length} variables
                            </span>
                          )}
                          {template.children?.length ? (
                            <>
                              <span className="chip chip-accent !text-[10px]">Group</span>
                              <span className="chip chip-neutral !text-[10px]">
                                {template.children.length} steps
                              </span>
                            </>
                          ) : (
                            <span className="chip chip-accent !text-[10px]">Single task</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Step 2: variable form */}
              <div className="flex items-center gap-2 px-5 py-3.5 border-b border-line">
                <button
                  onClick={() => setSelected(null)}
                  disabled={submitting}
                  className="p-1 rounded-md text-muted hover:text-fg hover:bg-well transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-fg truncate">{selected.name}</h3>
                  <p className="text-[11px] text-faint mt-0.5">
                    Creates {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
                  </p>
                </div>
              </div>

              {/* Body */}
              <div className="px-5 py-4 space-y-4">
                {selected.variables.map((variable) => (
                  <div key={variable.key}>
                    <label className="block text-[11px] font-medium text-muted mb-1.5">
                      {variable.label}
                    </label>
                    <input
                      type="text"
                      value={variableValues[variable.key] ?? ''}
                      placeholder={variable.defaultValue || variable.key}
                      onChange={(e) =>
                        setVariableValues({
                          ...variableValues,
                          [variable.key]: e.target.value,
                        })
                      }
                      className="input-min text-xs"
                    />
                  </div>
                ))}

                <div>
                  <label className="flex items-center gap-1.5 text-[11px] font-medium text-muted mb-1.5">
                    <CalendarDays className="w-3 h-3" /> Due date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="input-min text-xs"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-line">
                <button
                  onClick={onClose}
                  disabled={submitting}
                  className="btn-min btn-secondary !h-8 text-[11px]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="btn-min btn-primary !h-8 text-[11px] disabled:opacity-50"
                >
                  {submitting
                    ? 'Creating…'
                    : `Create ${taskCount > 1 ? `${taskCount} tasks` : 'task'}`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
