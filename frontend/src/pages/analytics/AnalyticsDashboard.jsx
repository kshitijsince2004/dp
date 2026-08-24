import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  BarChart3, LineChart as LineIcon, PieChart as PieIcon,
  Calendar, FileText, Shield, Phone, Search, Activity,
  TrendingUp, AlertCircle, Radio,
} from 'lucide-react';
import api from '../../utils/api.js';
import useAuthStore from '../../store/authStore.js';
import StatCard from '../../components/ui/StatCard.jsx';
import CrimeHeadMatrixTable from '../../components/common/CrimeHeadMatrixTable.jsx';
import CaseStatusBarChart from '../../components/common/CaseStatusBarChart.jsx';
import CrimeHeadCategoryBarChart from '../../components/common/CrimeHeadCategoryBarChart.jsx';
import { log } from '../../utils/logger.js';

// ── Shared chart tooltip style ────────────────────────────────────────────────
const CHART_TOOLTIP = {
  contentStyle: {
    background: 'var(--bg-page-main, #F0F4F9)',
    border: '1px solid var(--border-card-theme, #E2E8F0)',
    borderRadius: '12px',
    color: 'var(--text-main-theme, #1A202C)',
    fontSize: '11px',
    boxShadow: '0 4px 24px var(--accent-glow, rgba(0,0,0,0.05))',
  },
  labelStyle: { color: 'var(--text-main-theme, #4A5568)', fontWeight: 600 },
  itemStyle:  { color: 'var(--text-main-theme, #1A202C)' },
};

const COLORS = ['#003087', '#D97706', '#059669', '#DC2626', '#7C3AED', '#0891B2', '#EA580C'];

// UI period label (toggle button value) -> backend `period` query param.
const PERIOD_PARAM_MAP = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' };

// ── Status Badge colours ───────────────────────────────────────────────────────
const STATUS_COLORS = {
  DRAFT:           'bg-[#F0F4F9]  text-[#718096] border-[#E2E8F0]',
  SENT_BACK_HC:    'bg-[#FEF2F2]  text-[#DC2626] border-[#FCA5A5]',
  PENDING_SHO:     'bg-[#FFFBEB]  text-[#D97706] border-[#FDE68A]',
  ACP_REVIEW:      'bg-[#FFF7ED]  text-[#EA580C] border-[#FDBA74]',
  DISTRICT_REVIEW: 'bg-[#EFF6FF]  text-[#003087] border-[#BFDBFE]',
  HQ_RECEIVED:     'bg-[#F5F3FF]  text-[#7C3AED] border-[#C4B5FD]',
  CLOSED:          'bg-[#ECFDF5]  text-[#059669] border-[#6EE7B7]',
  COMPILED:        'bg-[#ECFEFF]  text-[#0891B2] border-[#A5F3FC]',
};

// ── Progress bar colour per status ────────────────────────────────────────────
const STATUS_BAR = {
  DRAFT:           'bg-[#CBD5E0]',
  SENT_BACK_HC:    'bg-[#DC2626]',
  PENDING_SHO:     'bg-[#D97706]',
  ACP_REVIEW:      'bg-[#EA580C]',
  DISTRICT_REVIEW: 'bg-[var(--accent-color)]',
  HQ_RECEIVED:     'bg-[#7C3AED]',
  CLOSED:          'bg-[#059669]',
  COMPILED:        'bg-[#0891B2]',
};

