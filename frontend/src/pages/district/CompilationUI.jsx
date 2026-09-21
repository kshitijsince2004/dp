import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, BookOpen, Send, Calendar, CheckCircle, Database, AlertTriangle, FileText, Shield, Phone, UserX, Fingerprint, ChevronDown, Clock, ChevronRight, Layers } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api.js';
import useAuthStore from '../../store/authStore.js';
import DateInput from '../../components/ui/DateInput.jsx';
import { formatDMY, parseDMY } from '../../utils/dateFormat.js';
import { log } from '../../utils/logger.js';

const REPORTS = [
  { tableName: "excel_1manual_fir",                label: "1. Manual FIR",                        type: "list",    num: 1  },
  { tableName: "excel_2eburglary_cases",           label: "2. E-Burglary Cases",                  type: "list",    num: 2  },
  { tableName: "excel_3ehouse_theft_cases",        label: "3. E-House Theft Cases",               type: "list",    num: 3  },
  { tableName: "excel_4eother_theft_cases",        label: "4. E-Other Theft Cases",               type: "list",    num: 4  },
  { tableName: "excel_5mvt_cases",                 label: "5. MVT Cases",                         type: "list",    num: 5  },
  { tableName: "excel_8arrested_kalandara",        label: "6. Arrested - Kalandara / Preventive", type: "list",    num: 6  },
  { tableName: "excel_9arrested_efir_theft",       label: "7. Arrested - E-FIR Theft",            type: "list",    num: 7  },
  { tableName: "excel_7arrested_east_district",    label: "Arrested - District",               type: "list",    num: 8  },
  { tableName: "excel_10arrested_efir_mv_theft",   label: "8. Arrested - E-FIR MV Theft",         type: "list",    num: 9  },
  { tableName: "excel_13arrested_24_hrs_list",     label: "11. Arrested - Last 24 Hrs",            type: "list",    num: 10 },
  { tableName: "excel_14pi_disposal_manual",       label: "12. PI Disposal - Manual",              type: "list",    num: 11 },
  { tableName: "excel_15pi_disposal_eproperty",    label: "13. PI Disposal - E-Theft",             type: "list",    num: 12 },
  { tableName: "excel_16pi_disposal_emvt",         label: "14. PI Disposal - E-MVT",               type: "list",    num: 13 },
  { tableName: "excel_18missing_persons",          label: "15. Missing Persons",                   type: "list",    num: 14 },
  { tableName: "excel_19uidb",                     label: "16. UIDB (Unidentified Bodies)",        type: "list",    num: 15 },
  { tableName: "excel_20abandoned_persons",        label: "17. Abandoned Persons",                 type: "list",    num: 16 },
  { tableName: "excel_21traced_persons",           label: "18. Traced Persons",                    type: "list",    num: 17 },
  { tableName: "excel_25inquest_registered",       label: "19. Inquest Registered",                type: "list",    num: 18 },
  { tableName: "excel_26inquest_acpsdm_disposal",  label: "20. Inquest ACP/SDM Disposal",          type: "list",    num: 19 },
  { tableName: "excel_28fir_goswara_summary",      label: "21. FIR Goswara Summary",               type: "summary", num: 20 },
];

// Diary catalogue: each diary bundles its own set of selectable reports, and is
// only offered to users whose hierarchy level is in `levels` (PS -> HC/SHO,
// DISTRICT -> DISTRICT_OFFICER, HQ -> HQ_ANALYST/HQ_ADMIN/SYSTEM_ADMIN).
// COMBINED_DAILY_DIARY and the single-day DAILY_DIARY variant share the same
// backend pipeline (/daily-diary/export — dateTo omitted = single day), so
// only COMBINED_DAILY_DIARY is offered here; other diaries are listed as
// "coming_soon" so the flow is ready to accept them without another UI
// rework once their report sets and export endpoints exist.
const PHQ_REPORTS = [
  { tableName: "PHQ_UPTODATE_MATRIX",       label: "Upto Date Comparative Crime Matrix (23 Scopes x 3 Years)", type: "summary", num: 1 },
  { tableName: "PHQ_DISTRICTS_COMPARATIVE", label: "District Comparative Statement (2-Year Date-Aligned)",     type: "summary", num: 2 },
  { tableName: "PHQ_LO_NORTH",              label: "L&O Zone 1 (North) Crime Matrix",                            type: "summary", num: 3 },
  { tableName: "PHQ_LO_SOUTH",              label: "L&O Zone 2 (South) Crime Matrix",                            type: "summary", num: 4 },
  { tableName: "PHQ_MONDAY_MORNING",        label: "Monday Morning Weekly Crime & Detection Statement",          type: "summary", num: 5 },
  { tableName: "PHQ_MULTIYEAR_DETECTION",   label: "Multi-Year Detection Ratio Statement (3-Year Dual Ratios)",   type: "summary", num: 6 },
  { tableName: "PHQ_MANUALY",               label: "Period Showcase Statement (Day, Fortnight, Upto-Date)",      type: "summary", num: 7 },
  { tableName: "PHQ_FOR_WEEK",              label: "Weekly Multi-Year Comparative Statement",                    type: "summary", num: 8 },
  { tableName: "PHQ_VARIATION_MVT",         label: "Historical Variation Statement (2014-2016)",                 type: "summary", num: 9 },
];

