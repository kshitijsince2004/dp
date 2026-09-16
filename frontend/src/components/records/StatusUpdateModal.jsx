import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { X, AlertTriangle, Lock, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api.js';

// Domain-status update modal (WS9). Zero hardcoded status vocabularies or per-type field
// maps here (P4) — every field, option list, current value and label comes from
// GET /records/:id/status-options. The frontend only renders what the backend returns.

const todayISO = () => new Date().toISOString().split('T')[0];

/**
 * @param {string} recordId
 * @param {boolean} open
 * @param {function} onClose
 * @param {function} [onUpdated] - optional extra callback fired after a successful update,
 *   in addition to this component's own default query invalidation.
 * @param {string} [initialField] - status_field key to preselect (e.g. from a "Flip worked
 *   out" shortcut button); falls back to the "which status?" chooser when omitted/absent
 *   from the fetched field set, or when there's only one field the chooser is skipped anyway.
 */
export default function StatusUpdateModal({ recordId, open, onClose, onUpdated, initialField }) {
  const { t, i18n } = useTranslation();
  const isHindi = i18n.language?.startsWith('hi');
  const queryClient = useQueryClient();

  const [activeFieldKey, setActiveFieldKey] = useState(null);
  const [newValue, setNewValue] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(todayISO());
  const [comment, setComment] = useState('');
  const [suppDetails, setSuppDetails] = useState('');
  const [courtCaseNo, setCourtCaseNo] = useState('');
  const [courtName, setCourtName] = useState('');
  const [courtDisposalDate, setCourtDisposalDate] = useState('');
  const [sentToCourtDate, setSentToCourtDate] = useState(todayISO());
  // Transfer fields
  const [transferToType, setTransferToType] = useState('PS'); // 'PS' | 'AGENCY'
  const [transferredToPsId, setTransferredToPsId] = useState('');
  const [transferredToAgencyId, setTransferredToAgencyId] = useState(''); // selected agency value or 'OTHER'
  const [agencyOther, setAgencyOther] = useState(''); // free text when 'OTHER' selected
  const [dateOfTransfer, setDateOfTransfer] = useState(todayISO());
  const [psSearch, setPsSearch] = useState('');

  const statusOptionsQueryKey = ['record-status-options', recordId];

  const { data, isLoading, isError, error } = useQuery({
    queryKey: statusOptionsQueryKey,
    queryFn: async () => {
      const res = await api.get(`/records/${recordId}/status-options`);
      return res.data.data;
    },
    enabled: open && !!recordId,
  });

  // Fetch PS nodes for transfer dropdown — for_transfer=true bypasses jurisdiction scoping
  // so any authenticated user sees the full list of PS (not just their own PS).
  const { data: psNodes = [] } = useQuery({
    queryKey: ['hierarchy-ps-nodes-transfer'],
    queryFn: async () => {
      const res = await api.get('/hierarchy/nodes', { params: { type: 'PS', for_transfer: 'true' } });
      return res.data.data || [];
    },
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const fields = data?.fields || [];
  const isFrozen = !!data?.is_frozen;

  // Reset local form state whenever the modal is (re)opened for a record
  useEffect(() => {
    if (!open) return;
    setNewValue('');
    setEffectiveDate(todayISO());
    setComment('');
    setSuppDetails('');
    setCourtCaseNo('');
    setCourtName('');
    setCourtDisposalDate('');
    setSentToCourtDate(todayISO());
    setTransferToType('PS');
    setTransferredToPsId('');
    setTransferredToAgencyId('');
    setDateOfTransfer(todayISO());
    setPsSearch('');
    setActiveFieldKey(null);
  }, [open, recordId]);

  useEffect(() => {
    if (!open || fields.length === 0 || activeFieldKey) return;
    const availableFields = fields.filter((f) => !f.disabled);
    if (initialField && availableFields.some((f) => f.status_field === initialField)) {
      setActiveFieldKey(initialField);
    } else if (availableFields.length === 1) {
      setActiveFieldKey(availableFields[0].status_field);
    }
  }, [open, fields, initialField, activeFieldKey]);

  const activeField = fields.find((f) => f.status_field === activeFieldKey) || null;

  const isWorkoutFlow = activeField?.status_field === 'is_worked_out';
  const workoutYes = isWorkoutFlow && (newValue === true || newValue === 'true');
  const isSupplementary = activeField?.status_field === 'case_status' && String(newValue).toUpperCase() === 'SUPPLEMENTARY CHARGESHEET';
  const isCourtDisposal = activeField?.status_field === 'court_disposal_type';
  const isTransfer = activeField?.status_field === 'case_status' && String(newValue).toUpperCase().includes('TRANSFER');

  const filteredPsNodes = psNodes.filter((n) =>
    !psSearch || n.name?.toLowerCase().includes(psSearch.toLowerCase())
  );

  const resolveOptionLabel = (field, rawValue) => {
    if (!field) return null;
    const match = field.options?.find((o) => String(o.value) === String(rawValue));
    if (!match) return null;
    return isHindi && match.label_hi ? match.label_hi : match.label;
  };

  const statusUpdateMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        status_field: activeField.status_field,
        new_value: newValue,
        effective_date: effectiveDate,
        comment: comment || undefined,
      };
      if (isSupplementary) {
        payload.supplementary_chargesheet_details = suppDetails;
      }
      if (isCourtDisposal) {
        payload.court_case_no = courtCaseNo || undefined;
        payload.court_name = courtName || undefined;
        payload.court_disposal_date = courtDisposalDate || undefined;
        payload.sent_to_court_date = sentToCourtDate || undefined;
      }
      if (isTransfer) {
        // For transfers, the date of transfer IS the effective date
        payload.effective_date = dateOfTransfer || effectiveDate;
        payload.transfer_to_type = transferToType;
        payload.date_of_transfer = dateOfTransfer || undefined;
        if (transferToType === 'PS') {
          payload.transferred_to_ps_id = transferredToPsId || undefined;
        } else {
          // resolve 'OTHER' to the free-text value
          const resolvedAgency = transferredToAgencyId === 'OTHER' ? agencyOther.trim() : transferredToAgencyId;
          payload.transferred_to_agency_id = resolvedAgency || undefined;
        }
      }
      const res = await api.patch(`/records/${recordId}/status`, payload);
      return res.data.data;
    },
    onSuccess: () => {
      toast.success(t('statusUpdate.updateSuccess', 'Status updated'));
      queryClient.invalidateQueries({ queryKey: ['records'] });
      queryClient.invalidateQueries({ queryKey: statusOptionsQueryKey });
      onUpdated?.();
      handleClose();
    },
    onError: (err) => {
      const status = err.response?.status;
      const message = err.response?.data?.message;
      if (status === 423) {
        toast.error(message || t('statusUpdate.frozenNotice', 'Record is frozen pending audit review and cannot be modified.'));
      } else {
        toast.error(message || t('statusUpdate.updateFailed', 'Failed to update status'));
      }
    },
  });

  const handleClose = () => {
    setActiveFieldKey(null);
    setNewValue('');
    setEffectiveDate(todayISO());
    setComment('');
    setTransferToType('PS');
    setTransferredToPsId('');
    setTransferredToAgencyId('');
    setAgencyOther('');
    setDateOfTransfer(todayISO());
    setPsSearch('');
    onClose();
  };

  const handleSubmit = () => {
    if (!activeField || activeField.disabled) return;
    if (newValue === '' || newValue === null || newValue === undefined) {
      toast.error(t('statusUpdate.chooseValueError', 'Select a value before saving'));
      return;
    }
    if (isSupplementary && !suppDetails.trim()) {
      toast.error('Please specify what investigation items remain pending for the supplementary chargesheet');
      return;
    }
    if (isTransfer) {
      if (!dateOfTransfer) {
        toast.error('Please specify the date of transfer');
        return;
      }
      if (transferToType === 'PS' && !transferredToPsId) {
        toast.error('Please select the Police Station being transferred to');
        return;
      }
      if (transferToType === 'AGENCY') {
        const agencyValue = transferredToAgencyId === 'OTHER' ? agencyOther.trim() : transferredToAgencyId;
        if (!agencyValue) {
          toast.error('Please select an Agency / Court or specify the name');
          return;
        }
      }
    }
    if (!effectiveDate) {
      toast.error(t('statusUpdate.chooseDateError', 'Select the date this change happened'));
      return;
    }
    statusUpdateMutation.mutate();
  };

  if (!open) return null;

  const rawOptions = activeField?.options || [];
  const hasSuppOption = rawOptions.some((o) => String(o.value).toUpperCase() === 'SUPPLEMENTARY CHARGESHEET');
  const fieldOptions = activeField?.status_field === 'case_status' && !hasSuppOption
    ? [...rawOptions, { value: 'SUPPLEMENTARY CHARGESHEET', label: 'SUPPLEMENTARY CHARGESHEET' }]
    : rawOptions;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[var(--bg-card-theme)] border border-[var(--border-card-theme)] rounded-2xl max-w-md w-full overflow-hidden shadow-2xl text-[var(--text-main-theme)]">
        <div className="flex justify-between items-center bg-[var(--bg-page-main)] border-b border-[var(--border-card-theme)]/70 px-6 py-4">
          <h3 className="text-base font-bold text-[var(--text-main-theme)]">
            {t('statusUpdate.title', 'Update record status')}
          </h3>
          <button
            onClick={handleClose}
            className="text-[var(--text-main-theme)] opacity-50 hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-[var(--bg-page-main)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-[var(--text-main-theme)] opacity-70">
              <Loader2 size={22} className="animate-spin" />
              <p className="text-xs font-semibold">{t('common.loading', 'Loading...')}</p>
            </div>
          )}

          {isError && !isLoading && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3.5 text-xs font-semibold">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              <span>{error?.response?.data?.message || t('statusUpdate.loadError', 'Failed to load status options')}</span>
            </div>
          )}

          {!isLoading && !isError && data && (
            <>
              {isFrozen && (
                <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3.5 text-xs font-semibold">
                  <Lock size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{t('statusUpdate.frozenNotice', 'This record is frozen pending audit review and cannot be modified.')}</span>
                </div>
              )}

              {/* Field chooser — shown when more than one status field exists and none is
                  preselected/chosen yet */}
              {!activeField && fields.length > 1 && (
                <div className="space-y-2">
                  <label className="text-sm font-bold text-[var(--text-main-theme)] opacity-80">
                    {t('statusUpdate.whichStatus', 'Which status would you like to update?')}
                  </label>
                  <div className="space-y-2">
                    {fields.map((f) => {
                      const isDisabled = isFrozen || !!f.disabled;
                      return (
                        <button
                          key={f.status_field}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => !isDisabled && setActiveFieldKey(f.status_field)}
                          className={`w-full text-left rounded-xl px-4 py-3 transition-all ${
                            f.disabled
                              ? 'bg-amber-500/10 border border-amber-500/30 opacity-75 cursor-not-allowed'
                              : 'bg-[var(--bg-page-main)]/50 hover:bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] hover:border-[var(--accent-color)] cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-bold text-[var(--text-main-theme)]">{f.label}</div>
                            {f.disabled && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-md">
                                <Lock size={12} /> Restricted
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--text-main-theme)] opacity-60 font-semibold mt-0.5">
                            {t('statusUpdate.currentValue', 'Current')}: {resolveOptionLabel(f, f.current_value) ?? (f.current_value ?? t('statusUpdate.notSet', 'Not set'))}
                          </div>
                          {f.disabled && f.disabled_reason && (
                            <div className="text-[11px] text-amber-700 font-semibold mt-1.5 flex items-start gap-1">
                              <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                              <span>{f.disabled_reason}</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeField && (
                <>
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => { setActiveFieldKey(null); setNewValue(''); }}
                      className="text-[11px] font-bold text-[var(--accent-color)] hover:underline cursor-pointer"
                    >
                      &larr; {t('statusUpdate.change', 'Change')}
                    </button>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-[var(--text-main-theme)] opacity-80">
                      {activeField.label}
                    </label>
                    <p className="text-[11px] text-[var(--text-main-theme)] opacity-60 font-semibold">
                      {t('statusUpdate.currentValue', 'Current')}: {resolveOptionLabel(activeField, activeField.current_value) ?? (activeField.current_value ?? t('statusUpdate.notSet', 'Not set'))}
                    </p>
                  </div>

                  {/* Value picker: boolean fields get Yes/No buttons, enum fields get a select — both driven entirely by field.options from the backend */}
                  {activeField.value_type === 'boolean' ? (
                    <div className="flex gap-3">
                      {fieldOptions.map((opt) => {
                        const label = isHindi && opt.label_hi ? opt.label_hi : opt.label;
                        const selected = String(newValue) === String(opt.value);
                        return (
                          <button
                            key={String(opt.value)}
                            type="button"
                            disabled={isFrozen}
                            onClick={() => setNewValue(opt.value)}
                            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold border-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                              selected
                                ? 'bg-[var(--accent-color)] border-[var(--accent-color)] text-white shadow-md'
                                : 'bg-[var(--bg-page-main)]/40 border-[var(--border-card-theme)] text-[var(--text-main-theme)] hover:border-[var(--accent-color)]'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <select
                      value={newValue}
                      disabled={isFrozen}
                      onChange={(e) => setNewValue(e.target.value)}
                      className="w-full bg-[var(--bg-page-main)]/40 border-2 border-[var(--border-card-theme)] text-sm text-[var(--text-main-theme)] px-3.5 py-2.5 rounded-xl outline-none focus:border-[var(--accent-color)] transition-all font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <option value="">{t('statusUpdate.chooseValue', '-- Choose value --')}</option>
                      {fieldOptions.map((opt) => (
                        <option key={String(opt.value)} value={opt.value}>
                          {isHindi && opt.label_hi ? opt.label_hi : opt.label}
                        </option>
                      ))}
                    </select>
                  )}

                  {isSupplementary && (
                    <div className="space-y-1.5 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30">
                      <label className="text-xs font-bold text-amber-800 flex items-center gap-1">
                        <span>Pending Investigation / Items Remaining for Supplementary Chargesheet *</span>
                      </label>
                      <p className="text-[11px] text-[var(--text-main-theme)] opacity-75 font-medium">
                        Specify what investigation items remain pending to be chargesheeted (e.g. FSL forensic report, pending arrest of co-accused, CDR/financial analysis):
                      </p>
                      <textarea
                        rows={3}
                        value={suppDetails}
                        disabled={isFrozen}
                        onChange={(e) => setSuppDetails(e.target.value)}
                        placeholder="e.g. Awaiting FSL forensic report and pending arrest of absconding co-accused A-2..."
                        className="w-full bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] rounded-xl p-3 text-xs text-[var(--text-main-theme)] outline-none focus:border-[var(--accent-color)] font-medium mt-1"
                      />
                    </div>
                  )}

                  {isTransfer && (
                    <div className="space-y-3 p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30">
                      <p className="text-xs font-bold text-blue-800">Transfer Details *</p>

                      {/* Transfer target type */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[var(--text-main-theme)] opacity-80">Transfer To</label>
                        <div className="flex gap-2">
                          {['PS', 'AGENCY'].map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              disabled={isFrozen}
                              onClick={() => { setTransferToType(opt); setTransferredToPsId(''); setTransferredToAgencyId(''); setPsSearch(''); }}
                              className={`flex-1 px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all cursor-pointer disabled:opacity-40 ${
                                transferToType === opt
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : 'bg-[var(--bg-page-main)]/40 border-[var(--border-card-theme)] text-[var(--text-main-theme)] hover:border-blue-400'
                              }`}
                            >
                              {opt === 'PS' ? 'Police Station' : 'Agency / Court'}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* PS picker */}
                      {transferToType === 'PS' && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--text-main-theme)] opacity-80">Police Station *</label>
                          <input
                            type="text"
                            value={psSearch}
                            onChange={(e) => setPsSearch(e.target.value)}
                            placeholder={psNodes.length === 0 ? 'Loading police stations…' : 'Search by PS name…'}
                            disabled={isFrozen}
                            className="w-full bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] rounded-xl px-3 py-2 text-xs text-[var(--text-main-theme)] outline-none focus:border-blue-400 mb-1"
                          />
                          <select
                            value={transferredToPsId}
                            disabled={isFrozen || psNodes.length === 0}
                            onChange={(e) => setTransferredToPsId(e.target.value)}
                            className="w-full bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] rounded-xl px-3 py-2.5 text-xs text-[var(--text-main-theme)] outline-none focus:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <option value="">{psNodes.length === 0 ? '-- Loading… --' : `-- Select Police Station (${filteredPsNodes.length} found) --`}</option>
                            {filteredPsNodes.map((ps) => (
                              <option key={ps.id} value={ps.id}>{ps.name}</option>
                            ))}
                          </select>
                          {psNodes.length > 0 && filteredPsNodes.length === 0 && psSearch && (
                            <p className="text-[10px] text-amber-700 font-semibold">No PS found for "{psSearch}" — try a different name</p>
                          )}
                        </div>
                      )}

                      {/* Agency / Court dropdown */}
                      {transferToType === 'AGENCY' && (
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-[var(--text-main-theme)] opacity-80">Agency / Court *</label>
                          <select
                            value={transferredToAgencyId}
                            disabled={isFrozen}
                            onChange={(e) => { setTransferredToAgencyId(e.target.value); setAgencyOther(''); }}
                            className="w-full bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] rounded-xl px-3 py-2.5 text-xs text-[var(--text-main-theme)] outline-none focus:border-blue-400 disabled:opacity-40"
                          >
                            <option value="">-- Select Agency / Court --</option>
                            <optgroup label="Central Agencies">
                              <option value="CBI">CBI — Central Bureau of Investigation</option>
                              <option value="NIA">NIA — National Investigation Agency</option>
                              <option value="ED">ED — Enforcement Directorate</option>
                              <option value="EOW">EOW — Economic Offences Wing</option>
                              <option value="SFIO">SFIO — Serious Fraud Investigation Office</option>
                              <option value="NCB">NCB — Narcotics Control Bureau</option>
                              <option value="NHRC">NHRC — National Human Rights Commission</option>
                              <option value="CVC">CVC — Central Vigilance Commission</option>
                            </optgroup>
                            <optgroup label="Delhi Police Specialised Units">
                              <option value="CRIME_BRANCH">Crime Branch, Delhi Police</option>
                              <option value="STF">STF — Special Task Force</option>
                              <option value="ATS">ATS — Anti-Terrorism Squad</option>
                              <option value="ACB">ACB — Anti-Corruption Branch</option>
                              <option value="CYBER_CELL">Cyber Cell, Delhi Police</option>
                              <option value="SIT">SIT — Special Investigation Team</option>
                            </optgroup>
                            <optgroup label="Courts">
                              <option value="SUPREME_COURT">Supreme Court of India</option>
                              <option value="HIGH_COURT_DELHI">Delhi High Court</option>
                              <option value="SESSIONS_COURT">Sessions Court</option>
                              <option value="MM_COURT">Metropolitan Magistrate Court</option>
                              <option value="FAMILY_COURT">Family Court</option>
                              <option value="FAST_TRACK_COURT">Fast Track Court</option>
                            </optgroup>
                            <option value="OTHER">Other (specify below)</option>
                          </select>
                          {transferredToAgencyId === 'OTHER' && (
                            <input
                              type="text"
                              value={agencyOther}
                              onChange={(e) => setAgencyOther(e.target.value)}
                              placeholder="Specify agency or court name…"
                              disabled={isFrozen}
                              className="w-full bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] rounded-xl px-3 py-2 text-xs text-[var(--text-main-theme)] outline-none focus:border-blue-400 disabled:opacity-40 mt-1"
                            />
                          )}
                        </div>
                      )}

                      {/* Date of transfer */}
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-[var(--text-main-theme)] opacity-80">Date of Transfer *</label>
                        <input
                          type="date"
                          value={dateOfTransfer}
                          max={todayISO()}
                          disabled={isFrozen}
                          onChange={(e) => setDateOfTransfer(e.target.value)}
                          className="w-full bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] rounded-xl px-3 py-2 text-xs text-[var(--text-main-theme)] outline-none focus:border-blue-400 disabled:opacity-40"
                        />
                      </div>
                    </div>
                  )}

                  {/* Generic effective date — hidden for transfers (dateOfTransfer already captures it) */}
                  {!isTransfer && (
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-[var(--text-main-theme)] opacity-80">
                      {workoutYes
                        ? t('statusUpdate.workoutDateLabel', 'Workout date')
                        : t('statusUpdate.effectiveDateLabel', 'When did this change happen?')}
                    </label>
                    <input
                      type="date"
                      value={effectiveDate}
                      max={todayISO()}
                      disabled={isFrozen}
                      onChange={(e) => setEffectiveDate(e.target.value)}
                      className="w-full bg-[var(--bg-page-main)]/40 border-2 border-[var(--border-card-theme)] text-sm text-[var(--text-main-theme)] px-3.5 py-2.5 rounded-xl outline-none focus:border-[var(--accent-color)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                    {workoutYes && (
                      <p className="text-[11px] text-[var(--text-main-theme)] opacity-60 font-semibold">
                        {t('statusUpdate.workoutDateHint', 'This date is recorded as the official workout date for this case.')}
                      </p>
                    )}
                  </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-[var(--text-main-theme)] opacity-80">
                      {t('statusUpdate.commentLabel', 'Comment (optional)')}
                    </label>
                    <textarea
                      rows={2}
                      value={comment}
                      disabled={isFrozen}
                      onChange={(e) => setComment(e.target.value)}
                      className="w-full bg-[var(--bg-page-main)]/40 border-2 border-[var(--border-card-theme)] rounded-xl p-3.5 text-sm text-[var(--text-main-theme)] outline-none focus:border-[var(--accent-color)] transition-all resize-none disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 bg-[var(--bg-page-main)] border-t border-[var(--border-card-theme)]/70 px-6 py-4">
          <button
            onClick={handleClose}
            className="bg-[var(--bg-page-main)] border-2 border-[var(--border-card-theme)] hover:border-[var(--accent-color)] text-[var(--text-main-theme)] px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer transition-all hover:shadow-sm"
          >
            {t('actions.cancel', 'Cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!activeField || activeField.disabled || isFrozen || statusUpdateMutation.isPending || (isSupplementary && !suppDetails.trim()) || (isTransfer && (!dateOfTransfer || (transferToType === 'PS' && !transferredToPsId) || (transferToType === 'AGENCY' && (!transferredToAgencyId || (transferredToAgencyId === 'OTHER' && !agencyOther.trim())))))}
            className="bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-md cursor-pointer transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {statusUpdateMutation.isPending ? t('statusUpdate.saving', 'Saving…') : t('statusUpdate.save', 'Save Status')}
          </button>
        </div>
      </div>
    </div>
  );
}
