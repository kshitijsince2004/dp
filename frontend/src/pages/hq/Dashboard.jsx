import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Building, Map, ShieldAlert, Award, FileCheck, PhoneCall, Filter, Radio, MapPin, Clock3, CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react';
import api from '../../utils/api.js';
import phqImage from '../../assets/phq.jpeg';
import useAuthStore from '../../store/authStore.js';

export default function HQDashboard() {
  const { t, i18n } = useTranslation();
  const currentLng = i18n.language || 'en';
  const { user, jurisdiction } = useAuthStore();
  const [filterDistrict, setFilterDistrict] = useState('All');
  const [filterType, setFilterType] = useState('All');

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

  // Fetch all compiled logs across Delhi
  const { data: records = [] } = useQuery({
    queryKey: ['records', 'all'],
    queryFn: async () => {
      const res = await api.get('/records');
      return res.data.data.cases ?? [];
    },
  });

  const cards = [
    { label: 'Delhi-wide FIR cases', value: (stats.cases_today || 0) , color: 'text-amber-500', icon: Building },
    { label: 'Total PCR emergency calls', value: (stats.pcr_today || 0) , color: 'text-blue-500', icon: PhoneCall },
    { label: 'Accused arrests processed', value: (stats.arrests_today || 0) , color: 'text-emerald-500', icon: FileCheck },
  ];

  const activeFilterCount = [filterDistrict, filterType].filter(v => v !== 'All').length;

  /* ── badge colour per record_type ── */
  const typeMeta = {
    CASE:     { bg: 'bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]',     label: 'FIR Case'   },
    ARREST:   { bg: 'bg-[#ECFDF5] text-[#059669] border-[#6EE7B7]',     label: 'Arrest'     },
    PCR_CALL: { bg: 'bg-[#EFF6FF] text-[#003087] border-[#BFDBFE]',     label: 'PCR Call'   },
    MISSING:  { bg: 'bg-[#FEF2F2] text-[#DC2626] border-[#FCA5A5]',     label: 'Missing'    },
    UIDB:     { bg: 'bg-[#F5F3FF] text-[#7C3AED] border-[#C4B5FD]',     label: 'UIDB'       },
  };

  const statusMeta = (status = '') => {
    const s = status.toUpperCase();
    if (['HQ_RECEIVED', 'CLOSED', 'COMPILED'].includes(s))
      return 'bg-[#ECFDF5] text-[#059669] border-[#6EE7B7]';
    if (['DRAFT', 'SENT_BACK_HC', 'PENDING_SHO', 'DISTRICT_REVIEW'].includes(s))
      return 'bg-[#FFFBEB] text-[#D97706] border-[#FDE68A]';
    return 'bg-[#F0F4F9] text-[#4A5568] border-[#E2E8F0]';
  };

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
              <p className="text-xs text-[#718096]">Narrow the activity feed by district or log type</p>
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
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#718096]">District</label>
              <select
                value={filterDistrict}
                onChange={(e) => setFilterDistrict(e.target.value)}
                className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFF] px-4 py-2.5 text-sm font-medium text-[#1A202C] shadow-sm outline-none transition-all duration-150 hover:border-[#003087] focus:border-[#003087] focus:ring-2 focus:ring-[#003087]/10 cursor-pointer"
              >
                <option value="All">All Districts</option>
                <option value="DIST_NDD">New Delhi District (NDD)</option>
                <option value="DIST_SD">South District (SD)</option>
                <option value="DIST_CD">Central District (CD)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-[#718096]">Log Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFF] px-4 py-2.5 text-sm font-medium text-[#1A202C] shadow-sm outline-none transition-all duration-150 hover:border-[#003087] focus:border-[#003087] focus:ring-2 focus:ring-[#003087]/10 cursor-pointer"
              >
                <option value="All">All Categories</option>
                <option value="CASE">Cases Master (FIR)</option>
                <option value="ARREST">Arrests logs</option>
                <option value="PCR_CALL">PCR emergency logs</option>
                <option value="MISSING">Missing registers</option>
                <option value="UIDB">UIDB Unidentified Bodies</option>
              </select>
            </div>

            {/* Reset hint when filters are active */}
            {activeFilterCount > 0 && (
              <button
                onClick={() => { setFilterDistrict('All'); setFilterType('All'); }}
                className="self-end rounded-xl border border-[#E2E8F0] bg-white px-4 py-2.5 text-xs font-semibold text-[#718096] shadow-sm transition-all duration-150 hover:border-[#DC2626] hover:text-[#DC2626]"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* ── Real-time Activity Feed ── */}
        <div className="mt-6 overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white shadow-sm transition-all duration-300 hover:shadow-lg hover:shadow-[#003087]/5">
          {/* Table panel header */}
          <div className="relative flex flex-wrap items-center justify-between gap-4 border-b border-[#E2E8F0] bg-gradient-to-r from-[#F8FAFF] via-white to-[#F0F4F9] px-6 py-5">
            {/* Left accent bar */}
            <div className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-gradient-to-b from-[#003087] to-[#0046C0]" />

            <div className="flex items-center gap-3 pl-4">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent-color-hover)] to-[var(--accent-color)] shadow-md shadow-blue-500/20">
                <ShieldAlert size={16} className="text-white" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#1A202C]">Real-time Jurisdiction Activity Feed</h3>
                <p className="mt-0.5 text-xs text-[#718096]">
                  Showing {Math.min(8, records.filter(r => filterType === 'All' || r.record_type === filterType).length)} of{' '}
                  {records.filter(r => filterType === 'All' || r.record_type === filterType).length} records
                  {filterType !== 'All' ? ` · ${filterType}` : ''}
                </p>
              </div>
            </div>

            {/* Type pills legend */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] px-3 py-1.5 shadow-sm">
                <Clock3 size={11} className="text-[#D97706]" />
                <span className="text-xs font-semibold text-[#D97706]">Cases</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-xl border border-[#6EE7B7] bg-[#ECFDF5] px-3 py-1.5 shadow-sm">
                <CheckCircle2 size={11} className="text-[#059669]" />
                <span className="text-xs font-semibold text-[#059669]">Arrests</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-1.5 shadow-sm">
                <PhoneCall size={11} className="text-[#003087]" />
                <span className="text-xs font-semibold text-[#003087]">PCR</span>
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFF] text-[#718096]">
                  <th className="px-5 py-3.5 pl-6 font-semibold uppercase tracking-wide">#</th>
                  <th className="px-5 py-3.5 font-semibold uppercase tracking-wide">Reference No.</th>
                  <th className="px-5 py-3.5 font-semibold uppercase tracking-wide">District</th>
                  <th className="px-5 py-3.5 font-semibold uppercase tracking-wide">Record Type</th>
                  <th className="px-5 py-3.5 font-semibold uppercase tracking-wide">Facts Gist</th>
                  <th className="px-5 py-3.5 font-semibold uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3.5 pr-6 font-semibold uppercase tracking-wide">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F4F9]">
                {records
                  .filter(r => filterType === 'All' || r.record_type === filterType)
                  .slice(0, 8)
                  .map((rec, idx) => {
                    const refId = rec.data.fir_no || rec.data.gd_no || rec.data.linked_fir_dd_no || rec.data.dd_fir_no || rec.data.uidbNumber || 'N/A';
                    const gist = rec.data.brief_facts || rec.data.call_gist || rec.data.recovered_material || rec.data.physical_description || rec.data.description || rec.data.foundPlace || 'No facts details';
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
                        {/* District */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5">
                            <MapPin size={11} className="text-[#003087] flex-shrink-0" />
                            <span className="font-medium text-[#4A5568]">New Delhi District</span>
                          </div>
                        </td>
                        {/* Record type badge */}
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold ${tMeta.bg}`}>
                            {tMeta.label}
                          </span>
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
            {records.filter(r => filterType === 'All' || r.record_type === filterType).length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F0F4F9] border border-[#E2E8F0]">
                  <AlertCircle size={24} className="text-[#718096]" />
                </div>
                <p className="text-sm font-semibold text-[#4A5568]">No records found</p>
                <p className="text-xs text-[#718096]">Try adjusting the scope filters above.</p>
              </div>
            )}
          </div>

          {/* Table footer */}
          <div className="flex items-center justify-between border-t border-[#E2E8F0] bg-[#F8FAFF] px-6 py-3">
            <p className="text-xs text-[#718096]">Showing latest 8 records · Sorted by log time</p>
            <div className="flex items-center gap-1 text-xs font-medium text-[#003087]">
              <span>View all records</span>
              <ChevronRight size={13} />
            </div>
          </div>
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