import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CheckSquare, X, Send, AlertTriangle, ShieldCheck, History, Edit, FileSpreadsheet, RefreshCw, Clock, Scale } from 'lucide-react';
import toast from 'react-hot-toast';
import DynamicForm from '../../components/forms/DynamicForm.jsx';
import useAuthStore from '../../store/authStore.js';
import api from '../../utils/api.js';
import LinkedRecordsPanel from '../../components/common/LinkedRecordsPanel.jsx';
import StatusUpdateModal from '../../components/records/StatusUpdateModal.jsx';
import RecordTypeBadge from '../../components/common/RecordTypeBadge.jsx';
import { useUpdateRecord } from '../../hooks/useUpdateRecord.js';
import { useFormSchema } from '../../hooks/useFormSchema.js';
import { log } from '../../utils/logger.js';

export default function RecordDetail() {
  const { t, i18n } = useTranslation();
  const lang = i18n?.language || 'en';
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  useEffect(() => {
    log.debug('page:mount', { route: '/records/:id', recordId: id, userId: user?.id, role: user?.role });
    return () => log.debug('page:unmount', { route: '/records/:id', recordId: id });
  }, [id]);

  const [sendBackModalOpen, setSendBackModalOpen] = useState(false);
  const [sendBackComment, setSendBackComment] = useState('');
  const [selectedFields, setSelectedFields] = useState([]);
  const [isEditing, setIsEditing] = useState(false);
  
  // DCP Override States
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideVal, setOverrideVal] = useState('');
  const [overrideReason, setOverrideReason] = useState('');

  // Domain status update modal (item 9, WS9) — single reusable StatusUpdateModal serves
  // every record type correctly (including ARREST's custody_status, which the old inline
  // maps below wrongly aliased to case_status). statusModalField optionally preselects a
  // field (used by the CASE "Flip" worked-out shortcut).
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusModalField, setStatusModalField] = useState(undefined);

  // Fetch record details. refetchOnMount:'always' + staleTime:0 force a fresh fetch every time
  // this view opens (#R2-2, 2026-07-20): edits ARE persisted by the backend, but useAutosave
  // deliberately does NOT invalidate ['records', id] (to avoid a background refetch clobbering
  // in-progress keystrokes), and the global staleTime is 60s — so reopening a just-saved record
  // within a minute served the STALE pre-edit cache, looking like "my change reverted". Refetching
  // on mount fixes that safely: a mount has no in-flight edit to clobber.
  const { data: recordPayload, isLoading } = useQuery({
    queryKey: ['records', id],
    queryFn: async () => {
      log.debug('data:load_start', { what: 'record_detail', recordId: id });
      try {
        const res = await api.get(`/records/${id}`);
        log.debug('data:load_success', { what: 'record_detail', recordId: id, status: res.data?.data?.record?.current_status });
        return res.data.data;
      } catch (err) {
        log.error('data:load_error', { what: 'record_detail', recordId: id, err });
        throw err;
      }
    },
    refetchOnMount: 'always',
    staleTime: 0,
  });

  const record = recordPayload?.record;
  const transitions = recordPayload?.transitions || [];
  const revisions = recordPayload?.revisions || [];
  const linkedRecords = recordPayload?.linkedRecords || [];
  const { schema: sendBackSchema } = useFormSchema(record?.record_type);

  const unlinkMutation = useMutation({
    mutationFn: async (linkId) => {
      log.debug('action:unlink_start', { recordId: id, linkId });
      await api.delete(`/v1/record-links/${linkId}`);
    },
    onSuccess: (_, linkId) => {
      log.info('action:unlink_success', { recordId: id, linkId });
      toast.success('Link removed');
      queryClient.invalidateQueries({ queryKey: ['records', id] });
    },
    onError: (err, linkId) => {
      log.error('action:unlink_failed', { recordId: id, linkId, err });
      toast.error(err.response?.data?.message || 'Failed to remove link');
    }
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      log.debug('action:approve_start', { recordId: id });
      const res = await api.post(`/records/${id}/approve`);
      return res.data.data;
    },
    onSuccess: () => {
      log.info('action:approve_success', { recordId: id });
      toast.success('Record approved successfully');
      queryClient.invalidateQueries({ queryKey: ['records', id] });
      queryClient.invalidateQueries({ queryKey: ['workflow', 'queue'] });
      navigate('/queue');
    },
    onError: (err) => {
      log.error('action:approve_failed', { recordId: id, err });
      toast.error(err.response?.data?.message || 'Failed to approve record');
    },
  });

  // Send back mutation
  const sendBackMutation = useMutation({
    mutationFn: async (payload) => {
      log.debug('action:send_back_start', { recordId: id, targetFields: payload.target_fields });
      const res = await api.post(`/records/${id}/send-back`, payload);
      return res.data.data;
    },
    onSuccess: () => {
      log.info('action:send_back_success', { recordId: id });
      toast.success('Record sent back to Head Constable for correction');
      setSendBackModalOpen(false);
      setSendBackComment('');
      setSelectedFields([]);
      queryClient.invalidateQueries({ queryKey: ['records', id] });
      queryClient.invalidateQueries({ queryKey: ['workflow', 'queue'] });
      navigate('/queue');
    },
    onError: (err) => {
      log.error('action:send_back_failed', { recordId: id, err });
      toast.error(err.response?.data?.message || 'Failed to send record back');
    },
  });

  // DCP Override Mutation
  const overrideMutation = useMutation({
    mutationFn: async (payload) => {
      log.debug('action:override_start', { recordId: id, newValue: payload.new_value });
      const res = await api.patch(`/records/${id}/override`, {
        caseHeadId: payload.new_value,
        reason: payload.reason
      });
      return res.data.data;
    },
    onSuccess: () => {
      log.info('action:override_success', { recordId: id });
      toast.success('Classification overridden successfully');
      setOverrideOpen(false);
      setOverrideReason('');
      queryClient.invalidateQueries({ queryKey: ['records', id] });
    },
    onError: (err) => {
      log.error('action:override_failed', { recordId: id, err });
      toast.error(err.response?.data?.message || 'Override failed');
    },
  });

  // Handles Send Back submission
  const handleSendBackSubmit = () => {
    if (!sendBackComment) {
      toast.error('Feedback comment is required');
      return;
    }
    log.debug('action:send_back_click', { recordId: id, fieldCount: selectedFields.length });
    sendBackMutation.mutate({
      comment: sendBackComment,
      target_fields: selectedFields
    });
  };

  // Handles DCP Override Save
  const handleOverrideSave = () => {
    if (!overrideVal) {
      toast.error('Please select a new classification head');
      return;
    }
    if (overrideReason.length < 10) {
      toast.error('Mandatory audit reason must be at least 10 characters');
      return;
    }
    log.debug('action:override_click', { recordId: id, newValue: overrideVal });
    overrideMutation.mutate({
      new_value: overrideVal,
      reason: overrideReason
    });
  };

  // Record Update Mutation
  const updateMutation = useUpdateRecord(record?.record_type);

  const handleRecordUpdateSave = async (formData, persons, properties, activeId) => {
    try {
      log.info('action:record_update_start', { recordId: id });
      await updateMutation.mutateAsync({
        id: id,
        data: formData,
        persons,
        properties,
        offences: formData?.offences || (formData?.act_name ? [{ act: formData.act_name, section: formData.sections }] : undefined)
      });
      toast.success('Record updated successfully');
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ['records', id] });
    } catch (err) {
      log.error('action:record_update_failed', { recordId: id, err });
      toast.error(err.response?.data?.message || 'Failed to update record');
    }
  };

  // Toggle field selection for send-back correction request
  const toggleField = (fieldKey) => {
    if (selectedFields.includes(fieldKey)) {
      setSelectedFields(selectedFields.filter(f => f !== fieldKey));
    } else {
      setSelectedFields([...selectedFields, fieldKey]);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent-color)] mb-4"></div>
        <p className="font-semibold">{t('common.loading', 'Syncing digital registry logs...')}</p>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="p-8 text-center text-slate-500 bg-white border border-slate-200 rounded-3xl shadow-sm">
        <AlertTriangle className="mx-auto text-amber-500 mb-2" />
        <p className="font-bold">Record details not found</p>
      </div>
    );
  }

  // Check if active user can perform action in hierarchy
  const isPendingReview = 
    (record.current_status === 'PENDING_SHO' && user?.role === 'SHO') ||
    (record.current_status === 'DISTRICT_REVIEW' && (user?.role === 'DISTRICT' || user?.role === 'DISTRICT_OFFICER'));

  const isDCP = user?.role === 'DISTRICT' || user?.role === 'DISTRICT_OFFICER';

  const canEditRecord = 
    ['DRAFT', 'SENT_BACK'].includes(record?.current_status) ||
    (isDCP && record?.current_status === 'DISTRICT_REVIEW') ||
    (user?.role === 'SHO' && record?.current_status === 'PENDING_SHO');

  // Domain status update is available to any role with record access (PS+), not gated to
  // the workflow-review roles above — it's the record's own progress tracking, not an
  // escalation action. Field set/vocabulary for the record type comes entirely from
  // StatusUpdateModal's GET /records/:id/status-options call (P4) — no per-type map here.
  const statusEvents = recordPayload?.status_events || [];
  const canUpdateStatus = ['HC', 'SHO', 'DISTRICT_OFFICER', 'DISTRICT'].includes(user?.role);

  // Field picker for the send-back modal. Sourced from the LIVE form schema (the same
  // GET /fields/form/:recordType the form itself renders from) so every checkbox label is
  // literally the label the officer sees, and newly added or custom fields appear without
  // anyone hand-editing a list. Grouped by section (and sub-tab, where a section has them)
  // because a flat list of ~100 physical-description fields is unusable.
  const getSendBackFieldGroups = () => {
    const groups = [];
    const seen = new Set(); // dedupe across the WHOLE modal, see note below
    const addGroup = (title, fields) => {
      const clean = (fields || []).filter((f) => {
        if (!f?.field_key || seen.has(f.field_key)) return false;
        if (f.readonly) return false; // the HC cannot correct a read-only field
        seen.add(f.field_key);
        return true;
      });
      if (clean.length) groups.push({ title, fields: clean });
    };

    for (const sec of sendBackSchema || []) {
      const secTitle = lang === 'hi' ? (sec.title_hi || sec.title_en) : sec.title_en;
      if (sec.sub_tabs?.length) {
        for (const st of sec.sub_tabs) {
          const stTitle = lang === 'hi' ? (st.title_hi || st.title_en) : st.title_en;
          addGroup(`${secTitle} › ${stTitle}`, st.fields);
        }
      } else {
        addGroup(secTitle, sec.fields);
      }
    }
    return groups;
  };

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
    <div className={`space-y-6 w-full pb-16 ${getThemeClass()} page-bg font-sans text-[var(--text-main-theme)]`}>
      {/* Detail Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-[var(--border-card-theme)]/70 pb-5 gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="hover:bg-[var(--bg-page-main)]/80 text-[var(--text-main-theme)] p-2.5 rounded-xl transition-all cursor-pointer border border-[var(--border-card-theme)] hover:shadow-sm"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--text-main-theme)] flex items-center gap-2.5 font-display">
              <span>Record Registry Details</span>
              <RecordTypeBadge recordType={record.record_type} />
            </h1>
            <p className="text-sm text-[var(--text-main-theme)] opacity-80 mt-1 font-semibold">
              Author: <strong className="text-[var(--text-main-theme)]">{record.created_by}</strong> · Created on: <span className="font-mono">{new Date(record.created_at).toLocaleString()}</span>
            </p>
          </div>
        </div>

        {/* Workflow actions tray */}
        <div className="flex items-center gap-3">
          {isPendingReview && (
            <>
              <button
                onClick={() => { log.debug('action:send_back_modal_open', { recordId: id }); setSendBackModalOpen(true); }}
                className="bg-red-55/10 hover:bg-red-500 text-red-600 hover:text-white border-2 border-red-200/50 hover:border-red-500 px-5 py-2.5 rounded-control text-sm font-bold transition-colors cursor-pointer"
              >
                {t('actions.sendBack', 'Send Back')}
              </button>
              <button
                onClick={() => {
                  log.debug('action:approve_click', { recordId: id });
                  if (window.confirm('Confirm approval and escalation of this record?')) {
                    approveMutation.mutate();
                  }
                }}
                className="bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center gap-2 shadow-md shadow-[var(--accent-glow)] border-none active:scale-95"
              >
                <ShieldCheck size={16} />
                <span>{t('actions.approve', 'Approve & Escalate')}</span>
              </button>
            </>
          )}

          {canEditRecord && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center gap-2 border-2 ${
                isEditing
                  ? 'bg-amber-500 text-white border-amber-600 shadow-md'
                  : 'bg-[var(--bg-page-main)] hover:bg-[var(--bg-page-main)]/80 text-[var(--text-main-theme)] border-[var(--border-card-theme)] hover:border-[var(--accent-color)]'
              }`}
            >
              <Edit size={16} />
              <span>{isEditing ? 'Cancel Edit' : 'Edit Record'}</span>
            </button>
          )}

          {isDCP && (
            <button
              onClick={() => { log.debug('action:override_modal_open', { recordId: id }); setOverrideOpen(true); }}
              className="bg-[var(--bg-page-main)] hover:bg-[var(--bg-page-main)]/80 text-[var(--text-main-theme)] border-2 border-[var(--border-card-theme)] hover:border-[var(--accent-color)] px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center gap-2 hover:shadow-md border-none"
            >
              <Edit size={16} className="text-[var(--accent-color)]" />
              <span>Override Classification</span>
            </button>
          )}
        </div>
      </div>

      {/* Transfer Information Banner */}
      {record.data?.case_status === 'TRANSFER' && (
        <div className="rounded-2xl p-4.5 border transition-all duration-200 shadow-sm flex items-start gap-3.5 bg-gradient-to-r from-blue-50/90 to-indigo-50/90 border-indigo-200/80 text-indigo-950 animate-in fade-in duration-200">
          <div className="p-2.5 bg-indigo-100 text-indigo-700 rounded-xl shrink-0 mt-0.5 shadow-xs">
            <Send size={20} />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-extrabold text-sm uppercase tracking-wider text-indigo-950">
                {record.data?.transfer_to === 'Agency'
                  ? 'Case Transferred for Agency Investigation'
                  : user?.ps_id && String(user.ps_id) === String(record.data?.transferred_to_ps_id)
                    ? 'Incoming Case Transfer (Appended to this Police Station)'
                    : 'Case Transferred Out to Another Police Station'}
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-indigo-200/80 text-indigo-800 shadow-xs">
                {record.data?.date_of_transfer ? `Transfer Date: ${record.data.date_of_transfer}` : 'Transfer Status'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-indigo-900/90 font-medium leading-relaxed m-0">
              {record.data?.transfer_to === 'Agency' ? (
                <>
                  Investigation for this case is actively assigned to <strong>{record.data.transferred_to_agency || 'External Agency'}</strong>. The case record continues to be maintained at origin Police Station <strong>{record.ps_name || 'Origin PS'}</strong>.
                </>
              ) : user?.ps_id && String(user.ps_id) === String(record.data?.transferred_to_ps_id) ? (
                <>
                  This case was transferred from <strong>{record.ps_name || 'Origin Police Station'}</strong> to this station (<strong>{record.data.transferred_to_ps || 'This PS'}</strong>) for further proceedings and record maintenance.
                </>
              ) : (
                <>
                  This case was transferred to <strong>{record.data.transferred_to_ps || 'Destination PS'}</strong> on {record.data.date_of_transfer || 'the recorded date'}. A transferred flag is maintained at this origin station.
                </>
              )}
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Form content */}
        <div className="lg:col-span-2 space-y-6">
          <DynamicForm
            recordType={record.record_type}
            initialValues={record}
            initialPersons={recordPayload?.persons || []}
            initialProperties={recordPayload?.properties || []}
            readOnly={!isEditing}
            onSubmit={handleRecordUpdateSave}
            onBack={() => {
              if (isEditing) setIsEditing(false);
              else navigate(-1);
            }}
          />
        </div>

        {/* Right Col: Timeline history details */}
        <div className="space-y-6">
          {/* Status info box */}
          <div className="theme-card border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/60 backdrop-blur-md rounded-xl p-5 space-y-3 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-main-theme)] opacity-80">Current Status</h3>
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-[var(--text-main-theme)]">
                {t(`status.${record.current_status}`, record.current_status)}
              </span>
              <span className="text-xs bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] text-[var(--text-main-theme)] font-bold px-2.5 py-0.5 rounded">
                Level: {record.current_level}
              </span>
            </div>
            <p className="text-[var(--text-main-theme)] opacity-70 text-xs sm:text-sm leading-relaxed font-semibold">
              Records are visible in the hierarchy immediately after HC submission.
            </p>
          </div>

          {/* Domain status update card (item 9, WS9) */}
          {canUpdateStatus && (
            <div className="theme-card border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/60 backdrop-blur-md rounded-xl p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-main-theme)] opacity-80 flex items-center gap-1.5">
                  <RefreshCw size={14} className="text-[var(--accent-color)]" />
                  <span>Case Progress</span>
                </h3>
                <button
                  onClick={() => { log.debug('action:status_update_modal_open', { recordId: id }); setStatusModalField(undefined); setStatusModalOpen(true); }}
                  className="text-xs sm:text-sm font-bold text-[var(--accent-color)] hover:underline cursor-pointer"
                >
                  {t('statusUpdate.updateAction', 'Update Status')}
                </button>
              </div>
              {record.record_type === 'CASE' && (
                <div className="flex items-center justify-between border-t border-[var(--border-card-theme)]/50 pt-2.5">
                  <span className="text-xs sm:text-sm font-semibold text-[var(--text-main-theme)] opacity-80">
                    Worked Out: <strong>{(record.data?.is_worked_out === true || record.data?.work_out === true || record.data?.is_worked_out === 'true' || record.data?.work_out === 'true') ? 'Yes' : 'No'}</strong>
                    {(record.data?.worked_out_date || record.data?.work_out_date) ? ` (${record.data.worked_out_date || record.data.work_out_date})` : ''}
                  </span>
                  {isDCP ? (
                    <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                      Evidence required from Station (Use Send Back)
                    </span>
                  ) : (
                    <button
                      onClick={() => { log.debug('action:status_update_modal_open', { recordId: id, field: 'is_worked_out' }); setStatusModalField('is_worked_out'); setStatusModalOpen(true); }}
                      className="text-xs sm:text-sm font-bold text-[var(--accent-color)] hover:underline cursor-pointer"
                    >
                      Update
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Supplementary Chargesheet Details Card */}
          {record.record_type === 'CASE' && (record.data?.supplementary_chargesheet_details || String(record.data?.case_status || '').toUpperCase() === 'SUPPLEMENTARY CHARGESHEET') && (
            <div className="theme-card border border-amber-500/40 bg-amber-500/10 backdrop-blur-md rounded-xl p-4 space-y-2 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-900 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-amber-700" />
                  <span>Supplementary Chargesheet — Pending Investigation Items</span>
                </span>
                <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded bg-amber-200 text-amber-900 border border-amber-300">
                  Pending Items
                </span>
              </div>
              <p className="text-xs text-[var(--text-main-theme)] font-semibold leading-relaxed bg-[var(--bg-page-main)]/60 p-3 rounded-lg border border-amber-200/50">
                {record.data?.supplementary_chargesheet_details || 'Supplementary chargesheet filed — pending investigation items under completion.'}
              </p>
            </div>
          )}

          {/* Court Details Card (Phase 3 Strategic Court Implementation) */}
          {record.record_type === 'CASE' && (
            (() => {
              const CHARGESHEET_STATUS_LIST = ['CHARGE SHEET', 'POLICE INVESTIGATION REPORT(PIR-JCL)', 'CHARGESHEETED', 'CHALLAN', 'SUPPLEMENTARY CHARGESHEET'];
              const currentStatusUpper = String(record.data?.case_status || '').toUpperCase();
              const isChargesheeted = CHARGESHEET_STATUS_LIST.includes(currentStatusUpper) || !!record.data?.sent_to_court_date;

              return (
                <div className="theme-card border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/60 backdrop-blur-md rounded-xl p-5 space-y-3.5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-main-theme)] opacity-80 flex items-center gap-1.5">
                      <Scale size={15} className="text-[var(--accent-color)]" />
                      <span>Court & Judicial Status</span>
                    </h3>
                    {isChargesheeted ? (
                      ['HC', 'SHO', 'DISTRICT_OFFICER', 'DISTRICT', 'SYSTEM_ADMIN'].includes(user?.role) && (
                        <button
                          onClick={() => { log.debug('action:status_update_modal_open', { recordId: id }); setStatusModalField('court_disposal_type'); setStatusModalOpen(true); }}
                          className="text-xs sm:text-sm font-bold text-[var(--accent-color)] hover:underline cursor-pointer"
                        >
                          Update
                        </button>
                      )
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md">
                        <Lock size={12} /> Requires Chargesheet
                      </span>
                    )}
                  </div>

                  {!isChargesheeted ? (
                    <p className="text-xs italic text-[var(--text-main-theme)] opacity-70 p-1">
                      Court & Judicial Status tracking activates automatically once a Chargesheet or Supplementary Chargesheet is filed.
                    </p>
                  ) : (
                    <div className="space-y-2 text-xs sm:text-sm">
                      <div className="flex justify-between items-center py-1 border-b border-[var(--border-card-theme)]/40">
                        <span className="text-[var(--text-main-theme)] opacity-75 font-medium">Sent to Court:</span>
                        <span className="font-mono font-semibold">{record.data?.sent_to_court_date || '—'}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-[var(--border-card-theme)]/40">
                        <span className="text-[var(--text-main-theme)] opacity-75 font-medium">Court Case No:</span>
                        <span className="font-mono font-semibold">{record.data?.court_case_no || '—'}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-[var(--border-card-theme)]/40">
                        <span className="text-[var(--text-main-theme)] opacity-75 font-medium">Court:</span>
                        <span className="font-semibold">{record.data?.court_name || '—'}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-[var(--border-card-theme)]/40">
                        <span className="text-[var(--text-main-theme)] opacity-75 font-medium">Disposal Status:</span>
                        <span className={`px-2 py-0.5 rounded font-bold text-xs ${
                          record.data?.court_disposal_type === 'CONVICTED' ? 'bg-emerald-100 text-emerald-800' :
                          record.data?.court_disposal_type === 'ACQUITTED' ? 'bg-amber-100 text-amber-800' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {record.data?.court_disposal_type || 'PENDING_TRIAL'}
                        </span>
                      </div>
                      {record.data?.court_disposal_date && (
                        <div className="flex justify-between items-center py-1">
                          <span className="text-[var(--text-main-theme)] opacity-75 font-medium">Disposal Date:</span>
                          <span className="font-mono font-semibold">{record.data.court_disposal_date}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()
          )}

          {/* Workflow logs timeline */}
          <div className="theme-card border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/60 backdrop-blur-md rounded-xl p-5 space-y-4 shadow-sm">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-main-theme)] opacity-80 flex items-center gap-1.5">
              <History size={16} className="text-[var(--accent-color)]" />
              <span>Workflow Transition History</span>
            </h3>

            <div className="relative border-l border-[var(--border-card-theme)]/70 pl-4 ml-1 space-y-5 text-sm">
              {transitions.length === 0 ? (
                <p className="text-[var(--text-main-theme)] opacity-65 italic p-1">No hierarchy transitions completed yet.</p>
              ) : (
                transitions.map((tran, i) => (
                  <div key={i} className="relative">
                    <div className="absolute -left-[21px] top-1 bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] h-2.5 w-2.5 rounded-full shadow-sm" />
                    <div className="space-y-1">
                      <div className="flex justify-between items-center gap-2">
                        <strong className="text-[var(--text-main-theme)] font-bold">{tran.action}</strong>
                        <span className="text-xs text-[var(--text-main-theme)] opacity-70 font-mono font-semibold">
                          {new Date(tran.performed_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-[var(--text-main-theme)] opacity-85 font-semibold">By: {tran.performed_by_name || tran.username || tran.performed_by}</p>
                      {tran.comment && (
                        <p className="bg-[var(--bg-page-main)]/45 text-[var(--text-main-theme)] p-2.5 rounded-lg border border-[var(--border-card-theme)]/50 mt-1 italic text-xs sm:text-sm font-semibold">
                          "{tran.comment}"
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Linked Records Panel */}
          <LinkedRecordsPanel
            linkedRecords={linkedRecords}
            userRole={user?.role}
            onUnlink={(linkId) => unlinkMutation.mutate(linkId)}
            onNavigate={(recordId) => navigate(`/records/${recordId}`)}
          />

          {/* Diffs & Revisions logs */}
          <div className="theme-card border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/60 backdrop-blur-md rounded-xl p-5 space-y-4 shadow-sm">
            {(() => {
              const editRevisions = revisions.filter((r) => r.change_type !== 'CREATE' && (r.revision_number > 1 || r.revision_number === undefined));
              return (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-main-theme)] opacity-80 flex items-center gap-1.5">
                      <FileSpreadsheet size={16} className="text-[var(--accent-color)]" />
                      <span>Audit Trail & Field Revision Log</span>
                    </h3>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] text-[var(--accent-color)]">
                      {editRevisions.length} Revision{editRevisions.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {revisions.length === 0 ? (
                      <p className="text-[var(--text-main-theme)] opacity-65 italic p-2 text-xs sm:text-sm">No edit revisions logged yet.</p>
                    ) : (
                      revisions.slice().reverse().map((rev, idx) => {
                        const isInitialFiling = rev.change_type === 'CREATE' || rev.revision_number === 1;
                        const officerName = rev.user_fullname || rev.user_name || rev.changed_by_name || rev.username || (rev.changed_by ? `Officer (${String(rev.changed_by).slice(0, 8)})` : 'District / System Official');
                        const badgeNo = rev.changed_by_badge || rev.badge_no;
                        const officerRole = rev.changed_by_role || rev.level || rev.role || 'DISTRICT';
                        const dateStr = rev.changed_at ? new Date(rev.changed_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
                        const changes = Array.isArray(rev.field_changes) ? rev.field_changes : [];
                        const commentOrReason = rev.reason || rev.comment;

                        const FIELD_LABELS = {
                          fir_no: 'FIR Number',
                          fir_date: 'FIR Date',
                          case_status: 'Case Status',
                          current_status: 'Workflow Status',
                          current_level: 'Workflow Level',
                          brief_facts: 'Brief Facts / Gist',
                          local_head_id: 'Crime Head ID',
                          local_head: 'Crime Head',
                          crime_head: 'Crime Head Classification',
                          is_worked_out: 'Worked Out Status',
                          worked_out_date: 'Worked Out Date',
                          io_id: 'Investigating Officer ID',
                          io_name: 'Investigating Officer Name',
                          custody_status: 'Custody Status',
                          missing_status: 'Missing Status',
                          uidb_status: 'UIDB Status',
                          act_name: 'Act Name',
                          sections: 'IPC/BNS Sections',
                          property_status: 'Property Status',
                          transferred_to_ps_id: 'Transferred to PS',
                          transferred_to_agency_id: 'Transferred to Agency',
                          sent_to_court_date: 'Sent to Court Date',
                          court_case_no: 'Court Case Number',
                          court_name: 'Court Name',
                          court_disposal_type: 'Court Disposal Status',
                          court_disposal_date: 'Court Disposal Date',
                        };

                        const formatVal = (v) => {
                          if (v === null || v === undefined || v === '') return '(empty)';
                          if (typeof v === 'boolean') return v ? 'TRUE / YES' : 'FALSE / NO';
                          if (typeof v === 'object') return JSON.stringify(v);
                          return String(v);
                        };

                        return (
                          <div key={rev.id || idx} className="bg-[var(--bg-page-main)]/50 border border-[var(--border-card-theme)]/70 p-3.5 rounded-xl text-xs sm:text-sm space-y-2 shadow-xs">
                            <div className="flex justify-between items-start border-b border-[var(--border-card-theme)]/50 pb-2 gap-2">
                              <div>
                                <div className="font-bold text-[var(--text-main-theme)] flex items-center gap-2 flex-wrap">
                                  <span>{officerName}</span>
                                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] font-bold text-[var(--accent-color)]">
                                    {officerRole}
                                  </span>
                                </div>
                                {badgeNo && badgeNo !== '—' && (
                                  <p className="text-[11px] font-mono text-[var(--text-main-theme)] opacity-70 font-semibold mt-0.5">
                                    Badge #{badgeNo}
                                  </p>
                                )}
                              </div>
                              <div className="text-right shrink-0">
                                <span className="text-[11px] font-mono font-semibold text-[var(--text-main-theme)] opacity-75 block">
                                  {dateStr}
                                </span>
                                <div className="text-[10px] text-[var(--accent-color)] font-bold font-mono">
                                  {isInitialFiling ? 'INITIAL INTAKE' : `Rev #${rev.revision_number} · ${rev.change_type}`}
                                </div>
                              </div>
                            </div>

                            {commentOrReason && (
                              <p className="text-xs italic bg-[var(--bg-page-main)]/80 p-2 rounded-lg border border-[var(--border-card-theme)]/50 text-[var(--text-main-theme)] font-semibold">
                                "{commentOrReason}"
                              </p>
                            )}

                            {isInitialFiling ? (
                              <div className="text-xs text-[var(--text-main-theme)] opacity-75 italic font-semibold p-2 bg-[var(--bg-page-main)]/40 rounded-lg border border-dashed border-[var(--border-card-theme)]">
                                Initial Record Filing — {changes.length} intake field{changes.length !== 1 ? 's' : ''} populated at creation.
                              </div>
                            ) : changes.length > 0 ? (
                              <div className="space-y-1.5 mt-2">
                                {changes.map((ch, cIdx) => {
                                  const key = ch.field_key || ch.field || ch.field_name;
                                  const label = ch.label || FIELD_LABELS[key] || key;
                                  return (
                                    <div key={cIdx} className="bg-[var(--bg-page-main)]/90 p-2.5 rounded-lg border border-[var(--border-card-theme)] shadow-2xs space-y-1">
                                      <div className="text-[var(--accent-color)] font-bold text-xs flex items-center justify-between">
                                        <span>{ch.entity_label ? `${ch.entity_label} — ` : ''}{label}</span>
                                        {key && <span className="font-mono text-[10px] opacity-60">[{key}]</span>}
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] sm:text-xs text-[var(--text-main-theme)] font-semibold">
                                        <div className="truncate border-b sm:border-b-0 sm:border-r border-[var(--border-card-theme)]/60 pb-0.5 sm:pb-0 sm:pr-1">
                                          <span className="opacity-60">Before:</span>{' '}
                                          <span className="line-through text-red-600 font-bold">{formatVal(ch.old_value)}</span>
                                        </div>
                                        <div className="truncate sm:pl-1">
                                          <span className="opacity-60">After:</span>{' '}
                                          <span className="text-emerald-600 font-bold">{formatVal(ch.new_value)}</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-xs text-[var(--text-main-theme)] opacity-75 italic font-semibold p-1">
                                Action completed: {rev.change_type}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── SEND BACK CORRECTION MODAL ────────────────────────────────────────── */}
      {sendBackModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card-theme)] border border-[var(--border-card-theme)] rounded-2xl max-w-2xl w-full overflow-hidden shadow-2xl text-[var(--text-main-theme)]">
            <div className="flex justify-between items-center bg-[var(--bg-page-main)] border-b border-[var(--border-card-theme)]/70 px-6 py-4">
              <h3 className="text-base font-bold text-[var(--text-main-theme)]">Return record for correction</h3>
              <button
                onClick={() => setSendBackModalOpen(false)}
                className="text-[var(--text-main-theme)] opacity-50 hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-[var(--bg-page-main)]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-bold text-[var(--text-main-theme)] opacity-80">Select fields requiring correction (Optional):</label>
                <div className="max-h-[50vh] overflow-y-auto bg-[var(--bg-page-main)]/50 p-3 rounded-xl border border-[var(--border-card-theme)] space-y-4">
                  {getSendBackFieldGroups().length === 0 ? (
                    <div className="text-sm text-[var(--text-main-theme)] opacity-50 italic py-2 text-center">
                      {lang === 'hi' ? 'फ़ील्ड लोड हो रहे हैं...' : 'Loading fields...'}
                    </div>
                  ) : (
                    getSendBackFieldGroups().map((group) => (
                      <div key={group.title}>
                        <div className="sticky top-0 z-10 bg-[var(--bg-page-main)] px-2 py-1.5 mb-1.5 rounded-md text-xs font-bold uppercase tracking-wider text-[var(--text-main-theme)] opacity-70 border-b border-[var(--border-card-theme)]">
                          {group.title}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {group.fields.map((f) => (
                            <button
                              key={f.field_key}
                              onClick={() => toggleField(f.field_key)}
                              className={`text-left p-2 rounded-lg transition-all text-sm flex items-center gap-2 cursor-pointer ${
                                selectedFields.includes(f.field_key)
                                  ? 'bg-amber-50 border border-amber-300 text-amber-700 font-semibold'
                                  : 'hover:bg-[var(--bg-page-main)] border border-transparent text-[var(--text-main-theme)] opacity-60 hover:opacity-100 hover:border-[var(--border-card-theme)]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedFields.includes(f.field_key)}
                                readOnly
                                className="accent-amber-500"
                              />
                              <span className="truncate">{lang === 'hi' ? (f.label_hi || f.label_en) : f.label_en}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-[var(--text-main-theme)] opacity-80">Mandatory Feedback Comment for HC:</label>
                <textarea
                  rows={4}
                  value={sendBackComment}
                  onChange={(e) => setSendBackComment(e.target.value)}
                  placeholder="Explain exactly what correction is needed..."
                  className="w-full bg-[var(--bg-page-main)]/40 border-2 border-[var(--border-card-theme)] rounded-xl p-3.5 text-sm text-[var(--text-main-theme)] outline-none focus:border-red-400 transition-all resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 bg-[var(--bg-page-main)] border-t border-[var(--border-card-theme)]/70 px-6 py-4">
              <button
                onClick={() => setSendBackModalOpen(false)}
                className="bg-[var(--bg-page-main)] border-2 border-[var(--border-card-theme)] hover:border-[var(--accent-color)] text-[var(--text-main-theme)] px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer transition-all hover:shadow-sm"
              >
                {t('actions.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleSendBackSubmit}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-control text-sm font-bold cursor-pointer transition-colors"
              >
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DCP OVERRIDE CLASSIFICATION MODAL ───────────────────────────────────── */}
      {overrideOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card-theme)] border border-[var(--border-card-theme)] rounded-2xl max-w-md w-full overflow-hidden shadow-2xl text-[var(--text-main-theme)]">
            <div className="flex justify-between items-center bg-[var(--bg-page-main)] border-b border-[var(--border-card-theme)]/70 px-6 py-4">
              <h3 className="text-base font-bold text-[var(--text-main-theme)]">Override crime classification</h3>
              <button
                onClick={() => setOverrideOpen(false)}
                className="text-[var(--text-main-theme)] opacity-50 hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-[var(--bg-page-main)]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-bold text-[var(--text-main-theme)] opacity-80">Current Classification:</label>
                <div className="bg-[var(--bg-page-main)]/50 p-3 rounded-xl border border-[var(--border-card-theme)] text-sm text-[var(--text-main-theme)] font-mono">
                  {record.data.local_head || record.data.crime_head || 'Not Classified'}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-[var(--text-main-theme)] opacity-80">New Classification Category:</label>
                <select
                  value={overrideVal}
                  onChange={(e) => setOverrideVal(e.target.value)}
                  className="w-full bg-[var(--bg-page-main)]/40 border-2 border-[var(--border-card-theme)] text-sm text-[var(--text-main-theme)] px-3.5 py-2.5 rounded-xl outline-none focus:border-[var(--accent-color)] transition-all font-bold"
                >
                  <option value="" className="bg-[var(--bg-page-main)] text-[var(--text-main-theme)]">-- Choose Category --</option>
                  <option value="Theft" className="bg-[var(--bg-page-main)] text-[var(--text-main-theme)]">Theft</option>
                  <option value="Robbery" className="bg-[var(--bg-page-main)] text-[var(--text-main-theme)]">Robbery</option>
                  <option value="Snatching" className="bg-[var(--bg-page-main)] text-[var(--text-main-theme)]">Snatching</option>
                  <option value="Burglary" className="bg-[var(--bg-page-main)] text-[var(--text-main-theme)]">Burglary</option>
                  <option value="Murder" className="bg-[var(--bg-page-main)] text-[var(--text-main-theme)]">Murder / Attempt</option>
                  <option value="Other" className="bg-[var(--bg-page-main)] text-[var(--text-main-theme)]">Other BNS offences</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-[var(--text-main-theme)] opacity-80">Mandatory Override Reason (min 10 chars):</label>
                <textarea
                  rows={3}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Explain why this re-classification is being made..."
                  className="w-full bg-[var(--bg-page-main)]/40 border-2 border-[var(--border-card-theme)] rounded-xl p-3.5 text-sm text-[var(--text-main-theme)] outline-none focus:border-[var(--accent-color)] transition-all resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 bg-[var(--bg-page-main)] border-t border-[var(--border-card-theme)]/70 px-6 py-4">
              <button
                onClick={() => setOverrideOpen(false)}
                className="bg-[var(--bg-page-main)] border-2 border-[var(--border-card-theme)] hover:border-[var(--accent-color)] text-[var(--text-main-theme)] px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer transition-all hover:shadow-sm"
              >
                {t('actions.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleOverrideSave}
                className="bg-[#cca43b] hover:bg-amber-600 text-white px-6 py-2.5 rounded-control text-sm font-bold cursor-pointer transition-colors"
              >
                Save Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DOMAIN STATUS UPDATE MODAL (item 9, WS9) — single reusable component now
          serves every record type correctly, including ARREST custody_status ─────── */}
      <StatusUpdateModal
        recordId={id}
        open={statusModalOpen}
        initialField={statusModalField}
        onClose={() => setStatusModalOpen(false)}
        onUpdated={() => queryClient.invalidateQueries({ queryKey: ['workflow', 'queue'] })}
      />
    </div>
  );
}
