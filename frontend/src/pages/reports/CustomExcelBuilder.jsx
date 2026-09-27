import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileSpreadsheet, Download, RefreshCw, ChevronDown, Search,
  X, AlertTriangle, CheckCircle2, Trash2,
  ChevronUp, CheckSquare
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
    id: 'fir_360_dossier',
    title: '360° Complete FIR Dossier',
    description: 'FIR, Complainant, Accused, Victim, Property & Occurrence (Full Multi-Entity Report)',
    table: 'CASE',
    join: 'CASE_ACCUSED',
    fieldKeywords: ['fir_no', 'record_date', 'ps_name', 'complainant', 'occurrence', 'accused', 'status', 'prop', 'stolen', 'recovered'],
  },
  {
    id: 'daily_fir',
    title: 'Daily FIR Master Log',
    description: 'FIR No, Registration Date, Local Head, PS Name, Status, IO Name',
    table: 'CASE',
    join: null,
    fieldKeywords: ['fir_no', 'record_date', 'local_head_id', 'ps_name', 'current_status', 'io_name', 'gd_no'],
  },
  {
    id: 'accused_register',
    title: 'Accused & Suspect Person Register',
    description: 'FIR No, Accused Name, Gender, Age, Social Category, Arrest Type, Address',
    table: 'CASE',
    join: 'CASE_ACCUSED',
    fieldKeywords: ['fir_no', 'name', 'gender', 'age', 'social_category', 'arrest_type', 'address'],
  },
  {
    id: 'property_stolen',
    title: 'Property Stolen & Recovered Detailed Register',
    description: 'FIR No, Property Category, Sub-Type, Nature, Estimated Value (₹), Property Description & Serial No / UID',
    table: 'CASE',
    join: null,
    fieldKeywords: ['fir_no', 'fir_date', 'local_head', 'property_category', 'property_type', 'property_nature', 'estimated_value', 'property_details', 'property_uid'],
  },
  {
    id: 'arrest_master',
    title: 'Arrest Classification & Custody Master Register',
    description: 'Arrest Memo No, Date of Arrest, Arrest Type, Category, Person Name, Address, Place of Arrest, Custody Status & IO Name',
    table: 'ARREST',
    join: 'ARREST_ARRESTED',
    fieldKeywords: ['linked_fir_dd_no', 'arrest_memo_no', 'arrest_date', 'arrest_type', 'arrest_category', 'arrested_name', 'arrested_address', 'arrest_place', 'status', 'io_name', 'dossier_prepared', 'nafis_prepared'],
  },
  {
    id: 'preventive_kalandra',
    title: 'Preventive Kalandra Register',
    description: 'Call ID, DD No, Date, PS Name, Act/Section, Bound Down Status (107/151 CrPC)',
    table: 'PCR_CALL',
    join: null,
    fieldKeywords: ['dd_no', 'call_id', 'record_date', 'ps_name', 'act_section', 'status', 'kalandra'],
  },
  {
    id: 'missing_persons',
    title: 'Missing Persons Search Register',
    description: 'Name, Gender, Age, Height, Clothing, Date Missing, Status (Traced/Untraced)',
    table: 'MISSING',
    join: null,
    fieldKeywords: ['name', 'gender', 'age', 'height', 'clothing', 'record_date', 'status', 'traced'],
  },
  {
    id: 'uidb_register',
    title: 'Unidentified Bodies (UIDB) Log',
    description: 'Found Date, Found Place, Estimated Age, Corpse Description, Mortuary Name',
    table: 'UIDB',
    join: null,
    fieldKeywords: ['found_date', 'place', 'age', 'gender', 'description', 'mortuary', 'status'],
  },
  {
    id: 'victim_dossier',
    title: 'Victim & Crime Head Register',
    description: 'FIR No, Crime Head, Victim Name, Gender, Age, Injury Type, POCSO / SC-ST Flag',
    table: 'CASE',
    join: 'CASE_VICTIM',
    fieldKeywords: ['fir_no', 'local_head_id', 'name', 'gender', 'age', 'injury', 'pocso'],
  },
];

const today = formatDMY(new Date());
const thirtyDaysAgo = formatDMY(new Date(Date.now() - 30 * 86400000));