const DISTRICT_REPORTS = [
  { tableName: "A1", label: "A1 — Rcell DD (R-Cell Crime Diary — PS x Head Matrix)", category: "A", num: 1 },
  { tableName: "A2", label: "A2 — R Cell- Distt Crime (YoY Comparative by Head)", category: "A", num: 2 },
  { tableName: "A3", label: "A3 — Morning-Daily Diary (Head-by-Head PS Sections)", category: "A", num: 3 },
  { tableName: "A4", label: "A4 — Daily Chart, Heinous, IPC (Summary Totals per PS)", category: "A", num: 4 },
  { tableName: "A5", label: "A5 — DCsP- Crime Chart (55-Row Chart with E-FIR Splits)", category: "A", num: 5 },
  { tableName: "A6", label: "A6 — G-22 Daily Crime (Single-Day Compact Grid)", category: "A", num: 6 },
  { tableName: "A7", label: "A7 — Accident Cases (Accident Cases with Brief Facts)", category: "A", num: 7 },
  { tableName: "B1", label: "B1 — E-FIR (E-FIR Only Matrix)", category: "B", num: 8 },
  { tableName: "B2", label: "B2 — N-1,N-2,N-3 (PS x Head Daily FIR Register)", category: "B", num: 9 },
  { tableName: "B3", label: "B3 — D1, N-1,2,3 Res (Resolution View)", category: "B", num: 10 },
  { tableName: "B4", label: "B4 — D-2 Heinous Brief Facts (Narrative Listing)", category: "B", num: 11 },
  { tableName: "B5", label: "B5 — D-8 Brief Facts (Full FIR Narrative Listing)", category: "B", num: 12 },
  { tableName: "B6", label: "B6 — D-9 FIR Arrests (Person-Level FIR Arrest Details)", category: "B", num: 13 },
  { tableName: "B7", label: "B7 — D-9 Kal Arrests (Kalandar/Preventive Arrests)", category: "B", num: 14 },
  { tableName: "C1", label: "C1 — Upto PCR Calls (PCR Calls Count per PS)", category: "C", num: 15 },
  { tableName: "C2", label: "C2 — D10 Action of 66 DP Act (Vehicle Seizures)", category: "C", num: 16 },
  { tableName: "C3", label: "C3 — D13 66DP (66 DP Summary)", category: "C", num: 17 },
];

const FN_REPORTS = [
  { tableName: "STAT01", label: "STAT 1 — Cases Reported (By Crime Head × 4 Period Columns)", category: "A", num: 1 },
  { tableName: "STAT02", label: "STAT 2 — Disposal During FN (Solved / Cancelled / Untraced / Arrested)", category: "A", num: 2 },
  { tableName: "STAT03", label: "STAT 3 — Cases Under Local & Special Laws (By Act)", category: "A", num: 3 },
  { tableName: "STAT05", label: "STAT 5 — Burglary Mode of Operation", category: "B", num: 4 },
  { tableName: "STAT07", label: "STAT 7 — Theft & Recovery of Property", category: "B", num: 5 },
  { tableName: "STAT08", label: "STAT 8 — Vehicle Theft & Recovery", category: "B", num: 6 },
  { tableName: "STAT09", label: "STAT 9 — Property Seized", category: "B", num: 7 },
  { tableName: "STAT11", label: "STAT 11 — Victims by Category (Women / Children / SC-ST)", category: "C", num: 8 },
  { tableName: "STAT13", label: "STAT 13 — Kidnapping & Abduction", category: "C", num: 9 },
  { tableName: "STAT14", label: "STAT 14 — Preventive Measures", category: "C", num: 10 },
  { tableName: "STAT19", label: "STAT 19 — Missing Persons (Reported / Traced / Pending)", category: "C", num: 11 },
  { tableName: "STAT24", label: "STAT 24 — Crimes Against Women", category: "C", num: 12 },
  { tableName: "STAT36", label: "STAT 36 — Running Balance of Cases", category: "D", num: 13 },
  { tableName: "STAT37", label: "STAT 37 — Pending Cases by Age Buckets", category: "D", num: 14 },
  { tableName: "STAT40", label: "STAT 40 — Court Disposal (Stub — data pending)", category: "D", num: 15 },
];

