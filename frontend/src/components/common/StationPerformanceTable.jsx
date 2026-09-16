import React, { useState, useMemo } from "react";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export default function StationPerformanceTable({
  stations = [],
  isHq = false,
  onRowClick,
}) {
  const [sortConfig, setSortConfig] = useState({ key: "cases", direction: "desc" });

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const sortedStations = useMemo(() => {
    const sortableItems = [...stations];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        // Handle string comparison for station/district names
        if (typeof valA === "string") {
          valA = valA.toLowerCase();
          valB = valB.toLowerCase();
        }

        // Handle nulls for last_activity
        if (sortConfig.key === "last_activity") {
          valA = valA ? new Date(valA).getTime() : 0;
          valB = valB ? new Date(valB).getTime() : 0;
        }

        if (valA < valB) {
          return sortConfig.direction === "asc" ? -1 : 1;
        }
        if (valA > valB) {
          return sortConfig.direction === "asc" ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [stations, sortConfig]);

  const renderSortIcon = (key) => {
    if (sortConfig.key !== key) {
      return <ArrowUpDown size={14} className="ml-1 text-slate-500 opacity-60 inline" />;
    }
    return sortConfig.direction === "asc" ? (
      <ArrowUp size={14} className="ml-1 text-amber-500 inline" />
    ) : (
      <ArrowDown size={14} className="ml-1 text-amber-500 inline" />
    );
  };

  const formatDate = (dateString) => {
    if (!dateString) return "No activity";
    const date = new Date(dateString);
    return date.toLocaleString("en-IN", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "Asia/Kolkata"
    });
  };

  return (
    <div className="overflow-hidden" style={{ backgroundColor: 'transparent' }}>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#0f172a] border-b" style={{ borderColor: 'var(--border-light)' }}>
              {isHq && (
                <th
                  onClick={() => handleSort("district_name")}
                  className="px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide cursor-pointer hover:bg-slate-800 transition-colors select-none"
                >
                  District {renderSortIcon("district_name")}
                </th>
              )}
              <th
                onClick={() => handleSort("name_en")}
                className="px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide cursor-pointer hover:bg-slate-800 transition-colors select-none"
              >
                Police Station {renderSortIcon("name_en")}
              </th>
              <th
                onClick={() => handleSort("cases")}
                className="px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide cursor-pointer hover:bg-slate-800 transition-colors select-none text-right"
              >
                Cases {renderSortIcon("cases")}
              </th>
              <th
                onClick={() => handleSort("arrests")}
                className="px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide cursor-pointer hover:bg-slate-800 transition-colors select-none text-right"
              >
                Arrests {renderSortIcon("arrests")}
              </th>
              <th
                onClick={() => handleSort("left_out")}
                className="px-5 py-3 text-xs font-bold text-amber-400 uppercase tracking-wide cursor-pointer hover:bg-slate-800 transition-colors select-none text-right"
              >
                Left Out Accused {renderSortIcon("left_out")}
              </th>
              <th
                onClick={() => handleSort("pcr")}
                className="px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide cursor-pointer hover:bg-slate-800 transition-colors select-none text-right"
              >
                PCR {renderSortIcon("pcr")}
              </th>
              <th
                onClick={() => handleSort("missing")}
                className="px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide cursor-pointer hover:bg-slate-800 transition-colors select-none text-right"
              >
                Missing {renderSortIcon("missing")}
              </th>
              <th
                onClick={() => handleSort("pending")}
                className="px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide cursor-pointer hover:bg-slate-800 transition-colors select-none text-right"
              >
                Pending {renderSortIcon("pending")}
              </th>
              <th
                onClick={() => handleSort("approved")}
                className="px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide cursor-pointer hover:bg-slate-800 transition-colors select-none text-right"
              >
                Approved {renderSortIcon("approved")}
              </th>
              <th
                onClick={() => handleSort("last_activity")}
                className="px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide cursor-pointer hover:bg-slate-800 transition-colors select-none"
              >
                Last Activity {renderSortIcon("last_activity")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-light)]">
            {sortedStations.length === 0 ? (
              <tr>
                <td colSpan={isHq ? 10 : 9} className="px-5 py-8 text-center text-sm text-slate-500">
                  No police station records match the current filters.
                </td>
              </tr>
            ) : (
              sortedStations.map((station) => (
                <tr
                  key={station.id}
                  onClick={() => onRowClick && onRowClick(station.id)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  {isHq && (
                    <td className="px-5 py-3.5 text-sm text-slate-700 font-semibold">
                      {station.district_name}
                    </td>
                  )}
                  <td className="px-5 py-3.5 text-sm text-slate-900 font-bold">
                    {station.name_en}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-600 font-bold text-right tabular-numbers">
                    {station.cases}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-600 font-bold text-right tabular-numbers">
                    {station.arrests}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-amber-600 font-bold text-right tabular-numbers">
                    {station.left_out || 0}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-600 font-bold text-right tabular-numbers">
                    {station.pcr}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-slate-600 font-bold text-right tabular-numbers">
                    {station.missing}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-amber-500 font-bold text-right tabular-numbers">
                    {station.pending}
                  </td>
                  <td className="px-5 py-3.5 text-sm text-emerald-500 font-bold text-right tabular-numbers">
                    {station.approved}
                  </td>
                  <td className="px-5 py-3.5 text-xs text-slate-500 font-mono tabular-numbers">
                    {formatDate(station.last_activity)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
