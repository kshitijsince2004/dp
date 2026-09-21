import React from "react";

// Crime heads apply only to FIR (CASE) and ARREST record types.
// UIDB, Kalandra, and MISSING have no crime-head classification.
const DEFAULT_COLUMNS = ["FIR", "Arrest", "Worked Out", "Clearance Rate"];

export default function CrimeHeadMatrixTable({ rows = [], columns = DEFAULT_COLUMNS }) {
  const formatColHeader = (col) => {
    if (col === "workout_rate_pct" || col === "Clearance Rate") return "CLEARANCE RATE";
    return String(col).toUpperCase();
  };

  return (
    <div className="max-h-[380px] overflow-y-auto overflow-x-auto rounded-xl border border-slate-200/80 shadow-xs">
      <table className="w-full text-xs text-left border-collapse min-w-[540px]">
        <thead>
          <tr className="bg-slate-900 text-white font-bold text-[11px] uppercase tracking-wider border-b border-slate-800">
            <th className="sticky left-0 top-0 z-20 bg-slate-900 px-4 py-3 text-left font-bold min-w-[160px] whitespace-nowrap shadow-[2px_0_5px_rgba(0,0,0,0.1)]">
              Crime Head
            </th>
            {columns.map((col) => (
              <th
                key={col}
                className="sticky top-0 z-10 bg-slate-900 px-4 py-3 text-right font-bold whitespace-nowrap min-w-[100px]"
              >
                {formatColHeader(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-white">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} className="py-10 text-center text-slate-400 font-medium">
                No crime-head classified records in this period.
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.crime_head} className="hover:bg-slate-50/80 transition-colors">
                <td className="sticky left-0 z-[5] bg-white py-3 px-4 font-bold text-slate-800 whitespace-nowrap flex items-center gap-2 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                  <span>{row.crime_head}</span>
                  {row.is_heinous && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-extrabold bg-rose-50 text-rose-600 border border-rose-200 uppercase tracking-wider">
                      Heinous
                    </span>
                  )}
                </td>
                {columns.map((col) => {
                  if (col === "Clearance Rate" || col === "workout_rate_pct") {
                    const rate = row.workout_rate_pct ?? (row.FIR > 0 ? Math.round(((row['Worked Out'] || 0) / row.FIR) * 100) : 0);
                    const isHigh = rate >= 60;
                    const isMed = rate >= 30 && rate < 60;
                    return (
                      <td key={col} className="py-3 px-4 text-right tabular-nums whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-2.5">
                          <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block shrink-0">
                            <div
                              className={`h-full rounded-full transition-all ${isHigh ? 'bg-emerald-500' : isMed ? 'bg-amber-500' : 'bg-slate-300'}`}
                              style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
                            />
                          </div>
                          <span className={`text-[11px] font-extrabold ${isHigh ? 'text-emerald-600' : isMed ? 'text-amber-600' : 'text-slate-500'}`}>
                            {rate}%
                          </span>
                        </div>
                      </td>
                    );
                  }

                  const val = row[col];
                  const isEmpty = val === null || val === undefined;
                  const isZero = val === 0;

                  return (
                    <td
                      key={col}
                      className={`py-3 px-4 text-right tabular-nums whitespace-nowrap ${
                        isEmpty || isZero
                          ? "text-slate-300 font-normal"
                          : "font-black text-slate-900 text-sm"
                      }`}
                    >
                      {isEmpty ? "—" : val}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
