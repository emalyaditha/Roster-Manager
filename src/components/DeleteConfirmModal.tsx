import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RosterEntry } from '../types/roster';
import { formatDateDisplay } from '../utils/date';
import { AlertTriangle, Trash2 } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  entry: RosterEntry | null;
  onClose: () => void;
  onConfirmDelete: (deleteCalendarEvent: boolean) => Promise<void>;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  entry,
  onClose,
  onConfirmDelete,
}) => {
  const [deleteCalendarEvent, setDeleteCalendarEvent] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onConfirmDelete(deleteCalendarEvent);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && entry && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto py-6 sm:py-10 px-4"
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 dark:bg-black/60"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="relative card shadow-[var(--shadow-md)] rounded-xl w-full max-w-sm overflow-hidden"
          >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="p-2 rounded-lg"
              style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-fg">
                Delete Roster Entry
              </h3>
              <p className="text-xs text-muted">
                {formatDateDisplay(entry.date)} ({entry.day})
              </p>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon" aria-label="Close">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <div
            className="rounded-lg p-3 text-xs leading-relaxed"
            style={{ background: 'var(--warning-bg)', color: 'var(--warning)' }}
          >
            Are you sure you want to delete the roster record for <strong>{entry.date}</strong> ({entry.action})?
            This operation will remove its audit logs as well.
          </div>

          {entry.googleCalendarEventId && (
            <label className="flex items-center gap-2 bg-well border border-line rounded-lg p-3 font-medium cursor-pointer text-fg text-xs">
              <input
                type="checkbox"
                checked={deleteCalendarEvent}
                onChange={(e) => setDeleteCalendarEvent(e.target.checked)}
                className="rounded border-line accent-[var(--color-primary)] cursor-pointer"
              />
              Remove corresponding event from Google Calendar
            </label>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-line flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={isDeleting} className="btn-secondary">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            style={{ background: 'var(--danger)', color: '#fff' }}
            className="h-9 px-3.5 rounded-md text-sm font-medium hover:opacity-90 flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            {isDeleting ? 'Deleting...' : 'Delete Permanently'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )}
  </AnimatePresence>
);
};