export default function AnalyticsDashboard() {
  const { user, jurisdiction } = useAuthStore();
  const [period, setPeriod] = useState('monthly');

  useEffect(() => {
    log.debug('page:mount', { route: '/analytics', userId: user?.id, role: user?.role });
    return () => log.debug('page:unmount', { route: '/analytics' });
  }, []);

  const getDistrictName = () => {
    const isHq = user?.role === 'HQ' || user?.role === 'HQ_ANALYST' || user?.role === 'HQ_ADMIN' || user?.role === 'SYSTEM_ADMIN';
    if (isHq) return "DELHI POLICE";
    const rawName = jurisdiction?.district?.name || user?.districtKey || "Delhi Police";
    return rawName.replace(/\s*\([^)]*\)/g, '').trim().toUpperCase();
  };

  const getThemeClass = () => {
    const role = user?.role;
    switch (role) {
      case 'PS':
      case 'HC':
        return 'theme-hc-page';
      case 'SHO':
        return 'theme-sho-page';
      case 'ACP':
        return 'theme-acp-page';
      case 'DISTRICT':
      case 'DISTRICT_OFFICER':
        return 'theme-district-page';
      case 'HQ':
      case 'HQ_ANALYST':
      case 'HQ_ADMIN':
        return 'theme-hq-page';
      case 'SYSTEM_ADMIN':
        return 'theme-admin-page';
      default:
        return 'theme-shared-page';
    }
  };

  // ── Role-conditional panel content ────────────────────────────────────────
  const role = user?.role;
  const isSho = role === 'SHO';
  const isAcp = role === 'ACP';
  const isDcpOrHq = ['DISTRICT', 'DISTRICT_OFFICER', 'HQ', 'HQ_ANALYST', 'HQ_ADMIN'].includes(role);
  const needsCrimeHeadMatrix = isSho || isAcp || isDcpOrHq;
  const periodParam = PERIOD_PARAM_MAP[period] || 'week';

  const { data: crimeHeadMatrix = { columns: [], rows: [] } } = useQuery({
    queryKey: ['analytics', 'crime-head-matrix', periodParam],
    queryFn: async () => {
      const res = await api.get('/analytics/crime-head-matrix', { params: { period: periodParam } });
      return res.data?.data ?? { columns: [], rows: [] };
    },
    enabled: needsCrimeHeadMatrix,
  });

  const { data: caseStatusRows = [] } = useQuery({
    queryKey: ['analytics', 'case-status-breakdown', periodParam],
    queryFn: async () => {
      const res = await api.get('/analytics/case-status-breakdown', { params: { period: periodParam } });
      return res.data?.data?.rows ?? [];
    },
    enabled: isSho,
  });

  const { data: localHeads = [] } = useQuery({
    queryKey: ['fields', 'lookup', 'local-heads'],
    queryFn: async () => {
      const res = await api.get('/fields/lookup/local-heads');
      return Array.isArray(res.data?.data) ? res.data.data : [];
    },
    enabled: isDcpOrHq,
  });

  // ── 1. Summary KPI data: GET /analytics/summary ───────────────────────────
  const { data: summary = {}, isLoading: summaryLoading } = useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: async () => {
      log.debug('data:load_start', { what: 'analytics_summary' });
      try {
        const res = await api.get('/analytics/summary');
        log.debug('data:load_success', { what: 'analytics_summary' });
        return res.data?.data?.summary ?? {};
      } catch (err) {
        log.error('data:load_error', { what: 'analytics_summary', err });
        throw err;
      }
    },
  });

  // ── 2. Crime Category breakdown: GET /analytics/by-crime-head ────────────
  const { data: categoryData = [] } = useQuery({
    queryKey: ['analytics', 'by-crime-head'],
    queryFn: async () => {
      log.debug('data:load_start', { what: 'analytics_by_crime_head' });
      try {
        const res = await api.get('/analytics/by-crime-head');
        const rows = Array.isArray(res.data?.data) ? res.data.data : [];
        log.debug('data:load_success', { what: 'analytics_by_crime_head', count: rows.length });
        return rows;
      } catch (err) {
        log.error('data:load_error', { what: 'analytics_by_crime_head', err });
        throw err;
      }
    },
  });

  // ── 3. Combined time-series trends: GET /analytics/arrest-trend-breakdown ─
  const { data: trendPoints = [] } = useQuery({
    queryKey: ['analytics', 'arrest-trend-breakdown', periodParam],
    queryFn: async () => {
      const res = await api.get('/analytics/arrest-trend-breakdown', { params: { period: periodParam } });
      return res.data?.data?.points ?? [];
    },
  });

  const trendData = trendPoints.map((point) => ({
    name: point.label,
    cases: point.breakdown?.FIR ?? 0,
    pcr: point.breakdown?.PCR ?? 0,
    arrests: point.arrest_value ?? 0,
  }));

  // ── 4. Status breakdown: GET /analytics/status-breakdown ─────────────────
  const { data: statusData = [] } = useQuery({
    queryKey: ['analytics', 'status-breakdown'],
    queryFn: async () => {
      log.debug('data:load_start', { what: 'analytics_status_breakdown' });
      try {
        const res = await api.get('/analytics/status-breakdown');
        const rows = Array.isArray(res.data?.data) ? res.data.data : [];
        log.debug('data:load_success', { what: 'analytics_status_breakdown', count: rows.length });
        return rows;
      } catch (err) {
        log.error('data:load_error', { what: 'analytics_status_breakdown', err });
        throw err;
      }
    },
    enabled: !isSho && !isAcp,
  });

  // ── 5. Station comparison: GET /analytics/by-ps ──────────────────────────
  const { data: stationData = [] } = useQuery({
    queryKey: ['analytics', 'by-ps'],
    queryFn: async () => {
      log.debug('data:load_start', { what: 'analytics_by_ps' });
      try {
        const res = await api.get('/analytics/by-ps');
        const rows = Array.isArray(res.data?.data) ? res.data.data : [];
        log.debug('data:load_success', { what: 'analytics_by_ps', count: rows.length });
        return rows;
      } catch (err) {
        log.error('data:load_error', { what: 'analytics_by_ps', err });
        throw err;
      }
    },
    enabled: !isSho && !isDcpOrHq,
  });

  const kpiCards = [
    { label: 'Cases (FIR)',     value: summary.CASES,   icon: FileText, color: 'text-amber-500',   sub: 'Submitted & above' },
    { label: 'Arrests',         value: summary.ARREST,  icon: Shield,   color: 'text-emerald-500', sub: 'In workflow' },
    { label: 'PCR Calls',       value: summary.PCR,     icon: Phone,    color: 'text-blue-500',    sub: 'In workflow' },
    { label: 'Missing Persons', value: summary.MISSING, icon: Search,   color: 'text-violet-500',  sub: 'In workflow' },
  ];

  // ── Shared panel section label ─────────────────────────────────────────────
  const SectionLabel = ({ children }) => (
    <h2 className="mb-3 text-label font-semibold text-[#4A5568]">{children}</h2>
  );

  // ── Shared empty-state ─────────────────────────────────────────────────────
  const EmptyState = ({ icon: EIcon, message }) => (
    <div className="flex h-full flex-col items-center justify-center gap-3 py-12">
      <EIcon size={24} className="text-[#A0AEC0]" />
      <p className="text-meta font-medium text-[#718096]">{message}</p>
    </div>
  );

  return (
    <div className={`min-h-screen ${getThemeClass()} page-bg text-[var(--text-main-theme)]`}>

      {/* ══════════════ HERO HEADER ══════════════ */}
      <div className="relative overflow-hidden hero-banner-gradient px-8 py-8">
        {/* Decorative blur orbs */}
        <div className="pointer-events-none absolute -top-20 -right-20 h-80 w-80 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 left-1/3 h-56 w-56 rounded-full bg-[var(--accent-color)]/20 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 right-1/4 h-28 w-28 rounded-full bg-white/5 blur-2xl" />
        {/* Grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg,white 0,white 1px,transparent 1px,transparent 48px),repeating-linear-gradient(90deg,white 0,white 1px,transparent 1px,transparent 48px)' }}
        />

        <div className="relative z-10 mx-auto max-w-screen-xl">
          {/* Top row */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-white/70">
              <BarChart3 size={12} className="text-amber-400" />
              {getDistrictName()} · Operational Analytics
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
              <Radio size={11} className="animate-pulse text-emerald-400" />
              Live
            </span>
          </div>

          {/* Heading + period toggle */}
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-4xl font-bold leading-tight tracking-tight text-white">
                Operational Analytics
              </h1>
              <p className="mt-1 text-xl font-medium tracking-wide text-white/40">
                Command Console
              </p>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/55">
                Live jurisdiction-scoped metrics, category breakdowns, workflow status distribution, and station comparative performance.
              </p>
            </div>

            {/* Period toggle */}
            <div className="flex flex-shrink-0 items-center gap-1.5 self-start rounded-2xl border border-white/20 bg-white/10 p-1.5 backdrop-blur-sm lg:self-end">
              <div className="flex items-center pl-2 pr-1">
                <Calendar size={13} className="text-white/50" />
              </div>
              {['daily', 'weekly', 'monthly', 'yearly'].map((p) => (
                <button
                  key={p}
                  onClick={() => { log.debug('action:period_change', { period: p }); setPeriod(p); }}
                  className={`rounded-xl px-4 py-1.5 text-xs font-semibold capitalize cursor-pointer transition-all duration-150 ${
                    period === p
                      ? 'bg-white text-[var(--text-accent)] shadow-sm'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom separator */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </div>

      {/* ══════════════ PAGE BODY ══════════════ */}
      <div className="mx-auto max-w-screen-xl px-6 pb-12">

        {/* ── KPI Cards ── */}
        <div className="mt-8">
          <SectionLabel>Summary KPIs</SectionLabel>
          {summaryLoading ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-28 animate-pulse rounded-card border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/60" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {kpiCards.map((card) => (
                <StatCard
                  key={card.label}
                  label={card.label}
                  value={card.value ?? '—'}
                  icon={card.icon}
                  iconColor={card.color}
                  subtext={card.sub}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Main Charts Row ── */}
        <div className="mt-8">
          <SectionLabel>Incident Analysis</SectionLabel>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

            {/* Crime Head Breakdown — Donut */}
            <div className="overflow-hidden rounded-card border border-[var(--border-card-theme)] bg-white">
              <div className="flex items-center gap-3 border-b border-[var(--border-card-theme)] px-4 py-3">
                <PieIcon size={16} className="text-[var(--text-main-theme)] opacity-50 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-[var(--text-main-theme)]">Heinous Offence Ratios</p>
                  <p className="text-meta text-[var(--text-main-theme)] opacity-70">Heinous offence breakdown · Donut view</p>
                </div>
              </div>
              <div className="p-4">
                {categoryData.length === 0 ? (
                  <EmptyState icon={AlertCircle} message="No category data available" />
                ) : (
                  <div className="h-[280px] w-full flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={categoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={65}
                          outerRadius={95}
                          paddingAngle={4}
                          dataKey="count"
                          nameKey="name"
                        >
                          {categoryData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip {...CHART_TOOLTIP} />
                        <Legend wrapperStyle={{ fontSize: '10px', color: '#718096' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            {/* Combined Time-Series Trends — Line */}
            <div className="overflow-hidden rounded-card border border-[var(--border-card-theme)] bg-white">
              <div className="flex items-center gap-3 border-b border-[var(--border-card-theme)] px-4 py-3">
                <LineIcon size={16} className="text-[var(--text-main-theme)] opacity-50 shrink-0" />
                <div>
                  <p className="text-sm font-bold text-[var(--text-main-theme)]">Daily Activity Timeline</p>
                  <p className="text-meta text-[var(--text-main-theme)] opacity-70">Combined trends · {period} view</p>
                </div>
              </div>
              <div className="p-4">
                {trendData.length === 0 ? (
                  <EmptyState icon={TrendingUp} message="No trend data available" />
                ) : (
                  <div className="h-[280px] w-full pt-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey="name" stroke="#A0AEC0" fontSize={9} tickLine={false} />
                        <YAxis stroke="#A0AEC0" fontSize={10} tickLine={false} allowDecimals={false} />
                        <Tooltip {...CHART_TOOLTIP} />
                        <Legend wrapperStyle={{ fontSize: '10px', color: '#718096' }} />
                        <Line type="monotone" dataKey="cases"   name="FIR Cases" stroke="#D97706" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#D97706' }} />
                        <Line type="monotone" dataKey="pcr"     name="PCR Calls" stroke="var(--accent-color)" strokeWidth={2}   dot={false} activeDot={{ r: 4, fill: 'var(--accent-color)' }} />
                        <Line type="monotone" dataKey="arrests" name="Arrests"   stroke="#059669" strokeWidth={2}   dot={false} activeDot={{ r: 4, fill: '#059669' }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom Row: Status + Station Bar ── */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Workflow Status Distribution — Crime Head Breakdown for SHO/ACP */}
          <div className="overflow-hidden rounded-card border border-[var(--border-card-theme)] bg-white">
            {(isSho || isAcp) ? (
              <>
                <div className="flex items-center gap-3 border-b border-[var(--border-card-theme)] px-4 py-3">
                  <Activity size={16} className="text-[var(--text-main-theme)] opacity-50 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-[var(--text-main-theme)]">Crime Head Breakdown</p>
                    <p className="text-meta text-[var(--text-main-theme)] opacity-70">
                      {isAcp ? 'All stations in sub-division · FIR / Arrest / Kalandra / UIDB / Workout' : 'FIR / Arrest / Kalandra / UIDB / Workout'}
                    </p>
                  </div>
                </div>
                <div className="p-4">
                  {crimeHeadMatrix.rows.length === 0 ? (
                    <EmptyState icon={AlertCircle} message="No crime-head classified records in this period" />
                  ) : (
                    <CrimeHeadMatrixTable rows={crimeHeadMatrix.rows} columns={crimeHeadMatrix.columns} />
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-[var(--border-card-theme)] px-4 py-3">
                  <Activity size={16} className="text-[var(--text-main-theme)] opacity-50 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-[var(--text-main-theme)]">Workflow Status Distribution</p>
                    <p className="text-meta text-[var(--text-main-theme)] opacity-70">{statusData.length} status stages · All record types</p>
                  </div>
                </div>
                <div className="p-4">
                  {statusData.length === 0 ? (
                    <EmptyState icon={AlertCircle} message="No status data available" />
                  ) : (
                    <div className="max-h-[240px] space-y-3 overflow-y-auto pr-1 pt-1">
                      {statusData.map((row) => {
                        const total = statusData.reduce((s, r) => s + r.count, 0) || 1;
                        const pct = Math.round((row.count / total) * 100);
                        const cls = STATUS_COLORS[row.status] || 'bg-[#F0F4F9] text-[#718096] border-[#E2E8F0]';
                        const bar = STATUS_BAR[row.status]  || 'bg-[var(--accent-color)]';
                        return (
                          <div key={row.status} className="flex items-center gap-3 px-2 py-1.5 text-meta">
                            <span className={`inline-flex w-36 flex-shrink-0 justify-center rounded-control border px-2 py-1 text-label font-bold ${cls}`}>
                              {row.status}
                            </span>
                            <div className="flex-1 h-2 overflow-hidden rounded-full bg-[var(--bg-page-main)]">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ${bar}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="w-10 text-right font-mono font-semibold tabular-nums text-[var(--text-main-theme)]">
                              {row.count}
                            </span>
                            <span className="w-8 text-right font-mono text-[var(--text-main-theme)] opacity-60">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Station Comparative Performance — Case Status (SHO) / Crime Head Category (DCP/HQ) */}
          <div className="overflow-hidden rounded-card border border-[var(--border-card-theme)] bg-white">
            {isSho ? (
              <>
                <div className="flex items-center gap-3 border-b border-[var(--border-card-theme)] px-4 py-3">
                  <BarChart3 size={16} className="text-[var(--text-main-theme)] opacity-50 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-[var(--text-main-theme)]">Case Status</p>
                    <p className="text-meta text-[var(--text-main-theme)] opacity-70">Domain case status · This station</p>
                  </div>
                </div>
                <div className="p-4">
                  {caseStatusRows.length === 0 ? (
                    <EmptyState icon={AlertCircle} message="No case status data available" />
                  ) : (
                    <CaseStatusBarChart data={caseStatusRows} />
                  )}
                </div>
              </>
            ) : isDcpOrHq ? (
              <>
                <div className="flex items-center gap-3 border-b border-[var(--border-card-theme)] px-4 py-3">
                  <BarChart3 size={16} className="text-[var(--text-main-theme)] opacity-50 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-[var(--text-main-theme)]">Crime Head Category Performance</p>
                    <p className="text-meta text-[var(--text-main-theme)] opacity-70">Reported vs Workout · Heinous / Non-Heinous / Other IPC / Act</p>
                  </div>
                </div>
                <div className="p-4">
                  <CrimeHeadCategoryBarChart localHeads={localHeads} matrixRows={crimeHeadMatrix.rows} />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-[var(--border-card-theme)] px-4 py-3">
                  <BarChart3 size={16} className="text-[var(--text-main-theme)] opacity-50 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-[var(--text-main-theme)]">Station Comparative Performance</p>
                    <p className="text-meta text-[var(--text-main-theme)] opacity-70">Top {Math.min(8, stationData.length)} stations · Cases, Arrests, PCR</p>
                  </div>
                </div>
                <div className="p-4">
                  {stationData.length === 0 ? (
                    <EmptyState icon={AlertCircle} message="No station data available" />
                  ) : (
                    <div className="h-[240px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stationData.slice(0, 8)} margin={{ top: 4, right: 4, left: -20, bottom: 30 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                          <XAxis
                            dataKey="station"
                            stroke="#A0AEC0"
                            fontSize={8}
                            tickLine={false}
                            angle={-35}
                            textAnchor="end"
                            interval={0}
                          />
                          <YAxis stroke="#A0AEC0" fontSize={10} tickLine={false} />
                          <Tooltip {...CHART_TOOLTIP} />
                          <Legend wrapperStyle={{ fontSize: '10px', color: '#718096' }} />
                          <Bar dataKey="cases"   name="Cases"   fill="#D97706" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="arrests" name="Arrests" fill="#059669" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="pcr"     name="PCR"     fill="var(--accent-color)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center justify-center gap-2">
          <div className="h-px w-20 bg-[var(--border-card-theme)]" />
          <p className="text-meta font-medium text-[var(--text-main-theme)] opacity-60">
            Delhi Police Command System · Data refreshes on page load · All times IST
          </p>
          <div className="h-px w-20 bg-[var(--border-card-theme)]" />
        </div>
      </div>
    </div>
  );
}