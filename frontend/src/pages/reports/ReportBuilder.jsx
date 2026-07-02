import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Calendar, Download, RefreshCw, FileText, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api.js';
import useAuthStore from '../../store/authStore.js';
import DateInput from '../../components/ui/DateInput.jsx';
import { formatDMY } from '../../utils/dateFormat.js';

export default function ReportBuilder() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const getThemeClass = () => {
    const role = user?.role;
    switch (role) {
      case 'PS':
      case 'HC':      return 'theme-hc-page';
      case 'SHO':     return 'theme-sho-page';
      case 'ACP':     return 'theme-acp-page';
      case 'DISTRICT':
      case 'DISTRICT_OFFICER': return 'theme-district-page';
      case 'HQ':
      case 'HQ_ANALYST':
      case 'HQ_ADMIN': return 'theme-hq-page';
      case 'SYSTEM_ADMIN': return 'theme-admin-page';
      default:         return 'theme-hq-page';
    }
  };

  const [templateId, setTemplateId] = useState('');
  const [fromDate, setFromDate] = useState(() => formatDMY(new Date(Date.now() - 3600000 * 24 * 7)));
  const [toDate, setToDate]     = useState(() => formatDMY(new Date()));
  const [format, setFormat]     = useState('EXCEL');
  const [generating, setGenerating] = useState(false);
  const [reportResult, setReportResult] = useState(null);

  // Fetch templates from API
  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ['report-templates'],
    queryFn: async () => {
      const res = await api.get('/reports/templates');
      return res.data.data?.templates || [];
    },
    onSuccess: (list) => {
      if (list.length && !templateId) setTemplateId(list[0].id);
    }
  });
  const templates = templatesData || [];

  // Set default once loaded
  React.useEffect(() => {
    if (templates.length && !templateId) setTemplateId(templates[0].id);
  }, [templates]);

  // Fetch history from API
  const { data: historyData, refetch: refetchHistory } = useQuery({
    queryKey: ['report-history'],
    queryFn: async () => {
      const res = await api.get('/reports/history');
      return res.data.data || [];
    }
  });
  const history = historyData || [];

  const generateMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await api.post('/reports/generate', payload);
      return res.data.data;
    },
    onSuccess: (data) => {
      const jobId = data?.job_id || data?.job?.id;
      if (!jobId) { toast.error('Report job ID missing in response'); return; }

      setGenerating(true);
      toast.loading('Compiling report in background...', { id: 'report-toast' });

      let attempts = 0;
      const interval = setInterval(async () => {
        attempts += 1;
        try {
          const statusRes = await api.get(`/reports/status/${jobId}`);
          const jobStatus = statusRes.data.data?.status || statusRes.data.data?.job?.status;

          if (jobStatus === 'READY' || jobStatus === 'FAILED' || attempts >= 15) {
            clearInterval(interval);
            setGenerating(false);
            refetchHistory();

            if (jobStatus === 'READY') {
              setReportResult({ jobId, format });
              toast.success('Report ready for download!', { id: 'report-toast' });
            } else if (jobStatus === 'FAILED') {
              toast.error('Report generation failed. Check Python worker logs.', { id: 'report-toast' });
            } else {
              toast.error('Report is taking longer than expected. Check history later.', { id: 'report-toast' });
            }
          }
        } catch (e) {
          clearInterval(interval);
          setGenerating(false);
          toast.error('Failed to check report status', { id: 'report-toast' });
        }
      }, 2000);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to trigger report generation');
    }
  });

  const handleGenerate = (e) => {
    e.preventDefault();
    if (!templateId) { toast.error('Select a template first'); return; }
    setReportResult(null);
    generateMutation.mutate({
      template_id: templateId,
      filters: { dateFrom: fromDate, dateTo: toDate },
      format,
    });
  };

  const handleDownload = async (jobId, fmt) => {
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`/api/v1/reports/download/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const blob = await res.blob();
      const ext = (fmt || 'xlsx').toLowerCase() === 'excel' ? 'xlsx' : (fmt || 'xlsx').toLowerCase();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Pharos_Report_${jobId}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      toast.success('Report downloaded');
    } catch (err) {
      toast.error('Download failed: ' + err.message);
    }
  };

  const selectedTemplate = templates.find(t => t.id === templateId);
  const availableFormats = selectedTemplate?.output_formats || ['EXCEL', 'PDF'];

  return (
    <div className={`space-y-6 p-5 rounded-2xl bg-[var(--bg-page-main)]/60 border border-[var(--border-card-theme)] backdrop-blur-md shadow-sm font-sans text-[var(--text-main-theme)] ${getThemeClass()}`}>
      {/* Header */}
      <div>
        <h1 className="text-2xl font-serif font-bold text-[var(--text-main-theme)] flex items-center gap-2.5">
          <FileSpreadsheet className="text-[var(--accent-color)]" size={20} />
          <span>Excel Export Manager</span>
        </h1>
        <p className="text-[var(--text-main-theme)]/70 text-xs mt-1">
          Compile hierarchy-scoped data registers, morning general diaries, or crime head tallies into formatted spreadsheets.
        </p>
      </div>

      <div className="space-y-6">
        {/* Parameters Card */}
        <div className="bg-[var(--bg-card-theme)] border border-[var(--border-card-theme)] rounded-2xl p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--text-main-theme)] border-b border-[var(--border-card-theme)] pb-2 flex items-center gap-1.5">
            <Calendar size={14} className="text-[var(--accent-color)]" />
            <span>Export Parameters</span>
          </h3>

          <form onSubmit={handleGenerate} className="space-y-5 text-sm">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              {/* Template Selection */}
              <div className="col-span-1 md:col-span-4 space-y-1.5">
                <label className="text-[var(--text-main-theme)]/80 font-bold">Report Proforma Template:</label>
                {templatesLoading ? (
                  <div className="w-full bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] rounded-xl p-2.5 text-[var(--text-main-theme)]/50 text-xs">
                    Loading templates...
                  </div>
                ) : (
                  <select
                    value={templateId}
                    onChange={(e) => {
                      setTemplateId(e.target.value);
                      setFormat('EXCEL');
                    }}
                    className="w-full bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] rounded-xl p-2.5 text-[var(--text-main-theme)] outline-none focus:border-[var(--accent-color)] transition-all cursor-pointer font-semibold shadow-sm"
                  >
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.name_en}
                        {t.template_type === 'LINKED' ? ' (Linked)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* From Date */}
              <div className="col-span-1 md:col-span-3 space-y-1.5">
                <label className="text-[var(--text-main-theme)]/80 font-bold">From Date:</label>
                <DateInput
                  value={fromDate}
                  onChange={setFromDate}
                  inputClassName="w-full bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] rounded-xl p-2 pr-9 text-[var(--text-main-theme)] outline-none focus:border-[var(--accent-color)] transition-all font-semibold shadow-sm text-sm"
                />
              </div>

              {/* To Date */}
              <div className="col-span-1 md:col-span-3 space-y-1.5">
                <label className="text-[var(--text-main-theme)]/80 font-bold">To Date:</label>
                <DateInput
                  value={toDate}
                  onChange={setToDate}
                  inputClassName="w-full bg-[var(--bg-page-main)] border border-[var(--border-card-theme)] rounded-xl p-2 pr-9 text-[var(--text-main-theme)] outline-none focus:border-[var(--accent-color)] transition-all font-semibold shadow-sm text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-8 pt-4">
              {/* Actions button */}
              <div>
                <button
                  type="submit"
                  disabled={generating}
                  className="bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white font-bold px-5 py-2.5 rounded-xl transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-none shadow-sm flex items-center gap-1.5 active:scale-95 text-sm"
                >
                  {generating ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      <span>Compiling Registry...</span>
                    </>
                  ) : (
                    <>
                      <FileText size={14} />
                      <span>Generate Excel Report</span>
                    </>
                  )}
                </button>
              </div>

              {/* Format selection */}
              <div className="col-span-1 md:col-span-4 space-y-1.5">
                <label className="text-[var(--text-main-theme)]/80 font-bold block mb-2">Output Format:</label>
                <div className="flex gap-4 py-1 flex-wrap">
                  {availableFormats.map(f => (
                    <label key={f} className="flex items-center gap-1.5 cursor-pointer text-[var(--text-main-theme)]/80 font-semibold">
                      <input
                        type="radio"
                        checked={format === f}
                        onChange={() => setFormat(f)}
                        className="accent-[var(--accent-color)]"
                      />
                      <span>{f === 'EXCEL' ? 'Excel (.xlsx)' : f === 'PDF' ? 'PDF' : f}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={generating || !templateId}
                className="bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white font-bold px-5 py-2.5 rounded-xl transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-none shadow-sm flex items-center gap-1.5 active:scale-95"
              >
                {generating ? (
                  <><RefreshCw size={14} className="animate-spin" /><span>Compiling...</span></>
                ) : (
                  <><FileText size={14} /><span>Generate Report</span></>
                )}
              </button>

              {reportResult && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 rounded-xl px-4 py-2 text-xs flex items-center gap-3 animate-in fade-in duration-200">
                  <div className="flex gap-1.5 items-center font-semibold">
                    <CheckCircle2 size={14} />
                    <span>Report ready!</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDownload(reportResult.jobId, reportResult.format)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer border-none shadow-sm active:scale-95"
                  >
                    <Download size={12} />
                    <span>Download Now</span>
                  </button>
                </div>
              )}
            </div>
          </form>
        </div>

        {/* History Table */}
        <div className="bg-[var(--bg-card-theme)] border border-[var(--border-card-theme)] rounded-2xl p-6 shadow-sm space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-main-theme)] border-b border-[var(--border-card-theme)] pb-2">
            Export History Log
          </h3>

          <div className="overflow-x-auto border border-[var(--border-card-theme)]/70 rounded-xl bg-[var(--bg-card-theme)]">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-[var(--bg-page-main)]/50 text-[var(--text-main-theme)]/80 uppercase font-semibold border-b border-[var(--border-card-theme)]/70">
                  <th className="p-3 pl-6 font-bold text-[var(--text-main-theme)]">Export ID</th>
                  <th className="p-3 font-bold text-[var(--text-main-theme)]">Template</th>
                  <th className="p-3 font-bold text-[var(--text-main-theme)]">Generated</th>
                  <th className="p-3 font-bold text-[var(--text-main-theme)]">Format</th>
                  <th className="p-3 font-bold text-[var(--text-main-theme)]">Status</th>
                  <th className="p-3 pr-6 text-right font-bold text-[var(--text-main-theme)]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-card-theme)]/30 text-[var(--text-main-theme)]">
                {history.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-[var(--text-main-theme)]/40 text-xs">
                      No reports generated yet.
                    </td>
                  </tr>
                )}
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-[var(--bg-page-main)]/30 transition-colors duration-150">
                    <td className="p-3 pl-6 font-mono font-bold text-[var(--text-main-theme)] opacity-60 text-[10px]">
                      {item.id?.slice(0, 8)}…
                    </td>
                    <td className="p-3 font-semibold text-[var(--text-main-theme)]">
                      {item.template_id || '—'}
                    </td>
                    <td className="p-3 text-[11px] text-[var(--text-main-theme)]/70 font-mono">
                      {item.created_at ? new Date(item.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="p-3 uppercase font-bold text-[var(--accent-color)]">
                      {item.format || '—'}
                    </td>
                    <td className="p-3">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        item.status === 'READY'   ? 'bg-emerald-500/15 text-emerald-600' :
                        item.status === 'FAILED'  ? 'bg-red-500/15 text-red-500' :
                        'bg-amber-500/15 text-amber-600'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="p-3 pr-6 text-right">
                      <button
                        disabled={item.status !== 'READY'}
                        onClick={() => handleDownload(item.id, item.format)}
                        className="bg-[var(--bg-page-main)] hover:bg-[var(--bg-page-main)]/85 text-[var(--accent-color)] font-bold px-3 py-1.5 rounded-lg text-[11px] transition-colors inline-flex items-center gap-1 cursor-pointer border border-[var(--border-card-theme)]/60 shadow-sm active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        <Download size={10} />
                        <span>Download</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
