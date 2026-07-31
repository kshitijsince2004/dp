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

  const statusOptionsQueryKey = ['record-status-options', recordId];

  const { data, isLoading, isError, error } = useQuery({
    queryKey: statusOptionsQueryKey,
    queryFn: async () => {
      const res = await api.get(`/records/${recordId}/status-options`);
      return res.data.data;
    },
    enabled: open && !!recordId,
  });

  const fields = data?.fields || [];
  const isFrozen = !!data?.is_frozen;

  // Reset local form state whenever the modal is (re)opened for a record, and pick the
  // active field once the field set is known.
  useEffect(() => {
    if (!open) return;
    setNewValue('');
    setEffectiveDate(todayISO());
    setComment('');
    setActiveFieldKey(null);
  }, [open, recordId]);

  useEffect(() => {
    if (!open || fields.length === 0 || activeFieldKey) return;
    if (initialField && fields.some((f) => f.status_field === initialField)) {
      setActiveFieldKey(initialField);
    } else if (fields.length === 1) {
      setActiveFieldKey(fields[0].status_field);
    }
  }, [open, fields, initialField, activeFieldKey]);

  const activeField = fields.find((f) => f.status_field === activeFieldKey) || null;

  const isWorkoutFlow = activeField?.status_field === 'is_worked_out';
  const workoutYes = isWorkoutFlow && (newValue === true || newValue === 'true');

  const resolveOptionLabel = (field, rawValue) => {
    if (!field) return null;
    const match = field.options?.find((o) => String(o.value) === String(rawValue));
    if (!match) return null;
    return isHindi && match.label_hi ? match.label_hi : match.label;
  };

  const statusUpdateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.patch(`/records/${recordId}/status`, {
        status_field: activeField.status_field,
        new_value: newValue,
        effective_date: effectiveDate,
        comment: comment || undefined,
      });
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
    onClose();
  };

  const handleSubmit = () => {
    if (!activeField) return;
    if (newValue === '' || newValue === null || newValue === undefined) {
      toast.error(t('statusUpdate.chooseValueError', 'Select a value before saving'));
      return;
    }
    if (!effectiveDate) {
      toast.error(t('statusUpdate.chooseDateError', 'Select the date this change happened'));
      return;
    }
    statusUpdateMutation.mutate();
  };

  if (!open) return null;

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
                    {fields.map((f) => (
                      <button
                        key={f.status_field}
                        type="button"
                        disabled={isFrozen}
                        onClick={() => setActiveFieldKey(f.status_field)}
                        className="w-full text-left bg-[var(--bg-page-main)]/50 hover:bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] hover:border-[var(--accent-color)] rounded-xl px-4 py-3 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <div className="text-sm font-bold text-[var(--text-main-theme)]">{f.label}</div>
                        <div className="text-[11px] text-[var(--text-main-theme)] opacity-60 font-semibold mt-0.5">
                          {t('statusUpdate.currentValue', 'Current')}: {resolveOptionLabel(f, f.current_value) ?? (f.current_value ?? t('statusUpdate.notSet', 'Not set'))}
                        </div>
                      </button>
                    ))}
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
                      {activeField.options.map((opt) => {
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
                      {activeField.options.map((opt) => (
                        <option key={String(opt.value)} value={opt.value}>
                          {isHindi && opt.label_hi ? opt.label_hi : opt.label}
                        </option>
                      ))}
                    </select>
                  )}

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
            disabled={!activeField || isFrozen || statusUpdateMutation.isPending}
            className="bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white px-6 py-2.5 rounded-xl text-sm font-bold shadow-md cursor-pointer transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {statusUpdateMutation.isPending ? t('statusUpdate.saving', 'Saving…') : t('statusUpdate.save', 'Save Status')}
          </button>
        </div>
      </div>
    </div>
  );
}
