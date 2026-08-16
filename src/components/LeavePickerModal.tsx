import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { RosterEntry, LeaveRow } from '../types/roster';
import { formatDateDisplay } from '../utils/date';
import {
  LEAVE_OPTIONS,
  SHIFT_CONTEXT,
  getBalanceForCode,
  validateLeaveApplication,
  ValidationResult,
} from '../utils/leave';
import { X } from 'lucide-react';

interface LeavePickerModalProps {
  isOpen: boolean;
  entry: RosterEntry | null;
  leaveRows: LeaveRow[];
  onClose: () => void;
  onApply: (code: string, reason: string) => Promise<void>;
}

function formatBalance(value: number | null | undefined): string {
  if (value === null || value === undefined) return '0.00';
  return value.toFixed(2);
}

export const LeavePickerModal: React.FC<LeavePickerModalProps> = ({
  isOpen,
  entry,
  leaveRows,
  onClose,
  onApply,
}) => {
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setSelectedCode('');
    setReason('');
    setSubmitting(false);
    setError(null);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const selectedOption = LEAVE_OPTIONS.find((o) => o.code === selectedCode);

  const validation: ValidationResult | null = useMemo(() => {
    if (!selectedOption) return null;
    return validateLeaveApplication(selectedOption.code, leaveRows);
  }, [selectedOption, leaveRows]);

  if (!isOpen || !entry) return null;

  const currentCode = entry.currentStatusId || entry.originalStatusId || '';
  const isWarnCode = currentCode === 'Training';
  const hasClockData = Boolean(entry.clockIn || entry.clockOut || entry.ot);

  const context = SHIFT_CONTEXT[currentCode] || { label: currentCode, hours: '' };

  const confirmDisabled =
    submitting ||
    !selectedCode ||
    !validation ||
    validation.ok === false ||
    (validation.ok === true && validation.warn === false && validation.after !== undefined && validation.after < 0);

  const handleConfirm = async () => {
    if (!selectedCode || !validation || !validation.ok) return;
    setSubmitting(true);
    setError(null);
    try {
      await onApply(selectedCode, reason);
      reset();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to apply leave. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const modal = (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="leave-picker">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="leave-picker-title">
                {formatDateDisplay(entry.date)} · {entry.day}
              </div>
              <div className="leave-picker-sub">
                {currentCode} → Change to Leave · {context.hours}
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={submitting}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {isWarnCode && (
            <div className="leave-warn-banner">
              This day is scheduled as <strong>Training</strong>. Confirm with HR before converting to leave.
            </div>
          )}

          {hasClockData && (
            <div className="leave-warn-banner">
              This day has clock data. Applying leave will clear it.
            </div>
          )}

          <div className="leave-picker-label">Select leave type</div>

          <div className="space-y-1.5">
            {LEAVE_OPTIONS.map((opt) => {
              const balRow = getBalanceForCode(opt.code, leaveRows);
              const balance = opt.noBalanceCheck ? null : (balRow?.balance ?? 0);
              const isSelected = selectedCode === opt.code;
              const zeroBalance = !opt.noBalanceCheck && balance !== null && balance <= 0;
              return (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => setSelectedCode(opt.code)}
                  className={`leave-option ${isSelected ? 'selected' : ''} ${zeroBalance ? 'zero-balance' : ''}`}
                >
                  <span
                    className="leave-option-dot"
                    style={{ background: opt.colorDot }}
                  />
                  <span className="flex-1 text-left">
                    <span className="block leave-option-label">{opt.label}</span>
                    {opt.subtitle && <span className="block leave-option-sub">{opt.subtitle}</span>}
                  </span>
                  {opt.noBalanceCheck ? (
                    <span className="leave-option-bal bal-ok">no cap</span>
                  ) : (
                    <span className={`leave-option-bal ${zeroBalance ? 'bal-warn' : 'bal-ok'}`}>
                      {formatBalance(balance)} left{zeroBalance ? ' ⚠' : ''}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* After-applying preview */}
          {selectedOption && validation && (
            <div
              className={`after-apply-box ${
                validation.ok === false
                  ? 'err'
                  : validation.ok === true && validation.warn
                  ? 'warn'
                  : 'ok'
              }`}
            >
              {validation.ok === false ? (
                validation.reason === 'no_balance' ? (
                  <>
                    No {selectedOption.label} balance remaining (
                    {formatBalance(validation.current)} days left).
                  </>
                ) : (
                  <>{validation.message || 'This leave type is not configured. Contact HR.'}</>
                )
              ) : validation.warn ? (
                <>
                  No {selectedOption.label} balance remaining. Applying anyway (leave it to HR to
                  resolve). After applying: {formatBalance(validation.after)} days remaining.
                </>
              ) : selectedOption.noBalanceCheck ? (
                <>Maternity Leave applied (no balance cap).</>
              ) : (
                <>
                  After applying: {selectedOption.label} — {formatBalance(validation.after)} days
                  remaining
                </>
              )}
            </div>
          )}

          {error && <div className="after-apply-box err">{error}</div>}

          {/* Reason (optional audit note) */}
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for leave (optional, audit record)"
            className="leave-picker-reason"
          />

          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirmDisabled}
            className="picker-confirm-btn"
          >
            {submitting ? 'Saving...' : 'Confirm Leave'}
          </button>
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="picker-cancel-btn"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};