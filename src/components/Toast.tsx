import React from 'react';
import { createPortal } from 'react-dom';
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
  if (toasts.length === 0) return null;

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />,
    warn: <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />,
    error: <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />,
  };

  return createPortal(
    <div className="toast-container">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => onDismiss(t.id)}
          className={`toast-card toast-${t.type}`}
        >
          {icons[t.type]}
          <div className="text-left">
            <div className="toast-message">{t.message}</div>
            {t.sub && <div className="toast-sub">{t.sub}</div>}
          </div>
        </button>
      ))}
    </div>,
    document.body
  );
};