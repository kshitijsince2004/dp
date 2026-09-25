import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Filter, Eye, ArrowRight, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore.js';
import api from '../../utils/api.js';
import { log } from '../../utils/logger.js';

import RecordTypeBadge from '../../components/common/RecordTypeBadge';


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
        <div className="pointer-events-none absolute -top-8 -right-8 h-48 w-48 rounded-full border border-white/5" />

        <div className="w-full max-w-[1920px] mx-auto relative z-10 flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black text-white flex items-center gap-3 font-display">
              {t('nav.queue', 'Approval Desk')}
            </h1>
            <p className="mt-2 text-base text-white/80 max-w-xl font-semibold">
              Review pending records submitted from your jurisdiction and approve or return them for correction.
            </p>
          </div>
          <p className="text-2xl font-bold text-white/95 m-0 text-right shrink-0 font-display">
            Welcome back, {currentLng === 'hi' ? (user?.name || user?.username) : (user?.name || user?.username || 'User')}
          </p>
        </div>
      </div>

      <div className="w-full max-w-[1920px] mx-auto px-3 sm:px-4 lg:px-6 pb-12">

        {/* Record Category Tabs */}
        <div className="mt-6 theme-card bg-white rounded-control border border-[var(--border-card-theme)] px-2 py-2 flex flex-wrap gap-1.5">
          {['ALL', 'CASE', 'ARREST', 'PCR_CALL', 'MISSING', 'UIDB'].map((tab) => {
            const count = countFor(tab);
            return (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`px-5 py-2.5 text-sm sm:text-base font-bold tracking-wide rounded-xl transition-all duration-200 cursor-pointer flex items-center gap-2 border-none ${
                  activeTab === tab
                    ? 'bg-[var(--accent-color)] text-white shadow-md shadow-[var(--accent-glow)]'
                    : 'text-[var(--text-main-theme)] opacity-80 hover:bg-[var(--bg-page-main)]/80 hover:text-[var(--accent-color)] bg-transparent'
                }`}
              >
                {t(`recordTypes.${tab}`, tab)}
                {count > 0 && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    activeTab === tab ? 'bg-white/25 text-white' : 'bg-[var(--bg-page-main)] text-[var(--text-main-theme)] border border-[var(--border-card-theme)]'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Fixed Floating Bulk Action Bar */}
        {selectedIds.length > 0 && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white backdrop-blur-xl border border-slate-700/80 px-6 py-4 rounded-2xl shadow-2xl flex flex-wrap items-center justify-between gap-4 min-w-[340px] max-w-[90vw] animate-in fade-in slide-in-from-bottom-5 duration-300">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-xs font-black text-slate-950 shadow-md">
                {selectedIds.length}
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                  {selectedIds.length} record{selectedIds.length > 1 ? 's' : ''} selected
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  Batch review &amp; escalation for station queue
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 ml-auto">
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="px-3 py-2 text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-all border border-transparent hover:border-slate-700 cursor-pointer"
              >
                Deselect All
              </button>

              <button
                type="button"
                onClick={handleBulkDecline}
                disabled={bulkLoading}
                className="bg-rose-500/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 hover:border-rose-600 px-4 py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50"
              >
                Send Back for Correction
              </button>

              <button
                type="button"
                onClick={handleBulkApprove}
                disabled={bulkLoading}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-all duration-200 shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center gap-2 cursor-pointer disabled:bg-slate-700 disabled:text-slate-500 border-none"
              >
                Approve &amp; Forward to ACP
              </button>
            </div>
          </div>
        )}

        {/* Queue Table */}
        <div className="mt-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-20 text-[var(--text-main-theme)] opacity-60">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent-color)] mb-4" />
              <p className="text-sm font-semibold">Loading approval queue...</p>
            </div>

          ) : filteredQueue.length === 0 ? (
            <div className="theme-card rounded-card bg-white border border-[var(--border-card-theme)] p-16 text-center">
              <div className="flex items-center justify-center mb-5">
                <ShieldCheck size={40} className="text-emerald-600" />
              </div>
              <p className="text-lg font-bold text-[var(--text-main-theme)] mb-1">Queue Clean &amp; Approved</p>
              <p className="text-sm text-[var(--text-main-theme)] opacity-70 max-w-sm mx-auto font-semibold">
                There are no pending diary records in your station queue requiring action.
              </p>
            </div>

          ) : (
            <div className="theme-card rounded-card bg-white border border-[var(--border-card-theme)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm sm:text-base">
                  <thead>
                    <tr className="border-b border-[var(--border-card-theme)]/70 bg-[var(--bg-page-main)]/80 text-sm sm:text-base font-bold">
                      <th className="p-4 pl-6 text-sm sm:text-base font-bold uppercase tracking-wider text-[var(--text-main-theme)] w-12">
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
                      <th className="p-4 text-sm sm:text-base font-bold uppercase tracking-wider text-[var(--text-main-theme)]">
                        {t('common.referenceId', 'Ref ID / Number')}
                      </th>
                      <th className="p-4 text-sm sm:text-base font-bold uppercase tracking-wider text-[var(--text-main-theme)]">Police Station</th>
                      <th className="p-4 text-sm sm:text-base font-bold uppercase tracking-wider text-[var(--text-main-theme)]">Record Date</th>
                      <th className="p-4 text-sm sm:text-base font-bold uppercase tracking-wider text-[var(--text-main-theme)]">Gist</th>
                      <th className="p-4 text-sm sm:text-base font-bold uppercase tracking-wider text-[var(--text-main-theme)]">Current Status</th>
                      <th className="p-4 pr-6 text-sm sm:text-base font-bold uppercase tracking-wider text-[var(--text-main-theme)] text-right">Review Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-card-theme)]/40 text-[var(--text-main-theme)]">
                    {filteredQueue.map((rec) => {
                      const refId =
                        rec.fir_no ||
                        rec.arrest_fir_no ||
                        rec.data?.fir_no ||
                        rec.data?.arrest_fir_no ||
                        rec.data?.linked_fir_dd_no ||
                        rec.data?.dd_fir_no ||
                        rec.missing_fir_no ||
                        rec.data?.missing_fir_no ||
                        rec.uidb_no ||
                        rec.data?.uidb_no ||
                        rec.data?.uidbNumber ||
                        rec.uid ||
                        rec.data?.uid ||
                        rec.legacy_ref ||
                        rec.data?.gd_no ||
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
                          <td className="p-4 font-mono font-bold text-[var(--text-main-theme)] text-sm sm:text-base">
                            <div className="flex flex-col gap-1">
                              <span>{refId}</span>
                              <RecordTypeBadge recordType={rec.record_type} />
                            </div>
                          </td>
                          <td className="p-4 text-[var(--text-main-theme)] font-semibold text-sm sm:text-base">
                            <div className="flex flex-col gap-0.5">
                              <span>{rec.ps_name || 'Police Station'}</span>
                              {rec.transfer_to_type === 'PS' && user?.ps_id && String(rec.transferred_to_ps_id) === String(user.ps_id) && String(rec.ps_id) !== String(user.ps_id) && (
                                <span className="text-[11px] font-bold text-sky-600 flex items-center gap-1">
                                  ↙ Transferred from {rec.origin_ps_name || rec.ps_name}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-4 font-mono text-[var(--text-main-theme)] text-sm sm:text-base font-semibold">{typeof recDate === 'string' ? recDate.slice(0, 10) : 'N/A'}</td>
                          <td className="p-4 max-w-[280px] truncate text-[var(--text-main-theme)] font-semibold text-sm sm:text-base" title={gist}>
                            {gist}
                          </td>
                          <td className="p-4">
                            <div className="flex flex-col gap-1.5 items-start">
                              <span className={`inline-flex items-center text-xs font-bold px-3 py-1.5 rounded-full border ${
                                isSentBack
                                  ? 'bg-rose-50 text-rose-700 border-rose-200/60'
                                  : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>
                                {t(`status.${rec.current_status}`, rec.current_status)}
                              </span>
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
                          <td className="p-4 pr-6 text-right whitespace-nowrap">
                            <button
                              onClick={() => { log.debug('action:queue_review_click', { recordId: rec.id }); navigate(`/records/${rec.id}`); }}
                              className="inline-flex items-center gap-2 bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white px-5 py-2.5 rounded-control text-sm font-bold transition-colors duration-200 cursor-pointer border-none"
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