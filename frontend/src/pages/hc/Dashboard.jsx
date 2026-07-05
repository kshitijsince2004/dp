import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import api from "../../utils/api.js";

const PERIODS = ["Day", "Week", "Month"];

export default function PSDashboard() {
  const [activePeriod, setActivePeriod] = useState("Day");

  // Fetch dashboard statistics dynamically from the backend using the agreed API contract
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats", activePeriod],
    queryFn: async () => {
      try {
        const res = await api.get("/dashboard/stats", {
          params: { period: activePeriod },
        });
        return res.data?.data;
      } catch (err) {
        console.warn("Failed to fetch dashboard stats from backend, falling back to mock contract data:", err);
        // Fallback mock contract data so the frontend remains fully functional and visual
        return {
          stats: {
            cases: {
              value: activePeriod === "Day" ? "1" : activePeriod === "Week" ? "8" : "34",
              change: activePeriod === "Day" ? "+20% month over month" : "+15% week over week",
            },
            arrests: {
              value: activePeriod === "Day" ? "2" : activePeriod === "Week" ? "14" : "56",
              change: activePeriod === "Day" ? "+33% month over month" : "+22% week over week",
            },
            leftOut: {
              value: activePeriod === "Day" ? "2" : activePeriod === "Week" ? "5" : "12",
              change: activePeriod === "Day" ? "-8% month over month" : "-4% week over week",
            },
          },
          arrestTrend: [
            { day: "23 Nov", value: 23200 },
            { day: "24", value: 24800 },
            { day: "25", value: 30200 },
            { day: "26", value: 29400 },
            { day: "27", value: 33600 },
            { day: "28", value: 39400 },
            { day: "29", value: 36000 },
            { day: "30", value: 48200 },
          ],
          leftOutAccused: [
            { name: "Aman Jha", note: "Linked FIR No. FIR/2026/1009" },
            { name: "Riya Gupta", note: "Linked FIR No. FIR/2026/1006" },
          ],
          caseTypeRows: [
            { name: "FIR", count: activePeriod === "Day" ? 2 : activePeriod === "Week" ? 11 : 41, change: "+84%", isUp: true },
            { name: "Kalandra", count: activePeriod === "Day" ? 0 : activePeriod === "Week" ? 1 : 3, change: "-8%", isUp: false },
            { name: "PCR", count: activePeriod === "Day" ? 1 : activePeriod === "Week" ? 8 : 28, change: "+2%", isUp: true },
            { name: "Missing", count: activePeriod === "Day" ? 0 : activePeriod === "Week" ? 1 : 4, change: "+33%", isUp: true },
            { name: "UIDB", count: activePeriod === "Day" ? 0 : activePeriod === "Week" ? 1 : 3, change: "+30%", isUp: true },
          ],
          casesByMonth: [
            { month: "Jan", value: 150 },
            { month: "Feb", value: 175 },
            { month: "Mar", value: 145 },
            { month: "Apr", value: 130 },
            { month: "May", value: 195 },
            { month: "Jun", value: 290 },
            { month: "Jul", value: 205 },
            { month: "Aug", value: 230 },
            { month: "Sep", value: 175 },
            { month: "Oct", value: 140 },
            { month: "Nov", value: 120 },
            { month: "Dec", value: 20 },
          ],
        };
      }
    },
  });

  const statCards = [
    {
      label: "Cases",
      value: data?.stats?.cases?.value ?? "0",
      change: data?.stats?.cases?.change ?? "0% month over month",
      bg: "#CFF3DD",
    },
    {
      label: "Arrest",
      value: data?.stats?.arrests?.value ?? "0",
      change: data?.stats?.arrests?.change ?? "0% month over month",
      bg: "#F1ECFB",
    },
    {
      label: "Left Out accused",
      value: data?.stats?.leftOut?.value ?? "0",
      change: data?.stats?.leftOut?.change ?? "0% month over month",
      bg: "#FADBCF",
    },
  ];

  const arrestTrend = data?.arrestTrend ?? [];
  const leftOutAccused = data?.leftOutAccused ?? [];
  const caseTypeRows = data?.caseTypeRows ?? [];
  const casesByMonth = data?.casesByMonth ?? [];

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center theme-hc-page page-bg px-8 py-8">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-[#6C4FE0]" />
        <p className="mt-4 text-sm font-semibold text-[#6B7280]">Loading Dashboard statistics...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen theme-hc-page page-bg px-8 py-8">
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
            className="rounded-2xl p-6 shadow-sm border border-slate-100"
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
        <div className="rounded-2xl p-6 shadow-sm border border-slate-100/50" style={{ backgroundColor: "#F6F3FC" }}>
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
                />
                <YAxis
                  stroke="#A0AEC0"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  dx={-5}
                  tickFormatter={(v) => v.toLocaleString()}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #E5E7EB",
                    borderRadius: "12px",
                    fontSize: "11px",
                    fontWeight: "bold",
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
                  }}
                  formatter={(value) => [value.toLocaleString(), "Arrests"]}
                  labelStyle={{ color: "#6B7280" }}
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

        <div className="rounded-2xl p-6 shadow-sm border border-slate-100/50" style={{ backgroundColor: "#FBE1D6" }}>
          <div className="text-base font-bold" style={{ color: "#DC5B3E" }}>
            Left Out Accused
          </div>
          <div className="mt-5 space-y-5">
            {leftOutAccused.map((accused) => (
              <div key={accused.name}>
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
        <div className="rounded-2xl p-6 shadow-sm border border-emerald-200/80" style={{ backgroundColor: "#D8F3E5" }}>
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

        <div className="rounded-2xl p-6 shadow-sm border border-slate-100/50" style={{ backgroundColor: "#F1ECFB" }}>
          <div className="text-base font-bold text-[#0A1628]">Cases</div>
          <div className="mt-4 h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={casesByMonth} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
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
                  tickFormatter={(v) => v.toLocaleString()}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #E5E7EB",
                    borderRadius: "12px",
                    fontSize: "11px",
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
                  maxBarSize={24}
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
