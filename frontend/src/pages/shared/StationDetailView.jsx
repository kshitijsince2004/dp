import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Shield, PhoneCall, UserX, HelpCircle, Calendar } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { useTranslation } from "react-i18next";
import useAuthStore from "../../store/authStore.js";
import api from "../../utils/api.js";
import { asNodesList, asRecordsList } from "../../utils/dataShape.js";
import { Spinner } from "../../components/ui/Spinner.jsx";
import StatCard from "../../components/ui/StatCard.jsx";
import SafeResponsiveContainer from "../../components/common/SafeResponsiveContainer.jsx";
import { parseDMY } from "../../utils/dateFormat.js";
import { log } from "../../utils/logger.js";

export default function StationDetailView() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  const isHq = location.pathname.startsWith("/hq");

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
  
  const [nodes, setNodes] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    log.debug('page:mount', { route: '/stations/:id', stationId: id, userId: user?.id, role: user?.role });
    return () => log.debug('page:unmount', { route: '/stations/:id', stationId: id });
  }, [id]);

  // Fetch nodes and records
  useEffect(() => {
    const fetchData = async () => {
      log.debug('data:load_start', { what: 'station_detail', stationId: id });
      try {
        setLoading(true);
        const [nodesRes, recordsRes] = await Promise.all([
          api.get("/hierarchy/nodes"),
          api.get("/records"),
        ]);

        setNodes(asNodesList(nodesRes.data?.data));
        setRecords(asRecordsList(recordsRes.data?.data ?? recordsRes.data));
        log.debug('data:load_success', { what: 'station_detail', stationId: id });
        setError(null);
      } catch (err) {
        console.error("Error fetching station details:", err);
        log.error('data:load_error', { what: 'station_detail', stationId: id, err });
        setError("Failed to load station profile. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  // Find the selected station node
  const stationNode = useMemo(() => {
    return nodes.find((n) => n.id === id);
  }, [nodes, id]);

  // Find parent district node
  const districtNode = useMemo(() => {
    if (!stationNode) return null;
    let current = stationNode;
    while (current && current.parent_id) {
      const parent = nodes.find((n) => n.id === current.parent_id);
      if (parent && parent.node_type === "DISTRICT") {
        return parent;
      }
      current = parent;
    }
    return null;
  }, [nodes, stationNode]);

  // Filter records belonging to this station
  const stationRecords = useMemo(() => {
    return records.filter((r) => r.ps_id === id);
  }, [records, id]);

  // Compute metrics and categorised lists
  const calculations = useMemo(() => {
    // Categories
    const cases = stationRecords.filter((r) => r.record_type === "CASE" || r.record_type === "CASES");
    const arrests = stationRecords.filter((r) => r.record_type === "ARREST");
    const pcrs = stationRecords.filter((r) => r.record_type === "PCR_CALL");
    const missing = stationRecords.filter((r) => r.record_type === "MISSING");
    
    // Status counts
    const pending = stationRecords.filter((r) =>
      ["DRAFT", "SENT_BACK_HC", "PENDING_SHO", "DISTRICT_REVIEW"].includes(r.current_status)
    ).length;
    const approved = stationRecords.filter((r) =>
      ["HQ_RECEIVED", "CLOSED", "COMPILED"].includes(r.current_status)
    ).length;

    // Sort logs descending
    const sortByDate = (arr) => {
      return [...arr].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
    };

    // Group trends by date (record_date is dd/mm/yyyy)
    const dateMap = {};
    stationRecords.forEach((r) => {
      const dateStr = r.record_date; // DD/MM/YYYY
      if (!dateMap[dateStr]) {
        dateMap[dateStr] = { date: dateStr, sortKey: parseDMY(dateStr), cases: 0, pcr: 0, arrests: 0 };
      }
      const type = (r.record_type || "").toUpperCase();
      if (type === "CASE" || type === "CASES") dateMap[dateStr].cases++;
      else if (type === "PCR_CALL") dateMap[dateStr].pcr++;
      else if (type === "ARREST") dateMap[dateStr].arrests++;
    });

    const trendData = Object.values(dateMap)
      .sort((a, b) => (a.sortKey || 0) - (b.sortKey || 0))
      .slice(-7)
      .map(({ sortKey, ...d }) => ({
        ...d,
        date: sortKey ? sortKey.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : d.date
      }));

    return {
      casesTotal: cases.length,
      arrestsTotal: arrests.length,
      pcrTotal: pcrs.length,
      missingTotal: missing.length,
      pending,
      approved,
      recentCases: sortByDate(cases),
      recentArrests: sortByDate(arrests),
      recentPcrs: sortByDate(pcrs),
      recentMissing: sortByDate(missing),
      trendData,
    };
  }, [stationRecords]);

  if (loading) {
    return (
      <div className={`flex flex-col items-center justify-center p-20 text-[var(--text-main-theme)] ${getThemeClass()} page-bg min-h-[60vh] font-sans`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent-color)] mb-4"></div>
        <p className="font-semibold">{t('common.loading', 'Syncing digital registry logs...')}</p>
      </div>
    );
  }

  if (error || !stationNode) {
    return (
      <div className={`min-h-screen ${getThemeClass()} page-bg flex items-center justify-center px-6 font-sans`}>
        <div className="rounded-panel border border-[var(--border-card-theme)] bg-white max-w-md w-full overflow-hidden">
          <div className="h-1.5 w-full bg-red-500" />
          <div className="p-8 text-center text-[var(--text-main-theme)]">
            <p className="font-semibold text-red-700">{error || "Station not found."}</p>
            <button
              onClick={() => navigate(isHq ? "/hq/stations" : "/district/stations")}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] px-5 py-2.5 text-sm font-bold text-white shadow-sm border-none cursor-pointer transition-all active:scale-95"
            >
              <ArrowLeft size={16} /> Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const statCards = [
    { title: "FIR Cases", value: calculations.casesTotal, icon: Shield, color: "text-emerald-500" },
    { title: "Arrests", value: calculations.arrestsTotal, icon: UserX, color: "text-rose-500" },
    { title: "PCR Calls", value: calculations.pcrTotal, icon: PhoneCall, color: "text-sky-500" },
    { title: "Missing", value: calculations.missingTotal, icon: HelpCircle, color: "text-purple-500" },
    { title: "Pending Deci.", value: calculations.pending, icon: Calendar, color: "text-amber-500" },
    { title: "Approved", value: calculations.approved, icon: Shield, color: "text-indigo-500" }
  ];

  return (
    <div className={`min-h-screen ${getThemeClass()} page-bg text-[var(--text-main-theme)] font-sans p-5`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5 border-b border-[var(--border-card-theme)]/70 pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(isHq ? "/hq/stations" : "/district/stations")}
            className="p-2 border border-[var(--border-card-theme)] hover:bg-[var(--bg-page-main)]/80 rounded-xl transition-all text-[var(--text-main-theme)]/80 cursor-pointer hover:border-[var(--accent-color)]"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-main-theme)] font-display">
              {stationNode.name_en || stationNode.name}
            </h1>
            <p className="text-xs text-[var(--text-main-theme)] opacity-80 mt-1 font-semibold">
              Station Code: <span className="font-mono font-bold text-[var(--accent-color)]">{stationNode.code || "N/A"}</span> | District: <span className="font-bold text-[var(--text-main-theme)]">{districtNode?.name_en || districtNode?.name || "N/A"}</span>
            </p>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {statCards.map((card, idx) => (
          <StatCard
            key={idx}
            label={card.title}
            value={card.value}
            icon={card.icon}
            iconColor={card.color}
          />
        ))}
      </div>

      {/* Trend Chart */}
      <div className="theme-card p-4 border mb-5 rounded-panel bg-white border-[var(--border-card-theme)]">
        <h3 className="text-label font-semibold text-[var(--text-main-theme)] opacity-60 mb-4">
          Volume Trend Analysis (Last 7 Active Days)
        </h3>
        <div className="h-[220px] w-full">
          {calculations.trendData.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--text-main-theme)] opacity-60 font-semibold">
              No recent volume data found for this station.
            </div>
          ) : (
            <SafeResponsiveContainer width="100%" height="100%">
              <LineChart data={calculations.trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-card-theme)" vertical={false} opacity={0.3} />
                <XAxis dataKey="date" stroke="var(--text-main-theme)" fontSize={10} tickLine={false} axisLine={false} dy={10} opacity={0.7} />
                <YAxis stroke="var(--text-main-theme)" fontSize={10} tickLine={false} axisLine={false} dx={-10} opacity={0.7} />
                <Tooltip contentStyle={{ backgroundColor: "var(--bg-page-main)", borderColor: "var(--border-card-theme)", color: "var(--text-main-theme)", borderRadius: "12px", backdropFilter: "blur(8px)" }} />
                <Legend wrapperStyle={{ fontSize: 'var(--text-label-s)', paddingTop: "10px", fontWeight: "600", color: "var(--text-main-theme)" }} />
                <Line type="monotone" dataKey="cases" name="Cases" stroke="var(--accent-gold)" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="pcr" name="PCR Calls" stroke="var(--accent-color)" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="arrests" name="Arrests" stroke="#e11d48" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </SafeResponsiveContainer>
          )}
        </div>
      </div>

      {/* Records Tables Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cases */}
        <div className="theme-card border overflow-hidden rounded-panel bg-white border-[var(--border-card-theme)]">
          <div className="p-4 border-b flex items-center gap-2 bg-[var(--bg-page-main)]/80 border-[var(--border-card-theme)]/70">
            <h3 className="text-sm font-bold text-[var(--text-main-theme)]">Recent Cases (FIR)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-page-main)]/80 border-b border-[var(--border-card-theme)]/70">
                  <th className="px-4 py-2.5 text-[10px] font-bold text-[var(--text-main-theme)] opacity-60 uppercase">FIR No / UID</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-[var(--text-main-theme)] opacity-60 uppercase">FIR Date</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-[var(--text-main-theme)] opacity-60 uppercase">Complainant</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-[var(--text-main-theme)] opacity-60 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-card-theme)]/30 text-[var(--text-main-theme)]">
                {calculations.recentCases.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-5 text-center text-xs text-[var(--text-main-theme)] opacity-60 font-semibold">No recent FIR records found.</td>
                  </tr>
                ) : (
                  calculations.recentCases.map((r) => (
                    <tr key={r.id} className="hover:bg-[var(--bg-page-main)]/40 text-xs">
                      <td className="px-4 py-2.5 font-bold text-[var(--text-main-theme)] font-mono">
                        {r.data?.fir_no || r.uid || r.id.substring(0, 8)}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-main-theme)] opacity-80">
                        {r.data?.fir_date || r.record_date}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-main-theme)] opacity-80">
                        {r.data?.complainant_name || "Unknown"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${r.current_status === 'CLOSED' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'}`}>
                          {r.current_status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Arrests */}
        <div className="theme-card border overflow-hidden rounded-panel bg-white border-[var(--border-card-theme)]">
          <div className="p-4 border-b flex items-center gap-2 bg-[var(--bg-page-main)]/80 border-[var(--border-card-theme)]/70">
            <h3 className="text-sm font-bold text-[var(--text-main-theme)]">Recent Arrests</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-page-main)]/80 border-b border-[var(--border-card-theme)]/70">
                  <th className="px-4 py-2.5 text-[10px] font-bold text-[var(--text-main-theme)] opacity-60 uppercase">Arrestee Name</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-[var(--text-main-theme)] opacity-60 uppercase">Arrest Date</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-[var(--text-main-theme)] opacity-60 uppercase">Classification</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-[var(--text-main-theme)] opacity-60 uppercase">Custody Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-card-theme)]/30 text-[var(--text-main-theme)]">
                {calculations.recentArrests.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-5 text-center text-xs text-[var(--text-main-theme)] opacity-60 font-semibold">No recent arrest records found.</td>
                  </tr>
                ) : (
                  calculations.recentArrests.map((r) => (
                    <tr key={r.id} className="hover:bg-[var(--bg-page-main)]/40 text-xs">
                      <td className="px-4 py-2.5 font-bold text-[var(--text-main-theme)]">
                        {r.data?.arrested_name || "Unknown"}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-main-theme)] opacity-80">
                        {r.data?.arrest_date || r.record_date}
                      </td>
                      <td className="px-4 py-2.5 text-rose-500 font-bold">
                        {r.data?.crime_head || "General"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--bg-page-main)]/80 border border-[var(--border-card-theme)] text-[var(--text-main-theme)] opacity-80">
                          {r.data?.status || "In Custody"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* PCR Calls */}
        <div className="theme-card border overflow-hidden rounded-panel bg-white border-[var(--border-card-theme)]">
          <div className="p-4 border-b flex items-center gap-2 bg-[var(--bg-page-main)]/80 border-[var(--border-card-theme)]/70">
            <h3 className="text-sm font-bold text-[var(--text-main-theme)]">Recent PCR Calls</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-page-main)]/80 border-b border-[var(--border-card-theme)]/70">
                  <th className="px-4 py-2.5 text-[10px] font-bold text-[var(--text-main-theme)] opacity-60 uppercase">GD No / Time</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-[var(--text-main-theme)] opacity-60 uppercase">Category</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-[var(--text-main-theme)] opacity-60 uppercase">Caller</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-[var(--text-main-theme)] opacity-60 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-card-theme)]/30 text-[var(--text-main-theme)]">
                {calculations.recentPcrs.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-5 text-center text-xs text-[var(--text-main-theme)] opacity-60 font-semibold">No recent PCR records found.</td>
                  </tr>
                ) : (
                  calculations.recentPcrs.map((r) => (
                    <tr key={r.id} className="hover:bg-[var(--bg-page-main)]/40 text-xs">
                      <td className="px-4 py-2.5 font-bold text-[var(--text-main-theme)] font-mono">
                        {r.data?.gd_no || "N/A"} ({r.data?.gd_time || "N/A"})
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-main-theme)] opacity-80">
                        {r.data?.call_head || "General"}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-main-theme)] opacity-80">
                        {r.data?.complainant_name || "Anonymous"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[var(--bg-page-main)]/80 border border-[var(--border-card-theme)] text-[var(--text-main-theme)] opacity-80">
                          {r.data?.status || "Closed"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Missing Persons */}
        <div className="theme-card border overflow-hidden rounded-panel bg-white border-[var(--border-card-theme)]">
          <div className="p-4 border-b flex items-center gap-2 bg-[var(--bg-page-main)]/80 border-[var(--border-card-theme)]/70">
            <h3 className="text-sm font-bold text-[var(--text-main-theme)]">Recent Missing Person Records</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-page-main)]/80 border-b border-[var(--border-card-theme)]/70">
                  <th className="px-4 py-2.5 text-[10px] font-bold text-[var(--text-main-theme)] opacity-60 uppercase">Missing Name</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-[var(--text-main-theme)] opacity-60 uppercase">Age/Gender</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-[var(--text-main-theme)] opacity-60 uppercase">Missing Since</th>
                  <th className="px-4 py-2.5 text-[10px] font-bold text-[var(--text-main-theme)] opacity-60 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-card-theme)]/30 text-[var(--text-main-theme)]">
                {calculations.recentMissing.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-5 text-center text-xs text-[var(--text-main-theme)] opacity-60 font-semibold">No recent missing records found.</td>
                  </tr>
                ) : (
                  calculations.recentMissing.map((r) => (
                    <tr key={r.id} className="hover:bg-[var(--bg-page-main)]/40 text-xs">
                      <td className="px-4 py-2.5 font-bold text-[var(--text-main-theme)]">
                        {r.data?.missing_name || "Unknown"}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-main-theme)] opacity-80">
                        {r.data?.age || "N/A"} yrs / {r.data?.gender || "N/A"}
                      </td>
                      <td className="px-4 py-2.5 text-[var(--text-main-theme)] opacity-80">
                        {r.data?.missing_date || r.record_date}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${r.data?.status === 'Traced' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 border-rose-500/20'}`}>
                          {r.data?.status || "Missing"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
