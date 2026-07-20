import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileSpreadsheet, Download, RefreshCw, ChevronDown, Search,
  X, Link2, AlertTriangle, CheckCircle2, Calendar, Shield,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api.js';
import useAuthStore from '../../store/authStore.js';
import DateInput from '../../components/ui/DateInput.jsx';
import { formatDMY, parseDMY } from '../../utils/dateFormat.js';

const JOIN_OPTIONS = {
  CASE: [
    { value: 'ARREST',       label: 'FIR + Arrests (joined by FIR No.)' },
    { value: 'MISSING',      label: 'FIR + Missing Persons (joined by DD No.)' },
    { value: 'CASE_ACCUSED', label: 'FIR + Accused Persons (one row per accused)' },
    { value: 'CASE_VICTIM',  label: 'FIR + Victims (one row per victim)' },
  ],
  ARREST: [
    { value: 'ARREST_ARRESTED', label: 'Arrests + Arrested Persons — Full Details (one row per person)' },
  ],
};

const TABLE_LABELS = {
  CASE:     'FIR Master (CASE)',
  ARREST:   'Arrest Master (ARREST)',
  PCR_CALL: 'PCR / Kalandra (PCR_CALL)',
  MISSING:  'Missing Persons (MISSING)',
  UIDB:     'Unidentified Bodies (UIDB)',
};

// Prettier prefix for join-only virtual tables when tagging field labels
// (e.g. "[CASE_ACCUSED] Accused First Name" -> "[Accused] Accused First Name").
const JOIN_TABLE_TAGS = {
  CASE_ACCUSED: 'Accused',
  CASE_VICTIM: 'Victim',
  ARREST_ARRESTED: 'Arrested Person',
};

const today = formatDMY(new Date());
const sevenDaysAgo = formatDMY(new Date(Date.now() - 7 * 86400000));

const inputCls = [
  'w-full bg-white border border-slate-200 rounded-lg text-xs text-slate-800',
  'px-3 py-2.5 outline-none focus:border-[var(--accent-color)] transition-all font-semibold',
].join(' ');

const labelCls = 'text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-1.5';

const SectionCard = ({ children, className = '' }) => (
  <div
    className={`rounded-2xl p-5 space-y-4 ${className}`}
    style={{ background: 'var(--bg-card-theme)', border: '1px solid var(--border-card-theme)' }}
  >
    {children}
  </div>
);

const SectionTitle = ({ icon: Icon, children }) => (
  <h3
    className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 pb-2.5"
    style={{ borderBottom: '1px solid var(--border-card-theme)', color: 'var(--text-main-theme)', opacity: 0.7 }}
  >
    {Icon && <Icon size={13} style={{ color: 'var(--accent-color)' }} />}
    <span>{children}</span>
  </h3>
);

