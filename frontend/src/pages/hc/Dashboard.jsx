import React, { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  AreaChart,
  Area,
} from "recharts";
import api from "../../utils/api.js";

const PERIODS = ["Day", "Week", "Month"];

const STAT_CARD_META = [
  { key: "cases", label: "Cases", bg: "#CFF3DD" },
  { key: "arrests", label: "Arrest", bg: "#F1ECFB" },
  { key: "left_out", label: "Left Out accused", bg: "#FADBCF" },
];

const formatChange = (changePct, period) => {
  if (changePct === null || changePct === undefined) return "--";
  const sign = changePct > 0 ? "+" : "";
  return `${sign}${changePct}% vs previous ${period}`;
};

// No dedicated backend endpoint provides an hour-by-hour/day-by-day arrest trend yet —
// this chart stays illustrative until that's built (out of scope for the dashboard-stats work).
const arrestTrend = [
  { day: "23 Nov", value: 23200 },
  { day: "24", value: 24800 },
  { day: "25", value: 30200 },
  { day: "26", value: 29400 },
  { day: "27", value: 33600 },
  { day: "28", value: 39400 },
  { day: "29", value: 36000 },
  { day: "30", value: 48200 },
];

export default function PSDashboard() {
  const [activePeriod, setActivePeriod] = useState("Day");
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [leftOutAccused, setLeftOutAccused] = useState([]);
  const [caseTypeRows, setCaseTypeRows] = useState([]);
  const [casesByMonth, setCasesByMonth] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/analytics/ps-dashboard", { params: { period: activePeriod.toLowerCase() } })
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data;
        setSummary(data || null);
        setLeftOutAccused(
          (data?.left_out_list || []).map((a) => ({
            name: a.name,
            note: `Linked FIR No.-${a.fir_no || ""}`,
          }))
        );
      })
      .catch(() => {
        if (cancelled) return;
        setSummary(null);
        setLeftOutAccused([]);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activePeriod]);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/analytics/case-type-breakdown", { params: { period: activePeriod.toLowerCase() } })
      .then((res) => {
        if (cancelled) return;
        const rows = res.data?.data?.rows || [];
        setCaseTypeRows(
          rows.map((r) => ({
            name: r.name,
            count: r.count,
            change: `${r.change_pct > 0 ? "+" : ""}${r.change_pct}%`,
            isUp: r.change_pct >= 0,
          }))
        );
      })
      .catch(() => {
        if (cancelled) return;
        setCaseTypeRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activePeriod]);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/analytics/cases-by-month")
      .then((res) => {
        if (cancelled) return;
        setCasesByMonth(res.data?.data || []);
      })
      .catch(() => {
        if (cancelled) return;
        setCasesByMonth([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentPeriod = activePeriod.toLowerCase();
  const statCards = STAT_CARD_META.map((meta) => ({
    label: meta.label,
    bg: meta.bg,
    value: summary ? String(summary[meta.key]?.count ?? 0) : "--",
    change: summary ? formatChange(summary[meta.key]?.change_pct, currentPeriod) : "--",
  }));

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center theme-hc-page page-bg px-8 py-8">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-[#6C4FE0]" />
        <p className="mt-4 text-sm font-semibold text-[#6B7280]">Loading Dashboard statistics...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen theme-hc-page page-bg px-5 py-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#0A1628]">Dashboard</h1>

        <div className="flex items-center gap-1 rounded-xl bg-[#F3F4F6] p-0.5">
          {PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setActivePeriod(period)}
              className={`rounded-lg px-3.5 py-1 text-xs font-semibold transition-colors ${
                activePeriod === period
                  ? "bg-white text-[#0A1628] shadow-sm"
                  : "text-[#6B7280] hover:text-[#0A1628]"
              }`}
            >
              {period}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl p-4 shadow-sm border border-slate-100/80"
            style={{ backgroundColor: card.bg }}
          >
            <div className="text-xs font-semibold text-[#4B5563]">{card.label}</div>
            <div className="mt-1 text-2xl font-black text-[#0A1628]">{card.value}</div>
            <div className="mt-1 text-[11px] text-[#6B7280] font-medium">{card.change}</div>
          </div>
        ))}
      </div>

      {/* Arrest chart + Left Out Accused panel */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">
        <div className="rounded-xl p-4 shadow-sm border border-slate-100/50" style={{ backgroundColor: "#F6F3FC" }}>
          <div className="text-xs font-bold uppercase tracking-wide text-[#0A1628]">ARREST</div>
          <div className="mt-2 h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={arrestTrend} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="arrestAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.02}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="5 5" vertical={false} />
                <XAxis
                  dataKey="day"
                  stroke="#A0AEC0"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  dy={8}
                />
                <YAxis
                  stroke="#A0AEC0"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  dx={-5}
                  tickFormatter={(v) => v.toLocaleString()}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #E5E7EB",
                    borderRadius: "10px",
                    fontSize: "10px",
                    fontWeight: "bold",
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
                  }}
                  formatter={(value) => [value.toLocaleString(), "Arrests"]}
                  labelStyle={{ color: "#6B7280" }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#10B981"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#arrestAreaGrad)"
                  activeDot={{ r: 5, fill: "#10B981", stroke: "#A7F3D0", strokeWidth: 3 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl p-4 shadow-sm border border-slate-100/50" style={{ backgroundColor: "#FBE1D6" }}>
          <div className="text-xs font-bold uppercase tracking-wide" style={{ color: "#DC5B3E" }}>
            Left Out Accused
          </div>
          <div className="mt-3 space-y-3">
            {leftOutAccused.map((accused) => (
              <div key={accused.name} className="border-b border-[#FADBCF]/40 pb-2 last:border-0 last:pb-0">
                <div className="text-xs font-bold" style={{ color: "#DC5B3E" }}>
                  {accused.name}
                </div>
                <div className="mt-0.5 text-xs text-[#4B5563] font-medium leading-relaxed">{accused.note}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Case Type table + Cases bar chart */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-xl p-4 shadow-sm border border-emerald-200/80" style={{ backgroundColor: "#D8F3E5" }}>
          <div className="text-xs font-bold uppercase tracking-wide text-[#0A1628]">Case Type</div>
          <table className="mt-2 w-full text-xs">
            <thead>
              <tr className="text-[#9CA3AF]">
                <th className="pb-2 text-left font-medium">Name</th>
                <th className="pb-2 text-right font-medium">Case</th>
                <th className="pb-2 text-right font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {caseTypeRows.map((row) => (
                <tr key={row.name} className="border-t border-[#F3F4F6]/50">
                  <td className="py-2 font-semibold text-[#0A1628]">{row.name}</td>
                  <td className="py-2 text-right text-[#0A1628] font-bold">{row.count}</td>
                  <td
                    className="py-2 text-right font-bold"
                    style={{ color: row.isUp ? "#059669" : "#DC2626" }}
                  >
                    {row.change}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl p-4 shadow-sm border border-slate-100/50" style={{ backgroundColor: "#F1ECFB" }}>
          <div className="text-xs font-bold uppercase tracking-wide text-[#0A1628]">Cases</div>
          <div className="mt-2 h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={casesByMonth} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                  <linearGradient id="casesBarGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.9}/>
                    <stop offset="100%" stopColor="#C4B5FD" stopOpacity={0.25}/>
                  </linearGradient>
                  <linearGradient id="casesBarGradHover" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6C4FE0" stopOpacity={1}/>
                    <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.6}/>
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#E5DDFB" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="month"
                  stroke="#A0AEC0"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  dy={8}
                />
                <YAxis
                  stroke="#A0AEC0"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  dx={-5}
                  tickFormatter={(v) => v.toLocaleString()}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #E5E7EB",
                    borderRadius: "10px",
                    fontSize: "10px",
                    fontWeight: "bold",
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
                  }}
                  cursor={{ fill: "rgba(108, 79, 224, 0.06)", radius: [6, 6, 0, 0] }}
                  formatter={(value) => [value.toLocaleString(), "Cases"]}
                  labelStyle={{ color: "#6B7280" }}
                />
                <Bar
                  dataKey="value"
                  fill="url(#casesBarGrad)"
                  radius={[6, 6, 0, 0]}
                  maxBarSize={20}
                  activeBar={{ fill: "url(#casesBarGradHover)", stroke: "#6C4FE0", strokeWidth: 1 }}
                  animationDuration={1200}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
