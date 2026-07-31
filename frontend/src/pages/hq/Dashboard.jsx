import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Building, ShieldAlert, FileCheck, PhoneCall, Filter, ArrowUpRight, ArrowDownRight, Layers
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import api from '../../utils/api.js';
import phqImage from '../../assets/phq.jpeg';
import useAuthStore from '../../store/authStore.js';
import SearchableSelect from '../../components/forms/SearchableSelect.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import { getCrimeHeadGroup } from '../../utils/crimeHeadGroups.js';

const FILTER_SELECT_CLASS = 'w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-[#1A202C] min-h-[38px]';

// One color per year-offset-from-current (index 0 = current year), so a given year's
// line color never repaints when the Duration selection changes. Max 5 lines (Last 5 Years).
const YEAR_BAR_COLORS = ['#003087', '#7C3AED', '#059669', '#D97706', '#DC2626'];

function CrimeHeadBarTooltip({ active, label, payload }) {
  if (!active || !payload || !payload.length) return null;
  const total = payload.reduce((sum, entry) => sum + (Number(entry.value) || 0), 0);
  return (
    <div className="w-[180px] rounded-xl border border-[#E2E8F0] bg-white p-3 shadow-lg text-xs">
      <p className="mb-1.5 font-bold text-[#0A1628]">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: entry.color }} />
          <span className="text-[#4A5568]">{entry.name}</span>
          <span className="ml-auto font-mono font-semibold tabular-nums text-[#1A202C]">{entry.value}</span>
        </div>
      ))}
      <div className="mt-1.5 flex items-center border-t border-[#E2E8F0] pt-1.5 font-semibold text-[#1A202C]">
        Total
        <span className="ml-auto font-mono tabular-nums">{total}</span>
      </div>
    </div>
  );
}

const MIN_BAR_WIDTH = 42;
const SCROLL_THRESHOLD = 20;

