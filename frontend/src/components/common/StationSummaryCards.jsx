import React from "react";
import { Shield, Building, PhoneCall, UserX, Layers } from "lucide-react";

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
        {
          title: "TOTAL DISTRICTS",
          value: summary.totalDistricts,
          icon: Layers,
          colorClass: "text-amber-500",
          bgClass: "bg-amber-500/10",
        },
        {
          title: "TOTAL STATIONS",
          value: summary.totalStations,
          icon: Building,
          colorClass: "text-blue-500",
          bgClass: "bg-blue-500/10",
        },
        {
          title: "TOTAL FIR CASES",
          value: summary.totalCases,
          icon: Shield,
          colorClass: "text-emerald-500",
          bgClass: "bg-emerald-500/10",
        },
        {
          title: "TOTAL ACCUSED ARRESTS",
          value: summary.totalArrests,
          icon: UserX,
          colorClass: "text-red-500",
          bgClass: "bg-red-500/10",
        },
      ]
    : [
        {
          title: "TOTAL STATIONS",
          value: summary.totalStations,
          icon: Building,
          colorClass: "text-blue-500",
          bgClass: "bg-blue-500/10",
        },
        {
          title: "TOTAL FIR CASES",
          value: summary.totalCases,
          icon: Shield,
          colorClass: "text-emerald-500",
          bgClass: "bg-emerald-500/10",
        },
        {
          title: "TOTAL PCR DISPATCHES",
          value: summary.totalPcr,
          icon: PhoneCall,
          colorClass: "text-amber-500",
          bgClass: "bg-amber-500/10",
        },
        {
          title: "TOTAL ACCUSED ARRESTS",
          value: summary.totalArrests,
          icon: UserX,
          colorClass: "text-red-500",
          bgClass: "bg-red-500/10",
        },
      ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card, idx) => {
        const Icon = card.icon;
        return (
          <div
            key={idx}
            className="card p-5 flex items-center justify-between transition-spring hover:translate-y-[-2px] border"
            style={{
              borderColor: "var(--border-light)",
              backgroundColor: "var(--bg-card)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            <div>
              <p className="text-[10px] font-bold text-slate-500 tracking-wider uppercase mb-1">
                {card.title}
              </p>
              <h3 className="text-2xl font-bold text-slate-900 tabular-numbers">
                {card.value}
              </h3>
            </div>
            <div className={`p-3 rounded-full ${card.bgClass} ${card.colorClass}`}>
              <Icon size={22} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
