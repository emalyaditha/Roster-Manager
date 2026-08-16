import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RosterEntry } from '../types/roster';
import { formatDateDisplay } from '../utils/date';
import { AlertTriangle, Trash2, X } from 'lucide-react';

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
          className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs"
        >
          <div className="flex min-h-full items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden transition-all my-8"
            >
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-red-50 dark:bg-red-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-red-600 text-white">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-red-950 dark:text-red-100">
                Delete Roster Entry
              </h3>
              <p className="text-xs text-red-700 dark:text-red-300">
                {formatDateDisplay(entry.date)} ({entry.day})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-red-400 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
            Are you sure you want to delete the roster record for <strong>{entry.date}</strong> ({entry.action})?
            This operation will remove its audit logs as well.
          </p>

          {entry.googleCalendarEventId && (
            <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold cursor-pointer text-slate-800 dark:text-slate-200">
              <input
                type="checkbox"
                checked={deleteCalendarEvent}
                onChange={(e) => setDeleteCalendarEvent(e.target.checked)}
                className="rounded border-slate-300 text-red-600 focus:ring-red-500"
              />
              Remove corresponding event from Google Calendar
            </label>
          )}

          {/* Buttons */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2 font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-5 py-2 font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-sm flex items-center gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              {isDeleting ? 'Deleting...' : 'Delete Permanently'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  </motion.div>
  )}
  </AnimatePresence>
);
};
