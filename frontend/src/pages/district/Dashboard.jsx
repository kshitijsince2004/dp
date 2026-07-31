import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Shield, BookOpen, FileCheck, PhoneCall, TrendingUp, BarChart3, Radio, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';
import api from '../../utils/api.js';
import useAuthStore from '../../store/authStore.js';
import StatCard from '../../components/ui/StatCard.jsx';

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 15, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring", stiffness: 95, damping: 14 } }
};

const METRIC_META = {
  cases:   { color: '#cca43b', label: 'FIR Cases' },
  pcr:     { color: '#0f52ba', label: 'PCR Calls' },
  arrests: { color: '#16a34a', label: 'Arrests' },
};

const CustomTooltip = ({ active, payload, label, activeMetric }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const meta = METRIC_META[activeMetric];
    return (
      <div className="bg-white/95 backdrop-blur-md border border-slate-200 shadow-xl rounded-xl p-4 min-w-[180px] transition-all">
        <p className="text-xs font-extrabold text-slate-800 mb-2 font-display uppercase tracking-wider">{label}</p>
        <div className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: meta.color }} />
            {meta.label}
          </span>
          <span className="text-xs font-bold font-mono text-slate-800">{data[activeMetric] || 0}</span>
        </div>
      </div>
    );
  }
  return null;
};

