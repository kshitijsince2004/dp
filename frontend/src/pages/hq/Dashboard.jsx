import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Building, ShieldAlert, FileCheck, PhoneCall, Filter, ArrowUpRight, ArrowDownRight, Layers,
  Clock3, CheckCircle2, ChevronRight, AlertCircle, MapPin, UserX
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from 'recharts';
import api from '../../utils/api.js';
import { asArray, asRecordsList } from '../../utils/dataShape.js';
import phqImage from '../../assets/phq.jpeg';
import useAuthStore from '../../store/authStore.js';
import SearchableSelect from '../../components/forms/SearchableSelect.jsx';
import RecordTypeBadge from '../../components/common/RecordTypeBadge.jsx';
import StatCard from '../../components/ui/StatCard.jsx';
import SafeResponsiveContainer from '../../components/common/SafeResponsiveContainer.jsx';
import { getCrimeHeadGroup } from '../../utils/crimeHeadGroups.js';
import { log } from '../../utils/logger.js';

const FILTER_SELECT_CLASS = 'w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-[#1A202C] min-h-[38px]';

const typeMeta = {
  CASE: { bg: 'bg-[#FEF3C7] text-[#D97706] border-[#FDE68A]', label: 'FIR Case' },
  ARREST: { bg: 'bg-[#D1FAE5] text-[#059669] border-[#6EE7B7]', label: 'Arrest' },
  PCR_CALL: { bg: 'bg-[#DBEAFE] text-[#003087] border-[#BFDBFE]', label: 'PCR Call' },
  MISSING: { bg: 'bg-[#FEE2E2] text-[#DC2626] border-[#FCA5A5]', label: 'Missing' },
  UIDB: { bg: 'bg-[#F3E8FF] text-[#7C3AED] border-[#DDD6FE]', label: 'UIDB' },
};

