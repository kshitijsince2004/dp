import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileSpreadsheet,
  Plus,
  X,
  Play,
  Save,
  Download,
  Filter,
  Sparkles,
  Layers,
  BarChart3,
  CheckCircle2,
  Table as TableIcon,
  Search,
  Clock,
  ChevronRight,
  ArrowUpDown,
  ArrowRightLeft,
  RotateCcw,
  Info,
  Shield,
  Tag
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
  const [filters, setFilters] = useState({
    recordType: '',
    caseStatus: '',
    fromDate: '',
    toDate: '',
  });

  const [saveName, setSaveName] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [hoveredCell, setHoveredCell] = useState(null); // { rowIdx, colIdx }

  useEffect(() => {
    log.debug('page:mount', { route: '/reports/builder', userId: user?.id, role: user?.role });
  }, []);

  // Fetch reportable fields catalogue
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

  // Fetch live pivot table preview
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
    setFilters({ recordType: '', caseStatus: '', fromDate: '', toDate: '' });
    toast.success('Layout reset to default!');
  };

  const loadPreset = (presetSpec) => {
    if (presetSpec.rows) setRows(presetSpec.rows);
    if (presetSpec.columns) setColumns(presetSpec.columns);
    if (presetSpec.measure) setMeasure(presetSpec.measure);
    if (presetSpec.filters) setFilters(presetSpec.filters);
    toast.success('Report preset loaded!');
  };

  return (
    <div className="p-6 min-h-screen bg-slate-900 text-slate-100 font-sans">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 p-6 rounded-2xl mb-6 border border-slate-800 shadow-2xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                <BarChart3 size={24} />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight text-white font-display">
                  Build Your Own Report &amp; Pivot Matrix
                </h1>
                <p className="text-slate-400 text-xs mt-0.5 font-medium">
                  Executive dynamic reporting — arrange rows, columns, and measures with live matrix previews and Excel export.
                </p>
              </div>
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

      {/* Quick Access Tiles */}
      {quickAccessData && quickAccessData.length > 0 && (
        <div className="mb-6 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400">
            <span className="flex items-center gap-2">
              <Sparkles size={14} className="text-amber-400" />
              <span>Quick Access &amp; Saved Presets</span>
            </span>
            <span className="text-[10px] text-slate-500 font-normal">Click any tile to auto-configure layout</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {quickAccessData.map((item) => (
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

      {/* Main Builder Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Field Catalogue Picker */}
        <div className="lg:col-span-3 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2 border-b border-slate-800 pb-2.5">
              <Layers size={15} className="text-emerald-400" />
              <span>Reportable Catalogue</span>
            </h3>

            {/* Measures Section */}
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                1. Select Value (Measure)
              </label>
              <div className="space-y-1.5">
                {measures.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setMeasure(m.key)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                      measure === m.key
                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/60 shadow-inner'
                        : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:bg-slate-950'
                    }`}
                  >
                    <span>{m.label}</span>
                    {measure === m.key && <CheckCircle2 size={14} className="text-emerald-400" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Dimensions Section */}
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                2. Available Dimensions
              </label>
              <div className="space-y-1.5 max-h-[380px] overflow-y-auto scrollbar-thin pr-1">
                {dimensions.map((d) => {
                  const isRow = rows.includes(d.key);
                  const isCol = columns.includes(d.key);
                  return (
                    <div
                      key={d.key}
                      className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between gap-2 hover:border-slate-700 transition-colors"
                    >
                      <span className="text-xs font-medium text-slate-200 truncate">{d.label}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => (isRow ? removeRow(d.key) : addRow(d.key))}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                            isRow
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                          }`}
                        >
                          + Row
                        </button>
                        <button
                          onClick={() => (isCol ? removeColumn(d.key) : addColumn(d.key))}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                            isCol
                              ? 'bg-indigo-500 text-white'
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
        </div>

        {/* Right Column: Pivot Configuration & Matrix Grid */}
        <div className="lg:col-span-9 space-y-4">
          {/* Active Chips & Filter Controls Bar */}
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

            {/* Filter Controls Bar */}
            <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  Record Type
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
                  From Date
                </label>
                <DateInput
                  value={filters.fromDate}
                  onChange={(val) => setFilters({ ...filters, fromDate: val })}
                  inputClassName="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 font-semibold outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  To Date
                </label>
                <DateInput
                  value={filters.toDate}
                  onChange={(val) => setFilters({ ...filters, toDate: val })}
                  inputClassName="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 font-semibold outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Live Pivot Grid Matrix Render */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl overflow-hidden space-y-4">
            
            {/* Matrix Metrics Bar */}
            {pivotData && (
              <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 bg-slate-950 px-4 py-2.5 rounded-xl border border-slate-800/80">
                <div className="flex items-center gap-4">
                  <span><strong className="text-white">{pivotData.rowHeaders?.length || 0}</strong> Rows</span>
                  <span><strong className="text-white">{pivotData.columnHeaders?.length || 0}</strong> Columns</span>
                  <span><strong className="text-emerald-400 font-mono">{pivotData.grandTotals?.reduce((a, b) => a + b, 0).toLocaleString()}</strong> {measureMap[measure] || 'Total'}</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">Live Aggregated Matrix</span>
              </div>
            )}

            {pivotFetching && (
              <div className="p-12 text-center text-slate-400 text-xs font-semibold flex flex-col items-center justify-center gap-3">
                <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <span>Processing ad-hoc 2D matrix aggregation...</span>
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

                {/* Matrix Table */}
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
                          {pivotData.cells[ri]?.map((val, ci) => (
                            <td
                              key={ci}
                              onMouseEnter={() => setHoveredCell({ rowIdx: ri, colIdx: ci })}
                              onMouseLeave={() => setHoveredCell(null)}
                              className={`p-3 text-center border-r border-slate-800/60 text-slate-300 font-mono transition-colors ${
                                hoveredCell?.rowIdx === ri || hoveredCell?.colIdx === ci ? 'bg-emerald-500/10 text-emerald-300' : ''
                              }`}
                            >
                              {val.toLocaleString()}
                            </td>
                          ))}
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
                          {pivotData.grandTotals?.reduce((a, b) => a + b, 0).toLocaleString()}
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
                placeholder="e.g. Monthly Crime Breakdown by PS"
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
    </div>
  );
}
