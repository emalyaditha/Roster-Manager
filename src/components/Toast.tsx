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
    success: <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--success)' }} />,
    warn: <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--warning)' }} />,
    error: <XCircle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--danger)' }} />,
  };

  return createPortal(
    <div className="fixed top-5 right-5 z-[99999] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            layout
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, x: 80, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={() => onDismiss(t.id)}
            className={`toast-card pointer-events-auto text-left ${
              t.type === 'success' ? 'toast-success' :
              t.type === 'warn' ? 'toast-warn' :
              'toast-error'
            }`}
          >
            {icons[t.type]}
            <div className="min-w-0">
              <div className="toast-message leading-tight">{t.message}</div>
              {t.sub && <div className="toast-sub leading-snug">{t.sub}</div>}
            </div>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
};