const statusMeta = (status) => {
  switch (status) {
    case 'HQ_RECEIVED': return 'bg-[#D1FAE5] text-[#059669] border-[#6EE7B7]';
    case 'DISTRICT_REVIEW': return 'bg-[#FEF3C7] text-[#D97706] border-[#FDE68A]';
    case 'PENDING_SHO': return 'bg-[#FEF3C7] text-[#D97706] border-[#FDE68A]';
    case 'SENT_BACK': return 'bg-[#FEE2E2] text-[#DC2626] border-[#FCA5A5]';
    case 'DRAFT': return 'bg-[#F3F4F6] text-[#4B5563] border-[#E5E7EB]';
    default: return 'bg-[#F0F4F9] text-[#4A5568] border-[#E2E8F0]';
  }
};

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
        <SafeResponsiveContainer width="100%" height="100%">
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
        </SafeResponsiveContainer>
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
  const [filterType, setFilterType] = useState('All');
  const [filterDistrict, setFilterDistrict] = useState('All');
  const [filterLocalHead, setFilterLocalHead] = useState('All');
  const [filterDuration, setFilterDuration] = useState('All');

  // Fetch real-time activity feed records
  const { data: recordsData = [] } = useQuery({
    queryKey: ['records', 'activity-feed'],
    queryFn: async () => {
      log.debug('data:load_start', { what: 'activity_feed_records' });
      try {
        const res = await api.get('/records?limit=200');
        const rows = asRecordsList(res.data?.data ?? res.data);
        log.debug('data:load_success', { what: 'activity_feed_records', count: rows.length });
        return rows;
      } catch (err) {
        log.error('data:load_error', { what: 'activity_feed_records', err });
        return [];
      }
    },
  });

  const records = asArray(recordsData);

  useEffect(() => {
    log.debug('page:mount', { route: '/hq', userId: user?.id, role: user?.role });
    return () => log.debug('page:unmount', { route: '/hq' });
  }, []);

  useEffect(() => {
    log.debug('data:load_start', { what: 'duration_presets' });
    api.get('/filters/duration-presets')
      .then((res) => {
        const raw = res.data?.data;
        if (Array.isArray(raw) && raw.length) {
          log.debug('data:load_success', { what: 'duration_presets', count: raw.length });
          setDurationPresets(raw);
          setDurationPresetId((prev) => (prev && raw.some((p) => p.id === prev)) ? prev : raw[0].id);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch duration presets:', err);
        log.error('data:load_error', { what: 'duration_presets', err });
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
      log.debug('data:load_start', { what: 'analytics_overview_global' });
      try {
        const res = await api.get('/analytics/overview');
        log.debug('data:load_success', { what: 'analytics_overview_global' });
        return res.data.data;
      } catch (err) {
        log.error('data:load_error', { what: 'analytics_overview_global', err });
        throw err;
      }
    },
  });

  // Fetch crime-head year-trend chart data — DB-driven duration + optional custom date range
  const { data: chartResp } = useQuery({
    queryKey: ['analytics', 'crime-head-year-trend', durationPresetId, dateFrom, dateTo],
    queryFn: async () => {
      log.debug('data:load_start', { what: 'crime_head_year_trend', durationPresetId, dateFrom, dateTo });
      try {
        const params = new URLSearchParams();
        if (durationPresetId) params.set('durationPresetId', durationPresetId);
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);
        const res = await api.get(`/analytics/crime-head-year-trend?${params.toString()}`);
        log.debug('data:load_success', { what: 'crime_head_year_trend' });
        return res.data.data;
      } catch (err) {
        log.error('data:load_error', { what: 'crime_head_year_trend', err });
        throw err;
      }
    },
    enabled: !!durationPresetId,
    keepPreviousData: true,
  });

  const filteredRecords = useMemo(() => {
    if (!Array.isArray(records)) return [];
    return records.filter(r => {
      if (!r) return false;
      if (filterType !== 'All' && r.record_type !== filterType) return false;
      if (filterDistrict !== 'All' && r.district_id !== filterDistrict && r.district_name !== filterDistrict) return false;
      if (filterLocalHead !== 'All') {
        const rLocalHead = r.case_local_head || r.arrest_local_head || r.call_head || r.uidb_local_head || r.local_head || r.data?.local_head || r.crime_head || r.data?.crime_head;
        if (!rLocalHead || !String(rLocalHead).toLowerCase().includes(String(filterLocalHead).toLowerCase())) return false;
      }
      if (dateFrom || dateTo) {
        const recDateStr = r.created_at || r.record_date || r.registration_date || r.data?.record_date || r.data?.date;
        if (recDateStr) {
          const recDateOnly = String(recDateStr).slice(0, 10);
          if (dateFrom && recDateOnly < dateFrom) return false;
          if (dateTo && recDateOnly > dateTo) return false;
        }
      }
      return true;
    });
  }, [records, filterType, filterDistrict, filterLocalHead, dateFrom, dateTo]);

  const years = asArray(chartResp?.years);
  const chartRows = asArray(chartResp?.rows);
  const changeRate = chartResp?.change_rate ?? null;

  const heinousRows = chartRows.filter((r) => r.is_heinous);
  const nonHeinousRows = chartRows.filter(
    (r) => !r.is_heinous && getCrimeHeadGroup({ label: r.crime_head }) === 'NON_HEINOUS'
  );

  const cards = [
    { label: 'Delhi-wide FIR cases', value: (stats.cases_today || 0) , color: 'text-amber-500', icon: Building },
    { label: 'Total PCR emergency calls', value: (stats.pcr_today || 0) , color: 'text-blue-500', icon: PhoneCall },
    { label: 'Accused arrests processed', value: (stats.arrests_today || 0) , color: 'text-emerald-500', icon: FileCheck },
    { label: 'Unarrested accused (Left Out)', value: (stats.left_out_accused || 0) , color: 'text-amber-500', icon: UserX },
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {cards.map((card, idx) => (
              <StatCard
                key={idx}
                label={card.label}
                value={card.value}
                icon={card.icon}
                iconColor={card.color}
                subtext="Delhi-wide"
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
                max={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div className="flex flex-col gap-1.5 w-full sm:w-[200px]">
              <label className="text-label font-semibold uppercase tracking-wide text-[#718096]">To Date</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className={FILTER_SELECT_CLASS}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>

            {/* Reset hint when filters are active */}
            {activeFilterCount > 0 && (
              <button
                onClick={() => {
                  log.debug('action:filters_clear', {});
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
                <h3 className="text-base font-bold text-[#1A202C]">Real-time Jurisdiction Activity Feed</h3>
                <p className="mt-0.5 text-xs text-[#718096]">
                  Showing {Math.min(8, filteredRecords.length)} of{' '}
                  {filteredRecords.length} records
                  {filterType !== 'All' ? ` · ${filterType}` : ''}
                  {filterLocalHead !== 'All' ? ` · ${filterLocalHead}` : ''}
                  {filterDuration !== 'All' ? ` · ${filterDuration}` : ''}
                </p>
              </div>
            </div>

            {/* Type pills legend & filter triggers */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setFilterType(prev => prev === 'CASE' ? 'All' : 'CASE')}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 shadow-sm transition-all cursor-pointer ${
                  filterType === 'CASE'
                    ? 'border-[#D97706] bg-[#FDE68A] text-[#92400E] ring-2 ring-[#D97706]/30 font-bold'
                    : 'border-[#FDE68A] bg-[#FFFBEB] text-[#D97706] hover:bg-[#FDE68A]/50'
                }`}
              >
                <Clock3 size={11} className="text-[#D97706]" />
                <span className="text-xs font-semibold">Cases</span>
              </button>

              <button
                type="button"
                onClick={() => setFilterType(prev => prev === 'ARREST' ? 'All' : 'ARREST')}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 shadow-sm transition-all cursor-pointer ${
                  filterType === 'ARREST'
                    ? 'border-[#059669] bg-[#6EE7B7] text-[#065F46] ring-2 ring-[#059669]/30 font-bold'
                    : 'border-[#6EE7B7] bg-[#ECFDF5] text-[#059669] hover:bg-[#6EE7B7]/50'
                }`}
              >
                <CheckCircle2 size={11} className="text-[#059669]" />
                <span className="text-xs font-semibold">Arrests</span>
              </button>

              <button
                type="button"
                onClick={() => setFilterType(prev => prev === 'PCR_CALL' ? 'All' : 'PCR_CALL')}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 shadow-sm transition-all cursor-pointer ${
                  filterType === 'PCR_CALL'
                    ? 'border-[#003087] bg-[#BFDBFE] text-[#1E3A8A] ring-2 ring-[#003087]/30 font-bold'
                    : 'border-[#BFDBFE] bg-[#EFF6FF] text-[#003087] hover:bg-[#BFDBFE]/50'
                }`}
              >
                <PhoneCall size={11} className="text-[#003087]" />
                <span className="text-xs font-semibold">PCR</span>
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFF] text-[#718096]">
                  <th className="px-5 py-3.5 pl-6 font-semibold uppercase tracking-wide">#</th>
                  <th className="px-5 py-3.5 font-semibold uppercase tracking-wide">Reference No.</th>
                  <th className="px-5 py-3.5 font-semibold uppercase tracking-wide">Police Station</th>
                  <th className="px-5 py-3.5 font-semibold uppercase tracking-wide">District</th>
                  <th className="px-5 py-3.5 font-semibold uppercase tracking-wide">Record Type</th>
                  <th className="px-5 py-3.5 font-semibold uppercase tracking-wide">Facts Gist</th>
                  <th className="px-5 py-3.5 font-semibold uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3.5 pr-6 font-semibold uppercase tracking-wide">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F4F9]">
                {filteredRecords
                  .slice(0, 8)
                  .map((rec, idx) => {
                    const firNumber = rec.fir_no || rec.arrest_fir_no || rec.data?.fir_no || rec.data?.arrest_fir_no || rec.data?.linked_fir_dd_no || rec.data?.dd_fir_no || rec.missing_fir_no || rec.data?.missing_fir_no;
                    const refId = firNumber 
                      ? (firNumber.toUpperCase().startsWith('FIR') ? firNumber : `FIR ${firNumber}`)
                      : rec.record_type === 'UIDB' 
                        ? (rec.uidb_no || rec.data?.uidb_no || rec.data?.uidbNumber ? `UIDB ${rec.uidb_no || rec.data?.uidb_no || rec.data?.uidbNumber}` : `UIDB-${rec.id?.slice(0, 8)}`)
                        : rec.record_type === 'MISSING'
                          ? `MP-${rec.id?.slice(0, 8)}`
                          : rec.record_type === 'PCR_CALL'
                            ? `PCR-${rec.id?.slice(0, 8)}`
                            : rec.legacy_ref || rec.uid || (rec.id ? rec.id.slice(0, 8) : 'N/A');
                    const gist = rec.data?.brief_facts || rec.data?.call_gist || rec.data?.recovered_material || rec.data?.physical_description || rec.data?.description || rec.data?.foundPlace || rec.case_local_head || rec.call_head || rec.arrest_local_head || rec.uidb_local_head || 'No facts details';
                    const psName = rec.ps_name || rec.data?.police_station || rec.data?.ps || 'PS Parliament Street';
                    const distName = rec.district_name || rec.data?.district || rec.districtKey || rec.district_id || 'New Delhi District';
                    const tMeta = typeMeta[rec.record_type] || { bg: 'bg-[#F0F4F9] text-[#4A5568] border-[#E2E8F0]', label: rec.record_type };
                    return (
                      <tr
                        key={idx}
                        className="group cursor-pointer transition-all duration-150 hover:bg-[#F8FAFF]"
                      >
                        {/* Row number */}
                        <td className="px-5 py-4 pl-6">
                          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#F0F4F9] text-xs font-bold text-[#718096]">
                            {idx + 1}
                          </span>
                        </td>
                        {/* Reference */}
                        <td className="px-5 py-4">
                          <span className="font-mono text-sm font-bold text-[#0A1628]">{refId}</span>
                        </td>
                        {/* Police Station */}
                        <td className="px-5 py-4 font-semibold text-[#0A1628]">
                          {psName}
                        </td>
                        {/* District */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5">
                            <MapPin size={11} className="text-[#003087] flex-shrink-0" />
                            <span className="font-medium text-[#4A5568]">
                              {distName}
                            </span>
                          </div>
                        </td>
                        {/* Record type badge */}
                        <td className="px-5 py-4">
                          <RecordTypeBadge recordType={rec.record_type} />
                        </td>
                        {/* Facts gist */}
                        <td className="max-w-[220px] px-5 py-4">
                          <p className="truncate text-[#4A5568]">{gist}</p>
                        </td>
                        {/* Status */}
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold ${statusMeta(rec.current_status)}`}>
                            {rec.current_status}
                          </span>
                        </td>
                        {/* Timestamp + chevron */}
                        <td className="px-5 py-4 pr-6">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-[#718096]">
                              {new Date(rec.created_at).toLocaleTimeString()}
                            </span>
                            <ChevronRight size={13} className="text-[#E2E8F0] transition-colors duration-150 group-hover:text-[#003087]" />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>

            {/* Empty state */}
            {filteredRecords.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0F4F9] border border-[#E2E8F0]">
                  <AlertCircle size={24} className="text-[#718096]" />
                </div>
                <p className="text-sm font-semibold text-[#4A5568]">No records found</p>
                <p className="text-xs text-[#718096]">Try adjusting the scope filters above.</p>
              </div>
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
