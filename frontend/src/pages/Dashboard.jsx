import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from '@tanstack/react-query';
import api from '../utils/api.js';
import { 
  FileText, UserX, PhoneCall, Search, TrendingUp, TrendingDown, Clock, ArrowRight,
  FileSpreadsheet, Filter, Printer, X, BookOpen, Layers
} from "lucide-react";
import useAuthStore from "../store/authStore.js";
import { 
  findNodeById, getNodePath, POLICE_HIERARCHY
} from "../utils/hierarchyData.js";
import UnifiedFilterStrip from '../components/common/UnifiedFilterStrip.jsx';

export default function Dashboard() {
  const navigate = useNavigate();
  const { activeNodeId, user } = useAuthStore();
  
  const activeNode = findNodeById(activeNodeId) || POLICE_HIERARCHY;
  const path = getNodePath(activeNodeId) || [POLICE_HIERARCHY];

  const [filters, setFilters] = useState({
    type: 'ALL',
    status: 'ALL',
    dateFrom: null,
    dateTo: null,
    search: '',
    localHead: ''
  });

  const [diaryOpen, setDiaryOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const formatNumber = (num) => new Intl.NumberFormat("en-IN").format(num || 0);

  const getSystemDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Intl.DateTimeFormat("en-IN", {
        dateStyle: "medium",
        timeStyle: "short"
      }).format(new Date(dateString));
    } catch {
      return dateString;
    }
  };

  const getIndianDateString = () => {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "long",
    }).format(new Date());
  };

  // Fetch real analytics stats
  const { data: analyticsStats = { cases_today: 0, pcr_today: 0, arrests_today: 0, missing_today: 0 } } = useQuery({
    queryKey: ['analytics_overview', activeNodeId],
    queryFn: async () => {
      const res = await api.get('/analytics/overview');
      return res.data.data;
    }
  });

  // Fetch live records
  const { data: filteredLogs = [], isLoading: recordsLoading } = useQuery({
    queryKey: ['dashboard_records', filters, activeNodeId],
    queryFn: async () => {
      const params = {};
      if (filters.type && filters.type !== 'ALL') params.type = filters.type;
      if (filters.status && filters.status !== 'ALL') params.status = filters.status;
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.search) params.search = filters.search;
      if (filters.localHead) params.localHead = filters.localHead;

      const res = await api.get('/records', { params });
      return res.data.data.cases || res.data.data.queue || res.data.data || [];
    }
  });

  const stats = [
    { 
      label: "Total Registered FIRs", 
      value: analyticsStats.cases_today, 
      icon: FileText, 
      trend: "Live Database Feed", 
      trendType: "up",
      bgClass: "bg-blue-500/10",
      textClass: "text-blue-500",
      borderClass: "border-blue-500/20"
    },
    { 
      label: "Accused Arrested", 
      value: analyticsStats.arrests_today, 
      icon: UserX, 
      trend: "Live Database Feed", 
      trendType: "up",
      bgClass: "bg-emerald-500/10",
      textClass: "text-emerald-500",
      borderClass: "border-emerald-500/20"
    },
    { 
      label: "PCR Response Dispatches", 
      value: analyticsStats.pcr_today, 
      icon: PhoneCall, 
      trend: "Live Database Feed", 
      trendType: "up",
      bgClass: "bg-amber-500/10",
      textClass: "text-amber-500",
      borderClass: "border-amber-500/20"
    },
    { 
      label: "Missing Persons / UIDB", 
      value: (analyticsStats.missing_today || 0) + (analyticsStats.uidb_today || 0), 
      icon: Search, 
      trend: "Live Database Feed", 
      trendType: "up",
      bgClass: "bg-rose-500/10",
      textClass: "text-rose-500",
      borderClass: "border-rose-500/20"
    }
  ];

  // Map backend status to badge colors
  const getBadgeColor = (status) => {
    switch(status) {
      case 'DRAFT': return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'PENDING_SHO': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'DISTRICT_REVIEW': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'HQ_RECEIVED': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'COMPILED': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'SENT_BACK_HC': return 'bg-rose-100 text-rose-800 border-rose-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:justify-between items-start md:items-center gap-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-[#0f52ba]/10 text-[#0f52ba] text-[10px] font-bold tracking-widest px-2.5 py-1 rounded-md border border-[#0f52ba]/20 uppercase">
              {activeNode.type} Scope Console
            </span>
            <div className="flex items-center text-xs text-slate-400 gap-1.5 font-medium">
              {path.map((node, index) => (
                <React.Fragment key={node.id}>
                  {index > 0 && <span className="text-slate-300">/</span>}
                  <span className={index === path.length - 1 ? "text-slate-700 font-bold" : ""}>
                    {node.name.replace("District: ", "").replace("PS: ", "")}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 font-display">
            {activeNode.type === "HQ" ? "Delhi Police Headquarters Console" : `${activeNode.name} Console`}
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            {activeNode.type === "HQ" 
              ? "Global command metrics overview, command filters, and reports across all ranges and districts."
              : `Scoped data logs, metrics, and activities for ${activeNode.name}.`}
          </p>
        </div>

        {/* Console Action Buttons */}
        <div className="flex gap-3">
          {user?.role === 'HC' && (
            <button 
              type="button" 
              className="bg-[#0f52ba] hover:bg-[#16406d] text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-md shadow-[#0f52ba]/20"
              onClick={() => navigate("/records")}
            >
              <span>Manage Desk</span>
              <ArrowRight size={16} />
            </button>
          )}

          {user?.role === 'DISTRICT_OFFICER' && (
            <button 
              type="button" 
              className="bg-white border border-[#0f52ba] text-[#0f52ba] hover:bg-[#0f52ba]/5 px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm"
              onClick={() => setDiaryOpen(true)}
            >
              <BookOpen size={16} />
              <span>Generate Morning Diary</span>
            </button>
          )}

          {['HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'].includes(user?.role) && (
            <button 
              type="button" 
              className="bg-[#cca43b] hover:bg-[#b08d33] text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-md shadow-[#cca43b]/20"
              onClick={() => setReportOpen(true)}
            >
              <FileSpreadsheet size={16} />
              <span>Generate Fortnightly Report</span>
            </button>
          )}
        </div>
      </div>

      {/* Dynamic Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div key={idx} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/60 transition-all hover:shadow-md hover:-translate-y-1">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">{item.label}</span>
                  <div className="text-4xl font-black text-slate-800 mt-2 font-display">{formatNumber(item.value)}</div>
                </div>
                <div className={`p-3 rounded-2xl ${item.bgClass} ${item.textClass} border ${item.borderClass}`}>
                  <Icon size={24} />
                </div>
              </div>
              <div className="flex items-center text-xs mt-4 font-semibold text-slate-500 bg-slate-50 w-fit px-2 py-1 rounded-lg">
                {item.trendType === "up" ? (
                  <TrendingUp size={14} className="mr-1.5 text-emerald-500" />
                ) : (
                  <TrendingDown size={14} className="mr-1.5 text-rose-500" />
                )}
                {item.trend}
              </div>
            </div>
          );
        })}
      </div>

      {/* HQ INTERACTIVE COMMAND FILTER PANEL */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/60">
        <div className="flex items-center gap-2 mb-4">
          <Filter size={20} className="text-[#0f52ba]" />
          <h2 className="text-lg font-bold text-slate-800">Command Filter Interface</h2>
        </div>
        <p className="text-slate-500 text-sm mb-6 font-medium">Filter registered crime dockets across all jurisdictions dynamically.</p>
        
        <UnifiedFilterStrip 
          filters={filters}
          onFilterChange={setFilters}
          allowedStatuses={['ALL', 'DRAFT', 'PENDING_SHO', 'ACP_REVIEW', 'DISTRICT_REVIEW', 'SENT_BACK_HC', 'COMPILED']}
        />
        
        <div className="flex justify-between items-center text-xs text-slate-400 mt-4 font-medium">
          <span>Showing {filteredLogs.length} matching dockets based on active filters.</span>
          <button 
            type="button" 
            className="text-[#0f52ba] hover:text-[#16406d] flex items-center gap-1.5 font-bold px-3 py-1.5 bg-[#0f52ba]/5 hover:bg-[#0f52ba]/10 rounded-lg transition-colors"
            onClick={() => window.print()}
          >
            <Printer size={14} />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Dynamic Log & Docket Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
        <div className="p-6 border-b border-slate-200/60 bg-slate-50 flex items-center gap-2">
          <Clock size={20} className="text-slate-700" />
          <h2 className="text-lg font-bold text-slate-800">
            {activeNode.type === "HQ" 
              ? "Filtered Command Feeds" 
              : `${activeNode.name} Logs & Docket Feeds`}
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-500 uppercase font-bold text-xs tracking-wider">
                <th className="p-4 pl-6 border-b border-slate-200/60">Docket / Ref</th>
                <th className="p-4 border-b border-slate-200/60">Jurisdiction</th>
                <th className="p-4 border-b border-slate-200/60">Entry Type</th>
                <th className="p-4 border-b border-slate-200/60">Time Registered</th>
                <th className="p-4 border-b border-slate-200/60">Description</th>
                <th className="p-4 pr-6 border-b border-slate-200/60">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {recordsLoading ? (
                <tr>
                  <td colSpan="6" className="text-center py-10">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0f52ba] mx-auto mb-4"></div>
                    <p className="text-slate-500 font-medium">Syncing live records...</p>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-10">
                    <FileText size={32} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-500 font-bold">No active dockets recorded.</p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const refId = log.data?.fir_no || log.data?.gd_no || log.data?.linked_fir_dd_no || log.data?.dd_fir_no || log.data?.uidbNumber || log.id.substring(0, 8);
                  const gist = log.data?.brief_facts || log.data?.call_gist || log.data?.recovered_material || log.data?.physical_description || log.data?.description || 'No description provided';
                  return (
                    <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4 pl-6 font-mono font-bold text-slate-800">{refId}</td>
                      <td className="p-4 font-semibold text-slate-600">{log.ps_name || log.district_name || 'Delhi Police'}</td>
                      <td className="p-4 font-bold text-slate-600 text-xs">
                        <span className="bg-slate-100 px-2 py-1 rounded-md border border-slate-200">
                          {log.record_type}
                        </span>
                      </td>
                      <td className="p-4 font-mono text-slate-500">{getSystemDate(log.created_at)}</td>
                      <td className="p-4 max-w-[300px] truncate text-slate-500" title={gist}>{gist}</td>
                      <td className="p-4 pr-6">
                        <span className={`inline-flex items-center text-[10px] font-bold px-2 py-1 rounded-full border ${getBadgeColor(log.current_status)}`}>
                          {log.current_status}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals for Diary and Report (Keep static UI for now, just stylized) */}
      {/* DISTRICT DAILY MORNING DIARY COMPILE MODAL */}
      {diaryOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setDiaryOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <h2 className="flex items-center gap-2 font-display font-bold text-slate-800 text-lg">
                <BookOpen size={20} className="text-[#0f52ba]" />
                <span>Daily Morning Diary compilation (District DCP)</span>
              </h2>
              <button className="text-slate-400 hover:text-slate-700 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm" onClick={() => setDiaryOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto font-sans text-xs flex-grow">
              {/* Keep the original inner HTML structure for print formatting */}
              <div className="text-center mb-6 pb-4 border-b border-black">
                <h1 className="text-xl font-bold tracking-wider font-serif">DELHI POLICE</h1>
                <h2 className="text-sm font-semibold uppercase">{activeNode.name.toUpperCase()}</h2>
                <h3 className="text-xs font-medium mt-1">DAILY MORNING DIARY (COMPILATION REPORT)</h3>
                <p className="text-[10px] mt-1">Generated: {getIndianDateString()} | Previous 24-Hours Summary</p>
              </div>
              <p className="text-center text-slate-500 italic">This report requires District Scope configuration to generate live data.</p>
            </div>
          </div>
        </div>
      )}

      {/* HQ FORTNIGHTLY COMMAND REPORT MODAL */}
      {reportOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setReportOpen(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <h2 className="flex items-center gap-2 font-display font-bold text-slate-800 text-lg">
                <FileSpreadsheet size={20} className="text-[#cca43b]" />
                <span>Fortnightly Command Report (Headquarters)</span>
              </h2>
              <button className="text-slate-400 hover:text-slate-700 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm" onClick={() => setReportOpen(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto font-sans text-xs flex-grow">
               <div className="text-center mb-6 pb-4 border-b border-black">
                <h1 className="text-xl font-bold tracking-wider font-serif">DELHI POLICE HEADQUARTERS</h1>
                <h2 className="text-sm font-semibold uppercase">SUPREME COMMAND AND CONTROL CENTRE</h2>
                <h3 className="text-xs font-medium mt-1">FORTNIGHTLY PERFORMANCE & CRIME ANALYSIS REPORT</h3>
                <p className="text-[10px] mt-1">Compiled: {getIndianDateString()} | Fortnight Range: 14 Days Analysis</p>
              </div>
              <p className="text-center text-slate-500 italic">This report requires full analytical queries implementation.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
