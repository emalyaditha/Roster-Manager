import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';

export interface ToastItem {
  id: number;
  type: 'success' | 'error' | 'warn';
  message: string;
  sub?: string;
}

interface ToastProps {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
}

export const Toast: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />,
    warn: <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />,
    error: <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />,
  };

  const borderColors = {
    success: 'border-l-emerald-500',
    warn: 'border-l-amber-500',
    error: 'border-l-red-500',
  };

  return createPortal(
    <div className="fixed top-5 right-5 z-[99999] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            layout
            initial={{ opacity: 0, y: -12, scale: 0.95, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: 80, scale: 0.95, filter: 'blur(4px)' }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={() => onDismiss(t.id)}
            className={`pointer-events-auto flex items-start gap-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 border-l-4 ${borderColors[t.type]} rounded-2xl shadow-xl shadow-black/5 dark:shadow-black/30 p-3.5 max-w-[360px] cursor-pointer text-left hover:shadow-2xl transition-shadow`}
          >
            {icons[t.type]}
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-slate-900 dark:text-white leading-tight">{t.message}</div>
              {t.sub && <div className="text-[11px] text-slate-500 dark:text-zinc-400 mt-1 leading-snug">{t.sub}</div>}
            </div>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
};
