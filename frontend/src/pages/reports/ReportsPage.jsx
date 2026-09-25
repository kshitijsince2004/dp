import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, BarChart3, Search, FileText, BookOpen } from 'lucide-react';
import useAuthStore from '../../store/authStore.js';
import CustomExcelBuilder from './CustomExcelBuilder';
import ReportBuilder from './ReportBuilder';
import RecordTracePanel from './RecordTracePanel';
import MultiSheetReportBuilder from './MultiSheetReportBuilder';
import { log } from '../../utils/logger.js';

const getThemeClass = (role) => {
  switch (role) {
    case 'HC':
      return 'theme-hc-page';
    case 'SHO':
      return 'theme-sho-page';
    case 'ACP':
      return 'theme-acp-page';
    case 'DISTRICT_OFFICER':
      return 'theme-district-page';
    case 'HQ_ANALYST':
    case 'HQ_ADMIN':
      return 'theme-hq-page';
    case 'SYSTEM_ADMIN':
      return 'theme-admin-page';
    default:
      return 'theme-shared-page';
  }
};

export const ReportsPage = () => {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('builder'); // 'builder', 'excel', 'multisheet', 'trace'

  useEffect(() => {
    log.debug('page:mount', { route: '/reports', userId: user?.id, role: user?.role });
    return () => log.debug('page:unmount', { route: '/reports' });
  }, []);

  return (
    <div className={`fade-in-up ${getThemeClass(user?.role)} page-bg p-6 min-h-screen font-sans`}>
      {/* Top Header & Subtitle */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 border border-blue-100 rounded-xl text-[#0f52ba]">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#0d2a4a] tracking-tight">
                Police Intelligence &amp; Executive Report Command Center
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Statutory Returns, OLAP Multi-Dimensional Pivots, Granular Dossier Exports &amp; FIR Traceability
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Tabs Header */}
        <div className="flex flex-wrap items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('builder')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold text-xs transition-all cursor-pointer ${
              activeTab === 'builder'
                ? 'bg-[#0f52ba] text-white shadow-md'
                : 'text-slate-600 hover:text-[#0d2a4a] hover:bg-white'
            }`}
          >
            <BarChart3 size={14} />
            <span>1. Custom Pivot Matrix</span>
          </button>

          <button
            onClick={() => setActiveTab('excel')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold text-xs transition-all cursor-pointer ${
              activeTab === 'excel'
                ? 'bg-[#0f52ba] text-white shadow-md'
                : 'text-slate-600 hover:text-[#0d2a4a] hover:bg-white'
            }`}
          >
            <FileText size={14} />
            <span>2. Raw Case/Register Export</span>
          </button>

          <button
            onClick={() => setActiveTab('multisheet')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold text-xs transition-all cursor-pointer ${
              activeTab === 'multisheet'
                ? 'bg-[#0f52ba] text-white shadow-md'
                : 'text-slate-600 hover:text-[#0d2a4a] hover:bg-white'
            }`}
          >
            <BookOpen size={14} />
            <span>3. Official 41 FN Return</span>
          </button>

          <button
            onClick={() => setActiveTab('trace')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg font-semibold text-xs transition-all cursor-pointer ${
              activeTab === 'trace'
                ? 'bg-[#0f52ba] text-white shadow-md'
                : 'text-slate-600 hover:text-[#0d2a4a] hover:bg-white'
            }`}
          >
            <Search size={14} />
            <span>4. Formula Trace Audit</span>
          </button>
        </div>
      </div>

      {/* Tab Panels */}
      <div className="transition-all duration-200">
        {activeTab === 'builder' && <ReportBuilder />}
        {activeTab === 'excel' && <CustomExcelBuilder />}
        {activeTab === 'multisheet' && <MultiSheetReportBuilder />}
        {activeTab === 'trace' && <RecordTracePanel />}
      </div>
    </div>
  );
};

export default ReportsPage;
