import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import useAuthStore from "../../store/authStore.js";
import api from "../../utils/api.js";
import StationFilters from "../../components/common/StationFilters.jsx";
import StationSummaryCards from "../../components/common/StationSummaryCards.jsx";
import StationPerformanceTable from "../../components/common/StationPerformanceTable.jsx";
import { Spinner } from "../../components/ui/Spinner.jsx";
import { Shield, MapPin, Activity, Users, AlertCircle, CheckCircle2, Clock3, Radio } from "lucide-react";

export default function StationPerformanceDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, activeNodeId } = useAuthStore();

  const isHq = location.pathname.startsWith("/hq");

  const [nodes, setNodes] = useState([]);
  const [records, setRecords] = useState([]);
  const [psStats, setPsStats] = useState([]);  // pre-aggregated from /analytics/by-ps
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters state
  const [filters, setFilters] = useState({
    districtId: "",
    psId: "",
    recordType: "",
    dateFrom: "",
    dateTo: "",
  });

  // Fetch nodes, records, and pre-aggregated station metrics
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Load hierarchy nodes, raw records and pre-aggregated PS stats in parallel
        const [nodesRes, recordsRes, psStatsRes] = await Promise.all([
          api.get("/hierarchy/nodes"),
          api.get("/records"),
          api.get("/analytics/by-ps").catch(() => ({ data: { data: [] } })), // non-fatal
        ]);

        setNodes(nodesRes.data.data || []);
        setRecords(recordsRes.data.data?.cases || recordsRes.data.data || []);
        // Store station-level stats from the analytics endpoint
        setPsStats(psStatsRes.data?.data || []);
        setError(null);
      } catch (err) {
        console.error("Error fetching dashboard data:", err);
        setError("Failed to load dashboard metrics. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filter districts list
  const districts = useMemo(() => {
    return nodes.filter((n) => n.node_type === "DISTRICT");
  }, [nodes]);

  // Filter stations list
  const stations = useMemo(() => {
    return nodes.filter((n) => n.node_type === "PS");
  }, [nodes]);

  // Resolve scope constraints
  const userDistrictNode = useMemo(() => {
    if (isHq) return null;
    // For District Officer, resolve their bound district node
    const userDistId = user?.district_id || user?.districtId;
    return districts.find((d) => d.id === userDistId) || districts.find((d) => d.id === activeNodeId) || null;
  }, [isHq, user, districts, activeNodeId]);

  // Filter stations shown in table based on role & selected district
  const scopedStations = useMemo(() => {
    let list = stations;

    // Helper to traverse hierarchy and verify if a station is under a district
    const isNodeUnderDistrict = (stationNode, districtId) => {
      let current = stationNode;
      while (current && current.parent_id) {
        if (current.parent_id === districtId) return true;
        const parent = nodes.find((n) => n.id === current.parent_id);
        current = parent;
      }
      return false;
    };

    if (!isHq && userDistrictNode) {
      // Limit to district nodes
      list = list.filter((s) => isNodeUnderDistrict(s, userDistrictNode.id));
    }

    return list;
  }, [stations, isHq, userDistrictNode, nodes]);

  // Compute final table row elements with in-memory aggregation
  const calculatedData = useMemo(() => {
    // 1. Filter raw records
    const filteredRecords = records.filter((r) => {
      if (filters.recordType && r.record_type !== filters.recordType) return false;
      if (filters.dateFrom && r.record_date < filters.dateFrom) return false;
      if (filters.dateTo && r.record_date > filters.dateTo) return false;
      if (filters.psId && r.ps_id !== filters.psId) return false;

      if (isHq) {
        if (filters.districtId && r.district_id !== filters.districtId) return false;
      } else if (userDistrictNode) {
        // District officer only sees records in their district
        if (r.district_id !== userDistrictNode.id) return false;
      }

      return true;
    });

    // 2. Group aggregates by station
    const statsMap = {};
    filteredRecords.forEach((r) => {
      const psId = r.ps_id;
      if (!statsMap[psId]) {
        statsMap[psId] = {
          cases: 0,
          arrests: 0,
          pcr: 0,
          missing: 0,
          pending: 0,
          approved: 0,
          last_activity: null,
        };
      }

      const stats = statsMap[psId];
      const type = (r.record_type || "").toUpperCase();

      if (type === "CASE" || type === "CASES") stats.cases++;
      else if (type === "ARREST") stats.arrests++;
      else if (type === "PCR_CALL") stats.pcr++;
      else if (type === "MISSING") stats.missing++;

      const status = r.current_status || "";
      if (["DRAFT", "SENT_BACK_HC", "PENDING_SHO", "DISTRICT_REVIEW"].includes(status)) {
        stats.pending++;
      } else if (["HQ_RECEIVED", "CLOSED", "COMPILED"].includes(status)) {
        stats.approved++;
      }

      if (!stats.last_activity || new Date(r.updated_at) > new Date(stats.last_activity)) {
        stats.last_activity = r.updated_at;
      }
    });

    // 3. Helper to find district name for a station
    const getDistrictName = (stationNode) => {
      let current = stationNode;
      while (current && current.parent_id) {
        const parent = nodes.find((n) => n.id === current.parent_id);
        if (parent && parent.node_type === "DISTRICT") {
          return parent.name_en || parent.name;
        }
        current = parent;
      }
      return "Unknown District";
    };

    // 4. Merge stations and calculated stats
    const listToProcess = scopedStations.filter((s) => {
      if (isHq && filters.districtId && !s.parent_id.includes(filters.districtId) && !s.id.includes(filters.districtId)) {
        // Traverse nodes to verify parent district id match
        let isMatch = false;
        let current = s;
        while (current && current.parent_id) {
          if (current.parent_id === filters.districtId) {
            isMatch = true;
            break;
          }
          current = nodes.find((n) => n.id === current.parent_id);
        }
        if (!isMatch) return false;
      }
      if (filters.psId && s.id !== filters.psId) return false;
      return true;
    });

    // Build a quick lookup: psName → {cases, arrests, pcr}
    const psApiMap = {};
    psStats.forEach((row) => {
      if (row.station) psApiMap[row.station] = row;
    });

    const isLocalFilterActive = Boolean(filters.dateFrom || filters.dateTo || filters.recordType);

    const finalStations = listToProcess.map((s) => {
      // Prefer the API-aggregated data only if no time/type filters are applied
      const apiRow = psApiMap[s.name_en || s.name];
      const clientAgg = statsMap[s.id] || {
        cases: 0, arrests: 0, pcr: 0, missing: 0, pending: 0, approved: 0, last_activity: null,
      };

      const useApi = !isLocalFilterActive && apiRow;

      return {
        id: s.id,
        name_en: s.name_en || s.name,
        district_id: userDistrictNode?.id || s.parent_id,
        district_name: isHq ? getDistrictName(s) : (userDistrictNode?.name_en || userDistrictNode?.name || "District"),
        cases:    useApi ? apiRow.cases : clientAgg.cases,
        arrests:  useApi ? apiRow.arrests : clientAgg.arrests,
        pcr:      useApi ? apiRow.pcr : clientAgg.pcr,
        missing:  clientAgg.missing,
        pending:  clientAgg.pending,
        approved: clientAgg.approved,
        last_activity: clientAgg.last_activity,
      };
    });

    // 5. Calculate summary indicators
    let totalCases = 0;
    let totalArrests = 0;
    let totalPcr = 0;

    finalStations.forEach((fs) => {
      totalCases += fs.cases;
      totalArrests += fs.arrests;
      totalPcr += fs.pcr;
    });

    const uniqueDistricts = new Set(finalStations.map((fs) => fs.district_name));

    const summary = {
      totalDistricts: uniqueDistricts.size,
      totalStations: finalStations.length,
      totalCases,
      totalArrests,
      totalPcr,
    };

    return {
      stations: finalStations,
      summary,
    };
  }, [scopedStations, records, filters, isHq, userDistrictNode, nodes, psStats]);

  const handleRowClick = () => {}
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

  /* ─────────────────────────── Loading screen ─────────────────────────── */
  if (loading) {
    return (
      <div className={`min-h-screen ${getThemeClass()} page-bg flex items-center justify-center font-sans`}>
        <div className="flex flex-col items-center gap-5">
          {/* Glowing icon */}
          <div className="relative">
            <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-[#0d2a4a] to-[#16406d] shadow-2xl flex items-center justify-center">
              <Shield size={34} className="text-white" />
            </div>
            <div className="absolute -inset-2 rounded-3xl bg-[var(--accent-glow)] blur-xl -z-10" />
            {/* Spinner badge */}
            <div className="absolute -bottom-1.5 -right-1.5 h-7 w-7 rounded-full bg-[var(--bg-page-main)] shadow-md border border-[var(--border-card-theme)] flex items-center justify-center">
              <Spinner size="sm" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-base font-bold text-[var(--text-main-theme)]">Loading Dashboard</p>
            <p className="text-xs text-[var(--text-main-theme)] opacity-70 mt-1 font-semibold">Fetching station metrics &amp; records…</p>
          </div>
          {/* Animated dots */}
          <div className="flex gap-1.5 mt-1">
            <span className="h-1.5 w-8 rounded-full bg-[var(--accent-color)] animate-pulse" />
            <span className="h-1.5 w-5 rounded-full bg-[var(--accent-color)]/40 animate-pulse" style={{ animationDelay: "150ms" }} />
            <span className="h-1.5 w-3 rounded-full bg-[var(--accent-color)]/20 animate-pulse" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────────────────── Error screen ───────────────────────────── */
  if (error) {
    return (
      <div className={`min-h-screen ${getThemeClass()} page-bg flex items-center justify-center px-6 font-sans`}>
        <div className="rounded-3xl border border-red-200/50 bg-[var(--bg-card-theme)] shadow-xl max-w-md w-full overflow-hidden text-[var(--text-main-theme)]">
          {/* Red accent top bar */}
          <div className="h-1.5 w-full bg-gradient-to-r from-red-650 to-red-400" />
          <div className="p-8 text-center">
            <div className="relative mx-auto mb-5 h-16 w-16">
              <div className="h-16 w-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center">
                <AlertCircle size={28} className="text-red-600" />
              </div>
              <div className="absolute -inset-1 rounded-2xl bg-red-100 blur-md -z-10" />
            </div>
            <h3 className="text-base font-bold text-[var(--text-main-theme)]">Unable to Load Data</h3>
            <p className="mt-2 text-sm text-red-600 font-semibold">{error}</p>
            <p className="mt-1 text-xs text-[var(--text-main-theme)] opacity-60 font-medium">Check your connection and try refreshing the page.</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-[var(--accent-glow)] border-none cursor-pointer transition-all active:scale-95"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────────────────── Main render ────────────────────────────── */
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className={`min-h-screen ${getThemeClass()} page-bg text-[var(--text-main-theme)] font-sans`}>

      {/* ══════════════ HERO GRADIENT HEADER ══════════════ */}
      <div className="relative hero-banner-gradient px-8 pt-5 pb-12 overflow-hidden">
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -top-16 -right-16 h-72 w-72 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-12 left-1/4 h-56 w-56 rounded-full bg-white/5 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 right-1/4 h-32 w-32 rounded-full bg-white/5 blur-2xl" />
        {/* Subtle grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg,white 0,white 1px,transparent 1px,transparent 48px),repeating-linear-gradient(90deg,white 0,white 1px,transparent 1px,transparent 48px)",
          }}
        />
        <div className="relative z-10 mx-auto max-w-screen-xl w-full">
          {/* Top badge row */}
          <div className="flex flex-wrap items-center justify-end gap-3 mb-2">
            {/* Live data pill */}
            <div className="flex items-center gap-2 rounded-full bg-emerald-500/15 border border-emerald-400/30 px-4 py-1.5 backdrop-blur-sm">
              <Radio size={11} className="text-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold text-emerald-300 tracking-wide">LIVE DATA</span>
            </div>
          </div>

          {/* Heading + inline hero stats */}
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
            <div className="max-w-2xl">
              <h1 className="text-4xl font-bold text-white tracking-tight leading-tight font-display">
                Station Wise Performance
              </h1>
              <p className="mt-1 text-xl font-medium text-white/70 tracking-wide">
                {isHq ? "Consolidated Delhi Police Command" : `${userDistrictNode?.name_en || "District"} Boundary`}
              </p>
              <p className="mt-4 text-sm text-white/60 leading-relaxed max-w-lg font-semibold">
                {isHq
                  ? "Cross-station performance analysis across all districts under Delhi Police HQ jurisdiction. Compare cases, arrests, and PCR response metrics."
                  : `Real-time performance monitoring for all police stations under the ${userDistrictNode?.name_en || "your"} district boundary.`}
              </p>

              {/* Breadcrumb location chips */}
              <div className="mt-5 flex flex-wrap items-center gap-2 font-semibold">
                {/* <div className="flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1">
                  <MapPin size={11} className="text-white/50" />
                  <span className="text-xs text-white/70">Delhi, India</span>
                </div> */}
                {isHq ? (
                  <div className="flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1">
                    <Users size={11} className="text-white/50" />
                    <span className="text-xs text-white/70">{calculatedData.summary.totalDistricts} Districts</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1">
                    <MapPin size={11} className="text-white/50" />
                    <span className="text-xs text-white/70">{userDistrictNode?.name_en || "District"}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Hero metric tiles */}
            <div className="flex flex-wrap gap-3 lg:flex-shrink-0 bg-transparent">
              {[
                { label: "Stations",  value: calculatedData.summary.totalStations,  color: "text-white",        bg: "bg-white/10",           border: "border-white/20" },
                { label: "Cases",     value: calculatedData.summary.totalCases,     color: "text-amber-300",    bg: "bg-amber-500/15",       border: "border-amber-400/30" },
                { label: "Arrests",   value: calculatedData.summary.totalArrests,   color: "text-emerald-300",  bg: "bg-emerald-500/15",     border: "border-emerald-400/30" },
                { label: "PCR Calls", value: calculatedData.summary.totalPcr,       color: "text-sky-300",      bg: "bg-sky-500/15",         border: "border-sky-400/30" },
              ].map((tile) => (
                <div
                  key={tile.label}
                  className={`rounded-2xl ${tile.bg} border ${tile.border} backdrop-blur-sm px-5 py-4 min-w-[96px] text-center transition-all duration-200 hover:scale-105 hover:bg-white/20`}
                >
                  <div className={`text-3xl font-bold ${tile.color} tabular-nums`}>{tile.value}</div>
                  <div className="text-xs text-white/50 mt-1 font-medium">{tile.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom fade line */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </div>

      {/* ══════════════ PAGE BODY ══════════════ */}
      <div className="mx-auto max-w-screen-xl px-6 pb-12 relative z-10 -mt-10 space-y-6">

        {/* ── KPI Summary Cards ── */}
        {/* <div className="mt-8">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-5 w-1 rounded-full bg-gradient-to-b from-[var(--accent-color)] to-[var(--accent-color-hover)]" />
            <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-main-theme)] opacity-70">Performance Overview</h2>
            <div className="flex-1 h-px bg-[var(--border-card-theme)]/70" />
          </div>
          <StationSummaryCards summary={calculatedData.summary} isHq={isHq} />
        </div> */}

        {/* ── Filters Panel ── */}
        <div className="theme-card border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/60 backdrop-blur-md rounded-2xl shadow-sm overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
          {/* Panel header */}
          <div className="flex items-center gap-3 border-b border-[var(--border-card-theme)]/70 bg-gradient-to-r from-[var(--bg-page-main)]/80 to-[var(--bg-page-main)]/40 px-6 py-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--bg-page-main)]/50 border border-[var(--border-card-theme)] flex-shrink-0">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            </div>
            <div>
              <p className="text-lg font-extrabold text-[var(--text-main-theme)] font-display">Filter &amp; Search</p>
              <p className="text-xs text-[var(--text-main-theme)] opacity-70 font-semibold">Narrow results by district, station, record type or date range</p>
            </div>
            {/* Active filter badge */}
            {activeFilterCount > 0 ? (
              <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-color)] px-3 py-1 text-xs font-bold text-white shadow-sm">
                <Activity size={10} />
                {activeFilterCount} active
              </span>
            ) : (
              <span className="ml-auto rounded-full border border-[var(--border-card-theme)] bg-[var(--bg-page-main)] px-3 py-1 text-xs font-bold text-[var(--text-main-theme)] opacity-70">
                No filters
              </span>
            )}
          </div>
          <div className="p-6">
            <StationFilters
              districts={districts}
              stations={scopedStations}
              filters={filters}
              setFilters={setFilters}
              isHq={isHq}
              allNodes={nodes}
            />
          </div>
        </div>

        {/* ── Station Performance Table ── */}
        <div className="theme-card border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/60 backdrop-blur-md rounded-3xl shadow-sm overflow-hidden transition-all duration-300 hover:shadow-lg">
          {/* Table panel header */}
          <div className="relative border-b border-[var(--border-card-theme)]/70 bg-gradient-to-r from-[var(--bg-page-main)]/80 to-[var(--bg-page-main)]/40 px-6 py-5">
            {/* Left vertical accent */}
            <div className="absolute left-0 top-4 bottom-4 w-1 rounded-r-full bg-[var(--accent-color)]" />

            <div className="flex flex-wrap items-start justify-between gap-4 pl-4">
              <div>
                <h2 className="text-xl font-extrabold text-[var(--text-main-theme)] font-display">Station Comparative Analysis</h2>
                <p className="mt-0.5 text-xs text-[var(--text-main-theme)] opacity-70 font-semibold">
                  {calculatedData.stations.length} station{calculatedData.stations.length !== 1 ? "s" : ""}
                  {isHq ? ` · ${calculatedData.summary.totalDistricts} district${calculatedData.summary.totalDistricts !== 1 ? "s" : ""}` : ""}
                  {" "}· Click any row to drill down
                </p>
              </div>

              {/* Metric legend pills */}
              {/* <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-1.5 rounded-xl bg-amber-50 border border-amber-200 px-3 py-1.5 shadow-sm">
                  <Clock3 size={12} className="text-amber-700" />
                  <span className="text-xs font-bold text-amber-700">{calculatedData.summary.totalCases} Cases</span>
                </div>
                <div className="flex items-center gap-1.5 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1.5 shadow-sm">
                  <CheckCircle2 size={12} className="text-emerald-700" />
                  <span className="text-xs font-bold text-emerald-700">{calculatedData.summary.totalArrests} Arrests</span>
                </div>
                <div className="flex items-center gap-1.5 rounded-xl bg-blue-50 border border-blue-200 px-3 py-1.5 shadow-sm">
                  <Radio size={12} className="text-blue-700" />
                  <span className="text-xs font-bold text-blue-700">{calculatedData.summary.totalPcr} PCR</span>
                </div>
              </div> */}
            </div>
          </div>

          {/* Table body */}
          <div className="p-6">
            <StationPerformanceTable
              stations={calculatedData.stations}
              isHq={isHq}
              onRowClick={handleRowClick}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 flex items-center justify-center gap-2">
          <div className="h-px flex-1 max-w-[80px] bg-[var(--border-card-theme)]/70" />
          <p className="text-xs text-[var(--text-main-theme)] opacity-60 font-semibold">
            Delhi Police Command System · Data refreshes on page load · All times IST
          </p>
          <div className="h-px flex-1 max-w-[80px] bg-[var(--border-card-theme)]/70" />
        </div>
      </div>
    </div>
  );
}