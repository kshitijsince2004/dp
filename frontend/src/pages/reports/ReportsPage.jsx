import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { FileSpreadsheet } from 'lucide-react';
import useAuthStore from '../../store/authStore.js';
import CustomExcelBuilder from './CustomExcelBuilder';
import { log } from '../../utils/logger.js';

const getThemeClass = (role) => {
  switch (role) {
    case 'HC':          return 'theme-hc-page';
    case 'SHO':         return 'theme-sho-page';
    case 'ACP':         return 'theme-acp-page';
    case 'DISTRICT_OFFICER': return 'theme-district-page';
    case 'HQ_ANALYST':
    case 'HQ_ADMIN':    return 'theme-hq-page';
    case 'SYSTEM_ADMIN': return 'theme-admin-page';
    default:            return 'theme-shared-page';
  }
};

export const ReportsPage = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();

  useEffect(() => {
    log.debug('page:mount', { route: '/reports', userId: user?.id, role: user?.role });
    return () => log.debug('page:unmount', { route: '/reports' });
  }, []);

  return (
    <div className={`fade-in-up ${getThemeClass(user?.role)} page-bg p-6 min-h-screen font-sans`}>
      {/* Hero Header */}
      <div className="hero-banner-gradient px-8 py-8 shadow-lg relative overflow-hidden rounded-2xl mb-6">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full border border-white/5" />
        <div className="absolute -right-4 -top-4 h-32 w-32 rounded-full border border-white/5" />
        <div className="relative z-10">
          <h1 className="mt-3 text-2xl font-bold text-white flex items-center gap-3 font-display">
            <FileSpreadsheet size={24} className="text-white/80" />
            <span>{t('nav.reports')}</span>
          </h1>
          <p className="text-white/60 text-xs mt-1.5 max-w-lg font-semibold">
            Build custom Excel exports by selecting record types, fields, and date ranges.
          </p>
        </div>
      </div>

      <CustomExcelBuilder />
    </div>
  );
};

export default ReportsPage;
