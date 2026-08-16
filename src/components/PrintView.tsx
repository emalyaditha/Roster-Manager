import React from 'react';
import { RosterEntry, RosterStatusConfig, AppSettings } from '../types/roster';
import { formatDateDisplay } from '../utils/date';

interface PrintViewProps {
  entries: RosterEntry[];
  statuses: RosterStatusConfig[];
  settings: AppSettings;
  currentMonthYear: string;
}

export const PrintView: React.FC<PrintViewProps> = ({
  entries,
  statuses,
  settings,
  currentMonthYear,
}) => {
  return (
    <div className="hidden print:block p-8 bg-white text-slate-900 font-sans">
      {/* Printable Header */}
      <div className="border-b-2 border-slate-900 pb-4 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight">
            Official Roster Report — {currentMonthYear}
          </h1>
          <p className="text-sm font-semibold text-slate-600 mt-1">
            Employee: {settings.userName} | Timezone: {settings.timezone}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Generated on: {new Date().toLocaleDateString()}</div>
          <div>Roster Manager System</div>
        </div>
      </div>

      {/* Roster Table */}
      <table className="w-full text-left text-xs border-collapse border border-slate-300 mb-6">
        <thead>
          <tr className="bg-slate-100 border-b border-slate-300 font-bold uppercase text-slate-700">
            <th className="p-2 border border-slate-300">Date</th>
            <th className="p-2 border border-slate-300">Day</th>
            <th className="p-2 border border-slate-300">Original Roster</th>
            <th className="p-2 border border-slate-300">Current Active Roster</th>
            <th className="p-2 border border-slate-300">Action / Details</th>
            <th className="p-2 border border-slate-300">OT</th>
            <th className="p-2 border border-slate-300">Notes</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const isChanged = e.originalStatusId !== e.currentStatusId;
            return (
              <tr key={e.id} className={`border-b border-slate-200 ${isChanged ? 'bg-amber-50 font-medium' : ''}`}>
                <td className="p-2 border border-slate-300 font-bold">{formatDateDisplay(e.date)}</td>
                <td className="p-2 border border-slate-300">{e.day}</td>
                <td className="p-2 border border-slate-300">{e.originalStatusId}</td>
                <td className="p-2 border border-slate-300 font-bold">
                  {e.currentStatusId}
                  {isChanged && <span className="text-[10px] text-amber-700 ml-1">(Changed)</span>}
                </td>
                <td className="p-2 border border-slate-300">{e.action}</td>
                <td className="p-2 border border-slate-300 text-center">{e.ot ? 'YES' : 'NO'}</td>
                <td className="p-2 border border-slate-300 text-slate-600">{e.notes || '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Legend & Signoff */}
      <div className="grid grid-cols-2 gap-4 text-xs pt-4 border-t border-slate-300">
        <div>
          <span className="font-bold block mb-1">Status Code Legend:</span>
          <div className="flex flex-wrap gap-2 text-[10px]">
            {statuses.map((s) => (
              <span key={s.code} className="border border-slate-300 px-1.5 py-0.5 rounded">
                <strong>{s.code}</strong>: {s.displayName}
              </span>
            ))}
          </div>
        </div>

        <div className="text-right">
          <div className="mt-8 border-t border-slate-400 w-48 inline-block pt-1 text-center font-semibold">
            Signature / Approval
          </div>
        </div>
      </div>
    </div>
  );
};