function MultiSelectDropdown({ label, options, selected, onToggle, onSelectAll, search, setSearch, open, setOpen, dropRef }) {
  const filtered = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={dropRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between bg-white border border-slate-200 rounded-lg text-xs text-slate-800 px-3 py-2.5 outline-none focus:border-[var(--accent-color)] transition-all cursor-pointer font-semibold"
      >
        <span className="truncate text-left">{label}</span>
        <ChevronDown size={13} className="text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden flex flex-col max-h-72">
          <div className="p-2 border-b border-slate-100 bg-slate-50 flex flex-col gap-1.5">
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg pl-6 pr-2 py-1 text-[11px] text-slate-800 outline-none focus:border-[var(--accent-color)] font-semibold"
              />
            </div>
            <div className="flex items-center justify-between text-[10px] px-0.5 text-slate-500">
              <button
                type="button"
                onClick={onSelectAll}
                className="hover:text-[var(--accent-color)] transition-colors font-bold cursor-pointer border-none bg-transparent"
              >
                {selected.size === options.length ? 'Deselect All' : 'Select All'}
              </button>
              <span>{selected.size} of {options.length} selected</span>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 scrollbar-thin">
            {filtered.length === 0 && (
              <p className="text-[11px] text-slate-400 text-center py-4">No matches</p>
            )}
            {filtered.map(opt => (
              <label
                key={opt.value}
                className="flex items-center gap-2 px-3 py-2 text-[11px] hover:bg-slate-50 transition-colors cursor-pointer select-none text-slate-700"
              >
                <input
                  type="checkbox"
                  checked={selected.has(opt.value)}
                  onChange={() => onToggle(opt.value)}
                  className="rounded border-slate-200 w-3.5 h-3.5 cursor-pointer accent-[var(--accent-color)]"
                />
                <span className="flex-1 font-semibold">{opt.label}</span>
                {opt.badge && (
                  <span className="text-[9px] font-bold px-1 py-px rounded border bg-amber-50 text-amber-600 border-amber-200 shrink-0">
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
  const [dateFrom, setDateFrom] = useState(sevenDaysAgo);
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

      // Group fields that share a `group` tag into ONE collapsed checkbox —
      // selecting it exports every member field as its own column (expanded
      // in handleExport), but the picker only shows one row for the whole group.
      const tableTag = JOIN_TABLE_TAGS[t] || t;
      const groupLabelByKey = new Map((tData.groups || []).map(g => [g.key, tables.length > 1 ? `[${tableTag}] ${g.label_en}` : g.label_en]));
      const groupMembers = new Map(); // groupKey -> [{value, isPii}]

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

  const toggleField    = (val) => setSelectedFields(prev => { const n = new Set(prev); n.has(val) ? n.delete(val) : n.add(val); return n; });
  const toggleAllFields = () => setSelectedFields(selectedFields.size === fieldOptions.length ? new Set() : new Set(fieldOptions.map(o => o.value)));

  const handleExport = async () => {
    if (selectedFields.size === 0) { toast.error('Select at least one field to export.'); return; }
    if (!dateFrom || !dateTo)      { toast.error('Please set a date range.'); return; }

    const hasJoin = !!join;
    // Expand any selected group checkbox into its full set of member field refs
    // so the export contains every underlying column, not the synthetic group value.
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

      const loadingToastId = toast.loading('Building Excel report…');

      let attempts = 0;
      const iv = setInterval(async () => {
        attempts++;
        try {
          const sr = await api.get(`/reports/status/${jobId}`);
          const status = sr.data?.data?.job?.status || sr.data?.data?.status;
          if (status === 'READY') {
            clearInterval(iv);
            toast.dismiss(loadingToastId);
            toast.success('Report ready — click Download to save.');
            setJobState({ status: 'ready', jobId });
          } else if (status === 'FAILED' || attempts > 40) {
            clearInterval(iv);
            toast.dismiss(loadingToastId);
            toast.error('Report generation failed.');
            setJobState({ status: 'failed', jobId });
          }
        } catch {
          clearInterval(iv);
          toast.dismiss(loadingToastId);
          toast.error('Lost connection while polling report status.');
          setJobState({ status: 'failed', jobId });
        }
      }, 1500);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to start report generation.');
      setJobState({ status: 'idle', jobId: null });
    }
  };

  const fmtDate = dmy => {
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
      toast.success('Excel downloaded!');
      setJobState({ status: 'idle', jobId: null });
    } catch (err) {
      toast.error('Download failed: ' + (err.response?.data?.message || err.message));
    }
  };

  const joinOptions  = JOIN_OPTIONS[table] || [];
  const isExporting  = jobState.status === 'pending';

  if (metaLoading) {
    return (
      <SectionCard>
        <div className="flex items-center justify-center h-32 gap-3" style={{ color: 'var(--text-main-theme)', opacity: 0.5 }}>
          <div className="animate-spin rounded-full h-5 w-5 border-b-2" style={{ borderColor: 'var(--accent-color)' }} />
          <span className="text-sm font-semibold">Loading field registry…</span>
        </div>
      </SectionCard>
    );
  }

  if (metaError) {
    return (
      <SectionCard>
        <div className="flex items-center gap-3 text-sm font-semibold text-red-600">
          <AlertTriangle size={16} />
          <span>Failed to load field metadata. Check that the backend is running.</span>
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5 font-sans">

      {/* ── Record Type & Columns ─────────────────────────────────────────── */}
      <SectionCard>
        <SectionTitle icon={FileSpreadsheet}>Record Type &amp; Columns</SectionTitle>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Primary table */}
          <div>
            <label className={labelCls}>Primary Record Type</label>
            <select value={table} onChange={e => changeTable(e.target.value)} className={inputCls + ' cursor-pointer'}>
              {Object.entries(TABLE_LABELS).map(([val, lbl]) => (
                <option key={val} value={val}>{lbl}</option>
              ))}
            </select>
          </div>

          {/* Join */}
          <div>
            <label className={labelCls}>
              <Link2 size={10} className="inline mr-1" />
              Link / Join Table
              <span className="text-[9px] font-normal normal-case text-slate-400 ml-1">(optional)</span>
            </label>
            <select
              value={join || ''}
              onChange={e => changeJoin(e.target.value || null)}
              disabled={joinOptions.length === 0}
              className={inputCls + ' cursor-pointer disabled:opacity-40'}
            >
              <option value="">No join — single table</option>
              {joinOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {joinOptions.length === 0 && (
              <p className="text-[10px] text-slate-400 mt-1">No joins available for {table}</p>
            )}
          </div>

          {/* Field multi-select */}
          <div>
            <label className={labelCls}>Columns to Export</label>
            <MultiSelectDropdown
              label={
                selectedFields.size === 0
                  ? 'Select fields…'
                  : selectedFields.size === fieldOptions.length
                    ? `All Fields (${fieldOptions.length})`
                    : `${selectedFields.size} Field${selectedFields.size !== 1 ? 's' : ''} Selected`
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

        {/* Selected field chips */}
        {selectedFields.size > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {Array.from(selectedFields).map(ref => {
              const opt = fieldOptions.find(o => o.value === ref);
              return (
                <span
                  key={ref}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ background: 'var(--accent-glow)', color: 'var(--accent-color)', border: '1px solid var(--accent-color)', borderOpacity: 0.25 }}
                >
                  {opt?.label || ref}
                  {opt?.badge && (
                    <span className="text-[8px] font-bold bg-amber-50 text-amber-600 rounded px-0.5">{opt.badge}</span>
                  )}
                  <button type="button" onClick={() => toggleField(ref)} className="transition-opacity opacity-60 hover:opacity-100 cursor-pointer border-none bg-transparent p-0">
                    <X size={9} />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <SectionCard>
        <SectionTitle icon={Calendar}>Filters</SectionTitle>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>From Date</label>
            <DateInput
              value={dateFrom}
              onChange={val => {
                setDateFrom(val);
                const from = parseDMY(val);
                const to = parseDMY(dateTo);
                if (from && to && from > to) setDateTo(val);
              }}
              inputClassName={`${inputCls} pr-9`}
            />
          </div>
          <div>
            <label className={labelCls}>To Date</label>
            <DateInput
              value={dateTo}
              onChange={val => {
                const from = parseDMY(dateFrom);
                const to = parseDMY(val);
                if (from && to && to < from) return;
                setDateTo(val);
              }}
              inputClassName={inputCls}
            />
          </div>
          {stationsList.length > 0 && (
            <div>
              <label className={labelCls}>
                <Shield size={10} className="inline mr-1" />
                Police Station
                <span className="text-[9px] font-normal normal-case text-slate-400 ml-1">(optional)</span>
              </label>
              <select value={psId || ''} onChange={e => setPsId(e.target.value || null)} className={inputCls + ' cursor-pointer'}>
                <option value="">All Stations</option>
                {stationsList.map(ps => (
                  <option key={ps.id} value={ps.id}>{ps.name_en} ({ps.code})</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Export Button & Status ─────────────────────────────────────────── */}
      <div className="flex items-center gap-4 flex-wrap">
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting || selectedFields.size === 0}
          style={{ background: 'var(--accent-color)', borderColor: 'var(--accent-color)' }}
          className="text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm active:scale-95 hover:brightness-110 border"
        >
          {isExporting ? (
            <><RefreshCw size={14} className="animate-spin" /><span>Building Report…</span></>
          ) : (
            <><FileSpreadsheet size={14} /><span>Export as Excel</span></>
          )}
        </button>

        {jobState.status === 'ready' && (
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-2"
            style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)' }}
          >
            <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
            <span className="text-xs font-semibold text-emerald-600">Report ready!</span>
            <button
              type="button"
              onClick={handleDownload}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer border-none shadow-sm active:scale-95"
            >
              <Download size={11} />
              <span>Download Excel</span>
            </button>
          </div>
        )}

        {jobState.status === 'failed' && (
          <div className="flex items-center gap-2 text-xs font-semibold text-red-500">
            <AlertTriangle size={14} />
            <span>Export failed. Try again.</span>
          </div>
        )}

        {selectedFields.size === 0 && jobState.status === 'idle' && (
          <p className="text-[11px] text-slate-400 font-semibold">
            Select at least one field to enable export.
          </p>
        )}
      </div>
    </div>
  );
}
