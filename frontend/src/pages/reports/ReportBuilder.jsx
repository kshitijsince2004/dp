import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileSpreadsheet, Plus, X, Play, Save, Download, Filter, Sparkles,
  Layers, BarChart3, CheckCircle2, Table as TableIcon, Search, Clock,
  ChevronRight, ArrowRightLeft, RotateCcw, Info, Shield, Tag, BookOpen,
  Eye, TrendingUp, DollarSign, Users, CheckSquare, Layers2
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api.js';
import useAuthStore from '../../store/authStore.js';
import DateInput from '../../components/ui/DateInput.jsx';
import { log } from '../../utils/logger.js';

export default function ReportBuilder() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [rows, setRows] = useState(['ps_name']);
  const [columns, setColumns] = useState(['crime_head']);
  const [measure, setMeasure] = useState('case_count');
  
  // Single Classification Focus State: 'CRIME_HEAD' vs 'ACT_SECTION'
  const [classificationMode, setClassificationMode] = useState('CRIME_HEAD');
  
  const [filters, setFilters] = useState({
    recordType: '',
    caseStatus: '',
    fromDate: '',
    toDate: '',
    crimeCategory: 'ALL',
    actCategory: 'ALL',
  });

  const [saveName, setSaveName] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [drilldownCell, setDrilldownCell] = useState(null);

  useEffect(() => {
    log.debug('page:mount', { route: '/reports/builder', userId: user?.id, role: user?.role });
  }, []);

  // Fetch reportable fields catalogue from DB
  const { data: fieldsData, isLoading: fieldsLoading } = useQuery({
    queryKey: ['warehouse-fields'],
    queryFn: async () => {
      const res = await api.get('/warehouse/fields');
      return res.data.data;
    },
  });

  // Fetch quick access & saved reports
  const { data: quickAccessData, refetch: refetchQuickAccess } = useQuery({
    queryKey: ['quick-access-reports'],
    queryFn: async () => {
      const res = await api.get('/reports/builder/quick-access');
      return res.data.data;
    },
  });

  // Fetch live pivot table preview from DB
  const {
    data: pivotData,
    isFetching: pivotFetching,
    error: pivotError,
  } = useQuery({
    queryKey: ['pivot-query', rows, columns, measure, filters],
    queryFn: async () => {
      const res = await api.post('/warehouse/run', {
        rows,
        columns,
        measure,
        filters,
      });
      return res.data.data;
    },
    enabled: !!measure && (rows.length > 0 || columns.length > 0),
  });

  // Handle Mutually-Exclusive Classification Mode Switch
  const handleClassificationModeChange = (newMode) => {
    setClassificationMode(newMode);
    if (newMode === 'CRIME_HEAD') {
      setColumns(['crime_head']);
      setFilters(prev => ({ ...prev, actCategory: 'ALL', recordType: 'CASE' }));
      toast.success('Switched to Crime Head Categorization (FIRs)');
    } else if (newMode === 'ACT_SECTION') {
      setColumns(['act_name']);
      setFilters(prev => ({ ...prev, crimeCategory: 'ALL', recordType: '' }));
      toast.success('Switched to Act & Section Legal Categorization');
    }
  };

  const handleExportPivot = async () => {
    try {
      const loadingToastId = toast.loading('Exporting pivot matrix to Excel...');
      const response = await api.post(
        '/warehouse/export',
        { rows, columns, measure, filters, name: `Pivot_${measure}_${Date.now()}` },
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Pivot_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.dismiss(loadingToastId);
      toast.success('Pivot Excel workbook downloaded!');
    } catch (err) {
      toast.error('Failed to export pivot table.');
    }
  };

  // Save report mutation
  const saveMutation = useMutation({
    mutationFn: async (name) => {
      const res = await api.post('/reports/builder/saved', {
        name,
        query_spec: { rows, columns, measure, filters },
      });
      return res.data.data;
    },
    onSuccess: () => {
      toast.success('Report preset saved successfully!');
      setShowSaveModal(false);
      setSaveName('');
      refetchQuickAccess();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to save report');
    },
  });

  // Export to Excel handler
  const handleExport = async () => {
    try {
      toast.loading('Generating formatted Excel file...', { id: 'export-toast' });
      const res = await api.post(
        '/warehouse/export',
        { rows, columns, measure, filters, name: 'AdHoc_Pivot_Report' },
        { responseType: 'blob' }
      );
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `AdHoc_Pivot_Report_${Date.now()}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Excel report downloaded!', { id: 'export-toast' });
    } catch (err) {
      toast.error('Failed to export Excel file', { id: 'export-toast' });
    }
  };

  const dimensions = fieldsData?.dimensions || [];
  const measures = fieldsData?.measures || [];

  const dimMap = Object.fromEntries(dimensions.map((d) => [d.key, d.label]));
  const measureMap = Object.fromEntries(measures.map((m) => [m.key, m.label]));

  // Heatmap intensity calculator for cells
  const maxCellValue = pivotData?.cells
    ? Math.max(...pivotData.cells.flatMap((r) => r), 1)
    : 1;

  const getHeatmapClass = (val) => {
    if (!val || val === 0) return 'text-slate-500 bg-transparent';
    const ratio = val / maxCellValue;
    if (ratio > 0.6) return 'bg-emerald-500/25 text-emerald-200 font-bold';
    if (ratio > 0.3) return 'bg-emerald-500/15 text-emerald-300 font-semibold';
    return 'bg-emerald-500/5 text-slate-200';
  };

  const addRow = (key) => {
    if (!rows.includes(key)) {
      setRows([...rows, key]);
      setColumns(columns.filter((c) => c !== key));
    }
  };

  const addColumn = (key) => {
    if (!columns.includes(key)) {
      setColumns([...columns, key]);
      setRows(rows.filter((r) => r !== key));
    }
  };

  const removeRow = (key) => setRows(rows.filter((r) => r !== key));
  const removeColumn = (key) => setColumns(columns.filter((c) => c !== key));

  const moveRow = (idx, direction) => {
    const newRows = [...rows];
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= newRows.length) return;
    const temp = newRows[idx];
    newRows[idx] = newRows[targetIdx];
    newRows[targetIdx] = temp;
    setRows(newRows);
  };

  const moveColumn = (idx, direction) => {
    const newCols = [...columns];
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= newCols.length) return;
    const temp = newCols[idx];
    newCols[idx] = newCols[targetIdx];
    newCols[targetIdx] = temp;
    setColumns(newCols);
  };

  const swapAxes = () => {
    const tempRows = [...rows];
    setRows([...columns]);
    setColumns(tempRows);
    toast.success('Swapped Rows and Columns!');
  };

  const resetAll = () => {
    setRows(['ps_name']);
    setColumns(['crime_head']);
    setMeasure('case_count');
    setClassificationMode('CRIME_HEAD');
    setFilters({ recordType: 'CASE', caseStatus: '', fromDate: '', toDate: '', crimeCategory: 'ALL', actCategory: 'ALL' });
    toast.success('Layout reset to default!');
  };

  const loadPreset = (presetSpec) => {
    if (presetSpec.rows) setRows(presetSpec.rows);
    if (presetSpec.columns) setColumns(presetSpec.columns);
    if (presetSpec.measure) setMeasure(presetSpec.measure);
    if (presetSpec.filters) setFilters(presetSpec.filters);
    toast.success('Report preset loaded!');
  };

  const grandTotalVal = pivotData?.grandTotals?.reduce((a, b) => a + b, 0) || 0;

  return (
    <div className="p-6 min-h-screen bg-slate-900 text-slate-100 font-sans space-y-6">
      
      {/* ── Executive Header Banner ────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-6 rounded-2xl border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <BarChart3 size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white font-display">
                Executive Custom Report Builder &amp; Dynamic Pivot Engine
              </h1>
              <p className="text-slate-400 text-xs mt-0.5 font-medium">
                Clean, single-focus report customizer — analyze either by Crime Head OR by Act &amp; Section laws without overlapping filter confusion.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={swapAxes}
              title="Swap Rows and Columns"
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3.5 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer"
            >
              <ArrowRightLeft size={14} className="text-indigo-400" />
              <span>Swap Axes</span>
            </button>
            <button
              onClick={resetAll}
              title="Reset Layout"
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 rounded-xl transition-all cursor-pointer"
            >
              <RotateCcw size={15} />
            </button>
            <button
              onClick={() => setShowSaveModal(true)}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all cursor-pointer"
            >
              <Save size={15} />
              <span>Save Preset</span>
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 px-4 py-2.5 rounded-xl font-bold text-xs shadow-lg transition-all cursor-pointer"
            >
              <Download size={15} className="text-emerald-400" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Quick Access & Officer Presets ─────────────────────────────────── */}
      {quickAccessData && quickAccessData.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
            <span className="flex items-center gap-2">
              <Sparkles size={14} className="text-amber-400" />
              <span>One-Click Officer Presets &amp; Saved Reports</span>
            </span>
            <span className="text-[10px] text-slate-500 font-normal">Click any preset tile to auto-configure matrix</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {Array.from(new Map(quickAccessData.map((item) => [item.name, item])).values()).map((item) => (
              <div
                key={item.id}
                onClick={() => loadPreset(item.spec)}
                className="p-3.5 bg-slate-950/70 hover:bg-slate-950 border border-slate-800 hover:border-emerald-500/60 rounded-xl cursor-pointer transition-all shadow-md group relative overflow-hidden"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="font-bold text-xs text-slate-100 group-hover:text-emerald-400 truncate pr-2">
                    {item.name}
                  </span>
                  {item.is_system_preset ? (
                    <span className="text-[9px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded font-mono border border-blue-500/30 shrink-0">
                      System
                    </span>
                  ) : (
                    <span className="text-[9px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded font-mono border border-emerald-500/30 shrink-0">
                      Saved
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-800/80">
                  <span className="truncate text-[10px] font-mono">
                    {item.spec?.rows?.[0] ? dimMap[item.spec.rows[0]] || item.spec.rows[0] : 'Total'} × {item.spec?.columns?.[0] ? dimMap[item.spec.columns[0]] || item.spec.columns[0] : 'Summary'}
                  </span>
                  <ChevronRight size={13} className="text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 3-Step Guided Customization Layout ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Step 1 & 2: Left Panel (Measure & Dimension Selector) */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Step 1: Select Metric Measure */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[10px] font-extrabold">1</span>
                <span>Select What to Count (Measure)</span>
              </span>
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {measures.map((m) => {
                const isSelected = measure === m.key;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setMeasure(m.key)}
                    className={`p-3 rounded-xl text-left transition-all cursor-pointer border flex items-center justify-between ${
                      isSelected
                        ? 'bg-emerald-950/60 border-emerald-500/70 text-white shadow-inner'
                        : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-950 text-slate-300'
                    }`}
                  >
                    <div>
                      <h4 className="text-xs font-bold">{m.label}</h4>
                      <span className="text-[10px] text-slate-500 font-mono">{m.key}</span>
                    </div>
                    {isSelected && <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Available Dimensions */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-extrabold">2</span>
                <span>Select Groupings (Dimensions)</span>
              </span>
            </h3>
            <div className="space-y-1.5 max-h-[340px] overflow-y-auto scrollbar-thin pr-1">
              {dimensions.map((d) => {
                const isRow = rows.includes(d.key);
                const isCol = columns.includes(d.key);
                return (
                  <div
                    key={d.key}
                    className="p-2.5 bg-slate-950/60 border border-slate-800/90 rounded-xl flex items-center justify-between gap-2 hover:border-slate-700 transition-colors"
                  >
                    <span className="text-xs font-medium text-slate-200 truncate">{d.label}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => (isRow ? removeRow(d.key) : addRow(d.key))}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          isRow
                            ? 'bg-emerald-500 text-slate-950 shadow-sm'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                        }`}
                      >
                        + Row
                      </button>
                      <button
                        onClick={() => (isCol ? removeColumn(d.key) : addColumn(d.key))}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          isCol
                            ? 'bg-indigo-500 text-white shadow-sm'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                        }`}
                      >
                        + Col
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Step 3: Main Matrix & Filter Controls Panel */}
        <div className="lg:col-span-8 space-y-4">
          
          {/* Active Hierarchy Chips & Mutually Exclusive Mode Selector */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            
            {/* Active Fields Hierarchy */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Rows Drop Box */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Row Hierarchy ({rows.length})
                </span>
                <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center">
                  {rows.length === 0 ? (
                    <span className="text-slate-500 text-xs italic">No row dimensions selected</span>
                  ) : (
                    rows.map((rk, idx) => (
                      <span
                        key={rk}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold"
                      >
                        <span className="text-[9px] font-bold text-emerald-400 font-mono">#{idx + 1}</span>
                        <span>{dimMap[rk] || rk}</span>
                        {rows.length > 1 && (
                          <div className="flex items-center gap-0.5 ml-1 border-l border-emerald-500/30 pl-1">
                            {idx > 0 && (
                              <button onClick={() => moveRow(idx, -1)} className="hover:text-white text-[10px]">▲</button>
                            )}
                            {idx < rows.length - 1 && (
                              <button onClick={() => moveRow(idx, 1)} className="hover:text-white text-[10px]">▼</button>
                            )}
                          </div>
                        )}
                        <X
                          size={12}
                          onClick={() => removeRow(rk)}
                          className="cursor-pointer hover:text-white ml-0.5"
                        />
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Columns Drop Box */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Column Hierarchy ({columns.length})
                </span>
                <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center">
                  {columns.length === 0 ? (
                    <span className="text-slate-500 text-xs italic">No column dimensions selected</span>
                  ) : (
                    columns.map((ck, idx) => (
                      <span
                        key={ck}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 rounded-lg text-xs font-semibold"
                      >
                        <span className="text-[9px] font-bold text-indigo-400 font-mono">#{idx + 1}</span>
                        <span>{dimMap[ck] || ck}</span>
                        {columns.length > 1 && (
                          <div className="flex items-center gap-0.5 ml-1 border-l border-indigo-500/30 pl-1">
                            {idx > 0 && (
                              <button onClick={() => moveColumn(idx, -1)} className="hover:text-white text-[10px]">▲</button>
                            )}
                            {idx < columns.length - 1 && (
                              <button onClick={() => moveColumn(idx, 1)} className="hover:text-white text-[10px]">▼</button>
                            )}
                          </div>
                        )}
                        <X
                          size={12}
                          onClick={() => removeColumn(ck)}
                          className="cursor-pointer hover:text-white ml-0.5"
                        />
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Value Drop Box */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Aggregated Value
                </span>
                <div className="min-h-[32px] flex items-center">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-bold">
                    {measureMap[measure] || measure}
                  </span>
                </div>
              </div>
            </div>

            {/* 🎯 Mutually-Exclusive Classification Focus Toggle Bar */}
            <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              
              {/* Primary Focus Toggle (Crime Head OR Act & Section) */}
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                  <Layers2 size={10} className="text-emerald-400" />
                  <span>Categorization Mode</span>
                </label>
                <select
                  value={classificationMode}
                  onChange={(e) => handleClassificationModeChange(e.target.value)}
                  className="w-full bg-slate-950 border border-emerald-500/60 rounded-xl px-3 py-2 text-xs text-emerald-300 font-bold outline-none focus:border-emerald-400 cursor-pointer shadow-sm"
                >
                  <option value="CRIME_HEAD">1. Categorize by Crime Head</option>
                  <option value="ACT_SECTION">2. Categorize by Act / Section Laws</option>
                </select>
              </div>

              {/* Dynamic Single-Focus Sub-Filter */}
              {classificationMode === 'CRIME_HEAD' ? (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <Tag size={10} className="text-amber-400" />
                    <span>Crime Head Filter</span>
                  </label>
                  <select
                    value={filters.crimeCategory}
                    onChange={(e) => setFilters({ ...filters, crimeCategory: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-amber-300 font-bold outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="ALL">All Crime Heads (Heinous → Non-Heinous)</option>
                    <option value="HEINOUS">Only Heinous Cases (Murder, Dacoity, Rape, etc.)</option>
                    <option value="NON_HEINOUS">Only Non-Heinous Cases (Theft, Hurt, Burglary)</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                    <BookOpen size={10} className="text-indigo-400" />
                    <span>Acts &amp; Sections Filter</span>
                  </label>
                  <select
                    value={filters.actCategory}
                    onChange={(e) => setFilters({ ...filters, actCategory: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-indigo-300 font-bold outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="ALL">All Acts &amp; Sections</option>
                    <option value="MAJOR">Only Major Acts (BNS / IPC / BNSS)</option>
                    <option value="SLL">Only Special &amp; Local Laws (SLL / Excise / NDPS / Arms)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Case Status
                </label>
                <select
                  value={filters.caseStatus}
                  onChange={(e) => setFilters({ ...filters, caseStatus: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 font-semibold outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">All Case Statuses</option>
                  <option value="PENDING">PENDING</option>
                  <option value="CHARGE SHEET">CHARGE SHEET</option>
                  <option value="UNTRACED">UNTRACED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Record Type Filter
                </label>
                <select
                  value={filters.recordType}
                  onChange={(e) => setFilters({ ...filters, recordType: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 font-semibold outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">All Record Types</option>
                  <option value="CASE">FIR Master (CASE)</option>
                  <option value="ARREST">Arrest Master (ARREST)</option>
                  <option value="PCR_CALL">PCR Call Log (PCR_CALL)</option>
                  <option value="MISSING">Missing Persons (MISSING)</option>
                  <option value="UIDB">UIDB Master (UIDB)</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── Executive Matrix Render with Visual Density Heatmap ───────────── */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl overflow-hidden space-y-4">
            
            {/* Executive Summary Metrics Banner */}
            {pivotData && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Total Aggregated</span>
                  <p className="text-base font-extrabold text-emerald-400 font-mono">
                    {grandTotalVal.toLocaleString()}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Active Rows</span>
                  <p className="text-base font-extrabold text-white font-mono">
                    {pivotData.rowHeaders?.length || 0}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Active Columns</span>
                  <p className="text-base font-extrabold text-white font-mono">
                    {pivotData.columnHeaders?.length || 0}
                  </p>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Categorization Mode</span>
                  <p className="text-xs font-bold text-emerald-400 mt-1 uppercase font-mono">
                    {classificationMode === 'CRIME_HEAD' ? 'Crime Head' : 'Act & Section'}
                  </p>
                </div>
                <div className="flex items-center justify-end">
                  <button
                    onClick={handleExportPivot}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-950/40 transition-all cursor-pointer"
                  >
                    <Download size={14} />
                    <span>Export Pivot Excel</span>
                  </button>
                </div>
              </div>
            )}

            {pivotFetching && (
              <div className="p-12 text-center text-slate-400 text-xs font-semibold flex flex-col items-center justify-center gap-3">
                <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <span>Processing dynamic database matrix aggregation...</span>
              </div>
            )}

            {!pivotFetching && pivotError && (
              <div className="p-6 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-semibold flex items-center gap-2">
                <Info size={16} />
                <span>Failed to compute report matrix: {pivotError.message}</span>
              </div>
            )}

            {!pivotFetching && pivotData && (
              <div>
                {/* Warnings */}
                {pivotData.warnings?.map((w, i) => (
                  <div
                    key={i}
                    className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs font-semibold flex items-center gap-2"
                  >
                    <Clock size={15} />
                    <span>{w}</span>
                  </div>
                ))}

                {/* Heatmap Matrix Table */}
                <div className="overflow-x-auto max-h-[550px] overflow-y-auto border border-slate-800 rounded-xl shadow-inner scrollbar-thin">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="sticky top-0 z-20 bg-slate-950 text-slate-200 font-bold uppercase tracking-wider border-b border-slate-800">
                      <tr>
                        <th className="p-3 bg-slate-950 border-r border-slate-800 sticky left-0 z-30 min-w-[200px]">
                          {rows.map((rk) => dimMap[rk] || rk).join(' / ') || 'Summary'}
                        </th>
                        {pivotData.columnHeaders?.map((ch, ci) => (
                          <th key={ci} className="p-3 border-r border-slate-800 text-center min-w-[110px]">
                            {ch.values.join(' / ')}
                          </th>
                        ))}
                        <th className="p-3 bg-slate-950 border-l border-slate-800 text-right min-w-[110px] text-emerald-400">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-medium">
                      {pivotData.rowHeaders?.map((rh, ri) => (
                        <tr
                          key={ri}
                          className={ri % 2 === 1 ? 'bg-slate-950/40 hover:bg-slate-800/50' : 'bg-slate-900/40 hover:bg-slate-800/50'}
                        >
                          <td className="p-3 font-semibold text-slate-200 border-r border-slate-800 sticky left-0 bg-slate-900">
                            {rh.values.join(' / ')}
                          </td>
                          {pivotData.cells[ri]?.map((val, ci) => {
                            const heatmapCls = getHeatmapClass(val);
                            return (
                              <td
                                key={ci}
                                onClick={() => val > 0 && setDrilldownCell({ row: rh.values.join(' / '), col: pivotData.columnHeaders[ci]?.values.join(' / '), count: val })}
                                onMouseEnter={() => setHoveredCell({ rowIdx: ri, colIdx: ci })}
                                onMouseLeave={() => setHoveredCell(null)}
                                className={`p-3 text-center border-r border-slate-800/60 font-mono transition-colors cursor-pointer ${heatmapCls} ${
                                  hoveredCell?.rowIdx === ri || hoveredCell?.colIdx === ci ? 'bg-emerald-500/20 text-emerald-200' : ''
                                }`}
                                title="Click to view drill-down records"
                              >
                                {val.toLocaleString()}
                              </td>
                            );
                          })}
                          <td className="p-3 text-right font-bold text-emerald-400 bg-slate-950/80 border-l border-slate-800 font-mono">
                            {pivotData.rowTotals[ri]?.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 z-20 bg-slate-950 text-slate-100 font-bold border-t-2 border-slate-800">
                      <tr>
                        <td className="p-3 bg-slate-950 border-r border-slate-800 sticky left-0 z-30">
                          Grand Total
                        </td>
                        {pivotData.grandTotals?.map((gt, ci) => (
                          <td key={ci} className="p-3 text-center border-r border-slate-800 text-emerald-400 font-mono">
                            {gt.toLocaleString()}
                          </td>
                        ))}
                        <td className="p-3 text-right text-emerald-400 bg-slate-950 border-l border-slate-800 font-mono text-sm">
                          {grandTotalVal.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Save Preset Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Save size={18} className="text-emerald-400" />
              <span>Save Report Preset</span>
            </h3>
            <p className="text-slate-400 text-xs font-medium">
              Save this custom pivot spec for instant 1-click loading anytime from your Quick Access dashboard.
            </p>
            <div>
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block mb-1.5">
                Report Preset Name
              </label>
              <input
                type="text"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. Monthly Heinous Crimes by PS"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white outline-none focus:border-emerald-500 font-semibold"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => saveName.trim() && saveMutation.mutate(saveName.trim())}
                disabled={!saveName.trim() || saveMutation.isLoading}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all cursor-pointer shadow-lg disabled:opacity-50"
              >
                {saveMutation.isLoading ? 'Saving...' : 'Save Preset'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drill-down Drawer Preview Modal */}
      {drilldownCell && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Eye size={16} className="text-emerald-400" />
                <span>Matrix Cell Drill-Down</span>
              </h3>
              <button onClick={() => setDrilldownCell(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 space-y-1 text-xs">
              <p className="text-slate-300"><strong>Row Segment:</strong> {drilldownCell.row}</p>
              <p className="text-slate-300"><strong>Column Segment:</strong> {drilldownCell.col}</p>
              <p className="text-emerald-400 font-bold font-mono">Total Matching Records: {drilldownCell.count}</p>
            </div>
            <p className="text-[11px] text-slate-400">
              This drill-down drawer shows the aggregated count of matching PostgreSQL records for this matrix cell under your assigned role scope.
            </p>
            <div className="flex justify-end">
              <button
                onClick={() => setDrilldownCell(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all cursor-pointer"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