/**
 * Categorized Field Picker with Form Section Groupings
 */
function CategorizedFieldPicker({ categorizedOptions, selected, onToggle, onToggleGroup, search, setSearch, open, setOpen, dropRef }) {
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const toggleGroupCollapse = (grpLabel) => {
    setCollapsedGroups(prev => ({ ...prev, [grpLabel]: !prev[grpLabel] }));
  };

  return (
    <div ref={dropRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 px-3.5 py-3 outline-none focus:border-[#0f52ba] transition-all cursor-pointer font-bold shadow-inner"
      >
        <span className="truncate text-left flex items-center gap-2">
          <span>{selected.size === 0 ? 'Select Form Sections & Fields...' : `${selected.size} Columns Selected`}</span>
        </span>
        <ChevronDown size={15} className="text-slate-500 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col max-h-96">
          {/* Search Header */}
          <div className="p-2.5 border-b border-slate-200 bg-slate-50 flex flex-col gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search fields across sections..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg pl-8 pr-2 py-1.5 text-xs text-slate-900 outline-none focus:border-[#0f52ba] font-medium"
              />
            </div>
            <div className="flex items-center justify-between text-label-s px-1 text-slate-500">
              <span className="font-semibold text-slate-600">Form-Matched Categories</span>
              <span>{selected.size} columns active</span>
            </div>
          </div>

          {/* Categorized List */}
          <div className="overflow-y-auto flex-1 scrollbar-thin divide-y divide-slate-800/60 p-1">
            {categorizedOptions.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-6">No matching fields found</p>
            )}

            {categorizedOptions.map((group) => {
              const filteredFields = group.fields.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));
              if (filteredFields.length === 0) return null;

              const isCollapsed = collapsedGroups[group.groupLabel];
              const allSelected = filteredFields.every(f => selected.has(f.value));

              return (
                <div key={group.groupLabel} className="py-1">
                  {/* Category Header */}
                  <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 rounded-lg mb-1">
                    <button
                      type="button"
                      onClick={() => toggleGroupCollapse(group.groupLabel)}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-800 hover:text-[#0f52ba] cursor-pointer bg-transparent border-none p-0"
                    >
                      {isCollapsed ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
                      <span>{group.groupLabel}</span>
                      <span className="text-[10px] text-slate-500 font-normal">({filteredFields.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleGroup(filteredFields.map(f => f.value), !allSelected)}
                      className="text-[10px] font-bold text-[#0f52ba] hover:underline cursor-pointer bg-transparent border-none p-0"
                    >
                      {allSelected ? 'Deselect Section' : 'Select Section'}
                    </button>
                  </div>

                  {/* Section Fields */}
                  {!isCollapsed && (
                    <div className="space-y-0.5 pl-2">
                      {filteredFields.map(opt => (
                        <label
                          key={opt.value}
                          className="flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-slate-100 rounded-md transition-colors cursor-pointer select-none text-slate-800"
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(opt.value)}
                            onChange={() => onToggle(opt.value)}
                            className="rounded border-slate-300 w-3.5 h-3.5 cursor-pointer accent-[#0f52ba]"
                          />
                          <span className="flex-1 font-medium">{opt.label}</span>
                          {opt.badge && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-400 border-amber-500/30 shrink-0">
                              {opt.badge}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
  const [rowGrain, setRowGrain] = useState('per_fir');
  const [selectedFields, setSelectedFields] = useState(new Set());
  const [dateFrom, setDateFrom] = useState(thirtyDaysAgo);
  const [dateTo, setDateTo]     = useState(today);
  const [psId, setPsId]         = useState(null);

  const [fieldDropOpen, setFieldDropOpen] = useState(false);
  const [fieldSearch, setFieldSearch]     = useState('');
  const fieldDropRef = useRef(null);

  const [jobState, setJobState] = useState({ status: 'idle', jobId: null });
  const [pendingPreset, setPendingPreset] = useState(null);

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

  const isDistrictOrHQ = ['DISTRICT_OFFICER', 'DCP', 'ACP', 'JCP', 'SCP', 'HQ_ANALYST', 'HQ_ADMIN', 'SYSTEM_ADMIN'].includes(role);

  // Grouped Field Options by Form Category
  const categorizedOptions = useMemo(() => {
    if (!metaRes?.tables) return [];

    const tables = join ? [table, join] : [table];
    const groupMap = new Map(); // sectionCategoryTitle -> array of field objects

    for (const t of tables) {
      const tData = metaRes.tables[t];
      if (!tData) continue;

      const tableTag = JOIN_TABLE_TAGS[t] || t;
      const groupLabelByKey = new Map(
        (tData.groups || []).map(g => [g.key, g.label_en])
      );

      for (const f of (tData.fields || [])) {
        let sectionTitle = 'General Info';
        if (f.group && groupLabelByKey.has(f.group)) {
          sectionTitle = groupLabelByKey.get(f.group);
        } else {
          // Fallback categorization based on field key if ungrouped
          const keyLower = f.key.toLowerCase();
          if (keyLower.includes('complainant_address') || keyLower.includes('informant_address')) sectionTitle = 'Complainant Address';
          else if (keyLower.includes('complainant') || keyLower.includes('informant')) sectionTitle = 'Complainant Personal Info';
          else if (keyLower.includes('accused_address') || keyLower.includes('suspect_address')) sectionTitle = 'Accused Address';
          else if (keyLower.includes('accused') || keyLower.includes('suspect')) sectionTitle = 'Accused Personal Info';
          else if (keyLower.includes('victim_address')) sectionTitle = 'Victim Address';
          else if (keyLower.includes('victim')) sectionTitle = 'Victim Personal Info';
          else if (keyLower.includes('occurrence') || keyLower.includes('area_of_crime')) sectionTitle = 'Occurrence Info';
          else if (keyLower.includes('prop') || keyLower.includes('stolen') || keyLower.includes('recovered') || keyLower.includes('seizure') || keyLower.includes('malkhana')) sectionTitle = 'Property Stolen & Recovery Details (Full Particulars)';
          else if (keyLower.includes('vehicle')) sectionTitle = 'Vehicle Details';
          else if (keyLower.includes('io_') || keyLower.includes('officer_')) sectionTitle = 'IO Info';
          else if (keyLower.includes('act_') || keyLower.includes('sections') || keyLower.includes('local_head')) sectionTitle = 'Acts & Sections (Act + Law Sections)';
          else if (keyLower.includes('facts') || keyLower.includes('modus_operandi')) sectionTitle = 'FIR Contents';
          else if (keyLower.includes('status') || keyLower.includes('disposal') || keyLower.includes('rc_no') || keyLower.includes('remarks')) sectionTitle = 'Investigation Details';
        }

        const grpTitle = tables.length > 1 ? `[${tableTag}] ${sectionTitle}` : sectionTitle;
        if (!groupMap.has(grpTitle)) groupMap.set(grpTitle, []);

        groupMap.get(grpTitle).push({
          value: `${t}.${f.key}`,
          label: f.label_en,
          badge: f.is_pii ? 'PII' : null,
          groupKey: f.group || null,
        });
      }

      for (const f of (tData.system_fields || [])) {
        const grpTitle = tables.length > 1 ? `[${tableTag}] System Metadata` : 'System Metadata';
        if (!groupMap.has(grpTitle)) groupMap.set(grpTitle, []);
        groupMap.get(grpTitle).push({
          value: `${t}.${f.key}`,
          label: f.label_en,
          badge: null,
          groupKey: '_system',
        });
      }
    }

    return Array.from(groupMap.entries()).map(([groupLabel, fields]) => ({
      groupLabel,
      fields: fields.sort((a, b) => a.label.localeCompare(b.label)),
    }));
  }, [metaRes, table, join]);

  // Flattened options list for lookup
  const allFieldOptions = useMemo(() => {
    return categorizedOptions.flatMap(g => g.fields);
  }, [categorizedOptions]);

  // Reactive Field Auto-Selection for Presets
  useEffect(() => {
    if (!pendingPreset || allFieldOptions.length === 0) return;

    const matches = new Set();
    allFieldOptions.forEach(opt => {
      const valLower = opt.value.toLowerCase();
      const lblLower = opt.label.toLowerCase();
      if (pendingPreset.fieldKeywords.some(kw => valLower.includes(kw) || lblLower.includes(kw))) {
        matches.add(opt.value);
      }
    });

    if (matches.size > 0) {
      setSelectedFields(matches);
      toast.success(`Preset "${pendingPreset.title}" applied! (${matches.size} fields selected)`);
    } else {
      const allKeys = new Set(allFieldOptions.map(o => o.value));
      setSelectedFields(allKeys);
      toast.success(`Preset "${pendingPreset.title}" applied! (${allKeys.size} fields selected)`);
    }
    setPendingPreset(null);
  }, [pendingPreset, allFieldOptions]);

  const changeTable = (newTable) => { setTable(newTable); setJoin(null); setRowGrain('per_fir'); setSelectedFields(new Set()); setFieldSearch(''); };
  const changeJoin  = (newJoin)  => { setJoin(newJoin || null); setSelectedFields(new Set()); setFieldSearch(''); };

  const toggleField = (val) => setSelectedFields(prev => { const n = new Set(prev); n.has(val) ? n.delete(val) : n.add(val); return n; });
  
  const toggleGroupFields = (fieldValues, select) => {
    setSelectedFields(prev => {
      const n = new Set(prev);
      fieldValues.forEach(v => (select ? n.add(v) : n.delete(v)));
      return n;
    });
  };

  const selectAllFields = () => {
    const all = new Set(allFieldOptions.map(o => o.value));
    setSelectedFields(all);
    toast.success(`Selected all ${all.size} available form fields!`);
  };

  const clearSelectedFields = () => setSelectedFields(new Set());

  // Apply a Quick Preset
  const applyPreset = (preset) => {
    setTable(preset.table);
    setJoin(preset.join);
    if (preset.row_grain) setRowGrain(preset.row_grain);
    setPendingPreset(preset);
  };

  const handleExport = async () => {
    if (selectedFields.size === 0) { toast.error('Select at least one column to export.'); return; }
    if (!dateFrom || !dateTo)      { toast.error('Please specify a date range.'); return; }

    const hasJoin = !!join;
    const expandedRefs = Array.from(selectedFields).flatMap(ref => {
      const opt = allFieldOptions.find(o => o.value === ref);
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
      row_grain: rowGrain,
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

      const loadingToastId = toast.loading('Building Excel workbook & formatting multi-entity columns...');

      let attempts = 0;
      let consecutiveErrors = 0;
      const iv = setInterval(async () => {
        attempts++;
        try {
          const sr = await api.get(`/reports/status/${jobId}`);
          consecutiveErrors = 0;
          const status = sr.data?.data?.job?.status || sr.data?.data?.status;
          if (status === 'READY') {
            clearInterval(iv);
            toast.dismiss(loadingToastId);
            toast.success('Excel workbook ready! Downloading file...');
            setJobState({ status: 'ready', jobId });
            triggerFileDownload(jobId);
          } else if (status === 'FAILED') {
            clearInterval(iv);
            toast.dismiss(loadingToastId);
            toast.error(sr.data?.data?.job?.error_message || 'Report generation failed on server.');
            setJobState({ status: 'failed', jobId });
          } else if (attempts >= 80) {
            clearInterval(iv);
            toast.dismiss(loadingToastId);
            toast.error('Export timed out. Try refining date range or filters.');
            setJobState({ status: 'failed', jobId });
          }
        } catch (err) {
          consecutiveErrors++;
          if (consecutiveErrors >= 5) {
            clearInterval(iv);
            toast.dismiss(loadingToastId);
            toast.error('Connection lost while polling job status.');
            setJobState({ status: 'failed', jobId });
          }
        }
      }, 500);
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

  const triggerFileDownload = async (idToDownload) => {
    const jobId = idToDownload || jobState.jobId;
    if (!jobId) return;
    try {
      const res = await api.get(`/reports/download/${jobId}`, { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `PHAROS_${table}${join ? `_${join}` : ''}_${fmtDate(dateFrom)}_to_${fmtDate(dateTo)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 500);
      toast.success('Excel file downloaded!');
    } catch (err) {
      let msg = err.message;
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          msg = parsed.message || msg;
        } catch (_) {}
      } else if (err.response?.data?.message) {
        msg = err.response.data.message;
      }
      toast.error('Download failed: ' + msg);
    }
  };

  const handleDownload = () => triggerFileDownload();

  const joinOptions = JOIN_OPTIONS[table] || [];
  const isExporting = jobState.status === 'pending';

  if (metaLoading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0f52ba] mx-auto" />
        <p className="text-xs text-slate-500 font-semibold">Loading field registry metadata...</p>
      </div>
    );
  }

  if (metaError) {
    return (
      <div className="bg-white border border-red-900/50 rounded-2xl p-6 flex items-center gap-3 text-xs text-red-400">
        <AlertTriangle size={18} />
        <span>Failed to connect to field registry API. Ensure backend server is online.</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans text-slate-900">
      
      {/* Scope Privilege Indicator Banner */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5">
          <div>
            <span className="font-bold text-slate-900 block">Hierarchical Scope Authority: <span className="text-[#0f52ba] uppercase font-mono">{role}</span></span>
            <span className="text-slate-500 text-label-s">
              {isDistrictOrHQ
                ? 'District Authority Enabled — You can customize descriptive reports for your entire district or filter down to any specific station.'
                : 'Police Station Authority — Descriptive reports are automatically scoped to your assigned Station.'}
            </span>
          </div>
        </div>
        <span className="text-[10px] bg-slate-100 text-slate-600 px-3 py-1 rounded-lg border border-slate-300 font-bold shrink-0">
          {isDistrictOrHQ ? 'Multi-Station Privileges Active' : 'Station Scoped'}
        </span>
      </div>

      {/* ⚡ Executive Quick-Start Presets */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
            One-Click Multi-Entity &amp; Officer Presets
          </h3>
          <span className="text-[10px] text-slate-500 font-medium">Auto-configures tables, joins &amp; descriptive dossier fields</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {QUICK_PRESETS.map((preset) => {
            const active = table === preset.table && join === preset.join;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between space-y-2 ${
                  active
                    ? 'bg-blue-50 border-[#0f52ba] text-[#0d2a4a] shadow-sm'
                    : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {active && (
                  <div className="flex items-center justify-end">
                    <CheckCircle2 size={14} className="text-[#0f52ba]" />
                  </div>
                )}
                <div>
                  <h4 className="text-xs font-bold text-slate-900">{preset.title}</h4>
                  <p className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">{preset.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Table Selection & Categorized Column Picker ────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xl space-y-4">
        <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200 pb-3">
          Form-Matched Record Master &amp; Categorized Column Configurator
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {/* Primary Table */}
          <div>
            <label className="text-label-s font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Primary Record Type</label>
            <select
              value={table}
              onChange={e => changeTable(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 outline-none focus:border-[#0f52ba] cursor-pointer shadow-inner"
            >
              {Object.entries(TABLE_LABELS).map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </select>
          </div>

          {/* Row Grain Unit */}
          <div>
            <label className="text-label-s font-bold text-slate-500 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
              <span>Output Row Grain</span>
              <span className="text-[9px] text-[#0f52ba] font-bold">Total Invariant</span>
            </label>
            <select
              value={rowGrain}
              onChange={e => setRowGrain(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 outline-none focus:border-[#0f52ba] cursor-pointer shadow-inner"
            >
              <option value="per_fir">1 Row per FIR / Record (per_fir)</option>
              <option value="per_accused">1 Row per Accused Person (per_accused)</option>
              <option value="per_victim">1 Row per Victim Person (per_victim)</option>
              <option value="per_property">1 Row per Property Item (per_property)</option>
            </select>
          </div>

          {/* Join Table */}
          <div>
            <label className="text-label-s font-bold text-slate-500 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
              <span>Link / Sub-Table Join</span>
              <span className="text-[9px] text-slate-500 font-normal normal-case">(optional)</span>
            </label>
            <select
              value={join || ''}
              onChange={e => changeJoin(e.target.value || null)}
              disabled={joinOptions.length === 0}
              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 outline-none focus:border-[#0f52ba] cursor-pointer disabled:opacity-40 shadow-inner"
            >
              <option value="">No sub-table join (single entity)</option>
              {joinOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Categorized Columns Picker Dropdown */}
          <div>
            <label className="text-label-s font-bold text-slate-500 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
              <span>Form-Matched Columns to Export</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllFields}
                  className="text-[10px] text-[#0f52ba] hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none p-0"
                >
                  <CheckSquare size={10} /> Select All
                </button>
                {selectedFields.size > 0 && (
                  <button
                    type="button"
                    onClick={clearSelectedFields}
                    className="text-[10px] text-rose-400 hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none p-0"
                  >
                    <Trash2 size={10} /> Clear
                  </button>
                )}
              </div>
            </label>
            <CategorizedFieldPicker
              categorizedOptions={categorizedOptions}
              selected={selectedFields}
              onToggle={toggleField}
              onToggleGroup={toggleGroupFields}
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
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between text-label-s text-slate-500">
              <span>Selected Export Layout ({selectedFields.size} columns)</span>
              <span className="text-[10px] text-slate-500">Click x to remove a column</span>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto scrollbar-thin p-1.5 bg-slate-50 rounded-xl border border-slate-200">
              {Array.from(selectedFields).map(ref => {
                const opt = allFieldOptions.find(o => o.value === ref);
                return (
                  <span
                    key={ref}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-label-s font-medium bg-slate-100 text-slate-800 border border-slate-200"
                  >
                    <span>{opt?.label || ref}</span>
                    {opt?.badge && (
                      <span className="text-[9px] font-bold bg-amber-50 text-amber-700 rounded px-1">{opt.badge}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleField(ref)}
                      className="text-slate-500 hover:text-rose-400 transition-colors cursor-pointer bg-transparent border-none p-0"
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

      {/* ── Scope & Filter Constraints ────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xl space-y-4">
        <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wider border-b border-slate-200 pb-3">
          Hierarchical Scope &amp; Date Range Filters
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="text-label-s font-bold text-slate-500 uppercase tracking-wider block mb-1.5">From Date</label>
            <DateInput
              value={dateFrom}
              onChange={val => {
                setDateFrom(val);
                const from = parseDMY(val);
                const to = parseDMY(dateTo);
                if (from && to && from > to) setDateTo(val);
              }}
              inputClassName="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 outline-none focus:border-[#0f52ba] shadow-inner"
            />
          </div>

          <div>
            <label className="text-label-s font-bold text-slate-500 uppercase tracking-wider block mb-1.5">To Date</label>
            <DateInput
              value={dateTo}
              onChange={val => {
                const from = parseDMY(dateFrom);
                const to = parseDMY(val);
                if (from && to && to < from) return;
                setDateTo(val);
              }}
              inputClassName="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 outline-none focus:border-[#0f52ba] shadow-inner"
            />
          </div>

          {stationsList.length > 0 && (
            <div>
              <label className="text-label-s font-bold text-slate-500 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                <span>Target Police Station Scope</span>
                <span className="text-[9px] text-slate-500 font-normal normal-case">(optional)</span>
              </label>
              <select
                value={psId || ''}
                onChange={e => setPsId(e.target.value || null)}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 outline-none focus:border-[#0f52ba] cursor-pointer shadow-inner"
              >
                <option value="">All Police Stations in District Scope</option>
                {stationsList.map(ps => (
                  <option key={ps.id} value={ps.id}>{ps.name_en} ({ps.code})</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ── Export Action Bar ────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || selectedFields.size === 0}
            className="bg-[#0f52ba] hover:bg-[#0d2a4a] text-white font-bold text-xs px-6 py-3 rounded-xl transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
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
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 flex items-center gap-3 animate-fade-in">
            <CheckCircle2 size={16} className="text-[#0f52ba] shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-slate-900 block">Workbook Ready!</span>
              <span className="text-[10px] text-slate-500">Multi-entity dossier Excel generated</span>
            </div>
            <button
              type="button"
              onClick={handleDownload}
              className="bg-[#0f52ba] hover:bg-[#0d2a4a] text-white font-bold text-xs px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-md"
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
