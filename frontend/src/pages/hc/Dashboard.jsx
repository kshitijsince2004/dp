import React, { useState, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import api from "../../utils/api.js";
import useAuthStore from "../../store/authStore.js";
import StatCard from "../../components/ui/StatCard.jsx";
import {
  FileText,
  ShieldCheck,
  AlertTriangle,
  UserX,
  Fingerprint,
  User,
  Clock3,
} from "lucide-react";

const PERIODS = ["Day", "Week", "Month"];

const STAT_CARD_META = [
  { key: "fir", label: "FIR", icon: FileText, accent: "green" },
  { key: "workout", label: "Workout", icon: Clock3, deferred: true },
  { key: "arrest_in_fir", label: "Arrest in FIR", icon: ShieldCheck, accent: "violet" },
  { key: "heinous_case", label: "Heinous Case", icon: AlertTriangle, accent: "amber" },
  { key: "leftout_heinous", label: "Leftout in Heinous Case", icon: UserX, accent: "amber" },
  { key: "kalandra", label: "Kalandra", icon: Fingerprint, accent: "blue" },
  { key: "kalandra_male", label: "Male Arrest in Kalandra", icon: User, accent: "blue" },
  { key: "kalandra_female", label: "Female Arrest in Kalandra", icon: User, accent: "rose" },
];

const ACCENT_STYLES = {
  green: { iconColor: "text-[#059669]" },
  violet: { iconColor: "text-[#7C3AED]" },
  amber: { iconColor: "text-[#D97706]" },
  blue: { iconColor: "text-[#2563EB]" },
  rose: { iconColor: "text-[#E11D48]" },
  muted: { iconColor: "text-[#94A3B8]" },
};

const formatChange = (changePct, period) => {
  if (changePct === null || changePct === undefined) return "--";
  const sign = changePct > 0 ? "+" : "";
  return `${sign}${changePct}% vs previous ${period}`;
};

const MATRIX_COLUMNS = ["FIR", "Arrest", "Kalandra", "UIDB", "Workout"];

const BREAKDOWN_CATEGORIES = [
  { key: "FIR", color: "#0EA5E9" },
  { key: "Kalandra", color: "#8B5CF6" },
  { key: "PCR", color: "#F59E0B" },
  { key: "Missing", color: "#EF4444" },
  { key: "UIDB", color: "#14B8A6" },
];

const Dot = ({ color }) => (
  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: color }} />
);

