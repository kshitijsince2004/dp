import React from "react";

export default function StationSummaryCards({
  summary = {
    totalDistricts: 0,
    totalStations: 0,
    totalCases: 0,
    totalArrests: 0,
    totalPcr: 0,
  },
  isHq = false,
}) {
  const cards = isHq
    ? [
        { title: "TOTAL DISTRICTS", value: summary.totalDistricts },
        { title: "TOTAL STATIONS", value: summary.totalStations },
        { title: "TOTAL FIR CASES", value: summary.totalCases },
        { title: "TOTAL ACCUSED ARRESTS", value: summary.totalArrests },
      ]
    : [
        { title: "TOTAL STATIONS", value: summary.totalStations },
        { title: "TOTAL FIR CASES", value: summary.totalCases },
        { title: "TOTAL PCR DISPATCHES", value: summary.totalPcr },
        { title: "TOTAL ACCUSED ARRESTS", value: summary.totalArrests },
      ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card, idx) => (
        <div
          key={idx}
          className="card p-5 border"
          style={{
            borderColor: "var(--border-light)",
            backgroundColor: "var(--bg-card)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <p className="text-[10px] font-bold text-slate-500 tracking-wider uppercase mb-1">
            {card.title}
          </p>
          <h3 className="text-2xl font-bold text-slate-900 tabular-numbers">
            {card.value}
          </h3>
        </div>
      ))}
    </div>
  );
}
