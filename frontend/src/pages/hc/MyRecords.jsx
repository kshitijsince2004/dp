import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { 
  FileText, Plus, FileEdit, Trash2, Send, Filter, Eye, 
  AlertCircle, RefreshCw, ArrowUpRight, RotateCcw, Clock, 
  CheckCircle2, Layers, ShieldCheck
} from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api.js';
import UnifiedFilterStrip from '../../components/common/UnifiedFilterStrip.jsx';
import FilterPresetsPanel from '../../components/common/FilterPresetsPanel.jsx';
import useAuthStore from '../../store/authStore.js';
import StatusUpdateModal from '../../components/records/StatusUpdateModal.jsx';
import { formatRecordRef, formatGist } from '../../utils/recordRef.js';
import { getStatusConfig } from '../../utils/statusConfig.js';
import { log } from '../../utils/logger.js';
import RecordTypeBadge from '../../components/common/RecordTypeBadge';

const pageVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, y: 12, filter: "blur(3px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring", stiffness: 95, damping: 14 } }
};

export default function MyRecords() {
  const { t, i18n } = useTranslation();
  const currentLng = i18n.language || 'en';
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const isUserSHO = user?.role === 'SHO';
  const isUserHC = user?.role === 'HC';

  const tableRef = useRef(null);

  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Domain status update modal (WS9)
  const [statusModalRecordId, setStatusModalRecordId] = useState(null);

  useEffect(() => {
    log.debug('page:mount', { route: '/records', userId: user?.id, role: user?.role });
    return () => log.debug('page:unmount', { route: '/records' });
  }, []);

  useEffect(() => {
    if (location.search.includes('scrollTo=table') || location.hash === '#records-table') {
      setTimeout(() => {
        tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 150);
    }
  }, [location]);

  // Fetch all records without filters to calculate the hero stats accurately
  const { data: allRecords = [] } = useQuery({
    queryKey: ['all-records-stats'],
    queryFn: async () => {
      const res = await api.get('/records', { params: { limit: 'all' } });
      const payload = res.data?.data;
      const rows = payload?.cases || payload?.records || payload?.queue || (Array.isArray(payload) ? payload : (Array.isArray(res.data) ? res.data : []));
      return Array.isArray(rows) ? rows : [];
    },
  });

  const safeAllRecords = Array.isArray(allRecords) ? allRecords : [];
  const getRecordStatus = (r) => r.current_status || r.status || r.workflow_status || '';

  const isForwarded = (r) => {
    const s = getRecordStatus(r);
    return ['DISTRICT_REVIEW', 'JCP_REVIEW', 'SCP_REVIEW', 'HQ_RECEIVED', 'COMPILED', 'ARCHIVED', 'SUBMITTED', 'SHO_REVIEWED', 'ACP_REVIEW'].includes(s);
  };
  const isReturnedByDistrict = (r) => {
    const s = getRecordStatus(r);
    return (s === 'SENT_BACK' || s === 'SENT_BACK_HC') && (r.last_transition_from_level === 'DISTRICT' || r.last_transition_by_role === 'DISTRICT_OFFICER');
  };
  const isSentBackToHc = (r) => {
    const s = getRecordStatus(r);
    return (s === 'SENT_BACK' || s === 'SENT_BACK_HC') && (r.last_transition_from_level === 'PS' || !r.last_transition_from_level || r.last_transition_role === 'SHO');
  };
  const isPendingSho = (r) => getRecordStatus(r) === 'PENDING_SHO';
  const isDraft = (r) => getRecordStatus(r) === 'DRAFT';

  const totalCount = safeAllRecords.length;
  const forwardedCount = safeAllRecords.filter(isForwarded).length;
  const returnedByDistrictCount = safeAllRecords.filter(isReturnedByDistrict).length;
  const sentBackToHcCount = safeAllRecords.filter(isSentBackToHc).length;
  const pendingShoCount = safeAllRecords.filter(isPendingSho).length;
  const draftCount = safeAllRecords.filter(isDraft).length;

  const [filters, setFilters] = useState({
    type: 'ALL',
    status: 'ALL',
    dateFrom: null,
    dateTo: null,
    search: '',
    localHead: ''
  });

  // Reset selectedIds when filters change
  useEffect(() => {
    setSelectedIds([]);
  }, [filters]);

  // Fetch filtered records
  const { data: rawRecords = [], isLoading } = useQuery({
    queryKey: ['records', filters],
    queryFn: async () => {
      const params = {};
      if (filters.type) params.type = filters.type;
      if (filters.arrestKind) params.arrest_kind = filters.arrestKind;
      if (filters.status && filters.status !== 'ALL') {
        params.status = filters.status;
      }
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.search) params.search = filters.search;
      if (filters.localHead) params.localHead = filters.localHead;

      log.debug('data:load_start', { what: 'records_list', params });
      try {
        const res = await api.get('/records', { params });
        const payload = res.data.data;
        const rows = payload?.cases || payload?.records || payload?.queue || (Array.isArray(payload) ? payload : []);
        log.debug('data:load_success', { what: 'records_list', count: rows.length });
        return Array.isArray(rows) ? rows : [];
      } catch (err) {
        log.error('data:load_error', { what: 'records_list', err });
        throw err;
      }
    },
  });

  const records = Array.isArray(rawRecords) ? rawRecords : [];

  // Submit Draft to SHO mutation
  const submitMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.post(`/records/${id}/submit`);
      return res.data;
    },
    onSuccess: () => {
      toast.success(t('actions.submitSuccess', 'Record submitted successfully'));
      queryClient.invalidateQueries({ queryKey: ['records'] });
      queryClient.invalidateQueries({ queryKey: ['all-records-stats'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to submit record');
    },
  });

  // Delete Draft mutation
  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.delete(`/records/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success(t('actions.deleteSuccess', 'Draft deleted successfully'));
      queryClient.invalidateQueries({ queryKey: ['records'] });
      queryClient.invalidateQueries({ queryKey: ['all-records-stats'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to delete draft');
    },
  });

  // Sort priorities: Returned/Sent Back first, then Pending SHO, then Drafts, then rest
  const filteredRecords = [...records].sort((a, b) => {
    const aIsReturned = a.current_status === 'SENT_BACK' || a.current_status === 'SENT_BACK_HC';
    const bIsReturned = b.current_status === 'SENT_BACK' || b.current_status === 'SENT_BACK_HC';
    if (aIsReturned && !bIsReturned) return -1;
    if (!aIsReturned && bIsReturned) return 1;

    const aIsPending = a.current_status === 'PENDING_SHO';
    const bIsPending = b.current_status === 'PENDING_SHO';
    if (aIsPending && !bIsPending) return -1;
    if (!aIsPending && bIsPending) return 1;

    return 0;
  });

  // Edit / Submit permission rules
  const canEditRecord = (rec) => {
    if (isUserSHO) {
      // SHO can only edit records when pushed from HC for SHO approval (PENDING_SHO) OR returned by District for correction
      if (rec.current_status === 'PENDING_SHO') return true;
      if (rec.current_status === 'SENT_BACK' || rec.current_status === 'SENT_BACK_HC') {
        return rec.last_transition_from_level === 'DISTRICT' || rec.last_transition_by_role === 'DISTRICT_OFFICER';
      }
      return false;
    }
    if (isUserHC) {
      // HC can edit drafts or records returned to HC
      return rec.current_status === 'DRAFT' || rec.current_status === 'SENT_BACK' || rec.current_status === 'SENT_BACK_HC';
    }
    return false;
  };

  const canSubmitRecord = (rec) => {
    if (isUserHC) {
      return rec.current_status === 'DRAFT' || rec.current_status === 'SENT_BACK' || rec.current_status === 'SENT_BACK_HC';
    }
    if (isUserSHO) {
      if (rec.current_status === 'PENDING_SHO') return true;
      if (rec.current_status === 'SENT_BACK' || rec.current_status === 'SENT_BACK_HC') {
        return rec.last_transition_from_level === 'DISTRICT' || rec.last_transition_by_role === 'DISTRICT_OFFICER';
      }
      return false;
    }
    return false;
  };

  const submittableRecords = filteredRecords.filter(canSubmitRecord);

  const isAllSelected = submittableRecords.length > 0 && submittableRecords.every(r => selectedIds.includes(r.id));

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(submittableRecords.map(r => r.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectRow = (id, checked) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(item => item !== id));
    }
  };

  const handleBulkSubmit = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(t('actions.confirmBulkSubmit', `Confirm submission of all ${selectedIds.length} selected records? This locks the records.`))) {
      return;
    }
    
    setBulkLoading(true);
    let successCount = 0;
    let failCount = 0;
    
    const results = await Promise.allSettled(
      selectedIds.map(id => api.post(`/records/${id}/submit`))
    );
    
    results.forEach(res => {
      if (res.status === 'fulfilled') {
        successCount++;
      } else {
        failCount++;
        console.error('Failed to submit record:', res.reason);
      }
    });
    
    if (successCount > 0) {
      toast.success(t('actions.bulkSubmitSuccess', `${successCount} records submitted successfully!`));
    }
    if (failCount > 0) {
      toast.error(t('actions.bulkSubmitFail', `Failed to submit ${failCount} records.`));
    }
    
    setSelectedIds([]);
    setBulkLoading(false);
    queryClient.invalidateQueries({ queryKey: ['records'] });
    queryClient.invalidateQueries({ queryKey: ['all-records-stats'] });
  };

  // Render Status Badge with rich lifecycle context
  const renderStatusBadge = (rec) => {
    const status = rec.current_status || rec.status || 'DRAFT';
    
    // 1. Returned / Sent Back
    if (status === 'SENT_BACK' || status === 'SENT_BACK_HC') {
      const isFromDistrict = rec.last_transition_from_level === 'DISTRICT' || rec.last_transition_by_role === 'DISTRICT_OFFICER';
      if (isFromDistrict) {
        return (
          <div className="flex flex-col gap-1 items-start">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border shadow-sm bg-rose-100 text-rose-800 border-rose-300">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping" />
              ↩ {t('status.RETURNED_DISTRICT', 'Returned by District')}
            </span>
            {rec.last_transition_comment && (
              <span className="text-[11px] text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200/80 max-w-[260px] truncate" title={rec.last_transition_comment}>
                District Note: {rec.last_transition_comment}
              </span>
            )}
          </div>
        );
      }

      return (
        <div className="flex flex-col gap-1 items-start">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border shadow-sm bg-amber-100 text-amber-900 border-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600" />
            ↩ {t('status.SENT_BACK_HC', 'Sent Back to HC')}
          </span>
          {rec.last_transition_comment && (
            <span className="text-[11px] text-amber-900 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/80 max-w-[260px] truncate" title={rec.last_transition_comment}>
              SHO Note: {rec.last_transition_comment}
            </span>
          )}
        </div>
      );
    }

    // 2. Forwarded to District / Higher
    if (status === 'DISTRICT_REVIEW') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border shadow-sm bg-blue-50 text-blue-700 border-blue-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          ↗ {t('status.DISTRICT_REVIEW', 'Forwarded (District Review)')}
        </span>
      );
    }

    if (['JCP_REVIEW', 'SCP_REVIEW', 'HQ_RECEIVED', 'COMPILED', 'ARCHIVED'].includes(status)) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border shadow-sm bg-emerald-50 text-emerald-800 border-emerald-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
          ✓ {t(`status.${status}`, status)}
        </span>
      );
    }

    // 3. Pending SHO
    if (status === 'PENDING_SHO') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border shadow-sm bg-amber-50 text-amber-700 border-amber-200/80">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          ⏱ {t('status.PENDING_SHO', 'Pending SHO Review')}
        </span>
      );
    }

    // 4. Draft or Default
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border shadow-sm bg-slate-100 text-slate-600 border-slate-200/80">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        {t(`status.${status}`, status || 'Draft')}
      </span>
    );
  };

  const workflowQuickTabs = isUserSHO ? [
    { key: 'ALL', label: t('status.ALL', 'All Station Records'), count: totalCount, icon: Layers, color: 'border-slate-400 text-white' },
    { key: 'PENDING_SHO', label: t('status.PENDING_SHO', 'Pending SHO Review'), count: pendingShoCount, icon: Clock, color: 'border-amber-300 text-amber-100' },
    { key: 'FORWARDED', label: t('status.FORWARDED', 'Forwarded to District'), count: forwardedCount, icon: ArrowUpRight, color: 'border-blue-400 text-blue-200' },
    { key: 'RETURNED_DISTRICT', label: t('status.RETURNED_DISTRICT', 'Returned by District'), count: returnedByDistrictCount, icon: AlertCircle, color: 'border-rose-400 text-rose-200' },
    { key: 'SENT_BACK_HC', label: t('status.SENT_BACK_HC', 'Sent Back to HC'), count: sentBackToHcCount, icon: RotateCcw, color: 'border-amber-400 text-amber-200' }
  ] : [
    { key: 'ALL', label: t('status.ALL', 'All My Records'), count: totalCount, icon: Layers, color: 'border-slate-400 text-white' },
    { key: 'DRAFT', label: t('status.DRAFT', 'Drafts'), count: draftCount, icon: FileEdit, color: 'border-sky-400 text-sky-200' },
    { key: 'PENDING_SHO', label: t('status.PENDING_SHO', 'Submitted to SHO'), count: pendingShoCount, icon: Clock, color: 'border-amber-300 text-amber-100' },
    { key: 'FORWARDED', label: t('status.FORWARDED', 'Forwarded to District'), count: forwardedCount, icon: ArrowUpRight, color: 'border-blue-400 text-blue-200' },
    { key: 'SENT_BACK_HC', label: t('status.SENT_BACK_HC', 'Returned for Correction'), count: (sentBackToHcCount + returnedByDistrictCount), icon: RotateCcw, color: 'border-amber-400 text-amber-200' }
  ];

  return (
    /* ── Full-page background matching Dashboard's deep navy gradient ── */
    <div className="min-h-screen theme-hc-page page-bg">
      <div className="hero-banner-gradient px-4 sm:px-8 pt-8 pb-16 relative overflow-hidden shadow-xl">
        <div className="absolute -top-10 -right-10 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-40 h-40 bg-white/5 rounded-full blur-2xl pointer-events-none" />

        <div className="w-full max-w-[1920px] mx-auto relative z-10 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex flex-col gap-1.5">
              <h1 className="text-3xl sm:text-4xl font-black text-white flex items-center gap-3 m-0 font-display tracking-tight">
                {t('nav.records', 'Station Records Desk')}
              </h1>
              <p className="text-base text-white/85 font-medium m-0">
                {isUserSHO 
                  ? t('common.shoRecordsSubtitle', 'Complete station lifecycle view: forwarded cases, district returns, HC revisions, and pending reviews.')
                  : t('common.recordsSubtitle', 'Manage and submit your daily diary entries.')}
              </p>
            </div>

            <div className="text-right">
              <p className="text-xl sm:text-2xl font-bold text-white/95 m-0 font-display">
                {currentLng === 'hi' ? (user?.name || user?.username) : (user?.name || user?.username || 'User')}
              </p>
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-white/80 bg-white/10 px-3 py-1 rounded-full border border-white/20 mt-1">
                <ShieldCheck size={14} className="text-emerald-300" />
                {t(`roles.${user?.role}`, user?.role)} • {user?.ps_name || 'Police Station'}
              </span>
            </div>
          </div>

          {/* ── Interactive Lifecycle Stat Cards ── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2">
            {workflowQuickTabs.map(tab => {
              const Icon = tab.icon;
              const isActive = filters.status === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setFilters(prev => ({ ...prev, status: tab.key }))}
                  className={`rounded-2xl p-3.5 text-left transition-all duration-200 cursor-pointer backdrop-blur-md border flex flex-col justify-between gap-2 shadow-sm hover:scale-[1.03] ${
                    isActive 
                      ? 'bg-white/25 border-white shadow-lg ring-2 ring-white/60' 
                      : 'bg-white/10 border-white/20 hover:bg-white/15'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-white/90">
                      {tab.label}
                    </span>
                    <Icon size={16} className={tab.color} />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-white tabular-nums">
                    {tab.count}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Content area overlaid on the light bg ── */}
      <motion.div
        variants={pageVariants}
        initial="hidden"
        animate="show"
        className="w-full max-w-[1920px] mx-auto px-3 sm:px-4 lg:px-6 pb-12 -mt-6 space-y-6"
      >

        {/* Unified Filter Strip */}
        <motion.div variants={itemVariants}>
          <UnifiedFilterStrip
            filters={filters}
            onFilterChange={setFilters}
            allowedStatuses={isUserSHO 
              ? ['ALL', 'PENDING_SHO', 'FORWARDED', 'RETURNED_DISTRICT', 'SENT_BACK_HC', 'COMPILED']
              : ['ALL', 'DRAFT', 'PENDING_SHO', 'FORWARDED', 'SENT_BACK_HC', 'COMPILED']
            }
          />
        </motion.div>

        {/* Saved Filter Presets — card */}
        <motion.div
          variants={itemVariants}
          className="bg-white rounded-2xl shadow-md border border-[#E2E8F0] p-4 transition-shadow duration-200 hover:shadow-lg"
        >
          <FilterPresetsPanel
            currentFilters={filters}
            onLoadPreset={(saved) => {
              setFilters(prev => ({
                ...prev,
                type: saved.type !== undefined ? saved.type : prev.type,
                status: saved.status !== undefined ? saved.status : prev.status,
                dateFrom: saved.dateFrom !== undefined ? saved.dateFrom : prev.dateFrom,
                dateTo: saved.dateTo !== undefined ? saved.dateTo : prev.dateTo,
                search: saved.search !== undefined ? saved.search : prev.search
              }));
            }}
          />
        </motion.div>

        {/* Fixed Floating Bulk Actions Bar */}
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white backdrop-blur-xl border border-slate-700/80 px-6 py-4 rounded-2xl shadow-2xl flex flex-wrap items-center justify-between gap-4 min-w-[320px] max-w-[90vw]"
          >
            <div className="flex items-center gap-3">
              <span className="bg-emerald-500 text-slate-950 font-black rounded-full h-7 w-7 flex items-center justify-center text-xs tabular-nums shadow-md">
                {selectedIds.length}
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                  {t('actions.selectedRecords', 'Records Selected')}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  {t('actions.readyForBulkSubmit', 'Ready for batch submission')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 ml-auto">
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="px-3.5 py-2 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-all border border-transparent hover:border-slate-700 cursor-pointer"
              >
                {t('actions.clearSelection', 'Deselect All')}
              </button>

              <button
                type="button"
                onClick={handleBulkSubmit}
                disabled={bulkLoading}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-6 py-2.5 rounded-xl text-sm transition-all duration-200 shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center gap-2 cursor-pointer disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed uppercase tracking-wider border-none"
              >
                {bulkLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-950" />
                    <span>{t('actions.submitting', 'Submitting...')}</span>
                  </>
                ) : (
                  <>
                    <Send size={16} className="stroke-[2.5]" />
                    <span>{t('actions.sendAllToSHO', `Submit ${selectedIds.length} Selected`)}</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}

        {/* Records Listing */}
        <div ref={tableRef} style={{ scrollMarginTop: '24px' }}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-20 bg-white rounded-3xl shadow-md border border-[#E2E8F0] text-[#4A5568]">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--accent-color)] mb-4"></div>
              <p className="text-sm font-semibold tracking-wide text-[#718096]">
                {t('common.loading', 'Syncing digital registry logs...')}
              </p>
            </div>
          ) : filteredRecords.length === 0 ? (
            <motion.div
              variants={itemVariants}
              className="bg-white rounded-3xl border border-dashed border-[#CBD5E0] p-16 text-center shadow-md"
            >
              <div className="mx-auto w-16 h-16 rounded-2xl bg-[var(--accent-glow)] flex items-center justify-center mb-4 shadow-inner">
                <FileText size={32} className="text-[var(--accent-color)]" />
              </div>
              <p className="text-lg font-bold text-[#1A202C]">
                {t('common.noRecords', 'No Station Records Found for Selected Filter')}
              </p>
              <p className="text-base text-[#718096] mt-1 font-medium">
                {filters.status !== 'ALL' 
                  ? `There are currently no records matching "${filters.status}". Switch to "All Records" to view full repository.` 
                  : t('common.noRecordsDetail', 'Enter daily general diary records or import legacy data.')}
              </p>
              {filters.status !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setFilters(prev => ({ ...prev, status: 'ALL' }))}
                  className="mt-4 px-4 py-2 bg-[var(--accent-color)] text-white text-sm font-bold rounded-xl shadow hover:bg-[var(--accent-color-hover)] transition-colors cursor-pointer"
                >
                  View All Records
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div
              variants={itemVariants}
              className="bg-white rounded-3xl overflow-hidden shadow-lg border border-[#E2E8F0] transition-shadow duration-200 hover:shadow-xl"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-base">
                  <thead>
                    <tr className="bg-gradient-to-r from-[var(--accent-color-hover)] to-[var(--accent-color)] text-white uppercase font-black text-xs sm:text-sm tracking-wider">
                      <th className="p-4 pl-6 w-12 text-center">
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          onChange={handleSelectAll}
                          disabled={submittableRecords.length === 0}
                          className="rounded border-slate-300 text-[var(--accent-color)] focus:ring-[var(--accent-color)] h-4 w-4 cursor-pointer"
                        />
                      </th>
                      <th className="p-4">{t('common.referenceId', 'Ref ID / Number')}</th>
                      <th className="p-4">Police Station</th>
                      <th className="p-4">{t('common.recordDate', 'Record Date')}</th>
                      <th className="p-4">{t('common.details', 'Gist')}</th>
                      <th className="p-4">{t('common.status', 'Status')}</th>
                      <th className="p-4 pr-6 text-right">{t('common.actions', 'Operations')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] text-[#1A202C]">
                    {filteredRecords.map((rec, index) => {
                      const psName = rec.ps_name || rec.data?.police_station || rec.data?.ps || 'PS Parliament Street';
                      const refId = formatRecordRef(rec);

                      const gist =
                        rec.data?.brief_facts ||
                        rec.data?.call_gist ||
                        rec.data?.recovered_material ||
                        rec.data?.physical_description ||
                        rec.data?.description ||
                        rec.data?.foundPlace ||
                        rec.case_local_head ||
                        rec.call_head ||
                        rec.arrest_local_head ||
                        rec.uidb_local_head ||
                        'No description text logged';

                      const recDate = rec.record_date || rec.registration_date || rec.created_at || rec.data?.record_date || 'N/A';
                      const isSentBack = rec.current_status === 'SENT_BACK_HC' || rec.current_status === 'SENT_BACK';
                      const isDistrictReturned = isSentBack && (rec.last_transition_from_level === 'DISTRICT' || rec.last_transition_by_role === 'DISTRICT_OFFICER');
                      const rowEditable = canEditRecord(rec);
                      const rowSubmittable = canSubmitRecord(rec);

                      return (
                        <motion.tr
                          key={rec.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.02, duration: 0.3 }}
                          className={`transition-colors duration-150 group ${
                            isDistrictReturned
                              ? 'bg-rose-50/90 hover:bg-rose-100/80 border-l-4 border-l-rose-500'
                              : isSentBack
                              ? 'bg-amber-50/70 hover:bg-amber-100/70 border-l-4 border-l-amber-500'
                              : rec.current_status === 'PENDING_SHO'
                              ? 'bg-amber-50/30 hover:bg-amber-100/40'
                              : 'hover:bg-[var(--accent-glow)]'
                          }`}
                        >
                          <td className="p-4 pl-6 text-center w-12">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(rec.id)}
                              onChange={(e) => handleSelectRow(rec.id, e.target.checked)}
                              disabled={!rowSubmittable}
                              className="rounded border-slate-300 text-[var(--accent-color)] focus:ring-[var(--accent-color)] h-4 w-4 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="p-4 font-mono font-bold text-[var(--accent-color)] text-sm sm:text-base group-hover:text-[var(--accent-color-hover)] transition-colors">
                            <div className="flex flex-col gap-1">
                              <span>{refId}</span>
                              <RecordTypeBadge recordType={rec.record_type} />
                            </div>
                          </td>
                          <td className="p-4 text-sm sm:text-base font-semibold text-[#1A202C]">
                            <div className="flex flex-col gap-0.5">
                              <span>{psName}</span>
                              {rec.transfer_to_type === 'PS' && user?.ps_id && String(rec.transferred_to_ps_id) === String(user.ps_id) && String(rec.ps_id) !== String(user.ps_id) && (
                                <span className="text-[11px] font-bold text-sky-600 flex items-center gap-1">
                                  ↙ Transferred from {rec.origin_ps_name || rec.ps_name}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 font-mono text-[#4A5568] font-semibold text-sm sm:text-base">
                            {typeof recDate === 'string' ? recDate.slice(0, 10) : 'N/A'}
                          </td>
                          <td className="p-4 max-w-[320px] truncate text-[#4A5568] font-medium text-sm sm:text-base" title={gist}>
                            {gist}
                          </td>
                          <td className="p-4">
                            <div className="flex flex-col gap-1.5 items-start">
                              {renderStatusBadge(rec)}
                              {(rec.case_status === 'TRANSFER' || rec.data?.case_status === 'TRANSFER') && (
                                <>
                                  {/* Transfer to PS */}
                                  {(rec.transfer_to_type === 'PS' || rec.data?.transfer_to === 'PS') && (
                                    user?.ps_id && String(rec.transferred_to_ps_id) === String(user.ps_id) && String(rec.ps_id) !== String(user.ps_id) ? (
                                      <span
                                        className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 shadow-xs"
                                        title={`Transferred from ${rec.ps_name || rec.origin_ps_name || 'Origin PS'} on ${rec.date_of_transfer || rec.data?.date_of_transfer || 'N/A'}`}
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                                        ↙ Transferred In
                                      </span>
                                    ) : (
                                      <span
                                        className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-xs"
                                        title={`Transferred to ${rec.transferred_to_ps_name || rec.data?.transferred_to_ps || 'Destination PS'} on ${rec.date_of_transfer || rec.data?.date_of_transfer || 'N/A'}`}
                                      >
                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                        ↗ Transferred ({rec.transferred_to_ps_name || rec.data?.transferred_to_ps || 'PS'})
                                      </span>
                                    )
                                  )}
                                  {/* Transfer to Agency */}
                                  {(rec.transfer_to_type === 'Agency' || rec.data?.transfer_to === 'Agency') && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 shadow-xs"
                                      title={`Investigation conducted by ${rec.transferred_to_agency_name || rec.data?.transferred_to_agency || 'Agency'} on ${rec.date_of_transfer || rec.data?.date_of_transfer || 'N/A'}`}
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                      🏛 {rec.transferred_to_agency_name || rec.data?.transferred_to_agency || 'Agency'}
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                          <td className="p-3.5 pr-6 text-right space-x-2 whitespace-nowrap">

                            {/* View Action */}
                            <button
                              onClick={() => navigate(`/records/${rec.id}`)}
                              className="bg-[var(--accent-glow)] hover:bg-[var(--accent-color)] text-[var(--accent-color)] hover:text-white p-2.5 rounded-xl transition-colors duration-200 inline-flex items-center justify-center cursor-pointer border border-[var(--accent-color)]/30 hover:border-[var(--accent-color)] shadow-xs"
                              title="View Details"
                            >
                              <Eye size={16} />
                            </button>

                            {/* SHO Quick Review & Approve / Send Back Action on Pending SHO */}
                            {isUserSHO && rec.current_status === 'PENDING_SHO' && (
                              <button
                                onClick={() => navigate(`/sho/approval`)}
                                className="bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white px-3 py-2 rounded-xl transition-colors duration-200 inline-flex items-center gap-1.5 text-xs font-bold cursor-pointer border border-emerald-300 hover:border-emerald-600 shadow-xs"
                                title="Open Approval Desk to Review, Edit, or Return to HC"
                              >
                                <CheckCircle2 size={15} />
                                <span>Review & Approve</span>
                              </button>
                            )}

                            {/* Update Status Action (WS9) */}
                            <button
                              onClick={() => setStatusModalRecordId(rec.id)}
                              className="bg-violet-50 hover:bg-violet-500 text-violet-700 hover:text-white p-2.5 rounded-xl transition-all duration-200 inline-flex items-center justify-center cursor-pointer border border-violet-200 hover:border-violet-500 hover:shadow-lg hover:shadow-violet-500/20 active:scale-95 shadow-xs"
                              title={t('statusUpdate.updateAction', 'Update Status')}
                            >
                              <RefreshCw size={16} />
                            </button>

                            {/* Edit Action */}
                            {rowEditable && (
                              <button
                                onClick={() => navigate(`/records/new/${rec.record_type}?edit=${rec.id}`)}
                                className="bg-amber-50 hover:bg-[#cca43b] text-amber-700 hover:text-white p-2.5 rounded-xl transition-colors duration-200 inline-flex items-center justify-center cursor-pointer border border-amber-200 hover:border-[#cca43b] shadow-xs"
                                title="Edit Full Record"
                              >
                                <FileEdit size={16} />
                              </button>
                            )}

                            {/* Submit Action */}
                            {rowSubmittable && (
                              <button
                                onClick={() => {
                                  if (window.confirm(t('actions.confirmSubmit', 'Confirm submission? This locks the record.'))) {
                                    submitMutation.mutate(rec.id);
                                  }
                                }}
                                className="bg-emerald-50 hover:bg-emerald-600 text-emerald-700 hover:text-white p-2.5 rounded-xl transition-colors duration-200 inline-flex items-center justify-center cursor-pointer border border-emerald-200 hover:border-emerald-600 shadow-xs"
                                title="Submit Record"
                              >
                                <Send size={16} />
                              </button>
                            )}

                            {/* Delete Draft Action (only for HC on unsubmitted drafts) */}
                            {isUserHC && rec.current_status === 'DRAFT' && (
                              <button
                                onClick={() => {
                                  if (window.confirm(t('actions.confirmDelete', 'Delete this draft record forever?'))) {
                                    deleteMutation.mutate(rec.id);
                                  }
                                }}
                                className="bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white p-2.5 rounded-xl transition-colors duration-200 inline-flex items-center justify-center cursor-pointer border border-rose-200 hover:border-rose-600 shadow-xs"
                                title="Delete Draft"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>

      <StatusUpdateModal
        recordId={statusModalRecordId}
        open={!!statusModalRecordId}
        onClose={() => setStatusModalRecordId(null)}
      />
    </div>
  );
}