export default function DistrictDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, jurisdiction } = useAuthStore();
  const [activeMetric, setActiveMetric] = useState('cases'); // 'cases' | 'pcr' | 'arrests'

  const getDistrictName = () => {
    const isHq = user?.role === 'HQ' || user?.role === 'HQ_ANALYST' || user?.role === 'HQ_ADMIN' || user?.role === 'SYSTEM_ADMIN';
    if (isHq) return "DELHI POLICE";
    const rawName = jurisdiction?.district?.name || user?.districtKey || "Delhi Police";
    return rawName.replace(/\s*\([^)]*\)/g, '').trim().toUpperCase();
  };

  // Fetch Analytics Overview Cards
  const { data: stats = {} } = useQuery({
    queryKey: ['analytics', 'overview'],
    queryFn: async () => {
      const res = await api.get('/analytics/overview');
      return res.data.data;
    },
  });

  // Fetch Station Breakdown Chart Data
  const { data: chartData = [] } = useQuery({
    queryKey: ['analytics', 'by-ps'],
    queryFn: async () => {
      const res = await api.get('/analytics/by-ps');
      return res.data.data;
    },
  });

  const cards = [
    { label: 'Total FIR Cases Registered', value: stats.cases_today || 0, color: 'text-amber-600', icon: Shield,    change: '+12%', isUp: true  },
    { label: 'PCR Response Dispatches',     value: stats.pcr_today   || 0, color: 'text-blue-600',  icon: PhoneCall, change: '-4%',  isUp: false },
    { label: 'Accused Arrests Filed',       value: stats.arrests_today || 0, color: 'text-emerald-600', icon: FileCheck, change: '+8%', isUp: true },
  ];

  return (
    <div className="min-h-screen theme-district-page page-bg">
 
      {/* ══════════════ HERO HEADER ══════════════ */}
      <div className="relative overflow-hidden hero-banner-gradient px-8 py-8">
        <div className="pointer-events-none absolute -top-20 -right-20 h-80 w-80 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 left-1/3 h-56 w-56 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 right-1/4 h-28 w-28 rounded-full bg-white/5 blur-2xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.15) 0%, transparent 60%), radial-gradient(circle at 20% 80%, rgba(255, 255, 255, 0.1) 0%, transparent 50%)'
          }}
        />
 
        <div className="relative z-10 mx-auto max-w-screen-xl">
          {/* Top row */}
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wide text-white/70">
            <Shield size={12} className="text-amber-400" />
            {getDistrictName()} · District DCP Console
          </div>

          {/* Heading + welcome */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-4xl font-bold leading-tight tracking-tight text-white">
                District DCP
              </h1>
              <p className="mt-1 text-xl font-medium tracking-wide text-white/40">Command Console</p>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/55">
                Aggregated operational statistics and crime logs spanning all Police Stations under district jurisdiction.
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
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="mx-auto max-w-screen-xl px-6 pb-12"
      >
 
        {/* ── Action strip ── */}
        <motion.div variants={itemVariants} className="mt-8 flex items-center justify-between">
          <h2 className="text-label font-semibold text-[#4A5568]">Operational Overview</h2>
          <button
            onClick={() => navigate('/compile')}
            className="inline-flex items-center gap-2 rounded-control bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] px-5 py-2.5 text-xs font-bold text-white transition-colors duration-200 cursor-pointer"
          >
            <BookOpen size={13} className="text-amber-300" />
            Compile Daily Logs
          </button>
        </motion.div>
 
        {/* ── Stats Cards ── */}
        <motion.div
          variants={containerVariants}
          className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3"
        >
          {cards.map((card, idx) => (
            <motion.div key={idx} variants={itemVariants}>
              <StatCard
                label={card.label}
                value={card.value}
                icon={card.icon}
                iconColor={card.color}
                trend={`${card.isUp ? '↑' : '↓'} ${card.change}`}
                trendDirection={card.isUp ? 'up' : 'down'}
                subtext="Last 30 days"
              />
            </motion.div>
          ))}
        </motion.div>
 
        {/* ── Station Chart Panel ── */}
        <motion.div
          variants={itemVariants}
          className="mt-6 overflow-hidden rounded-card border border-slate-200 bg-white"
        >
          {/* Panel header */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-3">
              <BarChart3 size={16} className="text-slate-400 shrink-0" />
              <div>
                <h3 className="text-sm font-bold text-[#1A202C]">Station-wise Operational Volume</h3>
                <p className="mt-0.5 text-meta text-[#718096]">Comparative FIR Cases · PCR Calls · Arrests across all stations</p>
              </div>
            </div>

            {/* Legend pills */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setActiveMetric('cases')}
                className={`flex items-center gap-1.5 rounded-control border px-3 py-1.5 text-meta font-bold cursor-pointer ${
                  activeMetric === 'cases'
                    ? 'border-[#D97706] bg-[#FFFBEB] text-[#D97706]'
                    : 'border-slate-200 bg-white text-slate-400'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${activeMetric === 'cases' ? 'bg-[#D97706]' : 'bg-slate-300'}`} />
                <span>FIR Cases</span>
              </button>
              <button
                onClick={() => setActiveMetric('pcr')}
                className={`flex items-center gap-1.5 rounded-control border px-3 py-1.5 text-meta font-bold cursor-pointer ${
                  activeMetric === 'pcr'
                    ? 'border-[#003087] bg-[#EFF6FF] text-[#003087]'
                    : 'border-slate-200 bg-white text-slate-400'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${activeMetric === 'pcr' ? 'bg-[#003087]' : 'bg-slate-300'}`} />
                <span>PCR Calls</span>
              </button>
              <button
                onClick={() => setActiveMetric('arrests')}
                className={`flex items-center gap-1.5 rounded-control border px-3 py-1.5 text-meta font-bold cursor-pointer ${
                  activeMetric === 'arrests'
                    ? 'border-[#059669] bg-[#ECFDF5] text-[#059669]'
                    : 'border-slate-200 bg-white text-slate-400'
                }`}
              >
                <span className={`h-2 w-2 rounded-full ${activeMetric === 'arrests' ? 'bg-[#059669]' : 'bg-slate-300'}`} />
                <span>Arrests</span>
              </button>
            </div>
          </div>

          {/* Chart */}
          <div className="p-4">
            <div className="h-[340px] w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 15, right: 10, left: -20, bottom: 20 }}>
                  <defs>
                    <linearGradient id="casesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#cca43b" />
                      <stop offset="100%" stopColor="#cca43b" stopOpacity={0.7} />
                    </linearGradient>
                    <linearGradient id="pcrGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0f52ba" />
                      <stop offset="100%" stopColor="#0f52ba" stopOpacity={0.7} />
                    </linearGradient>
                    <linearGradient id="arrestsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#16a34a" />
                      <stop offset="100%" stopColor="#16a34a" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="station"
                    stroke="#A0AEC0"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    height={70}
                    className="font-semibold"
                  />
                  <YAxis stroke="#A0AEC0" fontSize={10} tickLine={false} axisLine={false} dx={-10} allowDecimals={false} className="font-semibold" />
                  <Tooltip content={<CustomTooltip activeMetric={activeMetric} />} cursor={{ fill: '#F0F4F9', opacity: 0.6 }} />
                  <Bar
                    dataKey={activeMetric}
                    name={METRIC_META[activeMetric].label}
                    fill={`url(#${activeMetric}Grad)`}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={30}
                    className="outline-none focus:outline-none"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.div>

        {/* Footer */}
        <div className="mt-8 flex items-center justify-center gap-2">
          <div className="h-px w-20 bg-[#E2E8F0]" />
          <p className="text-meta font-medium text-[#A0AEC0]">
            Delhi Police Command System · Data refreshes on page load · All times IST
          </p>
          <div className="h-px w-20 bg-[#E2E8F0]" />
        </div>
      </motion.div>
    </div>
  );
}