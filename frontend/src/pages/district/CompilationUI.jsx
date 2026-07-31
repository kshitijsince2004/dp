import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Send, Calendar, CheckCircle, Database, AlertTriangle, FileText, Shield, Phone, UserX, Fingerprint, ChevronDown, Clock, ChevronRight, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api.js';
import useAuthStore from '../../store/authStore.js';
import DateInput from '../../components/ui/DateInput.jsx';
import { formatDMY, parseDMY } from '../../utils/dateFormat.js';

const REPORTS = [
  { tableName: "excel_1manual_fir",                label: "Manual FIR",                        type: "list",    num: 1  },
  { tableName: "excel_2eburglary_cases",           label: "E-Burglary Cases",                  type: "list",    num: 2  },
  { tableName: "excel_3ehouse_theft_cases",        label: "E-House Theft Cases",               type: "list",    num: 3  },
  { tableName: "excel_4eother_theft_cases",        label: "E-Other Theft Cases",               type: "list",    num: 4  },
  { tableName: "excel_5mvt_cases",                 label: "MVT Cases",                         type: "list",    num: 5  },
  { tableName: "excel_6arrested_all_heads",        label: "Arrested - All Heads",              type: "summary", num: 6  },
  { tableName: "excel_7arrested_east_district",    label: "Arrested - District",               type: "list",    num: 7  },
  { tableName: "excel_8arrested_kalandara",        label: "Arrested - Kalandara / Preventive", type: "list",    num: 8  },
  { tableName: "excel_9arrested_efir_theft",       label: "Arrested - E-FIR Theft",            type: "list",    num: 9  },
  { tableName: "excel_10arrested_efir_mv_theft",   label: "Arrested - E-FIR MV Theft",         type: "list",    num: 10 },
  { tableName: "excel_11proclaimed_offenders",     label: "Proclaimed Offenders",              type: "list",    num: 11 },
  { tableName: "excel_13arrested_24_hrs_list",     label: "Arrested - Last 24 Hrs",            type: "list",    num: 13 },
  { tableName: "excel_14pi_disposal_manual",       label: "PI Disposal - Manual",              type: "list",    num: 14 },
  { tableName: "excel_15pi_disposal_eproperty",    label: "PI Disposal - E-Property",          type: "list",    num: 15 },
  { tableName: "excel_16pi_disposal_emvt",         label: "PI Disposal - E-MVT",               type: "list",    num: 16 },
  { tableName: "excel_18missing_persons",          label: "Missing Persons",                   type: "list",    num: 18 },
  { tableName: "excel_19uidb",                     label: "UIDB (Unidentified Bodies)",        type: "list",    num: 19 },
  { tableName: "excel_20abandoned_persons",        label: "Abandoned Persons",                 type: "list",    num: 20 },
  { tableName: "excel_21traced_persons",           label: "Traced Persons",                    type: "list",    num: 21 },
  { tableName: "excel_22women_missing",            label: "Women Missing",                     type: "summary", num: 22 },
  { tableName: "excel_23children_missing",         label: "Children Missing",                  type: "summary", num: 23 },
  { tableName: "excel_25inquest_registered",       label: "Inquest Registered",                type: "list",    num: 25 },
  { tableName: "excel_26inquest_acpsdm_disposal",  label: "Inquest ACP/SDM Disposal",          type: "list",    num: 26 },
  { tableName: "excel_28fir_goswara_summary",      label: "FIR Goswara Summary",               type: "summary", num: 28 },
];