const DIARIES = [
  {
    key: 'COMBINED_DAILY_DIARY',
    label: 'Combine Daily Diary',
    description: 'Consolidated logs compiled over a date range — 20 report sheets',
    icon: Layers,
    status: 'active',
    levels: ['PS', 'DISTRICT', 'HQ'],
    reports: REPORTS,
  },
  {
    key: 'DISTRICT_DIARY',
    label: 'District Diary',
    description: 'District-level consolidated diary — 18 jurisdiction-scoped sheets',
    icon: Layers,
    status: 'active',
    levels: ['HQ', 'DISTRICT'],
    reports: DISTRICT_REPORTS,
  },
  {
    key: 'PHQ_DIARY',
    label: 'PHQ Diary',
    description: 'Police Headquarters consolidated diary — 9 city-level comparative sheets',
    icon: Shield,
    status: 'active',
    levels: ['HQ', 'DISTRICT', 'PS'],
    reports: PHQ_REPORTS,
  },
  {
    key: 'FN_DIARY',
    label: 'Fortnightly Crime Diary',
    description: 'District-level fortnightly statistical digest — 15 sheets (select the FN End Date)',
    icon: Calendar,
    status: 'active',
    levels: ['HQ', 'DISTRICT', 'PS'],
    reports: FN_REPORTS,
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
  const defaultFromDate = today;
  const [dateFrom, setDateFrom] = useState(defaultFromDate);
  const [dateTo, setDateTo]   = useState(today);
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

  // Hierarchy-aware comparative report states
  const [selectedScopeNodeId, setSelectedScopeNodeId] = useState('');
  const [scopeDetails, setScopeDetails] = useState(null);
  const [selectedSheets, setSelectedSheets] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState('HQ');

  const SHEET_DESC = {
    'Upto_Date': '3-Year Comparative Matrix',
    'DISTRICTS': '2-Year Date-Aligned Statement',
    'L&O_SOUTH': 'South Zone Crime Matrix',
    'L&O_NORTH': 'North Zone Crime Matrix',
    'Daily_Diary': 'Multi-Year Detection Ratio',
    'for_week': 'Weekly Multi-Year Statement',
    'Variation_Pct': 'Historical Variation Statement',
    'MANUALY': 'Period Showcase (Day, Fortnight, YTD)',
    'Monday_Morning': 'Monday Morning Crime & Solved'
  };

  useEffect(() => {
    log.debug('page:mount', { route: '/compilation', userId: user?.id, role: user?.role, userLevel });
    return () => log.debug('page:unmount', { route: '/compilation' });
  }, []);

  // Align selectedLevel and selectedScopeNodeId with user's profile on mount/load
  useEffect(() => {
    if (user) {
      const lvl = getUserLevel(user.role);
      setSelectedLevel(lvl);
      
      const defaultNodeId = lvl === 'HQ' 
        ? 'ALL_DELHI_TOTAL' 
        : lvl === 'DISTRICT' 
          ? (user.district_id || user.districtId) 
          : (user.ps_id || user.psId);
      if (defaultNodeId) {
        setSelectedScopeNodeId(defaultNodeId);
      }

      // Auto-select District Diary for District/DCP users, PHQ Diary for HQ users
      // FN Diary is never auto-selected — it requires explicit FN end date selection
      const targetDiaryKey = lvl === 'DISTRICT' ? 'DISTRICT_DIARY' : lvl === 'HQ' ? 'PHQ_DIARY' : 'COMBINED_DAILY_DIARY';
      const defaultDiary = DIARIES.find(d => d.key === targetDiaryKey);
      if (defaultDiary) {
        setSelectedDiary(defaultDiary);
        setSelectedFields(new Set(defaultDiary.reports.map(r => r.tableName)));
      }
    }
  }, [user]);

  const handleSelectDiary = (diary) => {
    if (diary.status !== 'active') {
      toast('This diary is coming soon.', { icon: '🚧' });
      return;
    }
    log.debug('action:diary_select', { diaryKey: diary.key });
    setSelectedDiary(diary);
    setSelectedFields(new Set(diary.reports.map(r => r.tableName)));
    // Pre-select all sheets for report-engine diaries
    if (diary.key === 'DISTRICT_DIARY' || diary.key === 'FN_DIARY') {
      setSelectedSheets(diary.reports.map(r => r.tableName));
    }
  };

  const handleChangeDiary = () => {
    log.debug('action:diary_change', { previousDiaryKey: selectedDiary?.key });
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
      log.debug('data:load_start', { what: 'hierarchy_ps', userLevel });
      try {
        const res = await api.get('/hierarchy/nodes', { params: { type: 'PS' } });
        const list = (res.data?.data?.nodes || res.data?.data || []).map(n => ({
          id: n.id || n._id,
          name: n.name_en || n.name || n.ps_name,
          code: n.code || n.ps_code || "",
        }));
        log.debug('data:load_success', { what: 'hierarchy_ps', count: list.length });
        return list;
      } catch (err) {
        console.warn('Failed to fetch hierarchy nodes:', err.message);
        log.error('data:load_error', { what: 'hierarchy_ps', err });
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

  // Fetch all hierarchy nodes for specific level selection
  const { data: allNodesList = [] } = useQuery({
    queryKey: ['hierarchy', 'all_nodes'],
    queryFn: async () => {
      const res = await api.get('/hierarchy/nodes');
      return res.data?.data || [];
    }
  });

  // Fetch detailed scope configurations on scope selection change
  useEffect(() => {
    if (!selectedDiary || selectedDiary.key !== 'PHQ_DIARY') return;

    let url = '/hierarchy/scope';
    if (selectedScopeNodeId) {
      url += `?node_id=${selectedScopeNodeId}`;
    }

    api.get(url)
      .then(res => {
        const data = res.data.data;
        setScopeDetails(data);
        if (!selectedScopeNodeId) {
          setSelectedScopeNodeId(data.self_id);
          setSelectedLevel(data.level);
        }
        setSelectedSheets(data.available_sheets);
      })
      .catch(err => {
        toast.error(err.response?.data?.message || 'Failed to fetch scope details');
      });
  }, [selectedScopeNodeId, selectedDiary]);

  const getAvailableLevels = () => {
    if (userLevel === 'HQ') return ['HQ', 'RANGE', 'DISTRICT', 'PS'];
    if (userLevel === 'DISTRICT') return ['DISTRICT', 'PS'];
    return ['PS'];
  };

  const getSpecificNodes = () => {
    const levelNodes = allNodesList.filter(n => n.node_type === selectedLevel);
    if (userLevel === 'HQ') return levelNodes;
    if (userLevel === 'DISTRICT') {
      const userDistrictId = user?.district_id || user?.districtId;
      if (selectedLevel === 'DISTRICT') {
        return levelNodes.filter(n => n.id === userDistrictId);
      } else {
        return levelNodes.filter(n => {
          let curr = n;
          while (curr && curr.parent_id) {
            if (curr.parent_id === userDistrictId) return true;
            curr = allNodesList.find(x => x.id === curr.parent_id);
          }
          return false;
        });
      }
    }
    const userPsId = user?.ps_id || user?.psId;
    return levelNodes.filter(n => n.id === userPsId);
  };

  const handleLevelChange = (level) => {
    setSelectedLevel(level);
    const nodes = allNodesList.filter(n => n.node_type === level);
    let allowed = [];
    if (userLevel === 'HQ') allowed = nodes;
    else if (userLevel === 'DISTRICT') {
      const userDistrictId = user?.district_id || user?.districtId;
      if (level === 'DISTRICT') {
        allowed = nodes.filter(n => n.id === userDistrictId);
      } else {
        allowed = nodes.filter(n => {
          let curr = n;
          while (curr && curr.parent_id) {
            if (curr.parent_id === userDistrictId) return true;
            curr = allNodesList.find(x => x.id === curr.parent_id);
          }
          return false;
        });
      }
    } else {
      const userPsId = user?.ps_id || user?.psId;
      allowed = nodes.filter(n => n.id === userPsId);
    }
    if (allowed.length > 0) {
      setSelectedScopeNodeId(allowed[0].id);
    }
  };

  const getBreadcrumbs = () => {
    if (!scopeDetails || !allNodesList.length) return '';
    const path = [];
    let curr = allNodesList.find(n => n.id === scopeDetails.self_id);
    while (curr) {
      path.unshift(curr.name);
      curr = allNodesList.find(n => n.id === curr.parent_id);
    }
    return path.join(' \u203a ');
  };

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
      log.debug('data:load_start', { what: 'compilations' });
      try {
        const res = await api.get('/compilations');
        const rows = res.data.data || [];
        log.debug('data:load_success', { what: 'compilations', count: rows.length });
        return rows;
      } catch (err) {
        log.error('data:load_error', { what: 'compilations', err });
        throw err;
      }
    },
  });

  // Create Compilation Mutation
  const createCompMutation = useMutation({
    mutationFn: async ({ period, fromDate, toDate }) => {
      log.info('action:compile_start', { period, fromDate, toDate });
      const res = await api.post('/compilations', { period, fromDate, toDate });
      return res.data.data;
    },
    onSuccess: (data) => {
      const total = data?.compiled_summary?.total_records ?? 0;
      log.info('action:compile_success', { compilationId: data?.id, totalRecords: total });
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
      log.warn('action:compile_failed_nonfatal', { err });
    },
  });

  // Submit Compilation Mutation
  const submitCompMutation = useMutation({
    mutationFn: async (id) => {
      log.info('action:compile_submit_start', { compilationId: id });
      const res = await api.post(`/compilations/${id}/submit`);
      return res.data.data;
    },
    onSuccess: (data, id) => {
      log.info('action:compile_submit_success', { compilationId: id });
      toast.success('Compilation dispatched to HQ successfully');
      queryClient.invalidateQueries({ queryKey: ['compilations'] });
    },
    onError: (err, id) => {
      log.error('action:compile_submit_failed', { compilationId: id, err });
      toast.error(err.response?.data?.message || 'Failed to submit compilation');
    },
  });

  const handleCompileTrigger = async () => {
    if (exporting || !selectedDiary) return;
    log.info('action:compile_logs_click', { diaryKey: selectedDiary.key, dateFrom, dateTo, psCount: selectedPSIds.size, reportCount: selectedFields.size });
    setExporting(true);

    const isReportEngine = selectedDiary.key === 'PHQ_DIARY' || selectedDiary.key === 'DISTRICT_DIARY' || selectedDiary.key === 'FN_DIARY';

    // 1. Persist compilation in DB
    try {
      await createCompMutation.mutateAsync({
        period: dateFrom,
        fromDate: dateFrom,
        toDate: isReportEngine ? dateFrom : (dateTo || dateFrom)
      });
    } catch {
      // non-fatal
    }

    const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

    // 2. Queue the export job
    let jobId;
    try {
      if (isReportEngine) {
        const isFnDiary = selectedDiary.key === 'FN_DIARY';
        const res = await api.post('/reports/generate', {
          template_id: selectedDiary.key,
          format: 'EXCEL',
          filters: {
            date: dateFrom,
            ...(isFnDiary ? { fn_end_date: dateFrom } : { from_date: dateFrom, to_date: dateFrom }),
            scope_node_id: selectedScopeNodeId,
            selected_sheets: selectedSheets
          }
        }, { timeout: 60000 });
        jobId = res.data?.data?.job_id || res.data?.data?.id || res.data?.data?.job?.id;
        if (!jobId) throw new Error(res.data?.message || 'No job ID returned from server');
      } else {
        const params = new URLSearchParams();
        params.set('date', dateFrom);
        if (dateTo && dateTo !== dateFrom) params.set('dateTo', dateTo);
        if (selectedPSIds.size > 0) params.set('psId', Array.from(selectedPSIds).join(','));
        if (selectedFields.size > 0) params.set('tableNames', Array.from(selectedFields).join(','));

        const res = await api.get(`/daily-diary/export?${params}`, { timeout: 60000 });
        jobId = res.data?.data?.job_id || res.data?.data?.id;
        if (!jobId) throw new Error('No job ID returned from server');
        log.info('action:export_queued', { jobId, diaryKey: selectedDiary.key, dateFrom, dateTo });
      }
    } catch (err) {
      console.error('[CompilationUI] Export queue failed:', err);
      log.error('action:export_queue_failed', { diaryKey: selectedDiary.key, err });
      toast.error(err.response?.data?.message || err.message || 'Failed to start report export.');
      setExporting(false);
      return;
    }

    // 3. Poll until READY or COMPLETED
    const loadingMessage = selectedDiary.key === 'FN_DIARY'
      ? (userLevel === 'PS' ? 'Generating Station Fortnightly Diary Excel…' : 'Generating Fortnightly Crime Diary Excel…')
      : selectedDiary.key === 'DISTRICT_DIARY'
        ? 'Generating District Diary Excel…'
        : (selectedDiary.key === 'PHQ_DIARY'
            ? (userLevel === 'PS' ? 'Generating PS Comparative Report Excel…' : 'Generating PHQ Diary Excel…')
            : 'Generating Daily Diary Excel…');
    const loadingToastId = toast.loading(loadingMessage);

    try {
      await new Promise((resolve, reject) => {
        let attempts = 0;
        const iv = setInterval(async () => {
          attempts++;
          try {
            const statusRes = await api.get(`/reports/status/${jobId}`, { timeout: 60000 });
            const status = statusRes.data?.data?.job?.status || statusRes.data?.data?.status;
            log.debug('action:export_poll_step', { jobId, attempt: attempts, status });
            if (status === 'READY' || status === 'COMPLETED') { log.info('action:export_poll_ready', { jobId, attempts }); clearInterval(iv); resolve(); }
            else if (status === 'FAILED') {
              clearInterval(iv);
              reject(new Error('Export failed on server'));
            } else if (attempts > 360) {
              clearInterval(iv);
              reject(new Error('Export timed out after 3 minutes'));
            }
          } catch (e) {
            log.warn('action:export_poll_retry', { jobId, attempt: attempts, err: e.message });
            if (attempts > 360) {
              clearInterval(iv);
              reject(e);
            }
          }
        }, 500);
      });
    } catch (err) {
      toast.dismiss(loadingToastId);
      console.error('[CompilationUI] Polling failed:', err);
      log.error('action:export_poll_failed', { jobId, err });
      toast.error(err.message || 'Failed to generate report.');
      setExporting(false);
      return;
    }

    toast.dismiss(loadingToastId);

    // 4. Download completed file via authenticated Blob fetch
    try {
      const filename = selectedDiary.key === 'FN_DIARY'
        ? `FN_Diary_${dateFrom.replace(/\//g, '-')}.xlsx`
        : selectedDiary.key === 'DISTRICT_DIARY'
          ? `District_Diary_${dateFrom.replace(/\//g, '-')}.xlsx`
          : (selectedDiary.key === 'PHQ_DIARY'
              ? (userLevel === 'PS' ? `PS_Comparative_Report_${dateFrom.replace(/\//g, '-')}.xlsx` : `PHQ_Diary_${dateFrom.replace(/\//g, '-')}.xlsx`)
              : `Daily_Diary_${dateFrom.replace(/\//g, '-')}.xlsx`);
      
      const response = await api.get(`/reports/download/${jobId}/${filename}`, { responseType: 'blob', timeout: 60000 });
      const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const blobUrl = window.URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = blobUrl;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      if (link.parentNode) link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      log.info('action:export_download_success', { jobId, filename });

      const successMessage = selectedDiary.key === 'FN_DIARY'
        ? 'Fortnightly Crime Diary Excel downloaded! Check your Downloads folder.'
        : selectedDiary.key === 'DISTRICT_DIARY'
          ? 'District Diary Excel downloaded! Check your Downloads folder.'
          : (selectedDiary.key === 'PHQ_DIARY'
              ? (userLevel === 'PS' ? 'PS Comparative Report Excel downloaded! Check your Downloads folder.' : 'PHQ Diary Excel downloaded! Check your Downloads folder.')
              : 'Daily Diary Excel downloaded! Check your Downloads folder.');
      toast.success(successMessage);
    } catch (err) {
      console.error('[CompilationUI] Download failed:', err);
      log.error('action:export_download_failed', { jobId, err });
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
                  <div className="text-sm font-bold text-slate-800">
                    {diary.key === 'PHQ_DIARY' && userLevel === 'PS'
                      ? 'PS Comparative Report'
                      : diary.key === 'FN_DIARY' && userLevel === 'PS'
                        ? 'PS Fortnightly Diary'
                        : diary.label}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    {diary.key === 'PHQ_DIARY' && userLevel === 'PS'
                      ? 'Police Station consolidated comparative diary — 9 station-level comparative sheets'
                      : diary.key === 'FN_DIARY' && userLevel === 'PS'
                        ? 'Police Station fortnightly statistical digest — 15 statistical sheets (select the FN End Date)'
                        : diary.description}
                  </div>
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
      <div className="border border-slate-200 bg-white rounded-xl p-5 shadow-sm space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 font-display">
          <Calendar size={14} className="text-[var(--accent-color)]" />
          <span>Step 2 — {selectedDiary.key === 'PHQ_DIARY' && userLevel === 'PS' ? 'PS Comparative Report' : selectedDiary.key === 'FN_DIARY' && userLevel === 'PS' ? 'PS Fortnightly Diary' : selectedDiary.label}: {selectedDiary.key === 'FN_DIARY' ? 'Select FN End Date, Scope & Sheets' : selectedDiary.key === 'PHQ_DIARY' ? 'Select Scope & Sheets' : 'Select Reports & Date Range'}</span>
        </h3>

        <p className="text-xs text-slate-500 font-medium">
          {selectedDiary.key === 'FN_DIARY'
            ? <>Select the <span className="text-[var(--accent-color)] font-semibold">last day of the fortnight</span> as the FN End Date. The 15-day window will be computed automatically.</>
            : selectedDiary.key === 'PHQ_DIARY'
              ? <>Generate comparative crime reports dynamically at any level of the Delhi Police hierarchy.</>
              : userLevel === 'PS'
                ? <>This will export today's records for <span className="text-[var(--accent-color)] font-semibold">{myStation?.name || 'your station'}</span> only.</>
                : <>This will bundle all records currently at <span className="text-[var(--accent-color)] font-semibold">DISTRICT_REVIEW</span> status in your district into a single compilation packet.</>}
        </p>

        {selectedDiary.key === 'PHQ_DIARY' || selectedDiary.key === 'DISTRICT_DIARY' || selectedDiary.key === 'FN_DIARY' ? (
          /* Hierarchy-Aware Report Selection UI */
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-slate-100 pb-4">
              {/* Date Selector */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  <Calendar size={10} className="text-slate-400" />
                  <span>{selectedDiary.key === 'FN_DIARY' ? 'FN End Date' : 'As-Of Date'}</span>
                </span>
                <DateInput
                  value={dateFrom}
                  onChange={setDateFrom}
                  inputClassName="w-full bg-white border border-slate-200 rounded-lg text-xs text-slate-805 px-3 py-2.5 outline-none focus:border-[var(--accent-color)] transition-all font-semibold"
                />
              </div>

              {/* Level Selector */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  <Layers size={10} className="text-slate-400" />
                  <span>Report Level</span>
                </span>
                <select
                  value={selectedLevel}
                  onChange={(e) => handleLevelChange(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg text-xs text-slate-805 px-3 py-2.5 outline-none focus:border-[var(--accent-color)] transition-all font-semibold"
                >
                  {getAvailableLevels().map(lvl => (
                    <option key={lvl} value={lvl}>
                      {lvl === 'HQ' ? 'Delhi Headquarters (PHQ)' : lvl}
                    </option>
                  ))}
                </select>
              </div>

              {/* Specific Node Selector */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                  <Shield size={10} className="text-slate-400" />
                  <span>Jurisdiction / District</span>
                </span>
                <select
                  value={selectedScopeNodeId}
                  onChange={(e) => setSelectedScopeNodeId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg text-xs text-slate-850 px-3 py-2.5 outline-none focus:border-[var(--accent-color)] transition-all font-semibold"
                >
                  {getSpecificNodes().map(node => (
                    <option key={node.id} value={node.id}>
                      {node.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Breadcrumbs */}
            {scopeDetails && (
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 px-3 py-2 rounded-lg flex items-center gap-1">
                <span className="text-slate-500">Hierarchy:</span>
                <span className="text-[var(--accent-color)]">{getBreadcrumbs()}</span>
              </div>
            )}

            {/* Sheets Selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                  Select Worksheets ({selectedSheets.length}/{(selectedDiary.key === 'DISTRICT_DIARY' ? DISTRICT_REPORTS : selectedDiary.key === 'FN_DIARY' ? FN_REPORTS : (scopeDetails?.available_sheets || [])).length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const allKeys = selectedDiary.key === 'DISTRICT_DIARY'
                      ? DISTRICT_REPORTS.map(r => r.tableName)
                      : selectedDiary.key === 'FN_DIARY'
                        ? FN_REPORTS.map(r => r.tableName)
                        : (scopeDetails?.available_sheets || []);
                    if (selectedSheets.length === allKeys.length) {
                      setSelectedSheets([]);
                    } else {
                      setSelectedSheets(allKeys);
                    }
                  }}
                  className="text-[10px] font-bold text-[var(--accent-color)] hover:underline cursor-pointer"
                >
                  {selectedSheets.length === (selectedDiary.key === 'DISTRICT_DIARY' ? DISTRICT_REPORTS.length : selectedDiary.key === 'FN_DIARY' ? FN_REPORTS.length : (scopeDetails?.available_sheets || []).length) ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {(selectedDiary.key === 'DISTRICT_DIARY'
                  ? DISTRICT_REPORTS.map(r => ({ key: r.tableName, label: r.label, desc: `Category ${r.category} Sheet` }))
                  : selectedDiary.key === 'FN_DIARY'
                    ? FN_REPORTS.map(r => ({ key: r.tableName, label: r.label, desc: `Category ${r.category} Sheet` }))
                    : (scopeDetails?.available_sheets || []).map(s => ({ key: s, label: s.replace(/_/g, ' '), desc: SHEET_DESC[s] || 'Comparative Sheet' }))
                ).map(item => {
                  const isChecked = selectedSheets.includes(item.key);
                  return (
                    <label
                      key={item.key}
                      className={`border rounded-lg p-3 flex items-start gap-2.5 cursor-pointer transition-all ${
                        isChecked
                          ? 'border-red-200 bg-red-50/20 shadow-sm'
                          : 'border-slate-100 bg-slate-50/30 hover:border-slate-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          setSelectedSheets(prev => {
                            if (prev.includes(item.key)) {
                              return prev.filter(x => x !== item.key);
                            } else {
                              return [...prev, item.key];
                            }
                          });
                        }}
                        className="mt-0.5 rounded border-slate-200 text-[var(--accent-color)] focus:ring-0 w-3.5 h-3.5 cursor-pointer accent-[var(--accent-color)]"
                      />
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-bold text-slate-800 truncate">{item.label}</span>
                        <span className="text-[10px] text-slate-400 font-semibold truncate">{item.desc}</span>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Action Button Row */}
            <div className="flex justify-end pt-2">
              <button
                onClick={handleCompileTrigger}
                disabled={exporting || selectedSheets.length === 0}
                className="bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shadow-md shadow-red-500/20 active:scale-95"
              >
                {exporting ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                    <span>Generating District Diary Excel…</span>
                  </>
                ) : (
                  <>
                    <Database size={14} />
                    <span>Compile & Export Report</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* Old/Standard Reports Selector UI */
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
                className="bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white px-6 py-2.5 rounded-lg text-sm font-bold transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 shrink-0 shadow-md shadow-red-500/20"
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
        )}
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
                className="border border-zinc-800 bg-zinc-950/40 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-sm sm:text-base"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-zinc-200">Period: {formatPeriod(comp.period)}</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-lg text-xs font-bold border ${
                        comp.status === 'SUBMITTED'
                          ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/40'
                          : 'bg-amber-950/30 text-amber-400 border-amber-800/40'
                      }`}
                    >
                      {comp.status}
                    </span>
                    <span className="text-zinc-500 font-mono text-xs">#{comp.id?.slice(0, 12)}</span>
                  </div>

                  {comp.compiled_summary ? (
                    <div className="flex gap-4 text-zinc-400 text-xs sm:text-sm font-semibold flex-wrap pt-1">
                      <span className="flex items-center gap-1.5">
                        <FileText size={14} className="text-amber-500" />
                        Cases: <strong className="text-zinc-200 ml-1">{getSummaryVal(comp, 'firs')}</strong>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Shield size={14} className="text-emerald-500" />
                        Arrests: <strong className="text-zinc-200 ml-1">{getSummaryVal(comp, 'arrests')}</strong>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Phone size={14} className="text-blue-400" />
                        PCR Calls: <strong className="text-zinc-200 ml-1">{getSummaryVal(comp, 'pcrCalls')}</strong>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <UserX size={14} className="text-purple-400" />
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
                        log.debug('action:compile_submit_click', { compilationId: comp.id });
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