function CrimeHeadBarChart({ rows, years }) {
  const needsScroll = rows.length > SCROLL_THRESHOLD;
  return (
    <div className={needsScroll ? 'overflow-x-auto p-6' : 'p-6'}>
      <div style={{ width: needsScroll ? rows.length * MIN_BAR_WIDTH : '100%', height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 10, right: 20, left: 0, bottom: 90 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
            <XAxis
              dataKey="crime_head"
              angle={-90}
              textAnchor="end"
              interval={0}
              height={110}
              tick={{ fontSize: 10, fill: '#718096' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#718096' }} tickLine={false} axisLine={false} />
            <Tooltip content={<CrimeHeadBarTooltip />} cursor={{ fill: '#F8FAFF' }} />
            <Legend verticalAlign="top" height={36} />
            {years.map((y, i) => {
              const isBottom = i === 0;
              const isTop = i === years.length - 1;
              const radius = years.length === 1 ? [4, 4, 4, 4] : isBottom ? [0, 0, 4, 4] : isTop ? [4, 4, 0, 0] : [0, 0, 0, 0];
              return (
                <Bar
                  key={y}
                  dataKey={String(y)}
                  name={String(y)}
                  stackId="a"
                  fill={YEAR_BAR_COLORS[i % YEAR_BAR_COLORS.length]}
                  radius={radius}
                />
              );
            })}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function HQDashboard() {
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
    const rawName = jurisdiction?.district?.name || user?.districtKey || "Delhi Police";
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
  // Frontend-curated Non-Heinous list (crimeHeadGroups.js), not every DB row that merely
  const nonHeinousRows = chartRows.filter(
    (r) => !r.is_heinous && getCrimeHeadGroup({ label: r.crime_head }) === 'NON_HEINOUS'
  );

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
        <div
          className="pointer-events-none absolute inset-0 w-full h-full"
          style={{
            backgroundImage: `url(${phqImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.65
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 w-full h-full bg-[#0a1120]/75"
        />
        <div className="pointer-events-none absolute -top-20 -right-20 h-80 w-80 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 left-1/3 h-56 w-56 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute top-1/3 right-1/3 h-32 w-32 rounded-full bg-white/5 blur-2xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg,white 0,white 1px,transparent 1px,transparent 48px),repeating-linear-gradient(90deg,white 0,white 1px,transparent 1px,transparent 48px)' }}
        />

        <div className="relative z-10 mx-auto max-w-screen-xl">
          {/* Top row */}
          <div className="flex items-center gap-2 mb-3 text-xs font-semibold tracking-wide text-white/70">
            <Building size={12} className="text-amber-400" />
            {getDistrictName()} · HQ Command Center
          </div>

          {/* Heading + welcome */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-4xl font-bold leading-tight tracking-tight text-white">
                Delhi Police
              </h1>
              <p className="mt-1 text-xl font-semibold tracking-wide text-slate-300">
                Headquarters Command Console
              </p>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-200">
                Global command center overview: comparative metrics and operational aggregates across all 15 ranges and zones of Delhi.
              </p>
            </div>
            <p className="text-2xl font-semibold text-white/90 m-0 text-right shrink-0">
              Welcome back, {user?.name || user?.username || 'User'}
            </p>
          </div>
        </div>

        {/* Bottom separator */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </div>

      {/* ══════════════ PAGE BODY ══════════════ */}
      <div className="mx-auto max-w-screen-xl px-6 pb-12">

        {/* ── Overview Stat Cards ── */}
        <div className="mt-8">
          <div className="mb-3 text-label font-semibold text-[#4A5568]">Operational Overview</div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {cards.map((card, idx) => (
              <StatCard
                key={idx}
                label={card.label}
                value={card.value}
                icon={card.icon}
                iconColor={card.color}
                subtext="Delhi-wide · Last 30 days"
              />
            ))}
          </div>
        </div>

        {/* ── Scope Filters ── */}
        <div className="mt-6 overflow-hidden rounded-card border border-slate-200 bg-white">
          {/* Panel header */}
          <div className="flex items-center gap-3 px-4 py-3">
            <Filter size={14} className="text-slate-400" />
            <div>
              <p className="text-sm font-bold text-[#1A202C]">Scope Filters</p>
            </div>
            <span className="ml-auto text-meta text-slate-500">
              {activeFilterCount > 0 ? `${activeFilterCount} active` : 'No filters'}
            </span>
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:flex-wrap">
            <div className="flex flex-col gap-1.5 w-full sm:w-[220px]">
              <label className="text-label font-semibold uppercase tracking-wide text-[#718096]">Duration</label>
              <SearchableSelect
                value={durationPresetId}
                onChange={(val) => setDurationPresetId(val)}
                options={presetOptions}
                placeholder="Select duration"
                className={FILTER_SELECT_CLASS}
              />
            </div>

            <div className="flex flex-col gap-1.5 w-full sm:w-[200px]">
              <label className="text-label font-semibold uppercase tracking-wide text-[#718096]">From Date</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className={FILTER_SELECT_CLASS}
              />
            </div>

            <div className="flex flex-col gap-1.5 w-full sm:w-[200px]">
              <label className="text-label font-semibold uppercase tracking-wide text-[#718096]">To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className={FILTER_SELECT_CLASS}
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
                className="self-end rounded-control border border-slate-300 bg-white px-3 py-2 text-meta font-semibold text-[#718096] transition-colors hover:border-[#DC2626] hover:text-[#DC2626] cursor-pointer"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* ── Crime-Head Year Trend ── */}
        <div className="mt-6">
          {/* Section header */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-center gap-3">
              <ShieldAlert size={16} className="text-slate-400 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-[#1A202C]">Crime Head Trend</h3>
                {changeRate && (
                  <p className="mt-0.5 text-meta text-[#718096]">
                    {changeRate.current_range.from} to {changeRate.current_range.to}
                  </p>
                )}
              </div>
            </div>

            {changeRate && (
              <span className={`ml-auto inline-flex items-center gap-1.5 text-meta font-semibold ${changeRate.pct_change >= 0 ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
                {changeRate.pct_change >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                {Math.abs(changeRate.pct_change)}% vs previous period
              </span>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            {/* Heinous crime heads */}
            <div className="overflow-hidden rounded-card border border-slate-200 bg-white">
              <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
                <ShieldAlert size={16} className="text-[#DC2626] shrink-0" />
                <p className="text-label font-semibold text-[#4A5568]">Heinous Crime Heads · {heinousRows.length}</p>
              </div>
              <CrimeHeadBarChart rows={heinousRows} years={years} />
            </div>

            {/* Non-heinous crime heads */}
            <div className="overflow-hidden rounded-card border border-slate-200 bg-white">
              <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
                <Layers size={16} className="text-[var(--accent-color)] shrink-0" />
                <p className="text-label font-semibold text-[#4A5568]">Non-Heinous Crime Heads · {nonHeinousRows.length}</p>
              </div>
              <CrimeHeadBarChart rows={nonHeinousRows} years={years} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center justify-center gap-2">
          <div className="h-px w-20 bg-[#E2E8F0]" />
          <p className="text-meta font-medium text-[#A0AEC0]">
            Delhi Police Command System · Data refreshes on page load · All times IST
          </p>
          <div className="h-px w-20 bg-[#E2E8F0]" />
        </div>
      </div>
    </div>
  );
}