// Diary catalogue: each diary bundles its own set of selectable reports, and is
// only offered to users whose hierarchy level is in `levels` (PS -> HC/SHO,
// DISTRICT -> DISTRICT_OFFICER, HQ -> HQ_ANALYST/HQ_ADMIN/SYSTEM_ADMIN).
// COMBINED_DAILY_DIARY and the single-day DAILY_DIARY variant share the same
// backend pipeline (/daily-diary/export — dateTo omitted = single day), so
// only COMBINED_DAILY_DIARY is offered here; other diaries are listed as
// "coming_soon" so the flow is ready to accept them without another UI
// rework once their report sets and export endpoints exist.
const DIARIES = [
  {
    key: 'COMBINED_DAILY_DIARY',
    label: 'Combine Daily Diary',
    description: 'Consolidated logs compiled over a date range (24 report sheets)',
    icon: Layers,
    status: 'active',
    levels: ['PS', 'DISTRICT', 'HQ'],
    reports: REPORTS,
  },
  {
    key: 'DISTRICT_DIARY',
    label: 'District Diary',
    description: 'District-level compiled diary',
    icon: Layers,
    status: 'coming_soon',
    levels: ['DISTRICT', 'HQ'],
    reports: [],
  },
  {
    key: 'PHQ_DIARY',
    label: 'PHQ Diary',
    description: 'Police Headquarters consolidated diary',
    icon: Shield,
    status: 'coming_soon',
    levels: ['HQ'],
    reports: [],
  },
];

const DISTRICT_ROLES = ['DISTRICT', 'DISTRICT_OFFICER'];
const HQ_ROLES = ['HQ', 'HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'];

// Anything not explicitly DISTRICT/HQ (HC, SHO, ACP, etc.) is treated as PS-level.
const getUserLevel = (role) => {
  if (HQ_ROLES.includes(role)) return 'HQ';
  if (DISTRICT_ROLES.includes(role)) return 'DISTRICT';
  return 'PS';
};

const MOCK_PS_LIST = [
  { id: "PS_NDD_01", name: "Connaught Place",    code: "CP"  },
  { id: "PS_NDD_02", name: "Tilak Marg",         code: "TM"  },
  { id: "PS_NDD_03", name: "Barakhamba Road",    code: "BR"  },
  { id: "PS_NDD_04", name: "Patel Marg",         code: "PM"  },
  { id: "PS_NDD_05", name: "Chanakyapuri",       code: "CKP" },
  { id: "PS_NDD_06", name: "Diplomatic Enclave", code: "DE"  },
  { id: "PS_NDD_07", name: "Parliament Street",  code: "PST" },
  { id: "PS_NDD_08", name: "Mandir Marg",        code: "MM"  },
  { id: "PS_NDD_09", name: "Karol Bagh",         code: "KB"  },
  { id: "PS_NDD_10", name: "Rajendra Nagar",     code: "RN"  },
  { id: "PS_NDD_11", name: "Patel Nagar",        code: "PN"  },
  { id: "PS_NDD_12", name: "Kishanganj",         code: "KSG" },
  { id: "PS_NDD_13", name: "Saraswati Vihar",   code: "SV"  },
  { id: "PS_NDD_14", name: "Delhi Cantt.",       code: "DC"  },
  { id: "PS_NDD_15", name: "Naraina",            code: "NAR" },
];

