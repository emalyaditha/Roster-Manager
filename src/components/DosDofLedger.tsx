import React from 'react';
import { RosterEntry, DosDofMatch } from '../types/roster';
import { buildDosDofLedger } from '../utils/otCalculator';
import { CalendarClock, AlertTriangle, HelpCircle } from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile';

interface DosDofLedgerProps {
  entries: RosterEntry[];
}

interface LedgerRow {
  id: string;
  date: string;
  type: 'DOS' | 'DOF';
  reference: string;
  status: 'SETTLED' | 'PENDING' | 'ORPHANED_DOF';
  notes?: string;
}

const STATUS_STYLE: Record<LedgerRow['status'], { cssClass: string; label: string }> = {
  SETTLED: { cssClass: 'ledger-badge-settled', label: 'Settled' },
  PENDING: { cssClass: 'ledger-badge-pending', label: 'Pending' },
  ORPHANED_DOF: { cssClass: 'ledger-badge-orphaned', label: 'Orphaned' },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const DosDofLedger: React.FC<DosDofLedgerProps> = ({ entries }) => {
  const isMobile = useIsMobile(640);
  const ledger = React.useMemo(() => buildDosDofLedger(entries), [entries]);

  // Expand each settlement match into rows. Plain DOF days (GENERAL_DOF, i.e. a
  // standard day off with no DOS reference) are NOT part of the settlement ledger
  // and are excluded here to avoid noise.
  const rows: LedgerRow[] = React.useMemo(() => {
    const out: LedgerRow[] = [];
    ledger.matches.forEach((m: DosDofMatch, idx: number) => {
      if (m.dosCode === 'GENERAL_DOF' || m.dosDate === 'N/A') return;

      if (m.status === 'SETTLED' && m.dofDate) {
        out.push({
          id: `dos-${m.dosDate}-${idx}`,
          date: m.dosDate,
          type: 'DOS',
          reference: '—',
          status: 'SETTLED',
          notes: m.notes,
        });
        out.push({
          id: `dof-${m.dofDate}-${idx}`,
          date: m.dofDate,
          type: 'DOF',
          reference: m.dosDate,
          status: 'SETTLED',
          notes: m.notes,
        });
      } else if (m.status === 'PENDING') {
        out.push({
          id: `pend-${m.dosDate}-${idx}`,
          date: m.dosDate,
          type: 'DOS',
          reference: '—',
          status: 'PENDING',
          notes: m.notes,
        });
      } else {
        out.push({
          id: `orph-${m.dofDate || m.dosDate}-${idx}`,
          date: m.dofDate || m.dosDate,
          type: 'DOF',
          reference: m.dosDate === 'N/A' ? '—' : m.dosDate,
          status: 'ORPHANED_DOF',
          notes: m.notes,
        });
      }
    });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }, [ledger]);

  const settled = ledger.matches.filter((m) => m.status === 'SETTLED' && m.dosDate !== 'N/A').length;
  const pending = ledger.unsettledDoses.length;
  const orphaned = ledger.orphanedDofs.length;

  const Tile = ({ label, value, color }: { label: string; value: number; color: string }) => (
    <div className="summary-cell">
      <div className="summary-label">{label}</div>
      <div className="summary-num" style={{ color }}>{value}</div>
    </div>
  );

  return (
    <div className="leave-card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: '1px solid var(--leave-card-border)',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 15 }} className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          Day-Off Settlement Ledger
        </span>
        <span className="leave-card-year">
          {ledger.dosCount + ledger.dofCount} entries
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '1px solid var(--leave-card-border)' }}>
        <Tile label="DOS Worked" value={ledger.dosCount} color="#2563eb" />
        <Tile label="DOF Taken" value={ledger.dofCount} color="#dc2626" />
        <Tile label="Days Owed" value={ledger.owedBalance} color="#bf360c" />
      </div>

      {ledger.owedBalance > 0 && (
        <div className="ledger-banner banner-warn">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {ledger.owedBalance} day(s) off owed to employee — no DOF entry found yet.
        </div>
      )}
      {orphaned > 0 && (
        <div className="ledger-banner banner-err">
          <HelpCircle className="w-4 h-4 flex-shrink-0" />
          {orphaned} DOF entr{orphaned === 1 ? 'y' : 'ies'} ha{orphaned === 1 ? 's' : 've'} no matching DOS. Check the roster for data errors.
        </div>
      )}

      {isMobile ? (
        <div className="leave-mobile-list">
          {rows.length === 0 && (
            <div style={{ padding: '18px 20px', textAlign: 'center', color: 'var(--leave-card-sub-color)', fontSize: 12 }}>
              No DOS/DOF entries in this cycle.
            </div>
          )}
          {rows.map((row) => {
            const st = STATUS_STYLE[row.status];
            return (
              <div key={row.id} className="leave-mobile-item" title={row.notes}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="leave-mobile-title">{formatDate(row.date)}</div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`ledger-type type-${row.type.toLowerCase()}`}>{row.type}</span>
                    </div>
                  </div>
                  <span className={`ledger-badge shrink-0 ${st.cssClass}`}>
                    {st.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 460 }}>
            <thead>
              <tr style={{ background: 'var(--leave-card-head-bg)' }}>
                <th style={{ width: '38%', textAlign: 'left', padding: '10px 20px' }}>Date</th>
                <th style={{ width: '26%', textAlign: 'left', padding: '10px 20px' }}>Type</th>
                <th style={{ width: '36%', textAlign: 'right', padding: '10px 20px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: '18px 20px', textAlign: 'center', color: 'var(--leave-card-sub-color)', fontSize: 12 }}>
                    No DOS/DOF entries in this cycle.
                  </td>
                </tr>
              )}
              {rows.map((row) => {
                const st = STATUS_STYLE[row.status];
                return (
                  <tr key={row.id} title={row.notes}>
                    <td style={{ padding: '10px 20px', fontWeight: 600, fontSize: 13 }}>{formatDate(row.date)}</td>
                    <td style={{ padding: '10px 20px', fontSize: 12 }}>
                      <span className={`ledger-type type-${row.type.toLowerCase()}`}>{row.type}</span>
                    </td>
                    <td style={{ padding: '10px 20px', textAlign: 'right' }}>
                      <span className={`ledger-badge ${st.cssClass}`}>
                        {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};