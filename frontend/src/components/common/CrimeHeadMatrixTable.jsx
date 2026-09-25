import React from "react";
import { asArray } from "../../utils/dataShape.js";

// Crime heads apply only to FIR (CASE) and ARREST record types.
// UIDB, Kalandra, and MISSING have no crime-head classification.
const DEFAULT_COLUMNS = ["FIR", "Arrest", "Worked Out", "Clearance Rate"];

const formatColHeader = (col) => {
  if (col === "workout_rate_pct" || col === "Clearance Rate") return "CLEARANCE RATE";
  return String(col).toUpperCase();
};

// Crime-head x case-type matrix table — shared by the PS dashboard and the SHO/ACP
// Analytics Console (same data shape from GET /analytics/crime-head-matrix).
export default function CrimeHeadMatrixTable({ rows, columns }) {
  const safeRows = asArray(rows);
  const safeColumns = asArray(columns).length ? asArray(columns) : DEFAULT_COLUMNS;
  const lastCol = safeColumns[safeColumns.length - 1];

  return (
    <div className="max-h-[380px] overflow-y-auto overflow-x-auto rounded-xl border border-slate-200/80 shadow-xs">
      <table className="w-full text-xs text-left border-collapse min-w-[540px]">
        <thead>
          <tr className="text-slate-500 border-b border-slate-200">
            <th className="sticky left-0 top-0 z-20 bg-slate-50 pb-2.5 pt-2 pl-2 text-left font-bold uppercase tracking-wider text-label min-w-[160px]">
              Crime Head
            </th>
            {safeColumns.map((col) => (
              <th
                key={col}
                className={`sticky top-0 z-10 bg-slate-50 pb-2.5 pt-2 text-right font-bold uppercase tracking-wider text-label whitespace-nowrap min-w-[100px] ${col === lastCol ? "pr-2" : ""}`}
              >
                {formatColHeader(col)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {safeRows.length === 0 && (
            <tr>
              <td colSpan={safeColumns.length + 1} className="py-6 text-center text-meta text-slate-400 font-semibold">
                No crime-head classified records in this period.
              </td>
            </tr>
          )}
          {safeRows.map((row) => (
            <tr key={row.crime_head} className="border-b border-slate-100/60 last:border-0">
              <td className="sticky left-0 z-[5] bg-white py-2.5 pl-2 font-semibold text-[#0A1628] whitespace-nowrap">
                <span>{row.crime_head}</span>
                {row.is_heinous && (
                  <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-50 text-rose-600 border border-rose-200 uppercase tracking-wider">
                    Heinous
                  </span>
                )}
              </td>
              {safeColumns.map((col) => {
                if (col === "Clearance Rate" || col === "workout_rate_pct") {
                  const rate = row.workout_rate_pct ?? (row.FIR > 0 ? Math.round(((row["Worked Out"] || 0) / row.FIR) * 100) : 0);
                  const isHigh = rate >= 60;
                  const isMed = rate >= 30 && rate < 60;
                  return (
                    <td key={col} className={`py-2.5 text-right tabular-nums whitespace-nowrap ${col === lastCol ? "pr-2" : ""}`}>
                      <div className="inline-flex items-center justify-end gap-2.5">
                        <div className="w-14 h-1.5 bg-slate-100 rounded-full overflow-hidden hidden sm:block shrink-0">
                          <div
                            className={`h-full rounded-full transition-all ${isHigh ? "bg-emerald-500" : isMed ? "bg-amber-500" : "bg-slate-300"}`}
                            style={{ width: `${Math.min(100, Math.max(0, rate))}%` }}
                          />
                        </div>
                        <span className={`text-[11px] font-bold ${isHigh ? "text-emerald-600" : isMed ? "text-amber-600" : "text-slate-500"}`}>
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
                    className={`py-2.5 text-right tabular-nums ${
                      isEmpty
                        ? "text-slate-300 italic"
                        : isZero
                        ? "text-slate-300"
                        : "font-bold text-[#0A1628]"
                    } ${col === lastCol ? "pr-2" : ""}`}
                  >
                    {isEmpty ? "—" : val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
