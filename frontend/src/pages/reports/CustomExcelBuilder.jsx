import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileSpreadsheet, Download, RefreshCw, ChevronDown, Search,
  X, Link2, AlertTriangle, CheckCircle2, Calendar, Shield,
  Sparkles, Layers, UserCheck, Package, Lock, Filter, Trash2, ArrowRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api.js';
import useAuthStore from '../../store/authStore.js';
import DateInput from '../../components/ui/DateInput.jsx';
import { formatDMY, parseDMY } from '../../utils/dateFormat.js';
import { log } from '../../utils/logger.js';

const JOIN_OPTIONS = {
  CASE: [
    { value: 'ARREST',       label: 'FIR + Arrests (joined by FIR No.)' },
    { value: 'MISSING',      label: 'FIR + Missing Persons (joined by DD No.)' },
    { value: 'CASE_ACCUSED', label: 'FIR + Accused Persons (one row per accused)' },
    { value: 'CASE_VICTIM',  label: 'FIR + Victims (one row per victim)' },
  ],
  ARREST: [
    { value: 'ARREST_ARRESTED', label: 'Arrests + Arrested Persons (full details, one row per person)' },
  ],
};

const TABLE_LABELS = {
  CASE:     'FIR Master (CASE)',
  ARREST:   'Arrest Master (ARREST)',
  PCR_CALL: 'PCR / Kalandra (PCR_CALL)',
  MISSING:  'Missing Persons (MISSING)',
  UIDB:     'Unidentified Bodies (UIDB)',
};

const JOIN_TABLE_TAGS = {
  CASE_ACCUSED: 'Accused',
  CASE_VICTIM: 'Victim',
  ARREST_ARRESTED: 'Arrested Person',
};

// Preset Configurations for One-Click Officer Workflows
const QUICK_PRESETS = [
  {
    id: 'daily_fir',
    title: 'Daily FIR Master Log',
    description: 'FIR No, Registration Date, Local Head, PS Name, Status',
    icon: FileSpreadsheet,
    table: 'CASE',
    join: null,
    fieldKeywords: ['fir_no', 'record_date', 'local_head_id', 'ps_name', 'current_status'],
  },
  {
    id: 'accused_register',
    title: 'Accused & Person Register',
    description: 'FIR No, Accused Name, Gender, Age, Social Category, Arrest Type',
    icon: UserCheck,
    table: 'CASE',
    join: 'CASE_ACCUSED',
    fieldKeywords: ['fir_no', 'name', 'gender', 'age', 'social_category', 'arrest_type'],
  },
  {
    id: 'property_stolen',
    title: 'Property Stolen & Recovered',
    description: 'FIR No, Local Head, Property Category, Value Stolen, Value Recovered',
    icon: Package,
    table: 'CASE',
    join: null,
    fieldKeywords: ['fir_no', 'local_head_id', 'prop_category', 'val_stolen', 'val_recovered'],
  },
  {
    id: 'preventive_kalandra',
    title: 'Preventive Kalandra Register',
    description: 'DD No, Date, PS, Act/Section, Bound Down Status',
    icon: Shield,
    table: 'PCR_CALL',
    join: null,
    fieldKeywords: ['dd_no', 'record_date', 'ps_name', 'act_section', 'status'],
  },
];

const today = formatDMY(new Date());
const thirtyDaysAgo = formatDMY(new Date(Date.now() - 30 * 86400000));

