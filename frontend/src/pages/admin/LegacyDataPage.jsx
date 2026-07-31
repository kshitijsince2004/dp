import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Archive, Upload, Eye, CheckCircle2, XCircle,
  AlertTriangle, Loader2, Clock, RefreshCw, FileSpreadsheet,
  Link, AlertCircle, Ban, ChevronDown, ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore.js';
import api from '../../utils/api.js';

// ── Status Badge ──────────────────────────────────────────────────────────────
const STATUS_CLS = {
  VALIDATION_PENDING: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  VALIDATED:          'bg-sky-500/10 text-sky-500 border-sky-500/20',
  CONFIRMED:          'bg-amber-500/10 text-amber-500 border-amber-500/20',
  IMPORTED:           'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  FAILED:             'bg-rose-500/10 text-rose-500 border-rose-500/20',
  CANCELLED:          'bg-[var(--bg-page-main)] border-[var(--border-card-theme)] text-[var(--text-main-theme)]/60',
};

function StatusBadge({ status }) {
  const cls = STATUS_CLS[status] || 'bg-[var(--bg-page-main)] border-[var(--border-card-theme)] text-[var(--text-main-theme)]/80';
  return (
    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${cls}`}>
      {status || '—'}
    </span>
  );
}

// Terminal statuses a confirmed batch can land on — polling stops here.
const TERMINAL_STATUSES = new Set(['IMPORTED', 'FAILED', 'CANCELLED']);

// Compresses a sorted-or-unsorted list of row numbers into human-readable ranges,
// e.g. [5,6,7,8,...,27,29,31] -> ["5–27", "29", "31"]. Presentation-only — T8.
function compressRows(rows) {
  const sorted = [...new Set(rows)].sort((a, b) => a - b);
  if (!sorted.length) return [];
  const ranges = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = cur;
    prev = cur;
  }
  ranges.push(start === prev ? `${start}` : `${start}–${prev}`);
  return ranges;
}

// Groups identical findings (same code + field + message text) across rows into one entry
// with the affected row numbers attached (T8 — presentation-only grouping; the backend's
// per-row rows in import_batch_errors are untouched, this just re-shapes what's already in
// the response). Distinct messages (e.g. different interpolated PIS numbers/section text)
// are never merged — only byte-identical message text collapses.
function groupErrorEntries(list) {
  const groups = new Map();
  for (const err of list) {
    const row = err.row ?? err.row_number;
    const code = err.code ?? err.error_code ?? '';
    const fieldKey = err.field_key ?? '';
    const message = err.message ?? err.error_message ?? '';
    const key = `${code}|${fieldKey}|${message}`;
    if (!groups.has(key)) {
      groups.set(key, { key, code, field_key: err.field_key ?? null, message, rows: [] });
    }
    if (row !== undefined && row !== null) groups.get(key).rows.push(row);
  }
  return Array.from(groups.values())
    .map((g) => {
      const rows = [...new Set(g.rows)].sort((a, b) => a - b);
      return { ...g, rows, count: rows.length || 1 };
    })
    // Descending by affected-row count — the walls (IO/beat/requiredness) surface first.
    .sort((a, b) => b.count - a.count);
}

// One collapsed finding line: message + row-count badge + optional field-key chip +
// expand toggle revealing the compressed row-range list. Reused for both ERROR and WARNING
// sections with only the color tokens swapped.
function ErrorGroupRow({ group, tone }) {
  const [expanded, setExpanded] = useState(false);
  const ranges = compressRows(group.rows);
  const colors = tone === 'error'
    ? {
        wrap: 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400',
        chip: 'bg-rose-500/20',
        border: 'border-rose-500/20',
      }
    : {
        wrap: 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400',
        chip: 'bg-amber-500/20',
        border: 'border-amber-500/20',
      };
  return (
    <div className={`font-mono text-[10px] border rounded-lg px-3 py-2 ${colors.wrap}`}>
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex justify-between items-start gap-4 text-left cursor-pointer bg-transparent border-none p-0"
      >
        <div className="flex items-start gap-1.5">
          {ranges.length > 0 ? (
            expanded ? <ChevronDown size={11} className="mt-0.5 shrink-0" /> : <ChevronRight size={11} className="mt-0.5 shrink-0" />
          ) : null}
          <span>{group.message}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {group.field_key && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${colors.chip}`}>
              {group.field_key}
            </span>
          )}
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${colors.chip}`}>
            {group.count} row{group.count === 1 ? '' : 's'}
          </span>
        </div>
      </button>
      {expanded && ranges.length > 0 && (
        <div className={`mt-1.5 pt-1.5 border-t ${colors.border} opacity-90`}>
          Rows: {ranges.join(', ')}
        </div>
      )}
    </div>
  );
}

// Splits a batch's error rows into ERROR (row rejected) vs WARNING (imported anyway, e.g.
// legacy leniency downgrades — docs/new-db-integration/03-import.md C6) sections, then groups
// identical findings within each section so N rows sharing the same message collapse into one
// line with an expandable row-range list (T8 — the IO/beat/requiredness "walls").
function ErrorList({ errors = [] }) {
  if (!errors.length) return null;
  const hardErrors = errors.filter((e) => e.severity !== 'WARNING');
  const warnings = errors.filter((e) => e.severity === 'WARNING');
  const hardGroups = groupErrorEntries(hardErrors);
  const warnGroups = groupErrorEntries(warnings);
  const totalDistinct = hardGroups.length + warnGroups.length;
  return (
    <div className="space-y-3">
      <p className="text-[var(--text-main-theme)] font-bold text-xs flex items-center gap-2 flex-wrap">
        <span className="text-rose-600 dark:text-rose-400">Errors ({hardErrors.length})</span>
        <span className="opacity-30">·</span>
        <span className="text-amber-600 dark:text-amber-400">Warnings ({warnings.length})</span>
        <span className="opacity-60 font-semibold text-[10px]">
          · across {totalDistinct} distinct issue{totalDistinct === 1 ? '' : 's'}
        </span>
      </p>
      {hardErrors.length > 0 && (
        <div className="border border-rose-500/30 bg-rose-500/5 rounded-2xl p-5 space-y-3">
          <p className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-2 text-xs">
            <AlertTriangle size={14} />
            Errors ({hardErrors.length}): these rows were skipped
            <span className="opacity-60 font-semibold text-[10px]">({hardGroups.length} distinct)</span>
          </p>
          <div className="max-h-64 overflow-y-auto space-y-1.5 pr-2">
            {hardGroups.map((g) => (
              <ErrorGroupRow key={g.key} group={g} tone="error" />
            ))}
          </div>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-2xl p-5 space-y-3">
          <p className="text-amber-600 dark:text-amber-400 font-bold flex items-center gap-2 text-xs">
            <AlertCircle size={14} />
            Warnings ({warnings.length}): imported anyway, review recommended
            <span className="opacity-60 font-semibold text-[10px]">({warnGroups.length} distinct)</span>
          </p>
          <div className="max-h-64 overflow-y-auto space-y-1.5 pr-2">
            {warnGroups.map((g) => (
              <ErrorGroupRow key={g.key} group={g} tone="warning" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Import Batch Table ────────────────────────────────────────────────────────
function BatchTable({ batches = [], isLoading, onViewBatch }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-14 text-[var(--text-main-theme)] opacity-80 font-semibold font-sans">
        <Loader2 size={20} className="animate-spin mr-2 text-[var(--accent-color)]" /> Loading batches…
      </div>
    );
  }
  if (!batches.length) {
    return (
      <div className="text-center py-16 text-[var(--text-main-theme)] opacity-60 font-semibold font-sans">
        <Archive size={40} className="mx-auto mb-3 opacity-30 text-[var(--accent-color)]" />
        <p className="text-sm font-bold text-[var(--text-main-theme)]">No import batches found.</p>
        <p className="text-xs mt-1 text-[var(--text-main-theme)] opacity-70">Upload a file in the Bulk Importer tab to get started.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse text-xs font-sans">
        <thead>
          <tr className="bg-[var(--bg-page-main)]/80 text-[var(--text-main-theme)] uppercase font-semibold border-b border-[var(--border-card-theme)]/70 tracking-wider">
            <th className="p-3 pl-6 text-[var(--text-main-theme)] font-bold">Batch ID</th>
            <th className="p-3 text-[var(--text-main-theme)] font-bold">Record Type</th>
            <th className="p-3 text-[var(--text-main-theme)] font-bold">Total Rows</th>
            <th className="p-3 text-[var(--text-main-theme)] font-bold">Imported</th>
            <th className="p-3 text-[var(--text-main-theme)] font-bold">Status</th>
            <th className="p-3 text-[var(--text-main-theme)] font-bold">Created At</th>
            <th className="p-3 pr-6 text-right text-[var(--text-main-theme)] font-bold">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-card-theme)]/30 text-[var(--text-main-theme)]">
          {batches.map((batch) => (
            <tr
              key={batch.id}
              className="hover:bg-[var(--bg-page-main)]/40 transition-colors duration-150"
            >
              <td className="p-3 pl-6 font-mono text-[var(--text-main-theme)] opacity-60 text-[10px]">{batch.id?.slice(0, 12)}…</td>
              <td className="p-3 font-bold text-[var(--accent-color)]">{batch.record_type || '—'}</td>
              <td className="p-3 tabular-numbers text-[var(--text-main-theme)] opacity-80 font-semibold">{batch.total_rows ?? '—'}</td>
              <td className="p-3 tabular-numbers text-emerald-500 font-bold">{batch.imported_rows ?? '—'}</td>
              <td className="p-3"><StatusBadge status={batch.status} /></td>
              <td className="p-3 font-mono text-[var(--text-main-theme)] opacity-70 text-[10px]">
                {batch.created_at
                  ? new Date(batch.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
                  : '—'}
              </td>
              <td className="p-3 pr-6 text-right">
                <button
                  type="button"
                  onClick={() => onViewBatch(batch)}
                  className="inline-flex items-center gap-1.5 text-[var(--text-main-theme)] opacity-95 hover:text-[var(--accent-color)] hover:bg-[var(--bg-page-main)]/80 border border-[var(--border-card-theme)] bg-transparent px-2.5 py-1.5 rounded-lg transition-all duration-150 cursor-pointer ml-auto font-bold active:scale-95 shadow-sm"
                  title="View details"
                >
                  <Eye size={13} />
                  <span>Details</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Bulk Importer Panel (Validate / Confirm / Poll / Report) ──────────────────
// Role-aware: HC is forced non-legacy, own PS only (D1). DISTRICT_OFFICER is forced legacy,
// destination PS restricted to their own district — the PS list itself already comes back
// district-scoped from GET /hierarchy/nodes?type=PS (hierarchy.controller.js's DISTRICT_OFFICER
// branch), so no client-side filtering is needed here.
function BulkImporterPanel({ onImported, isHC, isDistrictOfficer, user }) {
  const { t, i18n } = useTranslation();
  const currentLng = i18n.language || 'en';

  const [step, setStep] = useState(1); // 1 Upload/Validate | 2 Review/Confirm | 3 Report
  const [recordType, setRecordType] = useState('CASE');
  const [psId, setPsId] = useState(isHC ? (user?.ps_id || user?.station_id || '') : '');
  const [file, setFile] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [confirmedBatchId, setConfirmedBatchId] = useState(null);

  // Legacy mode is never a user choice — D1/D2, enforced identically server-side (403 on
  // mismatch): HC batches are always non-legacy, DISTRICT_OFFICER batches are always legacy.
  const isLegacy = !isHC;

  const { data: stations = [] } = useQuery({
    queryKey: ['hierarchy', 'stations'],
    queryFn: async () => {
      const res = await api.get('/hierarchy/nodes?type=PS');
      return res.data?.data || [];
    },
    enabled: !isHC,
  });

  const downloadTemplate = async () => {
    try {
      const res = await api.get(`/import/template/${recordType}`, {
        params: { lang: currentLng },
        responseType: 'blob'
      });
      const blob = new Blob([res.data], { type: res.headers['content-type'] });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `${recordType}_Import_Template.xlsx`;
      link.click();
      toast.success(t('import.templateDownloaded', 'Template downloaded successfully'));
    } catch (err) {
      console.error('[downloadTemplate] failed:', err);
      const status = err.response?.status;
      let serverMessage = err.response?.data?.message;
      if (!serverMessage && err.response?.data instanceof Blob) {
        try {
          serverMessage = JSON.parse(await err.response.data.text())?.message;
        } catch { /* body wasn't JSON */ }
      }
      console.error('[downloadTemplate] status:', status, 'message:', serverMessage);
      toast.error(
        `${t('import.templateDownloadFailed', 'Failed to download template')}${status ? ` (${status})` : ''}${serverMessage ? `: ${serverMessage}` : ''}`
      );
    }
  };

  const validateMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('record_type', recordType);
      formData.append('is_legacy', String(isLegacy));
      formData.append('ps_id', isHC ? (user?.ps_id || user?.station_id || '') : psId);
      const res = await api.post('/import/validate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        // Bulk validation parses the whole sheet (30k+ rows) — override the global
        // 15s axios timeout so the request isn't aborted mid-parse.
        timeout: 0,
      });
      return res.data?.data;
    },
    onSuccess: (data) => {
      toast.success(t('import.validationSuccess', 'Validation completed'));
      setValidationResult(data);
      setStep(2);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || t('import.validationFailed', 'Validation failed'));
    }
  });

  // Confirm only CLAIMS the batch (VALIDATED -> CONFIRMED) and hands off to the async
  // RabbitMQ worker (docs/new-db-integration/03-import.md C5) — the endpoint responds 202
  // immediately, well before any record is written. batchDetailQuery below (started once
  // confirmedBatchId is set) is what actually tracks the import to completion.
  const confirmMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/import/confirm/${validationResult?.batch_id}`, {}, { timeout: 0 });
      return res.data?.data;
    },
    onSuccess: (data) => {
      toast.success(t('import.importQueued', 'Import queued, processing in the background'));
      setConfirmedBatchId(data.batch_id);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || t('import.confirmFailed', 'Import confirmation failed'));
    }
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post(`/import/batches/${validationResult?.batch_id}/cancel`);
      return res.data?.data;
    },
    onSuccess: () => {
      toast.success(t('import.importCancelled', 'Import cancelled'));
      resetWizard();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || t('import.cancelFailed', 'Cancel failed'));
    }
  });

  // Polls GET /import/batches/:id every 2s while the batch is CONFIRMED (i.e. the async
  // worker has picked it up but hasn't finished) — stops the moment a terminal status lands.
  const { data: polledBatch } = useQuery({
    queryKey: ['import', 'batch', confirmedBatchId],
    queryFn: async () => {
      const res = await api.get(`/import/batches/${confirmedBatchId}`);
      return res.data?.data;
    },
    enabled: !!confirmedBatchId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && TERMINAL_STATUSES.has(status) ? false : 2000;
    },
  });

  React.useEffect(() => {
    if (polledBatch && TERMINAL_STATUSES.has(polledBatch.status) && step !== 3) {
      setStep(3);
      if (polledBatch.status === 'IMPORTED' && !isHC) {
        onImported?.();
      }
    }
  }, [polledBatch, step, isHC, onImported]);

  const resetWizard = () => {
    setStep(1);
    setFile(null);
    setValidationResult(null);
    setConfirmedBatchId(null);
  };

  const isPolling = !!confirmedBatchId && !(polledBatch && TERMINAL_STATUSES.has(polledBatch.status));
  const progressPct = polledBatch?.total_rows
    ? Math.min(100, Math.round((polledBatch.processed_rows / polledBatch.total_rows) * 100))
    : 0;

  return (
    <div className="space-y-6">
      {/* Dynamic Steps Ribbon */}
      <div className="flex items-center justify-center gap-4 mb-4">
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${step === 1 ? 'bg-[var(--accent-color)] text-white border-transparent shadow-md' : 'bg-[var(--bg-page-main)] border-[var(--border-card-theme)] text-[var(--text-main-theme)]/70'}`}>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-bold">1</span>
          <span className="text-xs font-bold">{t('import.stepUpload', 'Upload & Validate')}</span>
        </div>
        <div className="h-px w-12 bg-[var(--border-card-theme)]"></div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${step === 2 ? 'bg-[var(--accent-color)] text-white border-transparent shadow-md' : 'bg-[var(--bg-page-main)] border-[var(--border-card-theme)] text-[var(--text-main-theme)]/70'}`}>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-bold">2</span>
          <span className="text-xs font-bold">{t('import.stepConfirm', 'Review & Confirm')}</span>
        </div>
        <div className="h-px w-12 bg-[var(--border-card-theme)]"></div>
        <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${step === 3 ? 'bg-[var(--accent-color)] text-white border-transparent shadow-md' : 'bg-[var(--bg-page-main)] border-[var(--border-card-theme)] text-[var(--text-main-theme)]/70'}`}>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-bold">3</span>
          <span className="text-xs font-bold">{t('import.stepReport', 'Import Report')}</span>
        </div>
      </div>

      {step === 1 && (
        <div className="border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/60 backdrop-blur-md rounded-2xl p-6 space-y-6 text-xs shadow-sm">
          <h3 className="font-bold text-[var(--text-main-theme)] flex items-center gap-2 text-sm font-display">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--bg-page-main)]/80 border border-[var(--border-card-theme)]/85">
              <Upload size={15} className="text-[var(--accent-color)]" />
            </span>
            {t('import.bulkImportTitle', 'Bulk Spreadsheet Importer')}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[var(--text-main-theme)] font-semibold">
            {/* Record Type */}
            <div className="space-y-1.5">
              <label className="text-[var(--text-main-theme)] opacity-80 font-bold">{t('import.recordType', 'Record Type')}</label>
              <select
                value={recordType}
                onChange={(e) => setRecordType(e.target.value)}
                className="w-full bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] rounded-xl px-3 py-2 text-[var(--text-main-theme)] outline-none focus:border-[var(--accent-color)] transition-all cursor-pointer shadow-sm font-bold"
              >
                {['CASE', 'ARREST', 'KALANDRA', 'PCR_CALL', 'MISSING', 'UIDB'].map((rt) => (
                  <option key={rt} value={rt} className="bg-[var(--bg-page-main)] text-[var(--text-main-theme)]">{rt}</option>
                ))}
              </select>
            </div>

            {/* Template Download */}
            <div className="space-y-1.5 flex flex-col justify-end">
              <button
                type="button"
                onClick={downloadTemplate}
                className="flex items-center justify-center gap-1.5 bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] hover:border-[var(--accent-color)] text-[var(--accent-color)] hover:bg-[var(--bg-page-main)] font-bold px-4 py-2 rounded-xl transition-all shadow-sm cursor-pointer h-[34px]"
              >
                <FileSpreadsheet size={14} />
                {t('import.downloadTemplate', 'Download Excel Template')}
              </button>
            </div>

            {/* Destination Station selection (DISTRICT_OFFICER only — the list returned by
                the hierarchy API is already scoped to this user's own district server-side) */}
            {!isHC && (
              <div className="space-y-1.5">
                <label className="text-[var(--text-main-theme)] opacity-80 font-bold">{t('import.destinationStation', 'Destination Police Station (your district)')}</label>
                <select
                  value={psId}
                  onChange={(e) => setPsId(e.target.value)}
                  className="w-full bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] rounded-xl px-3 py-2 text-[var(--text-main-theme)] outline-none focus:border-[var(--accent-color)] transition-all cursor-pointer shadow-sm font-bold"
                >
                  <option value="">{t('import.selectStation', 'Select Destination Station...')}</option>
                  {stations.map(st => (
                    <option key={st.id} value={st.id} className="bg-[var(--bg-page-main)] text-[var(--text-main-theme)]">
                      {/* hierarchy API has no name_hi — fall back so Hindi mode never renders blank options */}
                      {currentLng === 'hi' ? (st.name_hi || st.name_en) : st.name_en}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Legacy mode indicator — never a choice, D1/D2 (server enforces identically) */}
            <div className="space-y-1.5 flex items-center pl-2 pt-6">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wide ${
                isLegacy
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400'
                  : 'bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400'
              }`}>
                <Clock size={12} />
                {isLegacy
                  ? t('import.legacyModeBadge', 'Legacy import: lands as LEGACY_IMPORTED, bypasses workflow')
                  : t('import.liveModeBadge', 'Live import: lands in your queue as DRAFT')}
              </span>
            </div>

            {/* File selection */}
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-[var(--text-main-theme)] opacity-80 font-bold">{t('import.selectFile', 'Select File (Excel .xlsx)')}</label>
              <input
                type="file"
                accept=".xlsx"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] rounded-xl px-3 py-2 text-[var(--text-main-theme)] opacity-80 cursor-pointer text-[11px] shadow-sm file:mr-2 file:rounded-lg file:border-0 file:bg-[var(--bg-page-main)]/80 file:text-[var(--accent-color)] file:font-bold file:px-2 file:py-0.5"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-[var(--text-main-theme)] opacity-60 font-semibold">
              {t('import.validateHint', 'File will be validated for correct fields, constraints, and data types.')}
            </p>
            <button
              type="button"
              disabled={!file || validateMutation.isPending || (!isHC && !psId)}
              onClick={() => validateMutation.mutate()}
              className="flex items-center gap-1.5 bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white font-bold px-5 py-2.5 rounded-xl transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-none shadow-sm active:scale-95"
            >
              {validateMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
              {t('import.validateButton', 'Validate Spreadsheet')}
            </button>
          </div>
        </div>
      )}

      {step === 2 && !confirmedBatchId && (
        <div className="border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/60 backdrop-blur-md rounded-2xl p-6 space-y-6 text-xs shadow-sm">
          <h3 className="font-bold text-[var(--text-main-theme)] flex items-center gap-2 text-sm font-display">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--bg-page-main)]/80 border border-[var(--border-card-theme)]/85">
              <CheckCircle2 size={15} className="text-emerald-500" />
            </span>
            {t('import.validationResult', 'Validation Summary')}
          </h3>

          {/* Validation Metrics Grid */}
          <div className="grid grid-cols-3 gap-4">
            <div className="border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/60 rounded-2xl p-4 text-center">
              <div className="text-[var(--text-main-theme)] opacity-60 text-[10px] font-bold uppercase tracking-wider mb-1">
                {t('import.totalRows', 'Total Rows')}
              </div>
              <div className="text-[var(--text-main-theme)] font-bold text-lg tabular-numbers">
                {validationResult?.total_rows ?? 0}
              </div>
            </div>
            <div className="border border-emerald-500/20 bg-emerald-500/5 rounded-2xl p-4 text-center">
              <div className="text-emerald-600 dark:text-emerald-400 opacity-80 text-[10px] font-bold uppercase tracking-wider mb-1">
                {t('import.validRows', 'Valid Rows')}
              </div>
              <div className="text-emerald-600 dark:text-emerald-400 font-bold text-lg tabular-numbers">
                {validationResult?.valid_rows ?? 0}
              </div>
            </div>
            <div className="border border-rose-500/20 bg-rose-500/5 rounded-2xl p-4 text-center">
              <div className="text-rose-600 dark:text-rose-400 opacity-80 text-[10px] font-bold uppercase tracking-wider mb-1">
                {t('import.invalidRows', 'Invalid Rows')}
              </div>
              <div className="text-rose-600 dark:text-rose-400 font-bold text-lg tabular-numbers">
                {validationResult?.invalid_rows ?? 0}
              </div>
            </div>
          </div>

          {validationResult?.errors?.length > 0 ? (
            <>
              <ErrorList errors={validationResult.errors} />
              {validationResult?.errors_truncated && (
                <p className="text-[var(--text-main-theme)]/60 text-[10px] font-semibold italic">
                  {t('import.errorsTruncated', 'Only the first errors are shown here. The full list is recorded against the batch.')}
                </p>
              )}
              <p className="text-[var(--text-main-theme)]/70 font-semibold text-[10px]">
                {t('import.errorSkipHint', 'Rows with errors will be skipped on confirm; rows with only warnings will still be imported.')}
              </p>
            </>
          ) : (
            <div className="border border-emerald-500/30 bg-emerald-500/5 rounded-2xl p-5 flex items-center gap-3">
              <CheckCircle2 className="text-emerald-500 shrink-0" size={18} />
              <div>
                <p className="text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                  {t('import.allRowsValid', 'All rows are valid!')}
                </p>
                <p className="text-[var(--text-main-theme)]/60 text-[10px] mt-0.5 font-semibold">
                  {t('import.readyToConfirm', 'Your spreadsheet has passed validation and is ready to be committed to the registry database.')}
                </p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between border-t border-[var(--border-card-theme)]/40 pt-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetWizard}
                className="flex items-center gap-1.5 text-[var(--text-main-theme)] hover:bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] bg-transparent px-4 py-2 rounded-xl transition-all cursor-pointer font-bold shadow-sm"
              >
                {t('common.startOver', 'Start Over')}
              </button>
              <button
                type="button"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
                className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 bg-transparent px-4 py-2 rounded-xl transition-all cursor-pointer font-bold shadow-sm disabled:opacity-50"
                title={t('import.cancelHint', 'Discards this batch, no records have been written yet')}
              >
                {cancelMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Ban size={12} />}
                {t('import.cancelBatch', 'Cancel Batch')}
              </button>
            </div>

            <button
              type="button"
              disabled={confirmMutation.isPending || (validationResult?.valid_rows === 0)}
              onClick={() => confirmMutation.mutate()}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-2.5 rounded-xl transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-none shadow-sm active:scale-95"
            >
              {confirmMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              {t('import.confirmImportButton', 'Confirm and Import Valid Rows')}
            </button>
          </div>
        </div>
      )}

      {step === 2 && confirmedBatchId && isPolling && (
        <div className="border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/60 backdrop-blur-md rounded-2xl p-8 space-y-5 text-xs shadow-sm text-center">
          <Loader2 size={32} className="animate-spin mx-auto text-[var(--accent-color)]" />
          <div>
            <p className="text-[var(--text-main-theme)] font-bold text-sm">
              {t('import.importing', 'Importing records…')}
            </p>
            <p className="text-[var(--text-main-theme)]/60 text-[10px] mt-1 font-semibold">
              {t('import.importingHint', 'This runs in the background. You can leave this page and check the Import Batches tab later.')}
            </p>
          </div>
          {polledBatch?.total_rows > 0 && (
            <div className="max-w-md mx-auto space-y-1.5">
              <div className="h-2.5 rounded-full bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] overflow-hidden">
                <div
                  className="h-full bg-[var(--accent-color)] transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <p className="text-[var(--text-main-theme)]/70 font-mono text-[10px] font-bold">
                {polledBatch.processed_rows ?? 0} / {polledBatch.total_rows} rows ({progressPct}%)
              </p>
            </div>
          )}
        </div>
      )}

      {step === 3 && polledBatch && (
        <div className="border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/60 backdrop-blur-md rounded-2xl p-6 space-y-6 text-xs shadow-sm font-sans">
          <div className="text-center py-4 space-y-2">
            <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full border ${
              polledBatch.status === 'IMPORTED'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
                : polledBatch.status === 'FAILED'
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-500'
                : 'bg-[var(--bg-page-main)] border-[var(--border-card-theme)] text-[var(--text-main-theme)]/60'
            }`}>
              {polledBatch.status === 'IMPORTED' && <CheckCircle2 size={30} />}
              {polledBatch.status === 'FAILED' && <XCircle size={30} />}
              {polledBatch.status === 'CANCELLED' && <Ban size={30} />}
            </div>
            <h3 className="text-lg font-bold text-[var(--text-main-theme)] font-display">
              {polledBatch.status === 'IMPORTED' && t('import.reportTitleDone', 'Import Completed')}
              {polledBatch.status === 'FAILED' && t('import.reportTitleFailed', 'Import Failed')}
              {polledBatch.status === 'CANCELLED' && t('import.reportTitleCancelled', 'Import Cancelled')}
            </h3>
            <p className="text-[var(--text-main-theme)] opacity-60 text-xs">
              Batch ID: <span className="font-mono text-[10px] bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] px-2 py-0.5 rounded">{polledBatch.id}</span>
            </p>
            {polledBatch.status === 'FAILED' && polledBatch.error_message && (
              <p className="text-rose-500 text-[10px] font-semibold max-w-md mx-auto">{polledBatch.error_message}</p>
            )}
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/60 rounded-2xl p-4 text-center">
              <div className="text-[var(--text-main-theme)] opacity-60 text-[10px] font-bold uppercase tracking-wider mb-1">
                {t('import.totalProcessed', 'Processed')}
              </div>
              <div className="text-[var(--text-main-theme)] font-bold text-lg tabular-numbers">
                {polledBatch.processed_rows ?? 0} / {polledBatch.total_rows ?? 0}
              </div>
            </div>
            <div className="border border-emerald-500/20 bg-emerald-500/5 rounded-2xl p-4 text-center">
              <div className="text-emerald-600 dark:text-emerald-400 opacity-80 text-[10px] font-bold uppercase tracking-wider mb-1">
                {t('import.imported', 'Imported')}
              </div>
              <div className="text-emerald-600 dark:text-emerald-400 font-bold text-lg tabular-numbers">
                {polledBatch.imported_rows ?? 0}
              </div>
            </div>
            <div className="border border-sky-500/20 bg-sky-500/5 rounded-2xl p-4 text-center">
              <div className="text-sky-600 dark:text-sky-400 opacity-80 text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
                <Link size={10} />
                {t('import.linked', 'Linked')}
              </div>
              <div className="text-sky-600 dark:text-sky-400 font-bold text-lg tabular-numbers">
                {polledBatch.linked ?? 0}
              </div>
            </div>
            <div className="border border-amber-500/20 bg-amber-500/5 rounded-2xl p-4 text-center">
              <div className="text-amber-600 dark:text-amber-400 opacity-80 text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
                <AlertCircle size={10} />
                {t('import.unmatched', 'Unmatched')}
              </div>
              <div className="text-amber-600 dark:text-amber-400 font-bold text-lg tabular-numbers">
                {polledBatch.unmatched ?? 0}
              </div>
            </div>
            <div className="border border-rose-500/20 bg-rose-500/5 rounded-2xl p-4 text-center col-span-2 md:col-span-1">
              <div className="text-rose-600 dark:text-rose-400 opacity-80 text-[10px] font-bold uppercase tracking-wider mb-1">
                {t('import.skipped', 'Skipped')}
              </div>
              <div className="text-rose-600 dark:text-rose-400 font-bold text-lg tabular-numbers">
                {(polledBatch.errors || []).filter((e) => e.severity !== 'WARNING').length}
              </div>
            </div>
          </div>

          {polledBatch.linked > 0 || polledBatch.unmatched > 0 ? (
            <p className="text-[var(--text-main-theme)]/60 text-[10px] font-semibold italic text-center">
              {t('import.linkageAsyncHint', 'Linked/unmatched counts resolve asynchronously and may still be climbing. Reopen this batch from Import Batches to see the latest.')}
            </p>
          ) : null}

          <ErrorList errors={polledBatch.errors || []} />

          {/* Action Bar */}
          <div className="flex justify-end border-t border-[var(--border-card-theme)]/40 pt-4">
            <button
              type="button"
              onClick={resetWizard}
              className="flex items-center gap-1.5 bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white font-bold px-6 py-2.5 rounded-xl transition-all duration-200 cursor-pointer border-none shadow-sm active:scale-95"
            >
              <Upload size={12} />
              {t('import.newImportButton', 'Start New Import')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LegacyDataPage() {
  const { user } = useAuthStore();
  const isHC = user?.role === 'HC';
  const isDistrictOfficer = user?.role === 'DISTRICT_OFFICER';
  const canImport = isHC || isDistrictOfficer;
  const [activeTab, setActiveTab] = useState(canImport ? 'bulk_import' : 'batches');
  const [selectedBatch, setSelectedBatch] = useState(null);

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

  // ── Fetch Batches ─────────────────────────────────────────────────────────
  const { data: batches = [], isLoading: batchLoading, refetch: refetchBatches } = useQuery({
    queryKey: ['import', 'batches'],
    queryFn: async () => {
      const res = await api.get('/import/batches');
      const raw = res.data?.data;
      return Array.isArray(raw) ? raw : [];
    },
    enabled: canImport,
  });

  // ── Fetch Batch Detail ────────────────────────────────────────────────────
  const { data: batchDetail } = useQuery({
    queryKey: ['import', 'batch', selectedBatch?.id],
    queryFn: async () => {
      const res = await api.get(`/import/batches/${selectedBatch.id}`);
      return res.data?.data;
    },
    enabled: !!selectedBatch?.id,
  });

  const TABS = canImport
    ? [
        { id: 'batches',     label: 'Import Batches' },
        { id: 'bulk_import', label: 'Bulk Importer' },
      ]
    : [ { id: 'batches', label: 'Import Batches' } ];

  return (
    <div className={`min-h-screen ${getThemeClass()} page-bg space-y-6 p-6 font-sans text-[var(--text-main-theme)]`}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="hero-banner-gradient px-8 py-8 shadow-lg relative overflow-hidden rounded-2xl">
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full border border-white/5" />
        <div className="absolute -right-4 -top-4 h-32 w-32 rounded-full border border-white/5" />

        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="mt-3 text-2xl font-bold text-white flex items-center gap-3 font-display">
              Bulk Import Manager
            </h1>
            <p className="text-white/60 text-xs mt-1.5 max-w-lg font-semibold">
              {isHC
                ? 'Upload case registers, arrest files, or PCR logs for your station.'
                : isDistrictOfficer
                ? 'Bulk-import legacy (historical) records for a police station in your district.'
                : 'View bulk import batch history.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetchBatches()}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer hover:shadow-md shrink-0 active:scale-95"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {!canImport && (
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-2xl p-4 flex items-center gap-3 text-xs">
          <AlertTriangle size={16} className="text-amber-500 shrink-0" />
          <p className="text-[var(--text-main-theme)]/80 font-semibold">
            Bulk import (upload/validate/confirm) is available to Station Operators (HC) and
            District Officers only. You can still view batch history below.
          </p>
        </div>
      )}

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 bg-[var(--bg-page-main)]/60 backdrop-blur-md rounded-2xl p-1.5 shadow-sm border border-[var(--border-card-theme)] w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSelectedBatch(null); }}
            className={`relative px-5 py-2 text-xs font-bold rounded-xl transition-all duration-200 cursor-pointer border-none ${
              activeTab === tab.id
                ? 'bg-[var(--accent-color)] text-white shadow-md shadow-[var(--accent-glow)]'
                : 'text-[var(--text-main-theme)] opacity-80 hover:text-[var(--accent-color)] hover:bg-[var(--bg-page-main)]/80 bg-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ────────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-[var(--bg-page-main)]/60 border border-[var(--border-card-theme)] backdrop-blur-md shadow-sm overflow-hidden transition-all duration-200">

        {activeTab === 'batches' && !selectedBatch && (
          <BatchTable
            batches={batches}
            isLoading={batchLoading}
            onViewBatch={(b) => setSelectedBatch(b)}
          />
        )}

        {activeTab === 'batches' && selectedBatch && (
          <div className="p-6 space-y-5 text-xs">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedBatch(null)}
                className="inline-flex items-center gap-1.5 text-[var(--accent-color)] hover:bg-[var(--bg-page-main)]/85 border border-[var(--border-card-theme)] bg-transparent px-3 py-1.5 rounded-lg transition-all duration-150 cursor-pointer font-bold shadow-sm active:scale-95"
              >
                ← Back to Batches
              </button>
              <span className="text-[var(--border-card-theme)]">·</span>
              <span className="text-[var(--text-main-theme)] opacity-60 font-mono font-semibold">Batch: {selectedBatch.id?.slice(0, 20)}…</span>
            </div>

            {!batchDetail ? (
              <div className="flex items-center gap-2 text-[var(--text-main-theme)] opacity-80 p-8 justify-center font-semibold">
                <Loader2 size={16} className="animate-spin text-[var(--accent-color)]" /> Loading batch detail…
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {[
                    { label: 'Record Type', value: batchDetail.record_type },
                    { label: 'Total Rows',  value: batchDetail.total_rows },
                    { label: 'Imported',    value: batchDetail.imported_rows },
                    { label: 'Linked',      value: batchDetail.linked },
                    { label: 'Unmatched',   value: batchDetail.unmatched },
                    { label: 'Status',      value: <StatusBadge status={batchDetail.status} /> },
                  ].map(({ label, value }) => (
                    <div
                      key={label}
                      className="border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/60 rounded-2xl p-4 hover:border-[var(--accent-color)]/40 hover:shadow-md transition-all duration-200"
                    >
                      <div className="text-[var(--text-main-theme)] opacity-60 text-[10px] font-bold uppercase tracking-wider mb-1">{label}</div>
                      <div className="text-[var(--text-main-theme)] font-bold text-sm">{value ?? '—'}</div>
                    </div>
                  ))}
                </div>

                <ErrorList errors={batchDetail.errors || []} />
              </div>
            )}
          </div>
        )}

        {activeTab === 'bulk_import' && canImport && (
          <div className="p-6">
            <BulkImporterPanel
              isHC={isHC}
              isDistrictOfficer={isDistrictOfficer}
              user={user}
              onImported={() => { refetchBatches(); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
