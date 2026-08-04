import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Filter, Eye, ArrowRight, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore.js';
import api from '../../utils/api.js';
import { log } from '../../utils/logger.js';

export default function Queue() {
  const { t, i18n } = useTranslation();
  const currentLng = i18n.language || 'en';
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('ALL');
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    log.debug('page:mount', { route: '/queue', userId: user?.id, role: user?.role });
    return () => log.debug('page:unmount', { route: '/queue' });
  }, []);

  const handleTabChange = (tab) => {
    log.debug('action:queue_tab_change', { tab });
    setActiveTab(tab);
    setSelectedIds([]);
  };

  const handleBulkApprove = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to approve and escalate all ${selectedIds.length} selected records?`)) return;

    log.info('action:bulk_approve_start', { recordIds: selectedIds, count: selectedIds.length });
    setBulkLoading(true);
    let successCount = 0;
    let failCount = 0;

    try {
      await Promise.all(
        selectedIds.map(async (id) => {
          try {
            await api.post(`/records/${id}/approve`);
            log.debug('action:approve_record_success', { recordId: id });
            successCount++;
          } catch (err) {
            console.error(`Failed to approve record ${id}:`, err);
            log.error('action:approve_record_failed', { recordId: id, err });
            failCount++;
          }
        })
      );

      log.info('action:bulk_approve_complete', { successCount, failCount });
      if (successCount > 0) {
        toast.success(`Successfully approved ${successCount} records!`);
      }
      if (failCount > 0) {
        toast.error(`Failed to approve ${failCount} records.`);
      }

      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['workflow', 'queue'] });
    } catch (err) {
      log.error('action:bulk_approve_error', { err });
      toast.error("An error occurred during bulk approval.");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkDecline = async () => {
    if (selectedIds.length === 0) return;

    const comment = window.prompt("Enter mandatory feedback/comment for returning the selected records for correction:");
    if (comment === null) return;
    if (!comment.trim()) {
      toast.error("Feedback comment is mandatory to return records.");
      return;
    }

    log.info('action:bulk_send_back_start', { recordIds: selectedIds, count: selectedIds.length });
    setBulkLoading(true);
    let successCount = 0;
    let failCount = 0;

    try {
      await Promise.all(
        selectedIds.map(async (id) => {
          try {
            await api.post(`/records/${id}/send-back`, {
              comment: comment.trim(),
              target_fields: []
            });
            log.debug('action:send_back_record_success', { recordId: id });
            successCount++;
          } catch (err) {
            console.error(`Failed to return record ${id}:`, err);
            log.error('action:send_back_record_failed', { recordId: id, err });
            failCount++;
          }
        })
      );

      log.info('action:bulk_send_back_complete', { successCount, failCount });
      if (successCount > 0) {
        toast.success(`Successfully returned ${successCount} records for correction!`);
      }
      if (failCount > 0) {
        toast.error(`Failed to return ${failCount} records.`);
      }

      setSelectedIds([]);
      queryClient.invalidateQueries({ queryKey: ['workflow', 'queue'] });
    } catch (err) {
      log.error('action:bulk_send_back_error', { err });
      toast.error("An error occurred during bulk return.");
    } finally {
      setBulkLoading(false);
    }
  };

  // Fetch pending review records queue
  const { data: queue = [], isLoading } = useQuery({
    queryKey: ['workflow', 'queue'],
    queryFn: async () => {
      log.debug('data:load_start', { what: 'workflow_queue' });
      try {
        const res = await api.get('/workflow/queue');
        const rows = res.data.data?.queue || res.data.data || [];
        log.debug('data:load_success', { what: 'workflow_queue', count: rows.length });
        return rows;
      } catch (err) {
        log.error('data:load_error', { what: 'workflow_queue', err });
        throw err;
      }
    },
  });

  const countFor = (tab) => tab === 'ALL' ? queue.length : queue.filter(r => r.record_type === tab).length;

  // Filter queue records based on type and sort 'SENT_BACK' / 'SENT_BACK_HC' to the top
  const filteredQueue = (activeTab === 'ALL' ? queue : queue.filter(r => r.record_type === activeTab))
    .sort((a, b) => {
      const aIsSentBack = a.current_status === 'SENT_BACK_HC' || a.current_status === 'SENT_BACK';
      const bIsSentBack = b.current_status === 'SENT_BACK_HC' || b.current_status === 'SENT_BACK';
      if (aIsSentBack && !bIsSentBack) return -1;
      if (!aIsSentBack && bIsSentBack) return 1;
      return 0;
    });

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

  return (
    <div className={`min-h-screen ${getThemeClass()} page-bg text-[var(--text-main-theme)] font-sans`}>

      {/* Hero Header — mirrors Dashboard's gradient banner */}
      <div className="hero-banner-gradient px-8 py-10 relative overflow-hidden">
        <span className="user-greeting-badge text-4xl font-bold text-white/95 bg-white/10 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/15 shadow-sm">
          Hi, {currentLng === 'hi' ? (user?.name || user?.username) : (user?.name || user?.username || 'User')}
        </span>
        <div className="pointer-events-none absolute -top-8 -right-8 h-48 w-48 rounded-full border border-white/5" />

        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="mt-4 text-3xl font-bold text-white flex items-center gap-3 font-display">
              {t('nav.queue', 'Approval Desk')}
            </h1>
            <p className="mt-2 text-sm text-white/60 max-w-xl font-semibold">
              Review pending records submitted from your jurisdiction and approve or return them for correction.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 pb-10">

        {/* Record Category Tabs */}
        <div className="mt-6 theme-card bg-[var(--bg-page-main)]/60 backdrop-blur-md rounded-2xl border border-[var(--border-card-theme)] shadow-sm px-2 py-2 flex flex-wrap gap-1">
          {['ALL', 'CASE', 'ARREST', 'PCR_CALL', 'MISSING', 'UIDB'].map((tab) => {
            const count = countFor(tab);
            return (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`px-5 py-2.5 text-sm font-semibold tracking-wide rounded-xl transition-all duration-200 cursor-pointer flex items-center gap-2 border-none ${
                  activeTab === tab
                    ? 'bg-[var(--accent-color)] text-white shadow-md shadow-[var(--accent-glow)]'
                    : 'text-[var(--text-main-theme)] opacity-80 hover:bg-[var(--bg-page-main)]/80 hover:text-[var(--accent-color)] bg-transparent'
                }`}
              >
                {t(`recordTypes.${tab}`, tab)}
                {count > 0 && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    activeTab === tab ? 'bg-white/25 text-white' : 'bg-[var(--bg-page-main)] text-[var(--text-main-theme)] border border-[var(--border-card-theme)]'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {selectedIds.length > 0 && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500 text-xs font-bold text-white">
                {selectedIds.length}
              </span>
              <span className="text-sm font-bold text-amber-900">
                {bulkLoading ? 'Processing bulk actions…' : `${selectedIds.length} records selected for bulk action`}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleBulkDecline}
                disabled={bulkLoading}
                className="bg-red-55/10 hover:bg-red-500 text-red-650 hover:text-white border border-red-200 hover:border-red-500 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
              >
                Decline All
              </button>
              <button
                type="button"
                onClick={handleBulkApprove}
                disabled={bulkLoading}
                className="bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border-none shadow-sm hover:shadow-md disabled:opacity-50"
              >
                Approve All
              </button>
            </div>
          </div>
        )}

        {/* Queue Listing */}
        <div className="mt-5">
          {isLoading ? (
            <div className="theme-card rounded-3xl bg-[var(--bg-page-main)]/60 backdrop-blur-md border border-[var(--border-card-theme)] shadow-sm flex flex-col items-center justify-center p-20 text-[var(--text-main-theme)] gap-4">
              <div className="animate-spin rounded-full h-10 w-10 border-b-[3px] border-[var(--accent-color)]" />
              <p className="text-sm font-semibold text-[var(--text-main-theme)]">
                {t('common.loading', 'Syncing digital registry logs...')}
              </p>
            </div>

          ) : filteredQueue.length === 0 ? (
            <div className="theme-card rounded-3xl bg-[var(--bg-page-main)]/60 backdrop-blur-md border border-[var(--border-card-theme)] shadow-sm p-16 text-center">
              <div className="flex items-center justify-center mb-5">
                <div className="h-20 w-20 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                  <ShieldCheck size={40} className="text-emerald-600" />
                </div>
              </div>
              <p className="text-lg font-bold text-[var(--text-main-theme)] mb-1">Queue Clean &amp; Approved</p>
              <p className="text-sm text-[var(--text-main-theme)] opacity-70 max-w-sm mx-auto font-semibold">
                There are no pending diary records in your station queue requiring action.
              </p>
            </div>

          ) : (
            <div className="theme-card rounded-3xl bg-[var(--bg-page-main)]/60 backdrop-blur-md border border-[var(--border-card-theme)] shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-card-theme)]/70 bg-[var(--bg-page-main)]/80">
                      <th className="p-4 pl-6 text-xs font-semibold uppercase tracking-wider text-[var(--text-main-theme)] font-bold w-12">
                        <input
                          type="checkbox"
                          checked={filteredQueue.length > 0 && selectedIds.length === filteredQueue.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(filteredQueue.map(r => r.id));
                            } else {
                              setSelectedIds([]);
                            }
                          }}
                          className="rounded border-[var(--border-card-theme)] accent-[var(--accent-color)] cursor-pointer w-4 h-4"
                        />
                      </th>
                      <th className="p-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-main-theme)] font-bold">
                        {t('common.referenceId', 'Ref ID / Number')}
                      </th>
                      <th className="p-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-main-theme)] font-bold">Police Station</th>
                      <th className="p-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-main-theme)] font-bold">Record Date</th>
                      <th className="p-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-main-theme)] font-bold">Gist</th>
                      <th className="p-4 text-xs font-semibold uppercase tracking-wider text-[var(--text-main-theme)] font-bold">Current Status</th>
                      <th className="p-4 pr-6 text-xs font-semibold uppercase tracking-wider text-[var(--text-main-theme)] font-bold text-right">Review Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-card-theme)]/40 text-[var(--text-main-theme)]">
                    {filteredQueue.map((rec) => {
                      const refId =
                        rec.fir_no ||
                        rec.arrest_fir_no ||
                        rec.missing_fir_no ||
                        rec.uidb_no ||
                        rec.legacy_ref ||
                        rec.data?.fir_no ||
                        rec.data?.gd_no ||
                        rec.data?.linked_fir_dd_no ||
                        rec.data?.dd_fir_no ||
                        rec.data?.uidbNumber ||
                        (rec.id ? rec.id.slice(0, 8) : 'N/A');

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
                        'No description logged';

                      const recDate = rec.record_date || rec.registration_date || rec.created_at || rec.data?.record_date || 'N/A';
                      const isSentBack = rec.current_status === 'SENT_BACK_HC' || rec.current_status === 'SENT_BACK';

                      return (
                        <tr
                          key={rec.id}
                          className={`group transition-all duration-150 ${
                            isSentBack
                              ? 'bg-rose-50/80 hover:bg-rose-100/70'
                              : 'hover:bg-[var(--bg-page-main)]/40'
                          }`}
                        >
                          <td className="p-4 pl-6 w-12">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(rec.id)}
                              onChange={() => {
                                setSelectedIds(prev =>
                                  prev.includes(rec.id) ? prev.filter(id => id !== rec.id) : [...prev, rec.id]
                                );
                              }}
                              className="rounded border-[var(--border-card-theme)] accent-[var(--accent-color)] cursor-pointer w-4 h-4"
                            />
                          </td>
                          <td className="p-4 font-mono font-bold text-[var(--text-main-theme)]">{refId}</td>
                          <td className="p-4 text-[var(--text-main-theme)] opacity-85 font-semibold">{rec.ps_name || 'Police Station'}</td>
                          <td className="p-4 font-mono text-[var(--text-main-theme)] opacity-60">{typeof recDate === 'string' ? recDate.slice(0, 10) : 'N/A'}</td>
                          <td className="p-4 max-w-[280px] truncate text-[var(--text-main-theme)] opacity-85 font-semibold" title={gist}>
                            {gist}
                          </td>
                          <td className="p-4">
                            <span className={`inline-flex items-center text-xs font-bold px-3 py-1.5 rounded-full border ${
                              isSentBack
                                ? 'bg-rose-50 text-rose-700 border-rose-200/60'
                                : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              {t(`status.${rec.current_status}`, rec.current_status)}
                            </span>
                          </td>
                          <td className="p-4 pr-6 text-right whitespace-nowrap">
                            <button
                              onClick={() => { log.debug('action:queue_review_click', { recordId: rec.id }); navigate(`/records/${rec.id}`); }}
                              className="inline-flex items-center gap-2 bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 cursor-pointer border-none shadow-sm hover:shadow-md active:scale-95"
                            >
                              <span>Review</span>
                              <ArrowRight size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}