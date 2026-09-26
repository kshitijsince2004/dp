import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
  AreaChart, Area
} from 'recharts';
import { ArrowRight, X } from 'lucide-react';
import api from '../../utils/api.js';
import { asNodesList, asRecordsList } from '../../utils/dataShape.js';
import useAuthStore from '../../store/authStore.js';
import { Spinner } from '../../components/ui/Spinner.jsx';
import SafeResponsiveContainer from '../../components/common/SafeResponsiveContainer.jsx';
import { log } from '../../utils/logger.js';

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

  useEffect(() => {
    log.debug('page:mount', { route: '/hq/district-analytics', userId: user?.id, role: user?.role });
    return () => log.debug('page:unmount', { route: '/hq/district-analytics' });
  }, []);

  // Fetch nodes and raw records to support dynamic client-side timeframe aggregations
  const { data: rawNodes = [], isLoading: loadingNodes } = useQuery({
    queryKey: ['hierarchy', 'nodes'],
    queryFn: async () => {
      log.debug('data:load_start', { what: 'hierarchy_nodes' });
      try {
        const res = await api.get('/hierarchy/nodes');
        const rows = asNodesList(res.data?.data);
        log.debug('data:load_success', { what: 'hierarchy_nodes', count: rows.length });
        return rows;
      } catch (err) {
        log.error('data:load_error', { what: 'hierarchy_nodes', err });
        throw err;
      }
    }
  });

  const { data: rawRecords = [], isLoading: loadingRecords } = useQuery({
    queryKey: ['records', 'all'],
    queryFn: async () => {
      log.debug('data:load_start', { what: 'records_all' });
      try {
        const res = await api.get('/records?limit=200');
        const rows = asRecordsList(res.data?.data);
        log.debug('data:load_success', { what: 'records_all', count: rows.length });
        return rows;
      } catch (err) {
        log.error('data:load_error', { what: 'records_all', err });
        throw err;
      }
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
    log.debug('action:district_drilldown', { districtId });
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
    log.debug('action:district_select', { districtId });
    setSelectedDistrictId(districtId);
    setTimeout(() => {
      trendSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const metricTabs = [
    { key: 'total', label: 'All Incidents' },
    { key: 'cases', label: 'FIR Cases' },
    { key: 'pcr', label: 'PCR Calls' },
    { key: 'arrests', label: 'Arrests' },
    { key: 'missing', label: 'Missing Persons' },
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
    <div className="min-h-screen theme-hq-page page-bg pb-8">
      {/* ══════════════ HERO HEADER ══════════════ */}
      <div className="relative overflow-hidden hero-banner-gradient px-6 py-5 rounded-b-[2rem] shadow-xl text-white">
        <div className="relative z-10 mx-auto max-w-screen-xl flex flex-col justify-between h-full gap-4">
          {/* Header row */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-white/70">
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
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-sm">
                District Performance
              </h1>
              <p className="mt-1 text-lg font-medium text-blue-100">
                HQ Comparative Desk
              </p>
              <p className="mt-3 text-sm leading-relaxed text-white/70">
                Aggregated overview of incident rates, operational workflow metrics, and performance metrics compared across all districts.
              </p>
            </div>

            {/* Calendar toggle control */}
            <div className="flex items-center gap-1 rounded-xl bg-slate-900 border border-slate-700 p-1 self-start lg:self-auto">
              {['Daily', 'Weekly', 'Monthly', 'Yearly'].map((item) => (
                <button
                  key={item}
                  onClick={() => { log.debug('action:timeframe_change', { timeframe: item }); setTimeframe(item); }}
                  className={`rounded-lg px-4 py-2 text-xs font-semibold tracking-wide transition-all duration-200 ${
                    timeframe === item
                      ? 'bg-white text-[#0d2a4a] shadow-md font-bold'
                      : 'text-white/80 hover:bg-slate-800 hover:text-white'
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
      <div className="mx-auto max-w-screen-xl px-6 mt-5">
        
        {/* ── Summary KPI Cards ── */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          
          <div className="rounded-card border border-slate-200 bg-white p-4">
            <div>
              <span className="text-xs font-semibold text-slate-500">Total Aggregated Incidents</span>
            </div>
            <div className="mt-4">
              <div className="text-3xl font-bold text-slate-900 tabular-nums">{summaryKpis.total}</div>
              <p className="mt-1 text-xs text-slate-500">({timeframe})</p>
            </div>
          </div>

          <div className="rounded-card border border-slate-200 bg-white p-4">
            <div>
              <span className="text-xs font-semibold text-slate-500">Highest Volume District</span>
            </div>
            <div className="mt-4">
              <div 
                className="text-xl font-bold text-slate-900 truncate cursor-pointer hover:underline"
                onClick={() => handleDrillDown(summaryKpis.highestId)}
              >
                {summaryKpis.highest}
              </div>
              <div className="text-2xl font-bold text-red-600 mt-1 tabular-nums">
                {summaryKpis.highestCount} <span className="text-xs font-medium text-slate-500">incidents</span>
              </div>
            </div>
          </div>

          <div className="rounded-card border border-slate-200 bg-white p-4">
            <div>
              <span className="text-xs font-semibold text-slate-500">Lowest Volume District</span>
            </div>
            <div className="mt-4">
              <div 
                className="text-xl font-bold text-slate-900 truncate cursor-pointer hover:underline"
                onClick={() => handleDrillDown(summaryKpis.lowestId)}
              >
                {summaryKpis.lowest}
              </div>
              <div className="text-2xl font-bold text-emerald-600 mt-1 tabular-nums">
                {summaryKpis.lowestCount} <span className="text-xs font-medium text-slate-500">incidents</span>
              </div>
            </div>
          </div>

          <div className="rounded-card border border-slate-200 bg-white p-4">
            <div>
              <span className="text-xs font-semibold text-slate-500">District Average</span>
            </div>
            <div className="mt-4">
              <div className="text-3xl font-bold text-slate-900 tabular-nums">{summaryKpis.avg}</div>
              <p className="mt-1 text-xs text-slate-500">Incidents / district</p>
            </div>
          </div>

        </div>

        {/* ── Category Filter Tabs ── */}
        <div className="mt-5 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
          {metricTabs.map((tab) => {
            const isActive = activeMetric === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => { log.debug('action:metric_tab_change', { metric: tab.key }); setActiveMetric(tab.key); }}
                className={`rounded-control border px-5 py-2.5 text-xs font-bold tracking-wide transition-colors duration-200 ${
                  isActive
                    ? METRIC_TAB_ACTIVE_CLASS
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Leaderboard & Chart Content Panels ── */}
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
          
          {/* LEFT: Styled Ranked Leaderboard */}
          <div className="lg:col-span-5 rounded-panel border border-slate-200 bg-white p-5 flex flex-col gap-4">
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
                    className="group flex items-center justify-between border border-slate-200 bg-white hover:border-[#3b82f6] px-4 py-3 rounded-control cursor-pointer transition-colors duration-150"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-lg border text-xs font-bold ${rankBadgeBg}`}>
                        {rank}
                      </span>
                      <div>
                        <p className="text-sm font-bold text-slate-900 group-hover:text-[#0f52ba] transition-colors">
                          {item.name}
                        </p>
                        <p className="text-[10px] text-slate-400 font-medium">{item.name_hi}</p>
                      </div>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900 tabular-nums">
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
          <div className="lg:col-span-7 rounded-panel border border-slate-200 bg-white p-5 flex flex-col gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Comparative visual breakdown</h3>
              <p className="text-xs text-slate-500 mt-0.5">Click bars to inspect individual police stations</p>
            </div>

            <div className="h-[320px] w-full">
              <SafeResponsiveContainer width="100%" height="100%">
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
                            <p className="font-bold text-[#0d2a4a] mb-1">{data.name}</p>
                            <p className="font-semibold">{activeMetric.toUpperCase()}: <span className="font-bold text-[#0f52ba]">{data[activeMetric]}</span></p>
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
                      let barColor = '#0f52ba'; // Brand blue default
                      if (index === 0) barColor = '#ef4444'; // Red for highest alert
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
              </SafeResponsiveContainer>
            </div>
          </div>

        </div>

        {/* ── Sub-dashboard navigation trigger card ── */}
        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/80 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div>
              <h4 className="text-sm font-bold text-slate-900">Looking for station performance tables?</h4>
              <p className="text-xs text-slate-500 mt-0.5">
                Go directly to the detailed Police Station view to check performance tables, lookup crime heads, and review log registries.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/hq/stations')}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#0f52ba] hover:bg-[#0d2a4a] text-white font-bold text-xs py-3 px-6 shadow-md transition-all self-start md:self-auto cursor-pointer"
          >
            Open PS Console
            <ArrowRight size={14} />
          </button>
        </div>

        {/* ── District Trend Analysis Section ── */}
        {selectedDistrictId && selectedDistrict && (
          <div 
            ref={trendSectionRef}
            className="mt-5 rounded-panel hero-banner-gradient p-6 text-white relative overflow-hidden transition-all duration-300"
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/20 pb-6">
              <div>
                <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-100 border border-white/20">
                  Operational Trend
                </span>
                <h3 className="text-2xl font-bold tracking-tight mt-2 text-white flex items-center gap-2">
                  {selectedDistrict.name}
                  <span className="text-sm font-normal text-blue-100">({selectedDistrict.name_hi})</span>
                </h3>
                <p className="text-xs text-white/60 mt-1">
                  Timeline analysis showing filtered {activeMetric.toUpperCase()} trends over the last {
                    timeframe === 'Yearly' ? '12 months' : timeframe === 'Monthly' ? '30 days' : '7 days'
                  }.
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate('/hq/stations', { state: { districtId: selectedDistrictId } })}
                  className="flex items-center gap-2 rounded-xl bg-white hover:bg-blue-50 text-[#0d2a4a] font-bold text-xs py-3 px-5 shadow-lg transition-all cursor-pointer"
                >
                  Inspect Stations in {selectedDistrict.name}
                  <ArrowRight size={14} />
                </button>
                <button
                  onClick={() => setSelectedDistrictId(null)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-blue-100 hover:text-white transition-all cursor-pointer"
                  title="Close Trend Analysis"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-12">
              {/* Left Column: PS leaderboard for the selected district */}
              <div className="lg:col-span-3 rounded-2xl border border-white/15 bg-white/5 p-4 flex flex-col gap-3">
                <div>
                  <span className="text-[10px] font-bold text-blue-100 uppercase tracking-wider">PS Leaderboard</span>
                  <p className="text-[10px] text-white/50 mt-0.5">Ranked by {activeMetric.toUpperCase()}</p>
                </div>
                <div className="flex flex-col gap-2 overflow-y-auto max-h-[260px] pr-1">
                  {stationData.length === 0 && (
                    <p className="text-xs text-white/50">No stations found for this district.</p>
                  )}
                  {stationData.map((s, idx) => (
                    <div
                      key={s.id}
                      onClick={() => navigate('/hq/stations', { state: { districtId: selectedDistrictId, psId: s.id } })}
                      className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 cursor-pointer hover:bg-white/15 hover:border-white/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-white/15 text-[10px] font-bold text-blue-100">
                          {idx + 1}
                        </span>
                        <span className="truncate text-xs font-semibold text-white hover:underline">{s.name}</span>
                      </div>
                      <span className="shrink-0 text-sm font-bold text-blue-100 tabular-nums">{s[activeMetric]}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Dynamic AreaChart */}
              <div className="lg:col-span-9 rounded-2xl border border-white/15 bg-white/5 p-5 h-[320px]">
                <SafeResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.12)" vertical={false} />
                    <XAxis 
                      dataKey="displayDate" 
                      stroke="#93c5fd" 
                      fontSize={11} 
                      tickLine={false} 
                    />
                    <YAxis 
                      stroke="#93c5fd" 
                      fontSize={11} 
                      tickLine={false} 
                      allowDecimals={false} 
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const data = payload[0].payload;
                          return (
                            <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-2xl text-xs text-slate-800">
                              <p className="font-bold mb-1 text-[#0d2a4a]">{data.displayDate}</p>
                              <p className="font-semibold text-slate-700">
                                {activeMetric.toUpperCase()}: <span className="font-bold text-[#0f52ba]">{data[activeMetric]}</span>
                              </p>
                              <p className="text-[10px] text-slate-500 mt-1 border-t border-slate-200 pt-1">
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
                      stroke="#3b82f6"
                      strokeWidth={3}
                      fillOpacity={1}
                      fill="url(#colorTrend)"
                      className="outline-none focus:outline-none"
                    />
                  </AreaChart>
                </SafeResponsiveContainer>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
