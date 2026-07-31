import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area
} from 'recharts';
import {
  Building, PhoneCall, FileCheck, ArrowRight, ShieldAlert,
  Award, Filter, Calendar, MapPin, ChevronRight, TrendingUp, AlertTriangle, X, UserX
} from 'lucide-react';
import api from '../../utils/api.js';
import useAuthStore from '../../store/authStore.js';
import { Spinner } from '../../components/ui/Spinner.jsx';

// Formats a Date to 'YYYY-MM-DD' using local date parts — record_date from the
// API is a plain DATE string with no timezone, so comparisons must avoid the
// UTC shift that toISOString() can introduce.
function toDateStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function DistrictAnalyticsDashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [timeframe, setTimeframe] = useState('Daily'); // 'Daily' | 'Weekly' | 'Monthly'
  const [activeMetric, setActiveMetric] = useState('total'); // 'total' | 'cases' | 'arrests' | 'pcr' | 'missing'
  const [selectedDistrictId, setSelectedDistrictId] = useState(null);
  const trendSectionRef = useRef(null);

  // Fetch nodes and raw records to support dynamic client-side timeframe aggregations
  const { data: rawNodes = [], isLoading: loadingNodes } = useQuery({
    queryKey: ['hierarchy', 'nodes'],
    queryFn: async () => {
      const res = await api.get('/hierarchy/nodes');
      return res.data?.data || [];
    }
  });

  const { data: rawRecords = [], isLoading: loadingRecords } = useQuery({
    queryKey: ['records', 'all'],
    queryFn: async () => {
      const res = await api.get('/records');
      return res.data?.data?.cases || res.data?.data || [];
    }
  });

  // Filter districts list
  const districts = useMemo(() => {
    return rawNodes.filter(n => n.node_type === 'DISTRICT');
  }, [rawNodes]);

  // Client-side date filter based on Daily, Weekly, Monthly toggles
  const filteredRecords = useMemo(() => {
    const baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0);
    const todayStr = toDateStr(baseDate);

    return rawRecords.filter(r => {
      // Must be submitted or compiled status to show in analytics
      if (!['submitted', 'PENDING_SHO', 'DISTRICT_REVIEW', 'HQ_RECEIVED', 'CLOSED', 'COMPILED'].includes(r.current_status)) {
        return false;
      }

      const recordDate = new Date(r.record_date);
      // Days in the past relative to today; negative (future-dated) records
      // fall outside the trend chart's day buckets, so exclude them here too
      // to keep the stat tiles and the graph in agreement.
      const diffDays = Math.floor((baseDate - recordDate) / (1000 * 60 * 60 * 24));

      if (timeframe === 'Daily') {
        return r.record_date === todayStr;
      } else if (timeframe === 'Weekly') {
        return diffDays >= 0 && diffDays <= 7;
      } else if (timeframe === 'Monthly') {
        return diffDays >= 0 && diffDays <= 30;
      } else if (timeframe === 'Yearly') {
        return diffDays >= 0 && diffDays <= 365;
      }
      return true;
    });
  }, [rawRecords, timeframe]);

  // Aggregate stats per district
  const districtData = useMemo(() => {
    const statsMap = {};
    districts.forEach(d => {
      statsMap[d.id] = {
        id: d.id,
        name: d.name_en || d.name,
        name_hi: d.name_hi || d.name,
        cases: 0,
        arrests: 0,
        pcr: 0,
        missing: 0,
        total: 0
      };
    });

    filteredRecords.forEach(r => {
      const distId = r.district_id;
      if (statsMap[distId]) {
        const type = (r.record_type || '').toUpperCase();
        if (type === 'CASE' || type === 'CASES') {
          statsMap[distId].cases++;
          statsMap[distId].total++;
        } else if (type === 'ARREST') {
          statsMap[distId].arrests++;
          statsMap[distId].total++;
        } else if (type === 'PCR_CALL') {
          statsMap[distId].pcr++;
          statsMap[distId].total++;
        } else if (type === 'MISSING') {
          statsMap[distId].missing++;
          statsMap[distId].total++;
        }
      }
    });

    return Object.values(statsMap);
  }, [districts, filteredRecords]);

  // Sort districts based on active metric (highest first)
  const sortedDistricts = useMemo(() => {
    return [...districtData].sort((a, b) => b[activeMetric] - a[activeMetric]);
  }, [districtData, activeMetric]);

  // Basic KPI computations
  const summaryKpis = useMemo(() => {
    if (sortedDistricts.length === 0) {
      return { total: 0, highest: '—', lowest: '—', highestCount: 0, lowestCount: 0, avg: 0 };
    }
    
    let sum = 0;
    sortedDistricts.forEach(d => {
      sum += d[activeMetric];
    });

    const highestDist = sortedDistricts[0];
    const lowestDist = sortedDistricts[sortedDistricts.length - 1];

    return {
      total: sum,
      highest: highestDist.name,
      highestId: highestDist.id,
      highestCount: highestDist[activeMetric],
      lowest: lowestDist.name,
      lowestId: lowestDist.id,
      lowestCount: lowestDist[activeMetric],
      avg: Math.round(sum / sortedDistricts.length)
    };
  }, [sortedDistricts, activeMetric]);

  const handleDrillDown = (districtId) => {
    navigate('/hq/stations', { state: { districtId } });
  };

  const selectedDistrict = useMemo(() => {
    return districtData.find(d => d.id === selectedDistrictId);
  }, [districtData, selectedDistrictId]);

  const trendData = useMemo(() => {
    if (!selectedDistrictId) return [];

    // Filter raw records for this district
    const distRecords = rawRecords.filter(r =>
      r.district_id === selectedDistrictId &&
      ['submitted', 'PENDING_SHO', 'DISTRICT_REVIEW', 'HQ_RECEIVED', 'CLOSED', 'COMPILED'].includes(r.current_status)
    );

    const bumpBucket = (bucket, recordType) => {
      const type = (recordType || '').toUpperCase();
      if (type === 'CASE' || type === 'CASES') { bucket.cases++; bucket.total++; }
      else if (type === 'ARREST') { bucket.arrests++; bucket.total++; }
      else if (type === 'PCR_CALL') { bucket.pcr++; bucket.total++; }
      else if (type === 'MISSING') { bucket.missing++; bucket.total++; }
    };

    const baseDate = new Date();
    baseDate.setHours(0, 0, 0, 0);

    if (timeframe === 'Yearly') {
      // Last 12 months, keyed by 'YYYY-MM', x-axis labeled by month name only.
      const timelineMap = {};
      for (let i = 11; i >= 0; i--) {
        const d = new Date(baseDate.getFullYear(), baseDate.getMonth() - i, 1);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        timelineMap[ym] = {
          date: ym,
          displayDate: d.toLocaleDateString('en-IN', { month: 'short' }),
          cases: 0, arrests: 0, pcr: 0, missing: 0, total: 0
        };
      }

      distRecords.forEach(r => {
        const d = new Date(r.record_date);
        const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (timelineMap[ym]) bumpBucket(timelineMap[ym], r.record_type);
      });

      return Object.values(timelineMap);
    }

    // Daily buckets: last 30 days if Monthly, else last 7 days
    const numDays = timeframe === 'Monthly' ? 30 : 7;
    const timelineMap = {};
    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(baseDate);
      d.setDate(baseDate.getDate() - i);
      const dateStr = toDateStr(d);
      timelineMap[dateStr] = {
        date: dateStr,
        displayDate: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
        cases: 0, arrests: 0, pcr: 0, missing: 0, total: 0
      };
    }

    distRecords.forEach(r => {
      if (timelineMap[r.record_date]) bumpBucket(timelineMap[r.record_date], r.record_type);
    });

    return Object.values(timelineMap);
  }, [rawRecords, selectedDistrictId, timeframe]);

  // Police-station leaderboard within the selected district, ranked by activeMetric
  const stationData = useMemo(() => {
    if (!selectedDistrictId) return [];

    const subDivIds = new Set(
      rawNodes.filter(n => n.node_type === 'SUB_DIVISION' && n.parent_id === selectedDistrictId).map(n => n.id)
    );
    const stations = rawNodes.filter(n => n.node_type === 'PS' && subDivIds.has(n.parent_id));

    const statsMap = {};
    stations.forEach(s => {
      statsMap[s.id] = {
        id: s.id,
        name: s.name_en || s.name,
        name_hi: s.name_hi || s.name,
        cases: 0,
        arrests: 0,
        pcr: 0,
        missing: 0,
        total: 0
      };
    });

    filteredRecords.forEach(r => {
      if (r.district_id !== selectedDistrictId) return;
      const stationStats = statsMap[r.ps_id];
      if (stationStats) {
        const type = (r.record_type || '').toUpperCase();
        if (type === 'CASE' || type === 'CASES') {
          stationStats.cases++;
          stationStats.total++;
        } else if (type === 'ARREST') {
          stationStats.arrests++;
          stationStats.total++;
        } else if (type === 'PCR_CALL') {
          stationStats.pcr++;
          stationStats.total++;
        } else if (type === 'MISSING') {
          stationStats.missing++;
          stationStats.total++;
        }
      }
    });

    return Object.values(statsMap).sort((a, b) => b[activeMetric] - a[activeMetric]);
  }, [rawNodes, filteredRecords, selectedDistrictId, activeMetric]);

  const handleSelectDistrict = (districtId) => {
    setSelectedDistrictId(districtId);
    setTimeout(() => {
      trendSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const metricTabs = [
    { key: 'total', label: 'All Incidents', icon: ShieldAlert },
    { key: 'cases', label: 'FIR Cases', icon: Building },
    { key: 'pcr', label: 'PCR Calls', icon: PhoneCall },
    { key: 'arrests', label: 'Arrests', icon: FileCheck },
    { key: 'missing', label: 'Missing Persons', icon: UserX },
  ];
  const METRIC_TAB_ACTIVE_CLASS = 'bg-[var(--accent-color)] border-[var(--accent-color)] text-white';

  if (loadingNodes || loadingRecords) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen theme-hq-page page-bg pb-12">
      {/* ══════════════ HERO HEADER ══════════════ */}
      <div className="relative overflow-hidden px-8 py-10 rounded-b-[2rem] shadow-xl text-white" 
        style={{
          background: 'linear-gradient(135deg, #2E0854 0%, #17022e 100%)'
        }}
      >
        {/* Subtle grid pattern overlay */}
        <div 
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: `repeating-linear-gradient(0deg, #fff 0, #fff 1px, transparent 1px, transparent 40px),
                              repeating-linear-gradient(90deg, #fff 0, #fff 1px, transparent 1px, transparent 40px)`
          }}
        />
        {/* Decorative blur elements */}
        <div className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-purple-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-1/4 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" />

        <div className="relative z-10 mx-auto max-w-screen-xl flex flex-col justify-between h-full gap-6">
          {/* Header row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-white/70">
              <Building size={12} className="text-purple-300" />
              Delhi Police · District Analytics
            </div>

            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Live
            </span>
          </div>

          {/* Heading + calendar selector */}
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-sm">
                District Performance
              </h1>
              <p className="mt-1 text-lg font-medium text-purple-200">
                HQ Comparative Desk
              </p>
              <p className="mt-3 text-sm leading-relaxed text-purple-100/80">
                Aggregated overview of incident rates, operational workflow metrics, and performance metrics compared across all districts.
              </p>
            </div>

            {/* Calendar toggle control */}
            <div className="flex items-center gap-1 rounded-xl bg-white/5 border border-white/10 p-1 backdrop-blur-md self-start lg:self-auto">
              {['Daily', 'Weekly', 'Monthly', 'Yearly'].map((item) => (
                <button
                  key={item}
                  onClick={() => setTimeframe(item)}
                  className={`rounded-lg px-4 py-2 text-xs font-semibold tracking-wide transition-all duration-200 ${
                    timeframe === item
                      ? 'bg-white text-purple-950 shadow-md font-bold'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════ PAGE BODY ══════════════ */}
      <div className="mx-auto max-w-screen-xl px-6 mt-8">
        
        {/* ── Summary KPI Cards ── */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          
          <div className="rounded-card border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Total Aggregated Incidents</span>
              <ShieldAlert size={18} className="text-purple-600 shrink-0" />
            </div>
            <div className="mt-4">
              <div className="text-3xl font-extrabold text-slate-900 tabular-nums">{summaryKpis.total}</div>
              <p className="mt-1 text-xs text-slate-500">({timeframe})</p>
            </div>
          </div>

          <div className="rounded-card border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Highest Volume District</span>
              <AlertTriangle size={18} className="text-red-600 shrink-0" />
            </div>
            <div className="mt-4">
              <div 
                className="text-xl font-bold text-slate-900 truncate cursor-pointer hover:underline"
                onClick={() => handleDrillDown(summaryKpis.highestId)}
              >
                {summaryKpis.highest}
              </div>
              <div className="text-2xl font-extrabold text-red-600 mt-1 tabular-nums">
                {summaryKpis.highestCount} <span className="text-xs font-medium text-slate-500">incidents</span>
              </div>
            </div>
          </div>

          <div className="rounded-card border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Lowest Volume District</span>
              <Award size={18} className="text-emerald-600 shrink-0" />
            </div>
            <div className="mt-4">
              <div 
                className="text-xl font-bold text-slate-900 truncate cursor-pointer hover:underline"
                onClick={() => handleDrillDown(summaryKpis.lowestId)}
              >
                {summaryKpis.lowest}
              </div>
              <div className="text-2xl font-extrabold text-emerald-600 mt-1 tabular-nums">
                {summaryKpis.lowestCount} <span className="text-xs font-medium text-slate-500">incidents</span>
              </div>
            </div>
          </div>

          <div className="rounded-card border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">District Average</span>
              <TrendingUp size={18} className="text-indigo-600 shrink-0" />
            </div>
            <div className="mt-4">
              <div className="text-3xl font-extrabold text-slate-900 tabular-nums">{summaryKpis.avg}</div>
              <p className="mt-1 text-xs text-slate-500">Incidents / district</p>
            </div>
          </div>

        </div>

        {/* ── Category Filter Tabs ── */}
        <div className="mt-8 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
          {metricTabs.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeMetric === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveMetric(tab.key)}
                className={`flex items-center gap-2 rounded-control border px-5 py-2.5 text-xs font-bold tracking-wide transition-colors duration-200 ${
                  isActive
                    ? METRIC_TAB_ACTIVE_CLASS
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                <TabIcon size={14} className={isActive ? 'text-white' : 'text-slate-500'} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Leaderboard & Chart Content Panels ── */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          
          {/* LEFT: Styled Ranked Leaderboard */}
          <div className="lg:col-span-5 rounded-panel border border-purple-200 bg-purple-50/60 p-5 flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Ranked Leaderboard</h3>
              <p className="text-xs text-slate-500 mt-0.5">Districts ordered by incidence density ({timeframe})</p>
            </div>
            
            <div className="flex flex-col gap-2.5 overflow-y-auto max-h-[450px] pr-1">
              {sortedDistricts.map((item, index) => {
                const rank = index + 1;
                // Style highlights for Top and Bottom rank indicators
                let rankBadgeBg = 'bg-slate-100 text-slate-600 border-slate-200';
                if (rank === 1) rankBadgeBg = 'bg-red-500 text-white border-red-600';
                else if (rank === 2) rankBadgeBg = 'bg-orange-500 text-white border-orange-600';
                else if (rank === sortedDistricts.length) rankBadgeBg = 'bg-emerald-500 text-white border-emerald-600';

                const totalVal = summaryKpis.total || 1;
                const percentage = Math.round((item[activeMetric] / totalVal) * 100);

                return (
                  <div
                    key={item.id}
                    onClick={() => handleSelectDistrict(item.id)}
                    className="group flex items-center justify-between border border-slate-200 bg-white hover:border-purple-300 px-4 py-3 rounded-control cursor-pointer transition-colors duration-150"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-lg border text-xs font-black ${rankBadgeBg}`}>
                        {rank}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-slate-900 group-hover:text-purple-900 transition-colors">
                          {item.name}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium">{item.name_hi}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-extrabold text-slate-900 tabular-nums">
                        {item[activeMetric]}
                      </p>
                      <p className="text-[10px] text-slate-400 font-semibold tabular-nums">
                        {percentage}% share
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Visual Leaderboard Bar Chart */}
          <div className="lg:col-span-7 rounded-panel border border-purple-200 bg-purple-50/60 p-5 flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Comparative visual breakdown</h3>
              <p className="text-xs text-slate-500 mt-0.5">Click bars to inspect individual police stations</p>
            </div>

            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sortedDistricts}
                  layout="vertical"
                  margin={{ top: 10, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" stroke="#94a3b8" fontSize={11} tickLine={false} allowDecimals={false} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    width={90}
                  />
                  <Tooltip
                    cursor={{ fill: '#f8fafc' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        return (
                          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg text-xs text-slate-800">
                            <p className="font-bold text-purple-950 mb-1">{data.name}</p>
                            <p className="font-semibold">{activeMetric.toUpperCase()}: <span className="font-extrabold text-purple-600">{data[activeMetric]}</span></p>
                            <p className="text-[10px] text-slate-400 mt-1">Cases: {data.cases} | Arrests: {data.arrests} | PCR: {data.pcr} | Missing: {data.missing}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar
                    dataKey={activeMetric}
                    radius={[0, 6, 6, 0]}
                    onClick={(data) => handleSelectDistrict(data.id)}
                    className="cursor-pointer outline-none focus:outline-none"
                  >
                    {sortedDistricts.map((entry, index) => {
                      // Color bars dynamically: highlight highest/lowest in different colors
                      let barColor = '#4f46e5'; // Default indigo
                      if (index === 0) barColor = '#ef4444'; // Red-orange for highest alert
                      else if (index === sortedDistricts.length - 1) barColor = '#10b981'; // Emerald for lowest crime

                      return (
                        <Cell
                          key={`cell-${index}`}
                          fill={barColor}
                          className="hover:opacity-90 transition-opacity duration-150 cursor-pointer outline-none focus:outline-none"
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>

        {/* ── Sub-dashboard navigation trigger card ── */}
        <div className="mt-8 rounded-2xl border border-purple-100 bg-purple-50/30 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-purple-100 p-3 text-purple-700 mt-0.5">
              <MapPin size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Looking for station performance tables?</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Go directly to the detailed Police Station view to check performance tables, lookup crime heads, and review log registries.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/hq/stations')}
            className="flex items-center justify-center gap-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs py-3 px-6 shadow-md transition-all self-start md:self-auto cursor-pointer"
          >
            Open PS Console
            <ArrowRight size={14} />
          </button>
        </div>

        {/* ── District Trend Analysis Section ── */}
        {selectedDistrictId && selectedDistrict && (
          <div 
            ref={trendSectionRef}
            className="mt-8 rounded-panel border border-purple-800 bg-gradient-to-br from-[#2E0854] to-[#120124] p-8 text-white relative overflow-hidden transition-all duration-300"
          >
            {/* Background glowing effects */}
            <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-purple-500/10 blur-3xl"></div>
            <div className="absolute -bottom-24 -left-24 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl"></div>
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-purple-800/80 pb-6">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-500/20 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-purple-200 border border-purple-500/30">
                  <TrendingUp size={10} />
                  Operational Trend
                </span>
                <h3 className="text-2xl font-black tracking-tight mt-2 text-white flex items-center gap-2">
                  {selectedDistrict.name}
                  <span className="text-sm font-normal text-purple-200">({selectedDistrict.name_hi})</span>
                </h3>
                <p className="text-xs text-purple-300 mt-1">
                  Timeline analysis showing filtered {activeMetric.toUpperCase()} trends over the last {
                    timeframe === 'Yearly' ? '12 months' : timeframe === 'Monthly' ? '30 days' : '7 days'
                  }.
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate('/hq/stations', { state: { districtId: selectedDistrictId } })}
                  className="flex items-center gap-2 rounded-xl bg-white hover:bg-purple-50 text-purple-950 font-extrabold text-xs py-3 px-5 shadow-lg transition-all cursor-pointer"
                >
                  Inspect Stations in {selectedDistrict.name}
                  <ArrowRight size={14} />
                </button>
                <button
                  onClick={() => setSelectedDistrictId(null)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-900/40 hover:bg-purple-900/80 border border-purple-700/50 text-purple-200 hover:text-white transition-all cursor-pointer"
                  title="Close Trend Analysis"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Left Column: PS leaderboard for the selected district */}
              <div className="lg:col-span-3 rounded-2xl border border-purple-800 bg-purple-950/40 p-4 flex flex-col gap-3">
                <div>
                  <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">PS Leaderboard</span>
                  <p className="text-[10px] text-purple-400 mt-0.5">Ranked by {activeMetric.toUpperCase()}</p>
                </div>
                <div className="flex flex-col gap-2 overflow-y-auto max-h-[260px] pr-1">
                  {stationData.length === 0 && (
                    <p className="text-xs text-purple-300/70">No stations found for this district.</p>
                  )}
                  {stationData.map((s, idx) => (
                    <div
                      key={s.id}
                      onClick={() => navigate('/hq/stations', { state: { districtId: selectedDistrictId, psId: s.id } })}
                      className="flex items-center justify-between gap-2 rounded-xl border border-purple-800/60 bg-purple-900/30 px-3 py-2 cursor-pointer hover:bg-purple-800/40 hover:border-purple-600 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-purple-800/60 text-[10px] font-black text-purple-200">
                          {idx + 1}
                        </span>
                        <span className="truncate text-xs font-semibold text-white hover:underline">{s.name}</span>
                      </div>
                      <span className="shrink-0 text-sm font-black text-purple-200 tabular-nums">{s[activeMetric]}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Dynamic AreaChart */}
              <div className="lg:col-span-9 rounded-2xl border border-purple-800 bg-purple-950/20 p-5 h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d8b4fe" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#d8b4fe" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#4a154b" vertical={false} />
                    <XAxis 
                      dataKey="displayDate" 
                      stroke="#c084fc" 
                      fontSize={11} 
                      tickLine={false} 
                    />
                    <YAxis 
                      stroke="#c084fc" 
                      fontSize={11} 
                      tickLine={false} 
                      allowDecimals={false} 
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="rounded-xl border border-purple-700 bg-purple-950 p-3 shadow-2xl text-xs text-white">
                              <p className="font-bold mb-1 text-purple-200">{data.displayDate}</p>
                              <p className="font-semibold text-white">
                                {activeMetric.toUpperCase()}: <span className="font-black text-purple-300">{data[activeMetric]}</span>
                              </p>
                              <p className="text-[10px] text-purple-300 mt-1 border-t border-purple-800/80 pt-1">
                                Cases: {data.cases} | Arrests: {data.arrests} | PCR: {data.pcr} | Missing: {data.missing}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey={activeMetric}
                      stroke="#c084fc"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorTrend)"
                      className="outline-none focus:outline-none"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
