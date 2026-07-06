import React, { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import api from "../../utils/api.js";

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

// ── Static mock data — UI only, no backend wiring ──────────────────────────
const arrestTrend = [
  { day: "23 Nov", value: 23200 },
  { day: "24", value: 24800 },
  { day: "25", value: 30200 },
  { day: "26", value: 29400 },
  { day: "27", value: 33600 },
  { day: "28", value: 39400 },
  { day: "29", value: 36000 },
  { day: "29.5", value: 39800 },
  { day: "30", value: 48200 },
];

const PERIODS = ["Day", "Week", "Month"];

export default function PSDashboard() {
  const [activePeriod, setActivePeriod] = useState("Day");
  const [summary, setSummary] = useState(null);
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

  return (
    <div className="min-h-screen bg-white px-8 py-8">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#0A1628]">Dashboard</h1>

        <div className="flex items-center gap-1 rounded-xl bg-[#F3F4F6] p-1">
          {PERIODS.map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setActivePeriod(period)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
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
      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl p-6"
            style={{ backgroundColor: card.bg }}
          >
            <div className="text-sm font-medium text-[#374151]">{card.label}</div>
            <div className="mt-3 text-4xl font-bold text-[#0A1628]">{card.value}</div>
            <div className="mt-3 text-sm text-[#6B7280]">{card.change}</div>
          </div>
        ))}
      </div>

      {/* Arrest chart + Left Out Accused panel */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
        <div className="rounded-2xl border border-[#E5E7EB] p-6">
          <div className="text-sm font-bold uppercase tracking-wide text-[#0A1628]">ARREST</div>
          <div className="mt-4 h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={arrestTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#F3F0FB" vertical={false} />
                <XAxis
                  dataKey="day"
                  stroke="#A0AEC0"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                  ticks={["23 Nov", "24", "25", "26", "27", "28", "29", "30"]}
                />
                <YAxis
                  stroke="#A0AEC0"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  dx={-5}
                  domain={[20000, 50000]}
                  ticks={[25000, 30000, 35000, 40000, 45000, 50000]}
                  tickFormatter={(v) => `$${v.toLocaleString()}`}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#6C4FE0"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 6, fill: "#0A1628", stroke: "#E5DDFB", strokeWidth: 8 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl p-6" style={{ backgroundColor: "#FBE1D6" }}>
          <div className="text-base font-bold" style={{ color: "#DC5B3E" }}>
            Left Out Accused
          </div>
          <div className="mt-5 space-y-5">
            {leftOutAccused.map((accused, idx) => (
              <div key={`${accused.name}-${idx}`}>
                <div className="text-sm font-bold" style={{ color: "#DC5B3E" }}>
                  {accused.name}
                </div>
                <div className="mt-0.5 text-sm text-[#4B5563]">{accused.note}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Case Type table + Cases bar chart */}
      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-2xl border border-[#E5E7EB] p-6">
          <div className="text-base font-bold text-[#0A1628]">Case Type</div>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-[#9CA3AF]">
                <th className="pb-3 text-left font-medium">Name</th>
                <th className="pb-3 text-right font-medium">Case</th>
                <th className="pb-3 text-right font-medium">Change</th>
              </tr>
            </thead>
            <tbody>
              {caseTypeRows.map((row) => (
                <tr key={row.name} className="border-t border-[#F3F4F6]">
                  <td className="py-3 font-semibold text-[#0A1628]">{row.name}</td>
                  <td className="py-3 text-right text-[#0A1628]">{row.count}</td>
                  <td
                    className="py-3 text-right font-medium"
                    style={{ color: row.isUp ? "#059669" : "#DC2626" }}
                  >
                    {row.change}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl p-6" style={{ backgroundColor: "#F1ECFB" }}>
          <div className="text-base font-bold text-[#0A1628]">Cases</div>
          <div className="mt-4 h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={casesByMonth} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#E5DDFB" vertical={false} />
                <XAxis
                  dataKey="month"
                  stroke="#A0AEC0"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  dy={10}
                />
                <YAxis
                  stroke="#A0AEC0"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  dx={-5}
                  domain={[0, "auto"]}
                  allowDecimals={false}
                />
                <Bar dataKey="value" fill="#6C4FE0" radius={[3, 3, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
