import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet, BarChart3, Search } from 'lucide-react';
import useAuthStore from '../../store/authStore.js';
import CustomExcelBuilder from './CustomExcelBuilder';
import ReportBuilder from './ReportBuilder';
import RecordTracePanel from './RecordTracePanel';
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
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('builder'); // 'builder', 'excel', or 'trace'

  useEffect(() => {
    log.debug('page:mount', { route: '/reports', userId: user?.id, role: user?.role });
    return () => log.debug('page:unmount', { route: '/reports' });
  }, []);

  return (
    <div className={`fade-in-up ${getThemeClass(user?.role)} page-bg p-6 min-h-screen font-sans`}>
      {/* Navigation Tabs Header */}
      <div className="flex flex-wrap items-center gap-3 mb-6 border-b border-slate-700/60 pb-3">
        <button
          onClick={() => setActiveTab('builder')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === 'builder'
              ? 'bg-emerald-600 text-white shadow-lg'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
          }`}
        >
          <BarChart3 size={16} />
          <span>Build Your Own Report (Pivot Builder)</span>
        </button>

        <button
          onClick={() => setActiveTab('excel')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === 'excel'
              ? 'bg-emerald-600 text-white shadow-lg'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
          }`}
        >
          <FileSpreadsheet size={16} />
          <span>Custom Excel & Field Exporter</span>
        </button>

        <button
          onClick={() => setActiveTab('trace')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all cursor-pointer ${
            activeTab === 'trace'
              ? 'bg-emerald-600 text-white shadow-lg'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'
          }`}
        >
          <Search size={16} />
          <span>Record Trace Tool (Verification)</span>
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'builder' && <ReportBuilder />}
      {activeTab === 'excel' && <CustomExcelBuilder />}
      {activeTab === 'trace' && <RecordTracePanel />}
    </div>
  );
};

export default ReportsPage;