export default function CompilationUI() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const userLevel = getUserLevel(user?.role);
  const availableDiaries = DIARIES.filter(d => d.levels.includes(userLevel));

  const today = formatDMY(new Date());
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo]   = useState(today);      // defaults to same as dateFrom (single-day export)
  const [exporting, setExporting] = useState(false);

  // Step 1: which diary is being compiled
  const [selectedDiary, setSelectedDiary] = useState(null);
  const diaryReports = selectedDiary?.reports || [];

  // Dropdown UI states
  const [selectedPSIds, setSelectedPSIds] = useState(new Set());
  const [psDropOpen, setPsDropOpen] = useState(false);
  const [psSearch, setPsSearch] = useState('');

  // Step 2: which reports within the selected diary
  const [selectedFields, setSelectedFields] = useState(new Set());
  const [reportsDropOpen, setReportsDropOpen] = useState(false);
  const [reportSearch, setReportSearch] = useState('');

  const handleSelectDiary = (diary) => {
    if (diary.status !== 'active') {
      toast('This diary is coming soon.', { icon: '🚧' });
      return;
    }
    setSelectedDiary(diary);
    setSelectedFields(new Set(diary.reports.map(r => r.tableName)));
  };

  const handleChangeDiary = () => {
    setSelectedDiary(null);
    setSelectedFields(new Set());
  };

  const psDropRef = useRef(null);
  const reportsDropRef = useRef(null);

  // Fetch police stations — the backend scopes this by the caller's own
  // jurisdiction (HC/SHO get only their own PS, DISTRICT_OFFICER only their
  // own district's PS, HQ gets everything), so no client-side district guess
  // is needed or trusted here.
  const { data: psList = [], isLoading: psLoading } = useQuery({
    queryKey: ['hierarchy', 'ps', userLevel, user?.ps_id || user?.psId, user?.district_id || user?.districtId],
    queryFn: async () => {
      try {
        const res = await api.get('/hierarchy/nodes?type=PS');
        const list = (res.data?.data?.nodes || res.data?.data || []).map(n => ({
          id: n.id || n._id,
          name: n.name_en || n.name || n.ps_name,
          code: n.code || n.ps_code || "",
        }));
        return list;
      } catch (err) {
        console.warn('Failed to fetch hierarchy nodes:', err.message);
        // Never fall back to a cross-jurisdiction mock list for PS-level users.
        return userLevel === 'PS' ? [] : MOCK_PS_LIST;
      }
    },
    // placeholderData (not initialData) — shows a placeholder without marking
    // it "fresh", so the real, jurisdiction-scoped fetch still fires on mount
    // instead of being skipped for the global staleTime window.
    placeholderData: userLevel === 'PS' ? [] : MOCK_PS_LIST,
  });

  const myStation = userLevel === 'PS' ? psList[0] : null;

  // Handle outside clicks to close dropdowns
  useEffect(() => {
    function handleClickOutside(event) {
      if (psDropRef.current && !psDropRef.current.contains(event.target)) {
        setPsDropOpen(false);
      }
      if (reportsDropRef.current && !reportsDropRef.current.contains(event.target)) {
        setReportsDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch district compilations list — backend uses JWT district, no need to send it
  const { data: compilations = [], isLoading, error: fetchError } = useQuery({
    queryKey: ['compilations'],
    queryFn: async () => {
      const res = await api.get('/compilations');
      return res.data.data || [];
    },
  });

  // Create Compilation Mutation
  const createCompMutation = useMutation({
    mutationFn: async ({ period, fromDate, toDate }) => {
      const res = await api.post('/compilations', { period, fromDate, toDate });
      return res.data.data;
    },
    onSuccess: (data) => {
      const total = data?.compiled_summary?.total_records ?? 0;
      if (total > 0) {
        toast.success(`Compilation created. ${total} DISTRICT_REVIEW records bundled.`);
      } else {
        toast('No approved records to bundle yet. Export will use all records for the date.', { icon: 'ℹ️' });
      }
      queryClient.invalidateQueries({ queryKey: ['compilations'] });
    },
    onError: (err) => {
      // Non-fatal — daily diary export proceeds independently
      console.warn('[Compilation] Create failed (non-fatal):', err.response?.data?.message);
    },
  });

  // Submit Compilation Mutation
  const submitCompMutation = useMutation({
    mutationFn: async (id) => {
      const res = await api.post(`/compilations/${id}/submit`);
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Compilation dispatched to HQ successfully');
      queryClient.invalidateQueries({ queryKey: ['compilations'] });
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to submit compilation');
    },
  });

  const handleCompileTrigger = async () => {
    if (exporting || !selectedDiary) return;
    setExporting(true);

    // 1. Persist compilation in DB (non-fatal — continues even if no DISTRICT_REVIEW records)
    try {
      await createCompMutation.mutateAsync({
        period: dateFrom,
        fromDate: dateFrom,
        toDate: dateTo || dateFrom
      });
    } catch {
      // onError toast already shown; continue to export with date-based fallback
    }

    const token = localStorage.getItem('access_token');
    const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    const authHeaders = { 'Authorization': token ? `Bearer ${token}` : '' };

    // 2. Queue the export job — returns 202 JSON { data: { job_id } }
    let jobId;
    try {
      const params = new URLSearchParams();
      params.set('date', dateFrom);
      if (dateTo && dateTo !== dateFrom) params.set('dateTo', dateTo);
      if (selectedPSIds.size > 0) params.set('psId', Array.from(selectedPSIds).join(','));
      if (selectedFields.size < diaryReports.length) params.set('tableNames', Array.from(selectedFields).join(','));

      const exportRes = await fetch(`${BASE_URL}/daily-diary/export?${params}`, {
        headers: authHeaders,
        credentials: 'include',
      });
      const exportJson = await exportRes.json();
      jobId = exportJson?.data?.job_id;
      if (!jobId) throw new Error('No job ID returned from server');
    } catch (err) {
      console.error('[CompilationUI] Export queue failed:', err);
      toast.error('Failed to start Daily Diary export.');
      setExporting(false);
      return;
    }

    // 3. Poll until READY or FAILED (max ~60 s, polling every 1.5 s)
    const loadingToastId = toast.loading('Generating Daily Diary Excel…');
    try {
      await new Promise((resolve, reject) => {
        let attempts = 0;
        const iv = setInterval(async () => {
          attempts++;
          try {
            const statusRes = await fetch(`${BASE_URL}/reports/status/${jobId}`, { headers: authHeaders });
            const statusJson = await statusRes.json();
            const status = statusJson?.data?.job?.status || statusJson?.data?.status;
            if (status === 'READY') { clearInterval(iv); resolve(); }
            else if (status === 'FAILED' || attempts > 120) {
              clearInterval(iv);
              reject(new Error(status === 'FAILED' ? 'Export failed on server' : 'Export timed out'));
            }
          } catch (e) { clearInterval(iv); reject(e); }
        }, 1500);
      });
    } catch (err) {
      toast.dismiss(loadingToastId);
      console.error('[CompilationUI] Polling failed:', err);
      toast.error(err.message || 'Failed to generate Daily Diary.');
      setExporting(false);
      return;
    }

    toast.dismiss(loadingToastId);

    // 4. Download the completed file — use direct URL navigation so the browser
    //    handles the download natively with the correct .xlsx Content-Disposition.
    //    The /reports/download/:id/:filename? endpoint has no auth guard, so no credentials needed.
    try {
      const fmtDate = (dmy) => {
        if (!dmy) return '';
        const [d, m, y] = dmy.split('/');
        const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m,10)-1];
        return `${d}${mon}${y}`;
      };
      const dateLabel = dateTo && dateTo !== dateFrom
        ? `${fmtDate(dateFrom)}_to_${fmtDate(dateTo)}`
        : fmtDate(dateFrom);
      const psLabel = selectedPSIds.size === 0
        ? 'AllStations'
        : selectedPSIds.size === 1
          ? (psList.find(ps => selectedPSIds.has(ps.id))?.name || 'Station').replace(/\s+/g, '_')
          : `${selectedPSIds.size}Stations`;
      const filename = `Daily_Diary_${dateLabel}_${psLabel}.xlsx`;

      const downloadUrl = `${BASE_URL}/reports/download/${jobId}/${filename}`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => { document.body.removeChild(link); }, 1000);
      toast.success('Daily Diary Excel downloaded! Check your Downloads folder.');
    } catch (err) {
      console.error('[CompilationUI] Download failed:', err);
      toast.error('Export ready but download failed. Try again.');
    } finally {
      setExporting(false);
    }
  };

  const getSummaryVal = (comp, key) => {
    const s = comp.compiled_summary;
    if (!s) return 0;
    return s[key] ?? 0;
  };

  const formatPeriod = (period) => {
    if (!period) return 'Unknown';
    const d = parseDMY(period);
    if (!d) return period;
    return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const backTo = userLevel === 'HQ' ? '/hq' : userLevel === 'DISTRICT' ? '/district' : '/records';
  const workspaceTitle = userLevel === 'HQ'
    ? 'HQ Compilation Workspace'
    : userLevel === 'DISTRICT'
      ? 'District Compilation Workspace'
      : 'Station Compilation Workspace';
  const workspaceSubtitle = userLevel === 'HQ'
    ? 'Select a diary and compile records aggregated across districts for Headquarters.'
    : userLevel === 'DISTRICT'
      ? (
        <>
          Aggregate approved station records for{' '}
          <span className="text-[var(--accent-color)] font-semibold">
            {user?.district_id || user?.districtId || 'your district'}
          </span>{' '}
          into a unified district operations log before sending to Headquarters.
        </>
      )
      : 'Select a diary and compile your station\'s records before sending them up for review.';

  const getThemeClass = () => {
    switch (user?.role) {
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
    <div className={`space-y-6 w-full ${getThemeClass()} p-5 rounded-panel bg-[var(--bg-page-main)] border border-slate-200`}>
      {/* Back Header */}
      <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
        <button
          onClick={() => navigate(backTo)}
          className="hover:bg-slate-100 text-slate-500 hover:text-slate-800 p-2 rounded-lg transition-colors cursor-pointer border border-slate-200 active:scale-95"
        >
          <ArrowLeft size={16} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2 font-display">
            <BookOpen className="text-[var(--accent-color)]" size={20} />
            <span>{workspaceTitle}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-semibold">
            {workspaceSubtitle}
          </p>
        </div>
      </div>

      {/* Step 1: Diary selector */}
      <div className="border border-slate-200 bg-white rounded-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 font-display">
            <Layers size={14} className="text-[var(--accent-color)]" />
            <span>Step 1: Select Diary</span>
          </h3>
          {selectedDiary && (
            <button
              type="button"
              onClick={handleChangeDiary}
              className="text-[10px] font-bold text-[var(--accent-color)] hover:underline cursor-pointer"
            >
              Change Diary
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {availableDiaries.map((diary) => {
            const Icon = diary.icon;
            const isSelected = selectedDiary?.key === diary.key;
            const isDisabled = diary.status !== 'active';
            return (
              <button
                key={diary.key}
                type="button"
                onClick={() => handleSelectDiary(diary)}
                disabled={isDisabled}
                className={`text-left border rounded-xl p-4 transition-all flex flex-col gap-2 ${
                  isSelected
                    ? 'border-[var(--accent-color)] bg-red-50/40 shadow-sm'
                    : isDisabled
                      ? 'border-slate-200 bg-slate-50 opacity-60 cursor-not-allowed'
                      : 'border-slate-200 bg-white hover:border-[var(--accent-color)] cursor-pointer'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Icon size={18} className={isSelected ? 'text-[var(--accent-color)]' : 'text-slate-500'} />
                  {isDisabled ? (
                    <span className="flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded border border-slate-300 text-slate-500 bg-white">
                      <Clock size={9} />
                      <span>Coming Soon</span>
                    </span>
                  ) : isSelected ? (
                    <CheckCircle size={16} className="text-[var(--accent-color)]" />
                  ) : (
                    <ChevronRight size={14} className="text-slate-300" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800">{diary.label}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{diary.description}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {!selectedDiary ? (
        <div className="border border-dashed border-slate-300 rounded-xl p-8 text-center text-slate-500 space-y-2">
          <FileText size={28} className="mx-auto text-slate-300" />
          <p className="text-sm font-semibold text-slate-500">Select a diary above to choose its reports.</p>
        </div>
      ) : (
      <>
      {/* Step 2: Date range + Police Station + Report selection */}
      <div className="border border-slate-200 bg-white rounded-card p-4 space-y-4">
        <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 font-display">
          <Calendar size={14} className="text-[var(--accent-color)]" />
          <span>Step 2 · {selectedDiary.label}: Select Reports &amp; Date Range</span>
        </h3>

        <p className="text-xs text-slate-500 font-medium">
          {userLevel === 'PS'
            ? <>This will export today's records for <span className="text-[var(--accent-color)] font-semibold">{myStation?.name || 'your station'}</span> only.</>
            : <>This will bundle all records currently at <span className="text-[var(--accent-color)] font-semibold">DISTRICT_REVIEW</span> status in your district into a single compilation packet.</>}
        </p>
 
        <div className="flex flex-col sm:flex-row gap-3 items-end relative">
          <div className="flex flex-col gap-1 shrink-0 w-full sm:w-auto">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <Calendar size={10} className="text-slate-400" />
              <span>From Date</span>
            </span>
            <DateInput
              value={dateFrom}
              onChange={(val) => {
                setDateFrom(val);
                const from = parseDMY(val);
                const to = parseDMY(dateTo);
                if (from && to && from > to) setDateTo(val);
              }}
              inputClassName="bg-white border border-slate-200 rounded-lg text-xs text-slate-800 px-3 py-2.5 pr-9 outline-none focus:border-[var(--accent-color)] transition-all font-semibold"
            />
          </div>

          <div className="flex flex-col gap-1 shrink-0 w-full sm:w-auto">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <Calendar size={10} className="text-slate-400" />
              <span>To Date</span>
            </span>
            <DateInput
              value={dateTo}
              onChange={(val) => {
                const from = parseDMY(dateFrom);
                const to = parseDMY(val);
                if (from && to && to < from) return;
                setDateTo(val);
              }}
              inputClassName="bg-white border border-slate-200 rounded-lg text-xs text-slate-800 px-3 py-2.5 pr-9 outline-none focus:border-[var(--accent-color)] transition-all font-semibold"
            />
          </div>

          {/* POLICE STATION — PS-level users are locked to their own station (no cross-station browsing) */}
          {userLevel === 'PS' ? (
            <div className="relative flex-1 min-w-[200px] w-full flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                <Shield size={10} className="text-slate-400" />
                <span>Police Station</span>
              </span>
              <div className="w-full flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 px-3 py-2.5 font-semibold">
                <Shield size={14} className="text-[var(--accent-color)] shrink-0" />
                <span className="truncate">
                  {psLoading ? 'Loading station...' : (myStation?.name || 'Your Station')}
                </span>
              </div>
            </div>
          ) : (
          <div ref={psDropRef} className="relative flex-1 min-w-[200px] w-full flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <Shield size={10} className="text-slate-400" />
              <span>Police Station</span>
            </span>
            <button
              type="button"
              onClick={() => setPsDropOpen(!psDropOpen)}
              className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-lg text-xs text-slate-800 px-3 py-2.5 outline-none focus:border-[var(--accent-color)] transition-all cursor-pointer font-semibold"
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <Shield size={14} className="text-[var(--accent-color)] shrink-0" />
                <span className="truncate text-left">
                  {psLoading 
                    ? 'Loading stations...' 
                    : selectedPSIds.size === 0 
                      ? 'All Stations (District)' 
                      : selectedPSIds.size === psList.length
                        ? `All Stations (${psList.length}/${psList.length})`
                        : `${selectedPSIds.size} Stations Selected`}
                </span>
              </div>
              <ChevronDown size={14} className="text-slate-500 shrink-0" />
            </button>
            
            {psDropOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-72 animate-fade-in">
                <div className="p-2 border-b border-slate-100 bg-slate-50 flex flex-col gap-2">
                  <input
                    type="text"
                    placeholder="Search station..."
                    value={psSearch}
                    onChange={(e) => setPsSearch(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[11px] text-slate-800 outline-none focus:border-[var(--accent-color)] font-semibold"
                  />
                  <div className="flex items-center justify-between text-[10px] px-1 text-slate-500">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedPSIds.size === psList.length) {
                          setSelectedPSIds(new Set());
                        } else {
                          setSelectedPSIds(new Set(psList.map(ps => ps.id)));
                        }
                      }}
                      className="hover:text-[var(--accent-color)] transition-colors cursor-pointer font-bold border-none bg-transparent"
                    >
                      {selectedPSIds.size === psList.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <span>{selectedPSIds.size} of {psList.length} selected</span>
                  </div>
                </div>
                <div className="overflow-y-auto flex-1 max-h-52 scrollbar-thin">
                  {psList
                    .filter(ps => 
                      ps.name.toLowerCase().includes(psSearch.toLowerCase()) || 
                      ps.code.toLowerCase().includes(psSearch.toLowerCase())
                    )
                    .map(ps => {
                      const isSelected = selectedPSIds.has(ps.id);
                      return (
                        <label
                          key={ps.id}
                          className="w-full text-left px-3 py-2 text-[11px] hover:bg-slate-50 transition-colors flex items-center gap-2 text-slate-700 cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedPSIds(prev => {
                                const next = new Set(prev);
                                if (next.has(ps.id)) {
                                  next.delete(ps.id);
                                } else {
                                  next.add(ps.id);
                                }
                                return next;
                              });
                            }}
                            className="rounded border-slate-200 bg-white text-[var(--accent-color)] focus:ring-0 focus:ring-offset-0 focus:outline-none w-3.5 h-3.5 cursor-pointer accent-[var(--accent-color)]"
                          />
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <span className="truncate">{ps.name}</span>
                          </div>
                        </label>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
          )}

          {/* REPORTS DROPDOWN */}
          <div ref={reportsDropRef} className="relative flex-1 min-w-[200px] w-full flex flex-col gap-1">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
              <FileText size={10} className="text-slate-400" />
              <span>Select Reports</span>
            </span>
            <button
              type="button"
              onClick={() => setReportsDropOpen(!reportsDropOpen)}
              className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-lg text-xs text-slate-800 px-3 py-2.5 outline-none focus:border-[var(--accent-color)] transition-all cursor-pointer font-semibold"
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <FileText size={14} className="text-[var(--accent-color)] shrink-0" />
                <span className="truncate text-left">
                  {selectedFields.size === diaryReports.length
                    ? `All Reports (${diaryReports.length}/${diaryReports.length})`
                    : `${selectedFields.size} Reports Selected`}
                </span>
              </div>
              <ChevronDown size={14} className="text-zinc-500 shrink-0" />
            </button>

            {reportsDropOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden flex flex-col max-h-72">
                <div className="p-2 border-b border-slate-100 bg-slate-50 flex flex-col gap-2">
                  <input
                    type="text"
                    placeholder="Search report fields..."
                    value={reportSearch}
                    onChange={(e) => setReportSearch(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[11px] text-slate-800 outline-none focus:border-[var(--accent-color)] font-semibold"
                  />
                  <div className="flex items-center justify-between text-[10px] px-1 text-slate-500">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedFields.size === diaryReports.length) {
                          setSelectedFields(new Set());
                        } else {
                          setSelectedFields(new Set(diaryReports.map(r => r.tableName)));
                        }
                      }}
                      className="hover:text-[var(--accent-color)] transition-colors cursor-pointer font-bold"
                    >
                      {selectedFields.size === diaryReports.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <span>{selectedFields.size} of {diaryReports.length} selected</span>
                  </div>
                </div>
                <div className="overflow-y-auto flex-1 max-h-52 scrollbar-thin">
                  {diaryReports
                    .filter(r => r.label.toLowerCase().includes(reportSearch.toLowerCase()))
                    .map(report => {
                      const isSelected = selectedFields.has(report.tableName);
                      return (
                        <label
                          key={report.tableName}
                          className="w-full text-left px-3 py-2 text-[11px] hover:bg-slate-50 transition-colors flex items-center gap-2 text-slate-700 cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedFields(prev => {
                                const next = new Set(prev);
                                  if (next.has(report.tableName)) {
                                    next.delete(report.tableName);
                                  } else {
                                    next.add(report.tableName);
                                  }
                                  return next;
                                });
                              }}
                              className="rounded border-slate-200 bg-white text-[var(--accent-color)] focus:ring-0 focus:ring-offset-0 focus:outline-none w-3.5 h-3.5 cursor-pointer accent-[var(--accent-color)]"
                            />
                            <span className="text-[10px] text-slate-400 font-mono w-4 text-right shrink-0">
                              {String(report.num).padStart(2, '0')}
                            </span>
                            <span className="truncate flex-1 font-semibold">{report.label}</span>
                            <span className={`text-[8px] font-bold px-1 py-0.2 rounded border shrink-0 ${
                              report.type === 'summary' 
                                ? 'bg-red-50 text-[var(--accent-color)] border-red-200' 
                                : 'bg-slate-100 text-slate-500 border-slate-200'
                            }`}>
                              {report.type === 'summary' ? 'SUM' : 'LIST'}
                            </span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
  
          <div className="w-full sm:w-auto shrink-0 flex flex-col justify-end">
            <button
              onClick={handleCompileTrigger}
              disabled={exporting || selectedFields.size === 0}
              className="bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white px-6 py-2.5 rounded-control text-sm font-bold transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shrink-0"
            >
              {exporting ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                  <span>Generating…</span>
                </>
              ) : (
                <>
                  <Database size={14} />
                  <span>Compile Logs</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      </>
      )}

        {/* Compiled Records List */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5 font-display">
            <Database size={14} className="text-[var(--accent-color)]" />
            <span>Compiled {userLevel === 'HQ' ? 'HQ' : userLevel === 'DISTRICT' ? 'District' : 'Station'} Archives</span>
          </h3>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-12 text-zinc-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#cca43b] mb-4"></div>
            <p>Fetching compilations register...</p>
          </div>
        ) : fetchError ? (
          <div className="border border-red-800/40 bg-red-950/20 p-6 rounded-xl flex items-center gap-3 text-red-400 text-sm">
            <AlertTriangle size={18} />
            <span>Failed to load compilations. Please try refreshing.</span>
          </div>
        ) : compilations.length === 0 ? (
          <div className="border border-zinc-800 p-8 text-center text-zinc-500 rounded-xl space-y-2">
            <Database size={32} className="mx-auto text-zinc-700" />
            <p className="font-semibold text-zinc-400">No compilations created yet.</p>
            <p className="text-xs">Select a date above and click <strong className="text-amber-400">Compile Station Logs</strong> to initialize your first compilation.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {compilations.map((comp) => (
              <div
                key={comp.id}
                className="border border-zinc-800 bg-zinc-950/40 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-zinc-200">Period: {formatPeriod(comp.period)}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        comp.status === 'SUBMITTED'
                          ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40'
                          : 'bg-amber-950/30 text-amber-400 border-amber-800/40'
                      }`}
                    >
                      {comp.status}
                    </span>
                    <span className="text-zinc-600 font-mono text-[10px]">#{comp.id?.slice(0, 12)}</span>
                  </div>

                  {comp.compiled_summary ? (
                    <div className="flex gap-4 text-zinc-400 text-[11px] flex-wrap pt-1">
                      <span className="flex items-center gap-1">
                        <FileText size={11} className="text-amber-500" />
                        Cases: <strong className="text-zinc-200 ml-1">{getSummaryVal(comp, 'firs')}</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <Shield size={11} className="text-emerald-500" />
                        Arrests: <strong className="text-zinc-200 ml-1">{getSummaryVal(comp, 'arrests')}</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <Phone size={11} className="text-blue-400" />
                        PCR Calls: <strong className="text-zinc-200 ml-1">{getSummaryVal(comp, 'pcrCalls')}</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <UserX size={11} className="text-purple-400" />
                        Missing: <strong className="text-zinc-200 ml-1">{getSummaryVal(comp, 'missing')}</strong>
                      </span>
                      <span className="flex items-center gap-1">
                        <Fingerprint size={11} className="text-rose-400" />
                        UIDB: <strong className="text-zinc-200 ml-1">{getSummaryVal(comp, 'uidb')}</strong>
                      </span>
                      <span className="text-zinc-500 ml-2">
                        Total: <strong className="text-zinc-300">{getSummaryVal(comp, 'total_records')}</strong> records
                      </span>
                    </div>
                  ) : (
                    <div className="text-zinc-600 text-[11px]">No summary data available</div>
                  )}

                  {comp.submitted_at && (
                    <div className="text-[10px] text-zinc-600 pt-0.5">
                      Submitted: {new Date(comp.submitted_at).toLocaleString('en-IN')}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {comp.status !== 'SUBMITTED' && (
                    <button
                      onClick={() => {
                        if (window.confirm(`Send this compilation (${getSummaryVal(comp, 'total_records')} records) to HQ? This action is locked and audited.`)) {
                          submitCompMutation.mutate(comp.id);
                        }
                      }}
                      disabled={submitCompMutation.isPending}
                      className="bg-emerald-950 hover:bg-emerald-900 text-emerald-400 border border-emerald-800 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Send size={12} />
                      <span>Dispatch to HQ</span>
                    </button>
                  )}
                  {comp.status === 'SUBMITTED' && (
                    <span className="text-zinc-500 flex items-center gap-1 text-[11px]">
                      <CheckCircle size={14} className="text-emerald-500" />
                      <span>Received by HQ</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
