import React from 'react';
import { LeaveRow } from '../types/roster';
import { leaveColors } from '../utils/leaveColors';

const subtitles: Record<string, string> = {
  'Annual Leave': 'Full-day leave',
  'Casual Leave': 'Casual leave',
  'Lieu Leave': 'Earned from DOS/OT',
  'Medical Leave': 'Medical leave',
  'Short Leave': '2 per month',
};

function barPct(balance: number | null, entitlement: number | null): string {
  if (balance === null || entitlement === null || entitlement === 0) return '0%';
  return `${Math.round((balance / entitlement) * 100)}%`;
}

function useIsMobile(breakpoint = 640): boolean {
  const [matches, setMatches] = React.useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(max-width: ${breakpoint}px)`).matches : false
  );

  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = () => setMatches(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);

  return matches;
}

interface LeaveBalanceCardProps {
  year: number;
  rows: LeaveRow[];
  loading: boolean;
  onSync: () => Promise<void>;
}

export const LeaveBalanceCard: React.FC<LeaveBalanceCardProps> = ({ year, rows, loading, onSync }) => {
  const [syncing, setSyncing] = React.useState<boolean>(false);
  const isMobile = useIsMobile(640);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await onSync();
    } finally {
      setSyncing(false);
    }
  };

  const visibleRows = rows.filter((row) => row.leaveType !== 'Lieu Leave');

  const shortLeaveRow = visibleRows.find((r) => r.leaveType === 'Short Leave');
  const otherRows = visibleRows.filter((r) => r.leaveType !== 'Short Leave');

  const totals = otherRows.reduce(
    (acc, row) => {
      if (row.entitlement !== null) acc.entitlement += row.entitlement;
      if (row.balance !== null) acc.balance += row.balance;
      acc.utilized += row.utilized;
      return acc;
    },
    { entitlement: 0, balance: 0, utilized: 0 }
  );

  const SummaryCell = ({
    label,
    value,
    color,
  }: {
    label: string;
    value: number;
    color: string;
  }) => (
    <div className="summary-cell">
      <div className="summary-label">{label}</div>
      <div className="summary-num" style={{ color }}>
        {value.toFixed(2)}
      </div>
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
        <span style={{ fontWeight: 700, fontSize: 15 }}>Leave balance</span>
        <span className="leave-card-year">Jan – Dec {year}</span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          borderBottom: '1px solid var(--leave-card-border)',
        }}
      >
        <SummaryCell label="Total entitlement" value={totals.entitlement} color="#0d47a1" />
        <SummaryCell label="Remaining" value={totals.balance} color="#2e7d32" />
        <SummaryCell label="Utilized" value={totals.utilized} color="#bf360c" />
      </div>

      {isMobile ? (
        /* Mobile: stacked cards — no horizontal scroll, all data visible */
        <div className="leave-mobile-list">
          {otherRows.map((row) => (
            <div
              key={row.leaveType}
              className="leave-mobile-item"
            >
              <div className="leave-mobile-head">
                <span
                  className="leave-mobile-dot"
                  style={{ background: leaveColors[row.leaveType] }}
                />
                <div>
                  <div className="leave-mobile-title">{row.leaveType}</div>
                  <div className="leave-mobile-sub">{subtitles[row.leaveType]}</div>
                </div>
                <div className="leave-mobile-balance">
                  {row.balance !== null ? (
                    <>
                      <div className="leave-mobile-balance-num">{row.balance.toFixed(2)}</div>
                      <div className="leave-mobile-balance-label">remaining</div>
                    </>
                  ) : (
                    <span className="na-val">N/A</span>
                  )}
                </div>
              </div>

              {row.balance !== null && row.entitlement !== null && (
                <div className="bar-bg leave-mobile-bar">
                  <div
                    className="bar-fill"
                    style={{
                      width: barPct(row.balance, row.entitlement),
                      background: leaveColors[row.leaveType],
                    }}
                  />
                </div>
              )}

              <div className="leave-mobile-stats">
                <div className="leave-mobile-stat">
                  <span className="leave-mobile-stat-label">Entitlement</span>
                  <span className="leave-mobile-stat-value">
                    {row.entitlement !== null ? row.entitlement.toFixed(2) : 'N/A'}
                  </span>
                </div>
                <div className="leave-mobile-stat">
                  <span className="leave-mobile-stat-label">Utilized</span>
                  <span className="leave-mobile-stat-value">{row.utilized.toFixed(2)}</span>
                </div>
              </div>
            </div>
          ))}

          {shortLeaveRow && (
            <div className="leave-mobile-item short-leave-row">
              <div className="leave-mobile-head">
                <span
                  className="leave-mobile-dot"
                  style={{ background: leaveColors['Short Leave'] }}
                />
                <div>
                  <div className="leave-mobile-title">Short Leave</div>
                  <div className="leave-mobile-sub">2 per month</div>
                </div>
                <div className="leave-mobile-balance">
                  <div className="leave-mobile-balance-num">{shortLeaveRow.utilized.toFixed(2)}</div>
                  <div className="leave-mobile-balance-label">used</div>
                </div>
              </div>
              <div className="leave-mobile-stats">
                <div className="leave-mobile-stat">
                  <span className="leave-mobile-stat-label">Entitlement</span>
                  <span className="leave-mobile-stat-value">2.00/mo</span>
                </div>
                <div className="leave-mobile-stat">
                  <span className="leave-mobile-stat-label">Utilized</span>
                  <span className="leave-mobile-stat-value">{shortLeaveRow.utilized.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Desktop: table */
        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 480 }}>
            <thead>
              <tr style={{ background: 'var(--leave-card-head-bg)' }}>
                <th style={{ width: '40%', textAlign: 'left', padding: '10px 20px' }}>Leave type</th>
                <th style={{ width: '18%', textAlign: 'right', padding: '10px 20px' }}>Entitlement</th>
                <th style={{ width: '26%', textAlign: 'right', padding: '10px 20px' }}>Balance</th>
                <th style={{ width: '16%', textAlign: 'right', padding: '10px 20px' }}>Utilized</th>
              </tr>
            </thead>
            <tbody>
              {otherRows.map((row) => (
                <tr key={row.leaveType}>
                  <td style={{ padding: '10px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{ width: 10, height: 10, borderRadius: '50%', background: leaveColors[row.leaveType], flexShrink: 0 }}
                      />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{row.leaveType}</div>
                        <div style={{ fontSize: 11, color: 'var(--leave-card-sub-color)' }}>
                          {subtitles[row.leaveType]}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 20px', textAlign: 'right' }}>
                    {row.entitlement !== null ? (
                      row.entitlement.toFixed(2)
                    ) : (
                      <span className="na-val">N/A</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 20px' }}>
                    {row.balance !== null ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                        <span style={{ minWidth: 36, fontWeight: 600, textAlign: 'right' }}>
                          {row.balance.toFixed(2)}
                        </span>
                        <div className="bar-bg" style={{ width: 80 }}>
                          <div
                            className="bar-fill"
                            style={{
                              width: barPct(row.balance, row.entitlement),
                              background: leaveColors[row.leaveType],
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <span className="na-val">N/A</span>
                    )}
                  </td>
                  <td style={{ padding: '10px 20px', textAlign: 'right' }}>{row.utilized.toFixed(2)}</td>
                </tr>
              ))}
              {shortLeaveRow && (
                <tr className="short-leave-row">
                  <td style={{ padding: '10px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{ width: 10, height: 10, borderRadius: '50%', background: leaveColors['Short Leave'], flexShrink: 0 }}
                      />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>Short Leave</div>
                        <div style={{ fontSize: 11, color: 'var(--leave-card-sub-color)' }}>
                          2 per month
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 600 }}>
                    2.00<span style={{ fontSize: 11, fontWeight: 400, opacity: 0.6 }}>/mo</span>
                  </td>
                  <td style={{ padding: '10px 20px', textAlign: 'right' }}>
                    <span className="na-val" style={{ fontSize: 11 }}>—</span>
                  </td>
                  <td style={{ padding: '10px 20px', textAlign: 'right' }}>{shortLeaveRow.utilized.toFixed(2)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {loading && (
        <div style={{ padding: '16px 20px', fontSize: 12, color: 'var(--leave-card-sub-color)' }}>
          Loading leave balance...
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '12px 20px',
          borderTop: '1px solid var(--leave-card-border)',
        }}
      >
        <span className="footer-note">
          Short leave: 2 per month (no annual cap tracking)
        </span>
        <button className="sync-btn" onClick={handleSync} disabled={syncing}>
          ↻ Sync
        </button>
      </div>
    </div>
  );
};