// Tooltip content branches on which of the two chart series the mouse is actually nearest to
// (see handleArrestChartMouseMove), so hovering one line only shows that line's own breakdown.
function ArrestTrendTooltip({ active, payload, label, hoveredSeries }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0].payload || {};
  const breakdown = point.breakdown || {};

  if (hoveredSeries === "arrest") {
    const totalArrests = point.arrest_value ?? 0;
    const kalandraArrests = breakdown.Kalandra ?? 0;
    const firArrests = Math.max(totalArrests - kalandraArrests, 0);
    return (
      <div className="rounded-[10px] border border-[#E5E7EB] bg-white px-3 py-2.5 text-[10px] font-bold shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="text-[#6B7280] mb-1.5">{label}</div>
        <div className="flex items-center justify-between gap-4 text-[#0A1628] pb-1.5 mb-1.5 border-b border-slate-100">
          <span className="flex items-center gap-1.5"><Dot color="#10B981" />Total Arrests</span>
          <span>{totalArrests.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-slate-500 py-0.5">
          <span className="flex items-center gap-1.5"><Dot color="#0EA5E9" />Arrest in FIR</span>
          <span>{firArrests.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between gap-4 text-slate-500 py-0.5">
          <span className="flex items-center gap-1.5"><Dot color="#8B5CF6" />Arrest in Kalandra</span>
          <span>{kalandraArrests.toLocaleString()}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[10px] border border-[#E5E7EB] bg-white px-3 py-2.5 text-[10px] font-bold shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)]">
      <div className="text-[#6B7280] mb-1.5">{label}</div>
      <div className="flex items-center justify-between gap-4 text-[#0A1628] pb-1.5 mb-1.5 border-b border-slate-100">
        <span className="flex items-center gap-1.5"><Dot color="#3B82F6" />Total (all case types)</span>
        <span>{(point.total_value ?? 0).toLocaleString()}</span>
      </div>
      {BREAKDOWN_CATEGORIES.map((c) => (
        <div key={c.key} className="flex items-center justify-between gap-4 text-slate-500 py-0.5">
          <span className="flex items-center gap-1.5">
            <Dot color={c.color} />
            {c.key}
          </span>
          <span>{(breakdown[c.key] ?? 0).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

export default function PSDashboard() {
  const { t, i18n } = useTranslation();
  const currentLng = i18n.language || 'en';
  const { user } = useAuthStore();
  const [activePeriod, setActivePeriod] = useState("Day");
  const [summary, setSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [leftOutAccused, setLeftOutAccused] = useState([]);
  const [arrestTrendData, setArrestTrendData] = useState([]);
  const [crimeHeadMatrix, setCrimeHeadMatrix] = useState({ columns: [], rows: [] });
  const [caseStatusRows, setCaseStatusRows] = useState([]);
  const [hoveredSeries, setHoveredSeries] = useState(null);
  const arrestChartWrapRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/analytics/ps-dashboard-v2", { params: { period: activePeriod.toLowerCase() } })
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data;
        setSummary(data || null);
        setLeftOutAccused(
          (data?.leftout_heinous_list || []).map((a) => ({
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
    const periodParam = activePeriod.toLowerCase();

    api
      .get("/analytics/arrest-trend-breakdown", { params: { period: periodParam } })
      .then((res) => {
        if (cancelled) return;
        setArrestTrendData(res.data?.data?.points || []);
      })
      .catch(() => {
        if (cancelled) return;
        setArrestTrendData([]);
      });

    api
      .get("/analytics/crime-head-matrix", { params: { period: periodParam } })
      .then((res) => {
        if (cancelled) return;
        setCrimeHeadMatrix(res.data?.data || { columns: [], rows: [] });
      })
      .catch(() => {
        if (cancelled) return;
        setCrimeHeadMatrix({ columns: [], rows: [] });
      });

    api
      .get("/analytics/case-status-breakdown", { params: { period: periodParam } })
      .then((res) => {
        if (cancelled) return;
        setCaseStatusRows(res.data?.data?.rows || []);
      })
      .catch(() => {
        if (cancelled) return;
        setCaseStatusRows([]);
      });

    return () => {
      cancelled = true;
    };
  }, [activePeriod]);

  const currentPeriod = activePeriod.toLowerCase();
  const statCards = STAT_CARD_META.map((meta) => {
    if (meta.deferred) {
      return {
        label: meta.label,
        value: "—",
        change: "Not yet available",
        icon: meta.icon,
        isUp: null,
        ...ACCENT_STYLES.muted,
      };
    }

    const data = summary?.[meta.key] || {};
    const count = data.count ?? 0;
    const changePct = data.change_pct ?? 0;
    const isUp = changePct >= 0;
    const style = ACCENT_STYLES[meta.accent] || ACCENT_STYLES.muted;

    return {
      label: meta.label,
      value: summary ? String(count) : "--",
      change: summary ? formatChange(changePct, currentPeriod) : "--",
      icon: meta.icon,
      isUp,
      ...style,
    };
  });

  // Highest value across both series, with headroom — used both to draw the YAxis and to
  // convert the mouse's pixel Y back into a data value in handleArrestChartMouseMove.
  const arrestChartYMax = useMemo(() => {
    const values = arrestTrendData.flatMap((d) => [d.arrest_value ?? 0, d.total_value ?? 0]);
    const max = values.length ? Math.max(...values) : 0;
    return max > 0 ? max * 1.15 : 10;
  }, [arrestTrendData]);

  const ARREST_CHART_MARGIN = { top: 10, right: 10, left: -15, bottom: 0 };

  const handleArrestChartMouseMove = (state, event) => {
    if (!state || !state.isTooltipActive || state.activeLabel === undefined || !arrestChartWrapRef.current) {
      setHoveredSeries(null);
      return;
    }
    const point = arrestTrendData.find((d) => d.label === state.activeLabel);
    if (!point) {
      setHoveredSeries(null);
      return;
    }
    const rect = arrestChartWrapRef.current.getBoundingClientRect();
    const mouseY = event.clientY - rect.top;
    const plotTop = ARREST_CHART_MARGIN.top;
    const plotBottom = rect.height - ARREST_CHART_MARGIN.bottom;
    const clampedY = Math.min(Math.max(mouseY, plotTop), plotBottom);
    const valueAtY = arrestChartYMax * (1 - (clampedY - plotTop) / (plotBottom - plotTop));
    const distArrest = Math.abs(valueAtY - (point.arrest_value ?? 0));
    const distTotal = Math.abs(valueAtY - (point.total_value ?? 0));
    setHoveredSeries(distArrest <= distTotal ? "arrest" : "total");
  };

  const handleArrestChartMouseLeave = () => setHoveredSeries(null);

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
      <div className="hero-banner-gradient px-8 pt-6 pb-8 relative overflow-hidden shadow-xl">
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
      </div>

      {/* Main Content Container */}
      <div className="mx-auto max-w-7xl px-4 py-5 space-y-4">

        {/* Key metrics strip — pulled out of the hero so 8 cards have room to breathe */}
        <div>
          <div className="text-label font-semibold uppercase tracking-wide text-[#0A1628] mb-3">Key Metrics</div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {statCards.map((card) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={card.value}
                icon={card.icon}
                iconColor={card.iconColor}
                trend={card.change}
                trendDirection={card.isUp === false ? "down" : "up"}
              />
            ))}
          </div>
        </div>

        {/* Arrest chart + Left Out Accused panel */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <div className="bg-white rounded-card p-4 border border-slate-200">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="text-label font-semibold uppercase tracking-wide text-[#0A1628]">Arrest &amp; Case Volume Trend</div>
              </div>
              <div className="flex items-center gap-3 text-meta font-semibold text-slate-500">
                <span className="flex items-center gap-1.5">
                  <Dot color="#10B981" />
                  Arrest
                </span>
                <span className="flex items-center gap-1.5">
                  <Dot color="#3B82F6" />
                  Total (all case types)
                </span>
              </div>
            </div>
            <div ref={arrestChartWrapRef} className="mt-2 h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={arrestTrendData}
                  margin={ARREST_CHART_MARGIN}
                  onMouseMove={handleArrestChartMouseMove}
                  onMouseLeave={handleArrestChartMouseLeave}
                >
                  <defs>
                    <linearGradient id="arrestAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10B981" stopOpacity={0.35}/>
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0.02}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#E2E8F0" strokeDasharray="5 5" vertical={false} />
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
                    domain={[0, arrestChartYMax]}
                    tickFormatter={(v) => v.toLocaleString()}
                  />
                  <Tooltip content={<ArrestTrendTooltip hoveredSeries={hoveredSeries} />} />
                  <Area
                    type="monotone"
                    dataKey="arrest_value"
                    stroke="#10B981"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#arrestAreaGrad)"
                    activeDot={{ r: 5, fill: "#10B981", stroke: "#A7F3D0", strokeWidth: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="total_value"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, fill: "#3B82F6", stroke: "#BFDBFE", strokeWidth: 3 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-card p-4 border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="text-label font-semibold uppercase tracking-wide text-[#0A1628]">
                Left Out Accused
              </div>
              <div className="text-meta font-semibold text-slate-400 mt-0.5">(Heinous cases only)</div>
              <div className="mt-4 space-y-3.5">
                {leftOutAccused.length === 0 && (
                  <div className="text-meta text-slate-400 font-semibold">No left out accused in heinous cases.</div>
                )}
                {leftOutAccused.map((accused) => (
                  <div key={accused.name} className="border-b border-slate-100 pb-2.5 last:border-0 last:pb-0">
                    <div className="text-body font-bold text-slate-800">
                      {accused.name}
                    </div>
                    <div className="mt-1 text-meta text-slate-400 font-semibold leading-relaxed">{accused.note}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Crime-head matrix + Case Status chart */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
          <div className="bg-white rounded-card p-4 border border-slate-200">
            <div className="text-label font-semibold uppercase tracking-wide text-[#0A1628]">Crime Head Breakdown</div>
            <div className="mt-3 max-h-[360px] overflow-y-auto overflow-x-auto">
              <table className="w-full text-body border-collapse">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-800">
                    <th className="sticky left-0 top-0 z-20 bg-slate-900 pb-2.5 pt-2 pl-2 text-left font-bold uppercase tracking-wider text-label">Crime Head</th>
                    {MATRIX_COLUMNS.map((col) => (
                      <th
                        key={col}
                        className={`sticky top-0 z-10 bg-slate-900 pb-2.5 pt-2 text-right font-bold uppercase tracking-wider text-label ${col === "Workout" ? "pr-2" : ""}`}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {crimeHeadMatrix.rows.length === 0 && (
                    <tr>
                      <td colSpan={MATRIX_COLUMNS.length + 1} className="py-6 text-center text-meta text-slate-400 font-semibold">
                        No crime-head classified records in this period.
                      </td>
                    </tr>
                  )}
                  {crimeHeadMatrix.rows.map((row) => (
                    <tr key={row.crime_head} className="border-b border-slate-100/60 last:border-0">
                      <td className="sticky left-0 z-[5] bg-white py-2.5 pl-2 font-semibold text-[#0A1628] whitespace-nowrap">{row.crime_head}</td>
                      {MATRIX_COLUMNS.map((col) => (
                        <td
                          key={col}
                          className={`py-2.5 text-right tabular-nums ${
                            row[col] === null || row[col] === undefined
                              ? "text-slate-300 italic"
                              : row[col] === 0
                              ? "text-slate-300"
                              : "font-bold text-[#0A1628]"
                          } ${col === "Workout" ? "pr-2" : ""}`}
                        >
                          {row[col] === null || row[col] === undefined ? "—" : row[col]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-card p-4 border border-slate-200">
            <div className="text-label font-semibold uppercase tracking-wide text-[#0A1628]">Case Status</div>
            <div className="mt-2 h-[230px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={caseStatusRows} margin={{ top: 10, right: 10, left: -15, bottom: 55 }}>
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
                    fontSize={9}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    angle={-40}
                    textAnchor="end"
                    height={70}
                    tickFormatter={(v) => (v && v.length > 16 ? `${v.slice(0, 16)}…` : v)}
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
                    labelFormatter={(label) => label}
                    labelStyle={{ color: "#6B7280" }}
                  />
                  <Bar
                    dataKey="count"
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
