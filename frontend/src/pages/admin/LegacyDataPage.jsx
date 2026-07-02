import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Archive, Upload, Eye, CheckCircle2, XCircle,
  AlertTriangle, Loader2, Clock, RefreshCw, ChevronDown, FileSpreadsheet,
  Link, AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore.js';
import api from '../../utils/api.js';

// ── Status Badge ──────────────────────────────────────────────────────────────
const STATUS_CLS = {
  PENDING:   'bg-amber-500/10 text-amber-500 border-amber-500/20',
  APPROVED:  'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  REJECTED:  'bg-rose-500/10 text-rose-500 border-rose-500/20',
  COMPLETED: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
};

function StatusBadge({ status }) {
  const cls = STATUS_CLS[status] || 'bg-[var(--bg-page-main)] border-[var(--border-card-theme)] text-[var(--text-main-theme)]/80';
  return (
    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${cls}`}>
      {status || '—'}
    </span>
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
        <p className="text-xs mt-1 text-[var(--text-main-theme)] opacity-70">Upload a file in the New Import tab to get started.</p>
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
            <th className="p-3 text-[var(--text-main-theme)] font-bold">Imported At</th>
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
              <td className="p-3 tabular-numbers text-emerald-500 font-bold">{batch.imported_count ?? '—'}</td>
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

// ── File Import Panel ─────────────────────────────────────────────────────────
function ImportPanel({ onImported }) {
  const [recordType, setRecordType] = useState('CASE');
  const [file, setFile] = useState(null);
  const [psId, setPsId] = useState('');
  const { i18n } = useTranslation();
  const currentLng = i18n.language || 'en';

  // Fetch active stations dynamically
  const { data: stations = [] } = useQuery({
    queryKey: ['hierarchy', 'stations'],
    queryFn: async () => {
      const res = await api.get('/hierarchy/nodes?type=PS');
      return res.data?.data || [];
    }
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('record_type', recordType);
      if (psId) {
        formData.append('ps_id', psId);
      }
      const res = await api.post('/legacy/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Legacy import triggered successfully');
      setFile(null);
      setPsId('');
      onImported?.();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Import failed'),
  });

  return (
    <div className="border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/60 backdrop-blur-md rounded-2xl p-6 space-y-5 text-xs shadow-sm font-sans">
      <h3 className="font-bold text-[var(--text-main-theme)] flex items-center gap-2 text-sm font-display">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--bg-page-main)]/80 border border-[var(--border-card-theme)]/85">
          <Upload size={15} className="text-[var(--accent-color)]" />
        </span>
        Bulk Import Records (Excel / CSV)
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[var(--text-main-theme)] font-semibold">
        {/* Record Type */}
        <div className="space-y-1.5">
          <label className="text-[var(--text-main-theme)] opacity-80 font-bold">Record Type</label>
          <select
            value={recordType}
            onChange={(e) => setRecordType(e.target.value)}
            className="w-full bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] rounded-xl px-3 py-2 text-[var(--text-main-theme)] outline-none focus:border-[var(--accent-color)] transition-all cursor-pointer shadow-sm font-bold"
          >
            {['CASE', 'ARREST', 'PCR_CALL', 'MISSING', 'UIDB'].map((rt) => (
              <option key={rt} value={rt} className="bg-[var(--bg-page-main)] text-[var(--text-main-theme)]">{rt}</option>
            ))}
          </select>
        </div>

        {/* Destination Police Station */}
        <div className="space-y-1.5">
          <label className="text-[var(--text-main-theme)] opacity-80 font-bold">Destination Police Station</label>
          <select
            value={psId}
            onChange={(e) => setPsId(e.target.value)}
            className="w-full bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] rounded-xl px-3 py-2 text-[var(--text-main-theme)] outline-none focus:border-[var(--accent-color)] transition-all cursor-pointer shadow-sm font-bold"
          >
            <option value="">Select Destination Station...</option>
            {stations.map(st => (
              <option key={st.id} value={st.id} className="bg-[var(--bg-page-main)] text-[var(--text-main-theme)]">
                {currentLng === 'hi' ? st.name_hi : st.name_en}
              </option>
            ))}
          </select>
        </div>

        {/* File Selection */}
        <div className="space-y-1.5">
          <label className="text-[var(--text-main-theme)] opacity-80 font-bold">File (Excel / CSV)</label>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] rounded-xl px-3 py-1.5 text-[var(--text-main-theme)] opacity-80 cursor-pointer text-[11px] shadow-sm file:mr-2 file:rounded-lg file:border-0 file:bg-[var(--bg-page-main)]/80 file:text-[var(--accent-color)] file:font-bold file:px-2 file:py-0.5"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[var(--text-main-theme)] opacity-60 font-semibold">
          File will be processed in background. Check Batches tab for status.
        </p>
        <button
          type="button"
          disabled={!file || !psId || importMutation.isPending}
          onClick={() => importMutation.mutate()}
          className="flex items-center gap-1.5 bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white font-bold px-5 py-2.5 rounded-xl transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-none shadow-sm active:scale-95"
        >
          {importMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          Start Import
        </button>
      </div>
    </div>
  );
}

// ── Bulk Importer Panel (Validate / Confirm) ───────────────────────────────────
function BulkImporterPanel({ onImported, isHC, user, refetchBatches, setActiveTab }) {
  const { t, i18n } = useTranslation();
  const currentLng = i18n.language || 'en';
  
  const [step, setStep] = useState(1); // 1 | 2 | 3
  const [recordType, setRecordType] = useState('CASE');
  const [psId, setPsId] = useState(isHC ? (user?.ps_id || user?.station_id || '') : '');
  const [isLegacy, setIsLegacy] = useState(false);
  const [file, setFile] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [importReport, setImportReport] = useState(null);
  
  // Fetch active stations dynamically
  const { data: stations = [] } = useQuery({
    queryKey: ['hierarchy', 'stations'],
    queryFn: async () => {
      const res = await api.get('/hierarchy/nodes?type=PS');
      return res.data?.data || [];
    },
    enabled: !isHC
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
      toast.error(t('import.templateDownloadFailed', 'Failed to download template'));
    }
  };

  const validateMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('record_type', recordType);
      formData.append('is_legacy', isHC ? 'false' : String(isLegacy));
      if (!isHC && psId) {
        formData.append('ps_id', psId);
      } else if (isHC) {
        formData.append('ps_id', user?.ps_id || user?.station_id || '');
      }
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

  const confirmMutation = useMutation({
    mutationFn: async () => {
      // Importing 30k+ rows can take well over the global 15s axios timeout; disable
      // the timeout for this request so the browser waits for the import to finish
      // instead of aborting and leaving the user to retry into an "already imported" error.
      const res = await api.post(`/import/confirm/${validationResult?.batch_id}`, {}, { timeout: 0 });
      return res.data?.data;
    },
    onSuccess: (data) => {
      toast.success(t('import.importSuccess', `Successfully imported ${data?.imported_rows} rows!`));
      setImportReport(data.report);
      setStep(3);
      if (!isHC) {
        onImported?.();
      }
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || t('import.confirmFailed', 'Import confirmation failed'));
    }
  });

  const resetWizard = () => {
    setStep(1);
    setFile(null);
    setValidationResult(null);
    setImportReport(null);
  };

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
                {['CASE', 'ARREST', 'PCR_CALL', 'MISSING', 'UIDB'].map((rt) => (
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

            {/* Destination Station selection (if not HC) */}
            {!isHC && (
              <div className="space-y-1.5">
                <label className="text-[var(--text-main-theme)] opacity-80 font-bold">{t('import.destinationStation', 'Destination Police Station')}</label>
                <select
                  value={psId}
                  onChange={(e) => setPsId(e.target.value)}
                  className="w-full bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] rounded-xl px-3 py-2 text-[var(--text-main-theme)] outline-none focus:border-[var(--accent-color)] transition-all cursor-pointer shadow-sm font-bold"
                >
                  <option value="">{t('import.selectStation', 'Select Destination Station...')}</option>
                  {stations.map(st => (
                    <option key={st.id} value={st.id} className="bg-[var(--bg-page-main)] text-[var(--text-main-theme)]">
                      {currentLng === 'hi' ? st.name_hi : st.name_en}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Is Legacy checkbox (if not HC) */}
            {!isHC && (
              <div className="space-y-1.5 flex items-center pl-2 pt-6">
                <label className="flex items-center gap-2 cursor-pointer font-bold select-none text-[var(--text-main-theme)] opacity-80">
                  <input
                    type="checkbox"
                    checked={isLegacy}
                    onChange={(e) => setIsLegacy(e.target.checked)}
                    className="h-4 w-4 accent-[var(--accent-color)] cursor-pointer"
                  />
                  <span>{t('import.markAsLegacy', 'Process as Legacy Data')}</span>
                </label>
              </div>
            )}

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

      {step === 2 && (
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

          {/* Error Details List */}
          {validationResult?.errors?.length > 0 ? (
            <div className="border border-rose-500/30 bg-rose-500/5 rounded-2xl p-5 space-y-3">
              <p className="text-rose-600 dark:text-rose-400 font-bold flex items-center gap-2 text-xs">
                <AlertTriangle size={14} />
                {t('import.validationErrorsFound', `Validation Errors Found (${validationResult.errors.length})`)}
              </p>
              <p className="text-[var(--text-main-theme)]/70 font-semibold text-[10px]">
                {t('import.errorSkipHint', 'These rows contain errors. When you confirm import, only valid rows will be imported and the rows listed below will be skipped.')}
              </p>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-2">
                {validationResult.errors.map((err, i) => (
                  <div key={i} className="font-mono text-[10px] bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 px-3 py-2 rounded-lg flex justify-between items-start gap-4">
                    <div>
                      <span className="font-bold mr-2">Row {err.row}:</span>
                      <span>{err.message}</span>
                    </div>
                    {err.field_key && (
                      <span className="bg-rose-500/20 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase">
                        {err.field_key}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
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
            <button
              type="button"
              onClick={resetWizard}
              className="flex items-center gap-1.5 text-[var(--text-main-theme)] hover:bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] bg-transparent px-4 py-2 rounded-xl transition-all cursor-pointer font-bold shadow-sm"
            >
              {t('common.cancel', 'Cancel & Reset')}
            </button>

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

      {step === 3 && importReport && (
        <div className="border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/60 backdrop-blur-md rounded-2xl p-6 space-y-6 text-xs shadow-sm font-sans">
          <div className="text-center py-4 space-y-2">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
              <CheckCircle2 size={30} className="animate-pulse" />
            </div>
            <h3 className="text-lg font-bold text-[var(--text-main-theme)] font-display">
              {t('import.reportTitle', 'Import Process Completed!')}
            </h3>
            <p className="text-[var(--text-main-theme)] opacity-60 text-xs">
              Batch ID: <span className="font-mono text-[10px] bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] px-2 py-0.5 rounded">{validationResult?.batch_id}</span>
            </p>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/60 rounded-2xl p-4 text-center">
              <div className="text-[var(--text-main-theme)] opacity-60 text-[10px] font-bold uppercase tracking-wider mb-1">
                {t('import.totalProcessed', 'Processed')}
              </div>
              <div className="text-[var(--text-main-theme)] font-bold text-lg tabular-numbers">
                {importReport.total_processed ?? 0}
              </div>
            </div>
            <div className="border border-emerald-500/20 bg-emerald-500/5 rounded-2xl p-4 text-center">
              <div className="text-emerald-600 dark:text-emerald-400 opacity-80 text-[10px] font-bold uppercase tracking-wider mb-1">
                {t('import.imported', 'Imported')}
              </div>
              <div className="text-emerald-600 dark:text-emerald-400 font-bold text-lg tabular-numbers">
                {importReport.imported_count ?? 0}
              </div>
            </div>
            <div className="border border-sky-500/20 bg-sky-500/5 rounded-2xl p-4 text-center">
              <div className="text-sky-600 dark:text-sky-400 opacity-80 text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
                <Link size={10} />
                {t('import.linked', 'Linked')}
              </div>
              <div className="text-sky-600 dark:text-sky-400 font-bold text-lg tabular-numbers">
                {importReport.linked_count ?? 0}
              </div>
            </div>
            <div className="border border-amber-500/20 bg-amber-500/5 rounded-2xl p-4 text-center">
              <div className="text-amber-600 dark:text-amber-400 opacity-80 text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
                <AlertCircle size={10} />
                {t('import.unmatched', 'Unmatched')}
              </div>
              <div className="text-amber-600 dark:text-amber-400 font-bold text-lg tabular-numbers">
                {importReport.unmatched_arrests_count ?? 0}
              </div>
            </div>
            <div className="border border-rose-500/20 bg-rose-500/5 rounded-2xl p-4 text-center col-span-2 md:col-span-1">
              <div className="text-rose-600 dark:text-rose-400 opacity-80 text-[10px] font-bold uppercase tracking-wider mb-1">
                {t('import.failed', 'Failed Rows')}
              </div>
              <div className="text-rose-600 dark:text-rose-400 font-bold text-lg tabular-numbers">
                {importReport.failed_count ?? 0}
              </div>
            </div>
          </div>

          {/* Details Sections */}
          <div className="space-y-4 pt-2">
            {/* Linked Records List */}
            {importReport.linked_details?.length > 0 && (
              <div className="border border-[var(--border-card-theme)] bg-[var(--bg-page-main)]/30 rounded-2xl p-4 space-y-2">
                <h4 className="font-bold text-[var(--text-main-theme)] flex items-center gap-2">
                  <Link size={14} className="text-sky-500" />
                  Auto-Linked Records ({importReport.linked_details.length})
                </h4>
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-2">
                  {importReport.linked_details.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] px-3 py-2 rounded-xl text-[10px] font-mono">
                      <div className="flex items-center gap-1.5">
                        <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 px-1.5 py-0.5 rounded font-bold">ARREST</span>
                        <span className="text-[var(--text-main-theme)] font-bold">{item.arrest_uid}</span>
                      </div>
                      <span className="text-[var(--text-main-theme)] opacity-40 font-bold">linked to</span>
                      <div className="flex items-center gap-1.5">
                        <span className="bg-sky-500/10 border border-sky-500/20 text-sky-500 px-1.5 py-0.5 rounded font-bold">CASE</span>
                        <span className="text-[var(--text-main-theme)] font-bold">{item.case_uid}</span>
                        <span className="text-[var(--text-main-theme)] opacity-60">(FIR No: {item.fir_no})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Unmatched Arrests Warning List */}
            {importReport.unmatched_arrest_details?.length > 0 && (
              <div className="border border-amber-500/20 bg-amber-500/5 rounded-2xl p-4 space-y-2">
                <h4 className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2">
                  <AlertCircle size={14} />
                  Unmatched Arrests ({importReport.unmatched_arrest_details.length})
                </h4>
                <p className="text-[var(--text-main-theme)]/70 text-[10px] font-semibold">
                  These arrest records were successfully imported, but could not be automatically linked because no corresponding CASE record could be found.
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-2">
                  {importReport.unmatched_arrest_details.map((item, idx) => (
                    <div key={idx} className="bg-[var(--bg-page-main)] border border-amber-500/20 text-amber-700 dark:text-amber-300 px-3 py-2 rounded-xl text-[10px] font-mono flex justify-between items-center">
                      <div>
                        <span className="font-bold">UID:</span> {item.arrest_uid || '—'} | <span className="font-bold">FIR Referer:</span> {item.linked_fir_dd_no || '—'}
                      </div>
                      <span className="text-[9px] bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded font-bold uppercase">
                        {item.reason}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Failed Rows List */}
            {importReport.failed_details?.length > 0 && (
              <div className="border border-rose-500/20 bg-rose-500/5 rounded-2xl p-4 space-y-2">
                <h4 className="font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                  <AlertTriangle size={14} />
                  Skipped / Failed Rows ({importReport.failed_details.length})
                </h4>
                <p className="text-[var(--text-main-theme)]/70 text-[10px] font-semibold">
                  These rows failed spreadsheet validations and were not imported.
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-2">
                  {importReport.failed_details.map((item, idx) => (
                    <div key={idx} className="bg-[var(--bg-page-main)] border border-rose-500/20 text-rose-700 dark:text-rose-300 px-3 py-2 rounded-xl text-[10px] font-mono flex justify-between items-start gap-4">
                      <div>
                        <span className="font-bold text-rose-600 dark:text-rose-400 mr-2">Row {item.row}:</span>
                        <span>{item.message}</span>
                      </div>
                      {item.field_key && (
                        <span className="bg-rose-500/10 border border-rose-500/20 text-[8px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0">
                          {item.field_key}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

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
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(isHC ? 'bulk_import' : 'batches');
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
    queryKey: ['legacy', 'batches'],
    queryFn: async () => {
      const res = await api.get('/legacy/batches');
      const raw = res.data?.data;
      return Array.isArray(raw) ? raw : [];
    },
    enabled: !isHC,
  });

  // ── Fetch Batch Detail ────────────────────────────────────────────────────
  const { data: batchDetail } = useQuery({
    queryKey: ['legacy', 'batch', selectedBatch?.id],
    queryFn: async () => {
      const res = await api.get(`/legacy/batches/${selectedBatch.id}`);
      return res.data?.data;
    },
    enabled: !!selectedBatch?.id,
  });
  const TABS = isHC
    ? [ { id: 'bulk_import', label: 'Bulk Importer' } ]
    : [
        { id: 'batches',    label: 'Import Batches' },
        { id: 'import',     label: 'New Import' },
        { id: 'bulk_import', label: 'Bulk Importer' },
      ];

  return (
    <div className={`min-h-screen ${getThemeClass()} page-bg space-y-6 p-6 font-sans text-[var(--text-main-theme)]`}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="hero-banner-gradient px-8 py-8 shadow-lg relative overflow-hidden rounded-2xl">
        {/* subtle decorative ring */}
        <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full border border-white/5" />
        <div className="absolute -right-4 -top-4 h-32 w-32 rounded-full border border-white/5" />

        <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            {/* <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/20 px-3 py-1 text-[10px] font-semibold text-white/80 uppercase tracking-wider">
              <Upload size={11} /> Bulk Import
            </span> */}
            <h1 className="mt-3 text-2xl font-bold text-white flex items-center gap-3 font-display">
              Bulk Import Manager
            </h1>
            <p className="text-white/60 text-xs mt-1.5 max-w-lg font-semibold">
              Upload case registers, arrest files, or PCR logs in bulk and monitor batch statuses.
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
                    { label: 'Imported',    value: batchDetail.imported_count },
                    { label: 'Duplicates Skipped', value: batchDetail.skipped_count ?? 0 },
                    { label: 'Validation Errors', value: batchDetail.error_count ?? 0 },
                    { label: 'Status',      value: batchDetail.status },
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

                {batchDetail.errors?.length > 0 && (
                  <div className="border border-rose-500/30 bg-rose-500/5 rounded-2xl p-5 shadow-sm">
                    <p className="text-rose-500 font-bold mb-3 flex items-center gap-2 text-sm">
                      <AlertTriangle size={14} /> Import Errors ({batchDetail.errors.length})
                    </p>
                    <ul className="text-rose-500/90 space-y-1 max-h-36 overflow-y-auto font-semibold">
                      {batchDetail.errors.map((e, i) => (
                        <li key={i} className="font-mono text-[10px] bg-rose-500/10 border border-rose-500/20 text-rose-500 px-3 py-1.5 rounded-lg">
                          Row {e.row}: {e.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}


        {activeTab === 'import' && (
          <div className="p-6">
            <ImportPanel onImported={() => { refetchBatches(); setActiveTab('batches'); }} />
          </div>
        )}

        {activeTab === 'bulk_import' && (
          <div className="p-6">
            <BulkImporterPanel
              isHC={isHC}
              user={user}
              onImported={() => { refetchBatches(); setActiveTab('batches'); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}