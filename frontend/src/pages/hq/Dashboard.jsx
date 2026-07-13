import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Building, ShieldAlert, FileCheck, PhoneCall, Filter, CheckCircle2, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import api from '../../utils/api.js';
import phqImage from '../../assets/phq.jpeg';
import useAuthStore from '../../store/authStore.js';
import SearchableSelect from '../../components/forms/SearchableSelect.jsx';

// One color per year-offset-from-current (index 0 = current year), so a given year's
// line color never repaints when the Duration selection changes. Max 5 lines (Last 5 Years).
const YEAR_LINE_COLORS = ['#003087', '#7C3AED', '#059669', '#D97706', '#DC2626'];

function CrimeHeadTooltip({ active, label, payload }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-lg text-xs">
      <p className="mb-1.5 font-bold text-[#0A1628]">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-[#4A5568]">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.name}
          </span>
          <span className="font-semibold tabular-nums text-[#1A202C]">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function CrimeHeadLineChart({ rows, years }) {
  return (
    <div className="overflow-x-auto p-6">
      <div style={{ width: Math.max(1100, rows.length * 42), height: 380 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 10, right: 20, left: 0, bottom: 90 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis
              dataKey="crime_head"
              angle={-90}
              textAnchor="end"
              interval={0}
              height={110}
              tick={{ fontSize: 10, fill: '#718096' }}
              stroke="#CBD5E0"
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#718096' }} stroke="#CBD5E0" />
            <Tooltip content={<CrimeHeadTooltip />} />
            <Legend verticalAlign="top" height={36} />
            {years.map((y, i) => (
              <Line
                key={y}
                type="monotone"
                dataKey={String(y)}
                name={String(y)}
                stroke={YEAR_LINE_COLORS[i % YEAR_LINE_COLORS.length]}
                strokeWidth={i === 0 ? 3 : 2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function HQDashboard() {
  const { i18n } = useTranslation();
  const currentLng = i18n.language || 'en';
  const { user, jurisdiction } = useAuthStore();

  const [durationPresetId, setDurationPresetId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [durationPresets, setDurationPresets] = useState([]);

  useEffect(() => {
    api.get('/filters/duration-presets')
      .then((res) => {
        const raw = res.data?.data;
        if (Array.isArray(raw) && raw.length) {
          setDurationPresets(raw);
          setDurationPresetId((prev) => (prev && raw.some((p) => p.id === prev)) ? prev : raw[0].id);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch duration presets:', err);
      });
  }, []);

  const presetOptions = useMemo(() => (
    durationPresets.map((p) => ({ value: p.id, label_en: p.name_en, label_hi: p.name_hi }))
  ), [durationPresets]);

  const defaultPresetId = durationPresets[0]?.id;

  const getDistrictName = () => {
    const isHq = user?.role === 'HQ' || user?.role === 'HQ_ANALYST' || user?.role === 'HQ_ADMIN' || user?.role === 'SYSTEM_ADMIN';
    if (isHq) return "DELHI POLICE";
    const rawName = jurisdiction?.district?.name_en || user?.districtKey || "Delhi Police";
    return rawName.replace(/\s*\([^)]*\)/g, '').trim().toUpperCase();
  };

  // Fetch global metrics
  const { data: stats = {} } = useQuery({
    queryKey: ['analytics', 'overview', 'global'],
    queryFn: async () => {
      const res = await api.get('/analytics/overview');
      return res.data.data;
    },
  });

  // Fetch crime-head year-trend chart data — DB-driven duration + optional custom date range
  const { data: chartResp } = useQuery({
    queryKey: ['analytics', 'crime-head-year-trend', durationPresetId, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (durationPresetId) params.set('durationPresetId', durationPresetId);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await api.get(`/analytics/crime-head-year-trend?${params.toString()}`);
      return res.data.data;
    },
    enabled: !!durationPresetId,
    keepPreviousData: true,
  });

  const years = chartResp?.years ?? [];
  const chartRows = chartResp?.rows ?? [];
  const changeRate = chartResp?.change_rate ?? null;

  const heinousRows = chartRows.filter((r) => r.is_heinous);
  const nonHeinousRows = chartRows.filter((r) => !r.is_heinous);

  const cards = [
    { label: 'Delhi-wide FIR cases', value: (stats.cases_today || 0) , color: 'text-amber-500', icon: Building },
    { label: 'Total PCR emergency calls', value: (stats.pcr_today || 0) , color: 'text-blue-500', icon: PhoneCall },
    { label: 'Accused arrests processed', value: (stats.arrests_today || 0) , color: 'text-emerald-500', icon: FileCheck },
  ];

  const activeFilterCount = [
    defaultPresetId && durationPresetId !== defaultPresetId,
    dateFrom,
    dateTo
  ].filter(Boolean).length;

  return (
    <div className="min-h-screen theme-hq-page page-bg">

      {/* ══════════════ HERO HEADER ══════════════ */}
      <div className="relative overflow-hidden hero-banner-gradient px-8 py-8">
        <span className="user-greeting-badge text-5xl font-bold text-white/95 bg-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/15 shadow-sm">
          Hi, {currentLng === 'hi' ? (user?.name_hi || user?.name_en || user?.username) : (user?.name_en || user?.username || 'User')}
        </span>
        {/* PHQ image filling the complete dashboard background */}
        <div
          className="pointer-events-none absolute inset-0 w-full h-full"
          style={{
            backgroundImage: `url(${phqImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.65
          }}
        />
        {/* Dark overlay layer for text readability contrast */}
        <div
          className="pointer-events-none absolute inset-0 w-full h-full bg-[#0a1120]/75"
        />
        {/* Decorative blur orbs */}
        <div className="pointer-events-none absolute -top-20 -right-20 h-80 w-80 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 left-1/3 h-56 w-56 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute top-1/3 right-1/3 h-32 w-32 rounded-full bg-white/5 blur-2xl" />
        {/* Grid texture */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg,white 0,white 1px,transparent 1px,transparent 48px),repeating-linear-gradient(90deg,white 0,white 1px,transparent 1px,transparent 48px)' }}
        />

        <div className="relative z-10 mx-auto max-w-screen-xl">
          {/* Top row */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-white/80 backdrop-blur-sm">
              <Building size={12} className="text-amber-400" />
              {getDistrictName()} · HQ COMMAND CENTER
            </span>
          </div>

          {/* Heading + hero stat tiles */}
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-4xl font-bold leading-tight tracking-tight text-white">
                Delhi Police
              </h1>
              <p className="mt-1 text-xl font-semibold tracking-wide text-slate-300">
                Headquarters Command Console
              </p>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-200">
                Global command center overview — comparative metrics and operational aggregates across all 15 ranges and zones of Delhi.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <div className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1">
                  <ShieldAlert size={11} className="text-white/50" />
                  <span className="text-xs text-white/60">15 Ranges &amp; Zones</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom separator */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </div>

      {/* ══════════════ PAGE BODY ══════════════ */}
      <div className="mx-auto max-w-screen-xl px-6 pb-12">

        {/* ── Overview Stat Cards ── */}
        <div className="mt-8">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-5 w-1 rounded-full bg-gradient-to-b from-[var(--accent-color-hover)] to-[var(--accent-color)]" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#4A5568]">Operational Overview</h2>
            <div className="h-px flex-1 bg-[#E2E8F0]" />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {cards.map((card, idx) => {
              const Icon = card.icon;
              const tileBg  = idx === 0 ? 'bg-[#FFFBEB]' : idx === 1 ? 'bg-[#EFF6FF]' : 'bg-[#ECFDF5]';
              const tileBdr = idx === 0 ? 'border-[#FDE68A]' : idx === 1 ? 'border-[#BFDBFE]' : 'border-[#6EE7B7]';
              return (
                <div
                  key={idx}
                  className="group rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[var(--accent-glow)]"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-3xl font-bold tabular-nums text-[#0A1628]">{card.value}</div>
                      <div className="mt-2 text-sm font-medium text-[#4A5568]">{card.label}</div>
                    </div>
                    <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border ${tileBdr} ${tileBg} transition-transform duration-200 group-hover:scale-110 ${card.color}`}>
                      <Icon size={20} />
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-[#718096]">Delhi-wide · Last 30 days</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Scope Filters ── */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[var(--accent-glow)]">
          {/* Panel header */}
          <div className="flex items-center gap-3 border-b border-[#E2E8F0] bg-gradient-to-r from-[#F8FAFF] to-white px-6 py-4">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent-color-hover)] to-[var(--accent-color)] shadow-md shadow-blue-500/20">
              <Filter size={13} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-[#1A202C]">Scope Filters</p>
              <p className="text-xs text-[#718096]">Choose the year range and optional custom date span for the crime-head trend</p>
            </div>
            {activeFilterCount > 0 ? (
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#003087] px-3 py-1 text-xs font-semibold text-white shadow-sm">
                <CheckCircle2 size={10} />
                {activeFilterCount} active
              </span>
            ) : (
              <span className="ml-auto rounded-full border border-[#E2E8F0] bg-[#F8FAFF] px-3 py-1 text-xs font-medium text-[#718096]">
                No filters
              </span>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:flex-wrap">
            <div className="flex flex-col gap-1.5 w-full sm:w-[220px]">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#718096]">Duration</label>
              <SearchableSelect
                value={durationPresetId}
                onChange={(val) => setDurationPresetId(val)}
                options={presetOptions}
                placeholder="Select duration"
                className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFF] px-4 py-2.5 text-sm font-medium text-[#1A202C] shadow-sm outline-none"
                style={{
                  minHeight: '42px',
                  border: '1px solid #E2E8F0',
                  paddingLeft: '16px',
                  paddingRight: '20px',
                  borderRadius: '12px',
                  backgroundColor: '#F8FAFF'
                }}
              />
            </div>

            <div className="flex flex-col gap-1.5 w-full sm:w-[200px]">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#718096]">From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFF] px-4 py-2.5 text-sm font-medium text-[#1A202C] shadow-sm outline-none"
                style={{ minHeight: '42px' }}
              />
            </div>

            <div className="flex flex-col gap-1.5 w-full sm:w-[200px]">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#718096]">To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-xl border border-[#E2E8F0] bg-[#F8FAFF] px-4 py-2.5 text-sm font-medium text-[#1A202C] shadow-sm outline-none"
                style={{ minHeight: '42px' }}
              />
            </div>

            {/* Reset hint when filters are active */}
            {activeFilterCount > 0 && (
              <button
                onClick={() => {
                  if (defaultPresetId) setDurationPresetId(defaultPresetId);
                  setDateFrom('');
                  setDateTo('');
                }}
                className="self-end rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-xs font-semibold text-[#718096] shadow-sm transition-all duration-150 hover:border-[#DC2626] hover:text-[#DC2626] cursor-pointer"
                style={{ minHeight: '42px' }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* ── Crime-Head Year Trend ── */}
        <div className="mt-6 overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white shadow-sm transition-all duration-300 hover:shadow-lg hover:shadow-[#003087]/5">
          {/* Panel header */}
          <div className="relative flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] bg-gradient-to-r from-[#F8FAFF] via-white to-[#F0F4F9] px-6 py-5">
            {/* Left accent bar */}
            <div className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-gradient-to-b from-[#003087] to-[#0046C0]" />

            <div className="flex items-center gap-3 pl-4">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent-color-hover)] to-[var(--accent-color)] shadow-md shadow-blue-500/20">
                <ShieldAlert size={16} className="text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#1A202C]">Crime-Head Trend — All Districts Combined</h3>
                {changeRate && (
                  <p className="mt-0.5 text-xs text-[#718096]">
                    {changeRate.current_range.from} to {changeRate.current_range.to}
                  </p>
                )}
              </div>
            </div>

            {changeRate && (
              <span className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${changeRate.pct_change >= 0 ? 'bg-[#ECFDF5] text-[#059669] border-[#6EE7B7]' : 'bg-[#FEF2F2] text-[#DC2626] border-[#FCA5A5]'}`}>
                {changeRate.pct_change >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                {Math.abs(changeRate.pct_change)}% vs previous period
              </span>
            )}
          </div>

          {/* Heinous crime heads */}
          <div className="border-b border-[#E2E8F0] px-6 pt-4">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-[#DC2626]">
              Heinous Crime Heads · {heinousRows.length}
            </span>
          </div>
          <CrimeHeadLineChart rows={heinousRows} years={years} />

          {/* Non-heinous crime heads */}
          <div className="border-y border-[#E2E8F0] bg-[#F8FAFF] px-6 pt-4">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-[#4A5568]">
              Non-Heinous Crime Heads · {nonHeinousRows.length}
            </span>
          </div>
          <CrimeHeadLineChart rows={nonHeinousRows} years={years} />
        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center justify-center gap-2">
          <div className="h-px w-20 bg-[#E2E8F0]" />
          <p className="text-xs font-medium text-[#A0AEC0]">
            Delhi Police Command System · Data refreshes on page load · All times IST
          </p>
          <div className="h-px w-20 bg-[#E2E8F0]" />
        </div>
      </div>
    </div>
  );
}
