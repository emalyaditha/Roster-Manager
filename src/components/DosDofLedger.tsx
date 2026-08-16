import React from 'react';
import { RosterEntry, DosDofMatch } from '../types/roster';
import { buildDosDofLedger } from '../utils/otCalculator';
import { CalendarClock, AlertTriangle, HelpCircle } from 'lucide-react';

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

const STATUS_STYLE: Record<LedgerRow['status'], { bg: string; text: string; label: string }> = {
  SETTLED: { bg: '#e8f5e9', text: '#2e7d32', label: 'Settled' },
  PENDING: { bg: '#fff3e0', text: '#bf360c', label: 'Pending' },
  ORPHANED_DOF: { bg: '#fce4ec', text: '#880e4f', label: 'Orphaned' },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const DosDofLedger: React.FC<DosDofLedgerProps> = ({ entries }) => {
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

      <div className="overflow-x-auto">
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 460 }}>
          <thead>
            <tr style={{ background: 'var(--leave-card-head-bg)' }}>
              <th style={{ width: '32%', textAlign: 'left', padding: '10px 20px' }}>Date</th>
              <th style={{ width: '14%', textAlign: 'left', padding: '10px 20px' }}>Type</th>
              <th style={{ width: '26%', textAlign: 'left', padding: '10px 20px' }}>Reference</th>
              <th style={{ width: '28%', textAlign: 'right', padding: '10px 20px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '18px 20px', textAlign: 'center', color: 'var(--leave-card-sub-color)', fontSize: 12 }}>
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
                  <td style={{ padding: '10px 20px', fontSize: 12, color: 'var(--leave-card-sub-color)' }}>
                    {row.reference === 'N/A' || row.reference === '—' ? '—' : formatDate(row.reference)}
                  </td>
                  <td style={{ padding: '10px 20px', textAlign: 'right' }}>
                    <span className="ledger-badge" style={{ background: st.bg, color: st.text }}>
                      {st.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};