function MultiSelectDropdown({ label, options, selected, onToggle, onSelectAll, search, setSearch, open, setOpen, dropRef }) {
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={dropRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-100 px-3.5 py-3 outline-none focus:border-emerald-500 transition-all cursor-pointer font-bold shadow-inner"
      >
        <span className="truncate text-left">{label}</span>
        <ChevronDown size={15} className="text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-80 backdrop-blur-xl">
          <div className="p-2.5 border-b border-slate-800 bg-slate-950 flex flex-col gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search columns or groups..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-2 py-1.5 text-xs text-slate-100 outline-none focus:border-emerald-500 font-medium"
              />
            </div>
            <div className="flex items-center justify-between text-[11px] px-1 text-slate-400">
              <button
                type="button"
                onClick={onSelectAll}
                className="hover:text-emerald-400 transition-colors font-bold cursor-pointer border-none bg-transparent"
              >
                {selected.size === options.length ? 'Deselect All' : 'Select All'}
              </button>
              <span>{selected.size} of {options.length} selected</span>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 scrollbar-thin divide-y divide-slate-800/40">
            {filtered.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-6">No matching fields found</p>
            )}
            {filtered.map(opt => (
              <label
                key={opt.value}
                className="flex items-center gap-2.5 px-3.5 py-2 text-xs hover:bg-slate-800/80 transition-colors cursor-pointer select-none text-slate-200"
              >
                <input
                  type="checkbox"
                  checked={selected.has(opt.value)}
                  onChange={() => onToggle(opt.value)}
                  className="rounded border-slate-700 w-4 h-4 cursor-pointer accent-emerald-500"
                />
                <span className="flex-1 font-medium">{opt.label}</span>
                {opt.badge && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/30 shrink-0">
                    {opt.badge}
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomExcelBuilder() {
  const { user } = useAuthStore();
  const role = user?.role || 'HC';

  const [table, setTable]       = useState('CASE');
  const [join, setJoin]         = useState(null);
  const [selectedFields, setSelectedFields] = useState(new Set());
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo]     = useState(today);
  const [psId, setPsId]         = useState(null);

  const [fieldDropOpen, setFieldDropOpen] = useState(false);
  const [fieldSearch, setFieldSearch]     = useState('');
  const fieldDropRef = useRef(null);

  const [jobState, setJobState] = useState({ status: 'idle', jobId: null });

  useEffect(() => {
    const handler = e => {
      if (fieldDropRef.current && !fieldDropRef.current.contains(e.target)) setFieldDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const { data: metaRes, isLoading: metaLoading, error: metaError } = useQuery({
    queryKey: ['report-builder-metadata'],
    queryFn: () => api.get('/reports/builder/metadata').then(r => r.data.data),
    staleTime: 300000,
  });

  const { data: stationsList = [] } = useQuery({
    queryKey: ['report-builder-stations'],
    queryFn: () => api.get('/reports/builder/lookups/police-stations').then(r => r.data.data || []),
    staleTime: 600000,
    enabled: ['DISTRICT_OFFICER', 'JCP', 'SCP', 'HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'].includes(role),
  });

  const fieldOptions = useMemo(() => {
    if (!metaRes?.tables) return [];
    const tables = join ? [table, join] : [table];
    const opts = [];
    for (const t of tables) {
      const tData = metaRes.tables[t];
      if (!tData) continue;

      const tableTag = JOIN_TABLE_TAGS[t] || t;
      const groupLabelByKey = new Map((tData.groups || []).map(g => [g.key, tables.length > 1 ? `[${tableTag}] ${g.label_en}` : g.label_en]));
      const groupMembers = new Map();

      for (const f of tData.fields) {
        if (f.group && groupLabelByKey.has(f.group)) {
          if (!groupMembers.has(f.group)) groupMembers.set(f.group, []);
          groupMembers.get(f.group).push({ value: `${t}.${f.key}`, isPii: !!f.is_pii });
          continue;
        }
        opts.push({
          value: `${t}.${f.key}`,
          label: tables.length > 1 ? `[${tableTag}] ${f.label_en}` : f.label_en,
          badge: f.is_pii ? 'PII' : null,
        });
      }
      for (const [groupKey, members] of groupMembers) {
        opts.push({
          value: `${t}.__group__${groupKey}`,
          label: groupLabelByKey.get(groupKey),
          badge: members.some(m => m.isPii) ? 'PII' : null,
          isGroup: true,
          memberValues: members.map(m => m.value),
        });
      }
      for (const f of (tData.system_fields || [])) {
        opts.push({ value: `${t}.${f.key}`, label: tables.length > 1 ? `[${tableTag}] ${f.label_en}` : f.label_en, badge: null });
      }
    }
    opts.sort((a, b) => a.label.localeCompare(b.label));
    return opts;
  }, [metaRes, table, join]);

  const changeTable = (newTable) => { setTable(newTable); setJoin(null); setSelectedFields(new Set()); setFieldSearch(''); };
  const changeJoin  = (newJoin)  => { setJoin(newJoin || null); setSelectedFields(new Set()); setFieldSearch(''); };

  const toggleField     = (val) => setSelectedFields(prev => { const n = new Set(prev); n.has(val) ? n.delete(val) : n.add(val); return n; });
  const toggleAllFields  = () => setSelectedFields(selectedFields.size === fieldOptions.length ? new Set() : new Set(fieldOptions.map(o => o.value)));
  const clearSelectedFields = () => setSelectedFields(new Set());

  // Apply a Quick Preset
  const applyPreset = (preset) => {
    setTable(preset.table);
    setJoin(preset.join);

    // Wait for fieldOptions update then match keywords
    setTimeout(() => {
      const matches = new Set();
      fieldOptions.forEach(opt => {
        if (preset.fieldKeywords.some(kw => opt.value.toLowerCase().includes(kw) || opt.label.toLowerCase().includes(kw))) {
          matches.add(opt.value);
        }
      });
      if (matches.size > 0) {
        setSelectedFields(matches);
        toast.success(`Preset "${preset.title}" applied! (${matches.size} fields selected)`);
      } else {
        // Fallback select all first 5 fields
        const first5 = new Set(fieldOptions.slice(0, 6).map(o => o.value));
        setSelectedFields(first5);
        toast.success(`Preset "${preset.title}" applied!`);
      }
    }, 100);
  };

  const handleExport = async () => {
    if (selectedFields.size === 0) { toast.error('Select at least one column to export.'); return; }
    if (!dateFrom || !dateTo)      { toast.error('Please specify a date range.'); return; }

    const hasJoin = !!join;
    const expandedRefs = Array.from(selectedFields).flatMap(ref => {
      const opt = fieldOptions.find(o => o.value === ref);
      return opt?.isGroup ? opt.memberValues : [ref];
    });
    const fields = Array.from(new Set(expandedRefs)).map(ref => {
      const [t, f] = ref.split('.');
      return hasJoin ? { field: f, table: t } : f;
    });
    const conditions = [];
    if (dateFrom) conditions.push({ field: '_record_date', table, operator: 'AFTER',  value: dateFrom });
    if (dateTo)   conditions.push({ field: '_record_date', table, operator: 'BEFORE', value: dateTo });
    if (psId)     conditions.push({ field: '_ps_id',       table, operator: 'EQ',     value: psId });

    const payload = {
      table,
      ...(join && { join }),
      fields,
      filters: conditions.length > 0 ? { logic: 'AND', conditions } : undefined,
      format: 'xlsx',
    };

    setJobState({ status: 'pending', jobId: null });

    try {
      const res = await api.post('/reports/builder/export', payload);
      const jobId = res.data?.data?.job_id;
      if (!jobId) throw new Error('No job ID returned');
      setJobState({ status: 'pending', jobId });

      const loadingToastId = toast.loading('Building Excel workbook & formatting columns...');

      let attempts = 0;
      const iv = setInterval(async () => {
        attempts++;
        try {
          const sr = await api.get(`/reports/status/${jobId}`);
          const status = sr.data?.data?.job?.status || sr.data?.data?.status;
          if (status === 'READY') {
            clearInterval(iv);
            toast.dismiss(loadingToastId);
            toast.success('Excel workbook ready! Click Download below.');
            setJobState({ status: 'ready', jobId });
          } else if (status === 'FAILED' || attempts > 40) {
            clearInterval(iv);
            toast.dismiss(loadingToastId);
            toast.error('Report generation failed.');
            setJobState({ status: 'failed', jobId });
          }
        } catch (err) {
          clearInterval(iv);
          toast.dismiss(loadingToastId);
          toast.error('Connection timeout while polling job status.');
          setJobState({ status: 'failed', jobId });
        }
      }, 1500);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to initialize export.');
      setJobState({ status: 'idle', jobId: null });
    }
  };

  const fmtDate = dmy => {
    if (!dmy || !dmy.includes('/')) return dmy;
    const [d, m, y] = dmy.split('/');
    return `${d}${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][+m-1]}${y}`;
  };

  const handleDownload = async () => {
    const { jobId } = jobState;
    if (!jobId) return;
    try {
      const res = await api.get(`/reports/download/${jobId}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `PHAROS_${table}${join ? `_${join}` : ''}_${fmtDate(dateFrom)}_to_${fmtDate(dateTo)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 500);
      toast.success('Excel file downloaded!');
      setJobState({ status: 'idle', jobId: null });
    } catch (err) {
      toast.error('Download failed: ' + (err.response?.data?.message || err.message));
    }
  };

  const joinOptions = JOIN_OPTIONS[table] || [];
  const isExporting = jobState.status === 'pending';

  if (metaLoading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mx-auto" />
        <p className="text-xs text-slate-400 font-semibold">Loading field registry metadata...</p>
      </div>
    );
  }

  if (metaError) {
    return (
      <div className="bg-slate-900 border border-red-900/50 rounded-2xl p-6 flex items-center gap-3 text-xs text-red-400">
        <AlertTriangle size={18} />
        <span>Failed to connect to field registry API. Ensure backend server is online.</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans text-slate-100">
      
      {/* ⚡ Executive Quick-Start Presets */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Sparkles size={15} className="text-amber-400" />
            <span>One-Click Officer Presets</span>
          </h3>
          <span className="text-[10px] text-slate-500 font-medium">Select a preset to auto-configure tables & fields</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {QUICK_PRESETS.map((preset) => {
            const Icon = preset.icon;
            const active = table === preset.table && join === preset.join;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                  active
                    ? 'bg-emerald-950/40 border-emerald-500/60 text-white shadow-lg shadow-emerald-950/30'
                    : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700 text-slate-300 hover:bg-slate-950'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`p-1.5 rounded-lg ${active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                    <Icon size={16} />
                  </span>
                  {active && <CheckCircle2 size={14} className="text-emerald-400" />}
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-100">{preset.title}</h4>
                  <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{preset.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Table Selection & Column Picker ───────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-3">
          <Layers size={15} className="text-emerald-400" />
          <span>Record Master & Column Configurator</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Primary Table */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Primary Table</label>
            <select
              value={table}
              onChange={e => changeTable(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-white outline-none focus:border-emerald-500 cursor-pointer shadow-inner"
            >
              {Object.entries(TABLE_LABELS).map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </select>
          </div>

          {/* Join Table */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
              <span>Link / Sub-Table</span>
              <span className="text-[9px] text-slate-500 font-normal normal-case">(optional)</span>
            </label>
            <select
              value={join || ''}
              onChange={e => changeJoin(e.target.value || null)}
              disabled={joinOptions.length === 0}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-white outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-40 shadow-inner"
            >
              <option value="">No sub-table join (single entity)</option>
              {joinOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Columns Picker Dropdown */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
              <span>Columns to Export</span>
              {selectedFields.size > 0 && (
                <button
                  type="button"
                  onClick={clearSelectedFields}
                  className="text-[10px] text-rose-400 hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none p-0"
                >
                  <Trash2 size={10} /> Clear
                </button>
              )}
            </label>
            <MultiSelectDropdown
              label={
                selectedFields.size === 0
                  ? 'Select column fields...'
                  : selectedFields.size === fieldOptions.length
                    ? `All Columns (${fieldOptions.length})`
                    : `${selectedFields.size} Columns Selected`
              }
              options={fieldOptions}
              selected={selectedFields}
              onToggle={toggleField}
              onSelectAll={toggleAllFields}
              search={fieldSearch}
              setSearch={setFieldSearch}
              open={fieldDropOpen}
              setOpen={setFieldDropOpen}
              dropRef={fieldDropRef}
            />
          </div>
        </div>

        {/* Selected Field Chips List */}
        {selectedFields.size > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>Selected Export Layout ({selectedFields.size} columns)</span>
              <span className="text-[10px] text-slate-500">Click x to remove a column</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto scrollbar-thin p-1 bg-slate-950/60 rounded-xl border border-slate-800">
              {Array.from(selectedFields).map(ref => {
                const opt = fieldOptions.find(o => o.value === ref);
                return (
                  <span
                    key={ref}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-800/90 text-slate-200 border border-slate-700/80"
                  >
                    <span>{opt?.label || ref}</span>
                    {opt?.badge && (
                      <span className="text-[9px] font-bold bg-amber-500/20 text-amber-300 rounded px-1">{opt.badge}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleField(ref)}
                      className="text-slate-400 hover:text-rose-400 transition-colors cursor-pointer bg-transparent border-none p-0"
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Filters & Constraints ────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2 border-b border-slate-800 pb-3">
          <Filter size={15} className="text-emerald-400" />
          <span>Scope &amp; Date Range Filters</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">From Date</label>
            <DateInput
              value={dateFrom}
              onChange={val => {
                setDateFrom(val);
                const from = parseDMY(val);
                const to = parseDMY(dateTo);
                if (from && to && from > to) setDateTo(val);
              }}
              inputClassName="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-white outline-none focus:border-emerald-500 shadow-inner"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">To Date</label>
            <DateInput
              value={dateTo}
              onChange={val => {
                const from = parseDMY(dateFrom);
                const to = parseDMY(val);
                if (from && to && to < from) return;
                setDateTo(val);
              }}
              inputClassName="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-white outline-none focus:border-emerald-500 shadow-inner"
            />
          </div>

          {stationsList.length > 0 && (
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                <span>Police Station</span>
                <span className="text-[9px] text-slate-500 font-normal normal-case">(optional)</span>
              </label>
              <select
                value={psId || ''}
                onChange={e => setPsId(e.target.value || null)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-white outline-none focus:border-emerald-500 cursor-pointer shadow-inner"
              >
                <option value="">All Police Stations (District Scope)</option>
                {stationsList.map(ps => (
                  <option key={ps.id} value={ps.id}>{ps.name_en} ({ps.code})</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── Export Action Bar ────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || selectedFields.size === 0}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-6 py-3 rounded-xl transition-all shadow-lg shadow-emerald-950/50 flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
          >
            {isExporting ? (
              <><RefreshCw size={15} className="animate-spin" /><span>Generating Workbook...</span></>
            ) : (
              <><FileSpreadsheet size={15} /><span>Generate Excel (.xlsx)</span></>
            )}
          </button>

          {selectedFields.size === 0 && jobState.status === 'idle' && (
            <p className="text-xs text-amber-400 font-semibold flex items-center gap-1.5">
              <AlertTriangle size={14} />
              <span>Select at least 1 column to enable export.</span>
            </p>
          )}
        </div>

        {/* Download Box */}
        {jobState.status === 'ready' && (
          <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl px-4 py-2.5 flex items-center gap-3 animate-fade-in">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-white block">Workbook Ready!</span>
              <span className="text-[10px] text-slate-400">Formatted &amp; sanitized Excel sheet generated</span>
            </div>
            <button
              type="button"
              onClick={handleDownload}
              className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
            >
              <Download size={13} />
              <span>Download File</span>
            </button>
          </div>
        )}

        {jobState.status === 'failed' && (
          <div className="flex items-center gap-2 text-xs font-bold text-rose-400">
            <AlertTriangle size={15} />
            <span>Generation failed. Please re-check date range and filter settings.</span>
          </div>
        )}
      </div>

    </div>
  );
}
