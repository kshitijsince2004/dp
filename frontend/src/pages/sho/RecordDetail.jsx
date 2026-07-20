import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CheckSquare, X, Send, AlertTriangle, ShieldCheck, History, Edit, FileSpreadsheet, RefreshCw, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import DynamicForm from '../../components/forms/DynamicForm.jsx';
import { formSchemas } from '../../utils/api.js';
import useAuthStore from '../../store/authStore.js';
import api from '../../utils/api.js';
import LinkedRecordsPanel from '../../components/common/LinkedRecordsPanel.jsx';
import StatusUpdateModal from '../../components/records/StatusUpdateModal.jsx';

export default function RecordDetail() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [sendBackModalOpen, setSendBackModalOpen] = useState(false);
  const [sendBackComment, setSendBackComment] = useState('');
  const [selectedFields, setSelectedFields] = useState([]);
  
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

  // Fetch record details
  const { data: recordPayload, isLoading } = useQuery({
    queryKey: ['records', id],
    queryFn: async () => {
      const res = await api.get(`/records/${id}`);
      return res.data.data;
    },
  });

  const record = recordPayload?.record;
  const transitions = recordPayload?.transitions || [];
  const revisions = recordPayload?.revisions || [];
  const linkedRecords = recordPayload?.linkedRecords || [];

  const unlinkMutation = useMutation({
    mutationFn: async (linkId) => {
      await api.delete(`/v1/record-links/${linkId}`);
    },
    onSuccess: () => {
      toast.success('Link removed');
      queryClient.invalidateQueries({ queryKey: ['records', id] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to remove link');
    }
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/records/${id}/approve`);
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Record approved successfully');
      queryClient.invalidateQueries({ queryKey: ['records', id] });
      queryClient.invalidateQueries({ queryKey: ['workflow', 'queue'] });
      navigate('/queue');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to approve record');
    },
  });

  // Send back mutation
  const sendBackMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post(`/records/${id}/send-back`, payload);
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Record sent back to Head Constable for correction');
      setSendBackModalOpen(false);
      setSendBackComment('');
      setSelectedFields([]);
      queryClient.invalidateQueries({ queryKey: ['records', id] });
      queryClient.invalidateQueries({ queryKey: ['workflow', 'queue'] });
      navigate('/queue');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to send record back');
    },
  });

  // DCP Override Mutation
  const overrideMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.patch(`/records/${id}/override`, {
        caseHeadId: payload.new_value,
        reason: payload.reason
      });
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Classification overridden successfully');
      setOverrideOpen(false);
      setOverrideReason('');
      queryClient.invalidateQueries({ queryKey: ['records', id] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Override failed');
    },
  });

  // Handles Send Back submission
  const handleSendBackSubmit = () => {
    if (!sendBackComment) {
      toast.error('Feedback comment is required');
      return;
    }
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
    overrideMutation.mutate({
      new_value: overrideVal,
      reason: overrideReason
    });
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

  // Domain status update is available to any role with record access (PS+), not gated to
  // the workflow-review roles above — it's the record's own progress tracking, not an
  // escalation action. Field set/vocabulary for the record type comes entirely from
  // StatusUpdateModal's GET /records/:id/status-options call (P4) — no per-type map here.
  const statusEvents = recordPayload?.status_events || [];
  const canUpdateStatus = ['HC', 'SHO', 'DISTRICT_OFFICER', 'DISTRICT'].includes(user?.role);

  // Get field keys for multi-select checklist in send-back
  const getAvailableFields = () => {
    const schemas = formSchemas[record.record_type] || [];
    return schemas.flatMap(sec => sec.fields);
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
            <h1 className="text-xl font-bold text-[var(--text-main-theme)] flex items-center gap-2.5 font-display">
              <span>Record Registry Details</span>
              <span className="text-xs bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] text-[var(--text-main-theme)] px-2.5 py-1 rounded-lg uppercase font-mono font-bold tracking-wider">
                {record.record_type}
              </span>
            </h1>
            <p className="text-xs text-[var(--text-main-theme)] opacity-70 mt-1 font-semibold">
              Author: <strong className="text-[var(--text-main-theme)]">{record.created_by}</strong> · Created on: <span className="font-mono">{new Date(record.created_at).toLocaleString()}</span>
            </p>
          </div>
        </div>

        {/* Workflow actions tray */}
        <div className="flex items-center gap-3">
          {isPendingReview && (
            <>
              <button
                onClick={() => setSendBackModalOpen(true)}
                className="bg-red-55/10 hover:bg-red-500 text-red-600 hover:text-white border-2 border-red-200/50 hover:border-red-500 px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer hover:shadow-md hover:shadow-red-500/25 hover:-translate-y-0.5"
              >
                {t('actions.sendBack', 'Send Back')}
              </button>
              <button
                onClick={() => {
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

          {isDCP && (
            <button
              onClick={() => setOverrideOpen(true)}
              className="bg-[var(--bg-page-main)] hover:bg-[var(--bg-page-main)]/80 text-[var(--text-main-theme)] border-2 border-[var(--border-card-theme)] hover:border-[var(--accent-color)] px-5 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center gap-2 hover:shadow-md border-none"
            >
              <Edit size={16} className="text-[var(--accent-color)]" />
              <span>Override Classification</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Form content */}
        <div className="lg:col-span-2 space-y-6">
          <DynamicForm
            recordType={record.record_type}
            initialValues={record}
            initialPersons={recordPayload?.persons || []}
            initialProperties={recordPayload?.properties || []}
            readOnly={true}
            onBack={() => navigate(-1)}
          />
        </div>

        {/* Right Col: Timeline history details */}
        <div className="space-y-6">
          {/* Status info box */}
          <div className="theme-card border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/60 backdrop-blur-md rounded-xl p-5 space-y-3 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-main-theme)] opacity-70">Current Status</h3>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[var(--text-main-theme)]">
                {t(`status.${record.current_status}`, record.current_status)}
              </span>
              <span className="text-[10px] bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] text-[var(--text-main-theme)] font-semibold px-2 py-0.5 rounded">
                Level: {record.current_level}
              </span>
            </div>
            <p className="text-[var(--text-main-theme)] opacity-60 text-[11px] leading-relaxed font-semibold">
              Records are visible in the hierarchy immediately after HC submission.
            </p>
          </div>

          {/* Domain status update card (item 9, WS9) */}
          {canUpdateStatus && (
            <div className="theme-card border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/60 backdrop-blur-md rounded-xl p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-main-theme)] opacity-70 flex items-center gap-1.5">
                  <RefreshCw size={13} className="text-[var(--accent-color)]" />
                  <span>Case Progress</span>
                </h3>
                <button
                  onClick={() => { setStatusModalField(undefined); setStatusModalOpen(true); }}
                  className="text-[11px] font-bold text-[var(--accent-color)] hover:underline cursor-pointer"
                >
                  {t('statusUpdate.updateAction', 'Update Status')}
                </button>
              </div>
              {record.record_type === 'CASE' && (
                <div className="flex items-center justify-between border-t border-[var(--border-card-theme)]/50 pt-2.5">
                  <span className="text-[11px] font-semibold text-[var(--text-main-theme)] opacity-70">
                    Worked Out: <strong>{record.data?.work_out === true || record.data?.work_out === 'true' ? 'Yes' : 'No'}</strong>
                    {record.data?.work_out_date ? ` (${record.data.work_out_date})` : ''}
                  </span>
                  <button
                    onClick={() => { setStatusModalField('is_worked_out'); setStatusModalOpen(true); }}
                    className="text-[11px] font-bold text-[var(--accent-color)] hover:underline cursor-pointer"
                  >
                    Flip
                  </button>
                </div>
              )}
              {statusEvents.length > 0 && (
                <div className="border-t border-[var(--border-card-theme)]/50 pt-2.5 space-y-1.5 max-h-[160px] overflow-y-auto">
                  {statusEvents.map((ev) => (
                    <div key={ev.id} className="text-[11px] text-[var(--text-main-theme)] opacity-80 flex items-start gap-1.5">
                      <Clock size={11} className="mt-0.5 flex-shrink-0 opacity-60" />
                      <span>
                        <strong>{ev.status_field}</strong>: {ev.old_value || '—'} → <strong>{ev.new_value}</strong>
                        <span className="opacity-60"> (effective {ev.effective_date}, by {ev.username})</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Workflow logs timeline */}
          <div className="theme-card border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/60 backdrop-blur-md rounded-xl p-5 space-y-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-main-theme)] opacity-80 flex items-center gap-1.5">
              <History size={14} className="text-[var(--accent-color)]" />
              <span>Workflow Transition History</span>
            </h3>

            <div className="relative border-l border-[var(--border-card-theme)]/70 pl-4 ml-1 space-y-5 text-xs">
              {transitions.length === 0 ? (
                <p className="text-[var(--text-main-theme)] opacity-65 italic p-1">No hierarchy transitions completed yet.</p>
              ) : (
                transitions.map((tran, i) => (
                  <div key={i} className="relative">
                    <div className="absolute -left-[21px] top-1 bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] h-2.5 w-2.5 rounded-full shadow-sm" />
                    <div className="space-y-1">
                      <div className="flex justify-between items-center gap-2">
                        <strong className="text-[var(--text-main-theme)] font-bold">{tran.action}</strong>
                        <span className="text-[10px] text-[var(--text-main-theme)] opacity-60 font-mono font-semibold">
                          {new Date(tran.performed_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-[var(--text-main-theme)] opacity-80 font-medium">By: {tran.performed_by}</p>
                      {tran.comment && (
                        <p className="bg-[var(--bg-page-main)]/45 text-[var(--text-main-theme)] p-2 rounded border border-[var(--border-card-theme)]/50 mt-1 italic text-[11px] font-semibold">
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
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-main-theme)] opacity-80 flex items-center gap-1.5">
              <FileSpreadsheet size={14} className="text-[var(--accent-color)]" />
              <span>Field revision log</span>
            </h3>

            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
              {revisions.map((rev, idx) => (
                <div key={idx} className="bg-[var(--bg-page-main)]/45 border border-[var(--border-card-theme)]/50 p-3 rounded-lg text-xs space-y-1">
                  <div className="flex justify-between items-center border-b border-[var(--border-card-theme)]/50 pb-1">
                    <span className="font-bold text-[var(--text-main-theme)]">Revision #{rev.revision_number}</span>
                    <span className="text-[10px] text-[var(--text-main-theme)] opacity-60 font-semibold">{new Date(rev.changed_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-[10px] text-[var(--text-main-theme)] opacity-60 font-semibold">By: {rev.changed_by}</p>
                  
                  {rev.field_changes?.length > 0 && (
                    <div className="space-y-1.5 mt-2">
                      {rev.field_changes.map((ch, cIdx) => (
                        <div key={cIdx} className="bg-[var(--bg-page-main)]/80 p-1.5 rounded text-[11px] border border-[var(--border-card-theme)]/60 shadow-sm">
                          <div className="text-[var(--accent-color)] font-semibold">{ch.field_key}</div>
                          <div className="grid grid-cols-2 gap-1.5 text-[var(--text-main-theme)] opacity-85 mt-0.5 font-medium">
                            <span className="truncate border-r border-[var(--border-card-theme)]/60 pr-1">Old: <span className="line-through text-red-500 font-bold">{String(ch.old_value)}</span></span>
                            <span className="truncate pl-1">New: <span className="text-emerald-600 font-bold">{String(ch.new_value)}</span></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── SEND BACK CORRECTION MODAL ────────────────────────────────────────── */}
      {sendBackModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--bg-card-theme)] border border-[var(--border-card-theme)] rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl text-[var(--text-main-theme)]">
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
                <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto bg-[var(--bg-page-main)]/50 p-3 rounded-xl border border-[var(--border-card-theme)]">
                  {getAvailableFields().map((f) => (
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
                      <span className="truncate">{f.label_en}</span>
                    </button>
                  ))}
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
                className="bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-md shadow-red-500/25 cursor-pointer transition-all hover:-translate-y-0.5"
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
                className="bg-gradient-to-r from-[#cca43b] to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-md shadow-amber-500/25 cursor-pointer transition-all hover:-translate-y-0.5"
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
