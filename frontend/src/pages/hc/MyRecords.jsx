import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FileText, Plus, FileEdit, Trash2, Send, Filter, Eye, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../utils/api.js';
import UnifiedFilterStrip from '../../components/common/UnifiedFilterStrip.jsx';
import FilterPresetsPanel from '../../components/common/FilterPresetsPanel.jsx';
import useAuthStore from '../../store/authStore.js';


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

  const tableRef = useRef(null);

  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);

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
      const res = await api.get('/records');
      const payload = res.data.data;
      if (payload?.cases) return payload.cases;
      if (payload?.queue) return payload.queue;
      if (Array.isArray(payload)) return payload;
      return [];
    },
  });

  const sentBackCount = allRecords.filter(r => r.current_status === 'SENT_BACK' || r.current_status === 'SENT_BACK_HC').length;
  const draftCount = allRecords.filter(r => r.current_status === 'DRAFT').length;

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


  // Fetch all records
  const { data: records = [], isLoading } = useQuery({
    queryKey: ['records', filters],
    queryFn: async () => {
      const params = {};
      if (filters.type) params.type = filters.type;
      if (filters.status) {
        if (filters.status === 'SENT_BACK_HC') {
          // Both SENT_BACK_HC and SENT_BACK statuses are used to represent returned records in different components
          params.status = ['SENT_BACK_HC', 'SENT_BACK'];
        } else {
          params.status = filters.status;
        }
      }
      if (filters.dateFrom) params.dateFrom = filters.dateFrom;
      if (filters.dateTo) params.dateTo = filters.dateTo;
      if (filters.search) params.search = filters.search;
      if (filters.localHead) params.localHead = filters.localHead;

      const res = await api.get('/records', { params });
      const payload = res.data.data;
      if (payload?.cases) return payload.cases;
      if (payload?.queue) return payload.queue;
      if (Array.isArray(payload)) return payload;
      return [];
    },
  });

  // Submit Draft to SHO mutation
  const submitMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.post(`/records/${id}/submit`);
      return res.data;
    },
    onSuccess: () => {
      toast.success(t('actions.submitSuccess', 'Record submitted to SHO successfully'));
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
      toast.success(t('actions.deleteSuccess', 'Local draft deleted successfully'));
      queryClient.invalidateQueries({ queryKey: ['records'] });
      queryClient.invalidateQueries({ queryKey: ['all-records-stats'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to delete draft');
    },
  });

  // Sort 'SENT_BACK' and 'SENT_BACK_HC' records to the very top, maintaining original order for other records
  const filteredRecords = [...records].sort((a, b) => {
    const aIsSentBack = a.current_status === 'SENT_BACK_HC' || a.current_status === 'SENT_BACK';
    const bIsSentBack = b.current_status === 'SENT_BACK_HC' || b.current_status === 'SENT_BACK';
    if (aIsSentBack && !bIsSentBack) return -1;
    if (!aIsSentBack && bIsSentBack) return 1;
    return 0;
  });

  const submittableRecords = filteredRecords.filter(r => {
    const isSentBack = r.current_status === 'SENT_BACK_HC' || r.current_status === 'SENT_BACK';
    return r.current_status === 'DRAFT' || isSentBack;
  });

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
    if (!window.confirm(t('actions.confirmBulkSubmit', `Confirm submission of all ${selectedIds.length} selected records to the SHO? This locks the records.`))) {
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

  // Render Status Badge
  const renderStatusBadge = (status) => {
    const badges = {
      DRAFT: 'bg-slate-100 text-slate-600 border-slate-200/80',
      PENDING_SHO: 'bg-amber-50 text-amber-700 border-amber-200/60',
      ACP_REVIEW: 'bg-purple-50 text-purple-700 border-purple-200/60',
      DISTRICT_REVIEW: 'bg-blue-50 text-blue-700 border-blue-200/60',
      SENT_BACK: 'bg-rose-50 text-rose-700 border-rose-200/60',
      SENT_BACK_HC: 'bg-rose-50 text-rose-700 border-rose-200/60',
      COMPILED: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
    };
    const dotColors = {
      DRAFT: 'bg-slate-400',
      PENDING_SHO: 'bg-amber-500',
      ACP_REVIEW: 'bg-purple-500',
      DISTRICT_REVIEW: 'bg-blue-500',
      SENT_BACK: 'bg-rose-500',
      SENT_BACK_HC: 'bg-rose-500',
      COMPILED: 'bg-emerald-500',
    };
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border shadow-sm ${badges[status] || badges.DRAFT}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dotColors[status] || dotColors.DRAFT}`} />
        {t(`status.${status}`, status)}
      </span>
    );
  };

  return (
    /* ── Full-page background matching Dashboard's deep navy gradient ── */
    <div className="min-h-screen theme-hc-page page-bg">
      <div className="hero-banner-gradient px-8 pt-6 pb-14 relative overflow-hidden shadow-xl">
        <span className="user-greeting-badge text-3xl font-bold text-white/95 bg-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/15 shadow-sm">
          Hi, {currentLng === 'hi' ? (user?.name_hi || user?.name_en || user?.username) : (user?.name_en || user?.username || 'User')}
        </span>
        <div className="absolute -top-10 -right-10 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 w-40 h-40 bg-white/5 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start gap-6">
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl font-bold text-white flex items-center gap-3 m-0">
              {t('nav.records', 'My Records Desk')}
            </h1>
            <p className="text-sm text-white/70 font-medium m-0">
              {t('common.recordsSubtitle', 'Manage and submit your daily diary entries.')}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 md:flex-shrink-0 bg-transparent w-full md:w-auto md:pt-14">
            {/* Sent Back Box */}
            <div className="rounded-2xl bg-red-600/25 border border-red-400/40 backdrop-blur-sm px-4 py-2.5 min-w-[100px] text-center transition-all duration-200 hover:scale-105 hover:bg-white/20">
              <div className="text-2xl font-bold text-red-200 tabular-nums">{sentBackCount}</div>
              <div className="text-[10px] text-red-100/70 mt-0.5 font-medium uppercase tracking-wider">
                {t('status.SENT_BACK_LABEL', 'Returned')}
              </div>
            </div>

            {/* Drafts Box */}
            <div className="rounded-2xl bg-sky-500/15 border border-sky-400/30 backdrop-blur-sm px-4 py-2.5 min-w-[100px] text-center transition-all duration-200 hover:scale-105 hover:bg-white/20">
              <div className="text-2xl font-bold text-sky-300 tabular-nums">{draftCount}</div>
              <div className="text-[10px] text-sky-100/70 mt-0.5 font-medium uppercase tracking-wider">
                {t('status.DRAFT', 'Draft')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content area overlaid on the light bg ── */}
      <motion.div
        variants={pageVariants}
        initial="hidden"
        animate="show"
        className="mx-auto max-w-7xl px-6 pb-10 -mt-4 space-y-5"
      >

        {/* Unified Filter Strip — card floating over the page bg */}
        <motion.div
          variants={itemVariants}
          className="bg-white rounded-2xl shadow-md border border-[#E2E8F0] p-4 transition-shadow duration-200 hover:shadow-lg"
        >
          <UnifiedFilterStrip
            filters={filters}
            onFilterChange={setFilters}
            allowedStatuses={['ALL', 'DRAFT', 'PENDING_SHO', 'ACP_REVIEW', 'DISTRICT_REVIEW', 'SENT_BACK_HC', 'COMPILED']}
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

        {/* Bulk Actions Banner */}
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-md"
          >
            <div className="flex items-center gap-2 text-emerald-800 text-xs font-bold uppercase tracking-wider">
              <span className="bg-emerald-500 text-white rounded-full h-5 w-5 flex items-center justify-center text-[10px] tabular-nums font-extrabold shadow-sm">
                {selectedIds.length}
              </span>
              <span>{t('actions.selectedRecords', 'Records Selected')}</span>
            </div>
            <button
              type="button"
              onClick={handleBulkSubmit}
              disabled={bulkLoading}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-xs font-extrabold transition-all duration-200 hover:shadow-lg active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer disabled:bg-slate-300 disabled:cursor-not-allowed uppercase tracking-wider border-none"
            >
              {bulkLoading ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                  <span>{t('actions.submitting', 'Submitting...')}</span>
                </>
              ) : (
                <>
                  <Send size={13} />
                  <span>{t('actions.sendAllToSHO', 'Send Selected to SHO')}</span>
                </>
              )}
            </button>
          </motion.div>
        )}

        {/* Records Listing */}
        <div ref={tableRef} style={{ scrollMarginTop: '24px' }}>
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-20 bg-white rounded-3xl shadow-md border border-[#E2E8F0] text-[#4A5568]">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[var(--accent-color)] mb-4"></div>
              <p className="text-xs font-semibold tracking-wide text-[#718096]">
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
              <p className="text-base font-bold text-[#1A202C]">
                {t('common.noRecords', 'No Daily Log Entries Found')}
              </p>
              <p className="text-sm text-[#718096] mt-1 font-medium">
                {t('common.noRecordsDetail', 'Select a creation form above to enter your daily general diary records.')}
              </p>
            </motion.div>
          ) : (
            <motion.div
              variants={itemVariants}
              className="bg-white rounded-3xl overflow-hidden shadow-md border border-[#E2E8F0] transition-shadow duration-200 hover:shadow-lg"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-gradient-to-r from-[var(--accent-color-hover)] to-[var(--accent-color)] text-white/80 uppercase font-bold text-xs tracking-wider">
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
                      <th className="p-4">{t('common.recordDate', 'Record Date')}</th>
                      <th className="p-4">{t('common.details', 'Gist')}</th>
                      <th className="p-4">{t('common.status', 'Status')}</th>
                      <th className="p-4 pr-6 text-right">{t('common.actions', 'Console Operations')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] text-[#1A202C]">
                    {filteredRecords.map((rec, index) => {
                      const refId =
                        rec.data.fir_no ||
                        rec.data.gd_no ||
                        rec.data.linked_fir_dd_no ||
                        rec.data.dd_fir_no ||
                        rec.data.uidbNumber ||
                        'N/A';

                      const gist =
                        rec.data.brief_facts ||
                        rec.data.call_gist ||
                        rec.data.recovered_material ||
                        rec.data.physical_description ||
                        rec.data.description ||
                        rec.data.foundPlace ||
                        'No description text logged';

                      const isSentBack = rec.current_status === 'SENT_BACK_HC' || rec.current_status === 'SENT_BACK';
                      const isEditable = rec.current_status === 'DRAFT' || isSentBack;

                      return (
                        <motion.tr
                          key={rec.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.02, duration: 0.3 }}
                          className={`transition-colors duration-150 group ${isSentBack
                              ? 'bg-rose-50/80 hover:bg-rose-100/70'
                              : 'hover:bg-[var(--accent-glow)]'
                            }`}
                        >
                          <td className="p-4 pl-6 text-center w-12">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(rec.id)}
                              onChange={(e) => handleSelectRow(rec.id, e.target.checked)}
                              disabled={!isEditable}
                              className="rounded border-slate-300 text-[var(--accent-color)] focus:ring-[var(--accent-color)] h-4 w-4 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="p-4 font-mono font-bold text-[var(--accent-color)] text-sm group-hover:text-[var(--accent-color-hover)] transition-colors">
                            {refId}
                          </td>
                          <td className="p-4 font-mono text-[#4A5568] font-semibold text-xs">
                            {rec.data.record_date || 'N/A'}
                          </td>
                          <td className="p-4 max-w-[280px] truncate text-[#4A5568] font-medium text-sm" title={gist}>
                            {gist}
                          </td>
                          <td className="p-4">{renderStatusBadge(rec.current_status)}</td>
                          <td className="p-3.5 pr-6 text-right space-x-2 whitespace-nowrap">

                            {/* View Action */}
                            <button
                              onClick={() => navigate(`/records/${rec.id}`)}
                              className="bg-[var(--accent-glow)] hover:bg-[var(--accent-color)] text-[var(--accent-color)] hover:text-white p-2 rounded-xl transition-all duration-200 inline-flex items-center justify-center cursor-pointer border border-[var(--accent-color)]/30 hover:border-[var(--accent-color)] hover:shadow-lg hover:shadow-emerald-500/20 active:scale-95"
                              title="View Details"
                            >
                              <Eye size={14} />
                            </button>

                            {/* Edit Action */}
                            {isEditable && (
                              <button
                                onClick={() => navigate(`/records/new/${rec.record_type}?edit=${rec.id}`)}
                                className="bg-amber-50 hover:bg-[#cca43b] text-amber-700 hover:text-white p-2 rounded-xl transition-all duration-200 inline-flex items-center justify-center cursor-pointer border border-amber-200 hover:border-[#cca43b] hover:shadow-lg hover:shadow-amber-500/20 active:scale-95"
                                title="Edit Record"
                              >
                                <FileEdit size={14} />
                              </button>
                            )}

                            {/* Submit Action */}
                            {isEditable && (
                              <button
                                onClick={() => {
                                  if (window.confirm(t('actions.confirmSubmit', 'Confirm submission to SHO? This locks the record.'))) {
                                    submitMutation.mutate(rec.id);
                                  }
                                }}
                                className="bg-emerald-50 hover:bg-emerald-500 text-emerald-700 hover:text-white p-2 rounded-xl transition-all duration-200 inline-flex items-center justify-center cursor-pointer border border-emerald-200 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-500/20 active:scale-95"
                                title="Submit to SHO"
                              >
                                <Send size={14} />
                              </button>
                            )}

                            {/* Delete Action */}
                            {rec.current_status === 'DRAFT' && (
                              <button
                                onClick={() => {
                                  if (window.confirm(t('actions.confirmDelete', 'Delete this draft record forever?'))) {
                                    deleteMutation.mutate(rec.id);
                                  }
                                }}
                                className="bg-rose-50 hover:bg-rose-500 text-rose-700 hover:text-white p-2 rounded-xl transition-all duration-200 inline-flex items-center justify-center cursor-pointer border border-rose-200 hover:border-rose-500 hover:shadow-lg hover:shadow-rose-500/20 active:scale-95"
                                title="Delete Draft"
                              >
                                <Trash2 size={14} />
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
    </div>
  );
}