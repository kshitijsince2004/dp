import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
import useAuthStore from "../../store/authStore.js";
import { FileText, Shield, UserX } from "lucide-react";

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

export default function PSDashboard() {
  const { t, i18n } = useTranslation();
  const currentLng = i18n.language || 'en';
  const { user } = useAuthStore();
  const [activePeriod, setActivePeriod] = useState("Day");
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [leftOutAccused, setLeftOutAccused] = useState([]);
  const [caseTypeRows, setCaseTypeRows] = useState([]);
  const [casesByMonth, setCasesByMonth] = useState([]);
  const [arrestTrend, setArrestTrend] = useState([]);

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
    const periodParam = activePeriod.toLowerCase();
    api
      .get("/analytics/cases-by-month", { params: { period: periodParam } })
      .then((res) => {
        if (cancelled) return;
        setCasesByMonth(res.data?.data || []);
      })
      .catch(() => {
        if (cancelled) return;
        setCasesByMonth([]);
      });

    api
      .get("/analytics/arrests-trend", { params: { period: periodParam } })
      .then((res) => {
        if (cancelled) return;
        setArrestTrend(res.data?.data || []);
      })
      .catch(() => {
        if (cancelled) return;
        setArrestTrend([]);
      });

    return () => {
      cancelled = true;
    };
  }, [activePeriod]);

  const currentPeriod = activePeriod.toLowerCase();
  const statCards = STAT_CARD_META.map((meta) => {
    const data = summary?.[meta.key] || {};
    const count = data.count ?? 0;
    const changePct = data.change_pct ?? 0;
    const isUp = changePct >= 0;

    let icon = FileText;
    let iconColor = "text-[#059669]";
    let iconBg = "bg-[#ECFDF5]";
    let iconBorder = "border-[#A7F3D0]";

    if (meta.key === 'arrests') {
      icon = Shield;
      iconColor = "text-[#7C3AED]";
      iconBg = "bg-[#F5F3FF]";
      iconBorder = "border-[#C084FC]";
    } else if (meta.key === 'left_out') {
      icon = UserX;
      iconColor = "text-[#D97706]";
      iconBg = "bg-[#FFFBEB]";
      iconBorder = "border-[#FDE68A]";
    }

    const badgeClass = isUp
      ? "bg-[#ECFDF5] text-[#059669] border-[#6EE7B7]"
      : "bg-[#FEF2F2] text-[#DC2626] border-[#FCA5A5]";

    return {
      label: meta.label,
      bg: meta.bg,
      value: summary ? String(count) : "--",
      change: summary ? formatChange(changePct, currentPeriod) : "--",
      icon,
      iconColor,
      iconBg,
      iconBorder,
      badgeClass,
    };
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center theme-hc-page page-bg px-8 py-8">
        <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-[#6C4FE0]" />
        <p className="mt-4 text-sm font-semibold text-[#6B7280]">Loading Dashboard statistics...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen theme-hc-page page-bg">
      {/* Hero Banner Header */}
      <div className="hero-banner-gradient px-8 pt-6 pb-10 relative overflow-hidden shadow-xl">
        <span className="user-greeting-badge text-3xl font-bold text-white/95 bg-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/15 shadow-sm">
          Hi, {currentLng === 'hi' ? (user?.name || user?.username) : (user?.name || user?.username || 'User')}
        </span>
        <div className="absolute -top-10 -right-10 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-40 h-40 bg-white/5 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mt-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-white flex items-center gap-3 m-0">
              {t('nav.dashboard', 'Dashboard')}
            </h1>
            <p className="text-sm text-white/70 font-medium m-0">
              {t('common.dashboardSubtitle', 'Monitor and analyze your station activities and crime metrics.')}
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-white/10 backdrop-blur-md border border-white/15 p-0.5">
            {PERIODS.map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setActivePeriod(period)}
                className={`rounded-lg px-3.5 py-1 text-xs font-semibold transition-colors ${
                  activePeriod === period
                    ? "bg-white text-[#0A1628] shadow-sm"
                    : "text-white/80 hover:text-white"
                }`}
              >
                {period}
              </button>
            ))}
          </div>
        </div>

        {/* White Stat Cards inside the banner */}
        <div className="relative z-10 grid grid-cols-1 gap-5 md:grid-cols-3 mt-8">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="bg-white rounded-2xl p-5 border border-white/20 text-slate-800 shadow-xl hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 flex items-center justify-between group cursor-pointer"
            >
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {card.label}
                </span>
                <div className="text-3xl font-extrabold tracking-tight text-slate-800">
                  {card.value}
                </div>
                <div className="pt-1">
                  <span className={`inline-flex items-center text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${card.badgeClass}`}>
                    {card.change}
                  </span>
                </div>
              </div>
              <div className={`p-3.5 rounded-xl border ${card.iconBg} ${card.iconBorder} ${card.iconColor} shadow-inner transform group-hover:scale-110 transition-transform duration-300`}>
                <card.icon size={22} className="stroke-[2.2]" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Container */}
      <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">

        {/* Arrest chart + Left Out Accused panel */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
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
                    allowDecimals={false}
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

          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-wide text-[#0A1628]">
                Left Out Accused
              </div>
              <div className="mt-4 space-y-3.5">
                {leftOutAccused.map((accused) => (
                  <div key={accused.name} className="border-b border-slate-100 pb-2.5 last:border-0 last:pb-0">
                    <div className="text-xs font-bold text-slate-800">
                      {accused.name}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400 font-semibold leading-relaxed">{accused.note}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Case Type table + Cases bar chart */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-wide text-[#0A1628]">Case Type</div>
            <table className="mt-3 w-full text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-slate-100">
                  <th className="pb-2.5 text-left font-bold uppercase tracking-wider text-[10px]">Name</th>
                  <th className="pb-2.5 text-right font-bold uppercase tracking-wider text-[10px]">Case</th>
                  <th className="pb-2.5 text-right font-bold uppercase tracking-wider text-[10px]">Change</th>
                </tr>
              </thead>
              <tbody>
                {caseTypeRows.map((row) => (
                  <tr key={row.name} className="border-b border-slate-100/60 last:border-0">
                    <td className="py-3 font-semibold text-[#0A1628]">{row.name}</td>
                    <td className="py-3 text-right text-[#0A1628] font-bold">{row.count}</td>
                    <td
                      className="py-3 text-right font-bold"
                      style={{ color: row.isUp ? "#059669" : "#DC2626" }}
                    >
                      {row.change}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
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
                  <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
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
                    allowDecimals={false}
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
    </div>
  );
}
