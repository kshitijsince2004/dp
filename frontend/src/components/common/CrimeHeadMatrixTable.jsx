import React from "react";

// Crime heads apply only to FIR (CASE) and ARREST record types.
// UIDB, Kalandra, and MISSING have no crime-head classification.
const DEFAULT_COLUMNS = ["FIR", "Arrest", "Worked Out"];

// Crime-head x case-type matrix table — shared by the PS dashboard and the SHO/ACP
// Analytics Console (same data shape from GET /analytics/crime-head-matrix).
export default function CrimeHeadMatrixTable({ rows = [], columns = DEFAULT_COLUMNS }) {
  const lastCol = columns[columns.length - 1];
  return (
    <div className="max-h-[360px] overflow-y-auto overflow-x-auto">
      <table className="w-full text-body border-collapse">
        <thead>
          <tr className="text-slate-400 border-b border-slate-800">
            <th className="sticky left-0 top-0 z-20 bg-slate-900 pb-2.5 pt-2 pl-2 text-left font-bold uppercase tracking-wider text-label">Crime Head</th>
            {columns.map((col) => (
              <th
                key={col}
                className={`sticky top-0 z-10 bg-slate-900 pb-2.5 pt-2 text-right font-bold uppercase tracking-wider text-label ${col === lastCol ? "pr-2" : ""}`}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + 1} className="py-6 text-center text-meta text-slate-400 font-semibold">
                No crime-head classified records in this period.
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.crime_head} className="border-b border-slate-100/60 last:border-0">
              <td className="sticky left-0 z-[5] bg-white py-2.5 pl-2 font-semibold text-[#0A1628] whitespace-nowrap">{row.crime_head}</td>
              {columns.map((col) => (
                <td
                  key={col}
                  className={`py-2.5 text-right tabular-nums ${
                    row[col] === null || row[col] === undefined
                      ? "text-slate-300 italic"
                      : row[col] === 0
                      ? "text-slate-300"
                      : "font-bold text-[#0A1628]"
                  } ${col === lastCol ? "pr-2" : ""}`}
                >
                  {row[col] === null || row[col] === undefined ? "—" : row[col]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
