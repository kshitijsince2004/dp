import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Plus, X, ChevronDown, ChevronRight, ToggleLeft, ToggleRight, Globe, Pencil } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api.js';
import { log } from '../../utils/logger.js';

const ensureArray = (val) => (Array.isArray(val) ? val : []);

const RECORD_TYPES = ['CASE', 'ARREST', 'PCR_CALL', 'MISSING', 'UIDB'];
const FIELD_TYPES  = ['TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'DATETIME', 'SELECT', 'BOOLEAN'];

const TYPE_COLORS = {
  CASE:     'text-blue-400 border-blue-800/40 bg-blue-950/30',
  ARREST:   'text-red-400 border-red-800/40 bg-red-950/30',
  PCR_CALL: 'text-amber-400 border-amber-800/40 bg-amber-950/30',
  MISSING:  'text-violet-400 border-violet-800/40 bg-violet-950/30',
  UIDB:     'text-zinc-400 border-zinc-600/40 bg-zinc-800/30',
};

function sectionsFromFields(fieldList, selectedTypes) {
  const seen = new Set();
  const upperTypes = selectedTypes.map((t) => t.toUpperCase());
  const relevant = upperTypes.length > 0
    ? fieldList.filter((f) =>
        ensureArray(f.applicable_record_types).some((rt) => upperTypes.includes(rt.toUpperCase()))
      )
    : fieldList;
  return relevant
    .map((f) => ({ key: f.section, label: f.section_label_en || f.section }))
    .filter((s) => s.key && !seen.has(s.key) && seen.add(s.key));
}

const emptyForm = () => ({
  field_key: '', label_en: '', label_hi: '', field_type: 'TEXT',
  section: '', section_label_en: '', section_label_hi: '',
  isNewSection: false,
  applicable_record_types: [],
  is_required: false, sort_order: 0,
  options: [],
});

export default function FieldManager() {
  const queryClient = useQueryClient();

  const [activeTab,        setActiveTab]        = useState('global');
  const [filterType,       setFilterType]        = useState('ALL');
  const [expandedSections, setExpandedSections]  = useState({});
  const [showModal,        setShowModal]         = useState(false);
  const [form,             setForm]              = useState(emptyForm());
  const [editTarget,       setEditTarget]        = useState(null);

  useEffect(() => {
    log.debug('page:mount', { route: '/admin/fields' });
    return () => log.debug('page:unmount', { route: '/admin/fields' });
  }, []);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: allFields = [], isLoading } = useQuery({
    queryKey: ['admin', 'fields', 'all'],
    queryFn: async () => {
      log.debug('data:load_start', { what: 'admin_fields_all' });
      try {
        const res = await api.get('/fields');
        const rows = res.data?.data?.fields || [];
        log.debug('data:load_success', { what: 'admin_fields_all', count: rows.length });
        return rows;
      } catch (err) {
        log.error('data:load_error', { what: 'admin_fields_all', err });
        throw err;
      }
    },
    staleTime: 60_000,
  });

  const globalFields   = useMemo(() => allFields.filter((f) => f.scope_level === 'global' || !f.scope_level), [allFields]);
  const districtFields = useMemo(() => allFields.filter((f) => f.scope_level === 'district'), [allFields]);
  const displayFields  = activeTab === 'global' ? globalFields : districtFields;

  const filteredFields = filterType === 'ALL'
    ? displayFields
    : displayFields.filter((f) => ensureArray(f.applicable_record_types).map((t) => t.toUpperCase()).includes(filterType));

  const grouped = useMemo(() => filteredFields.reduce((acc, f) => {
    const key = f.section || 'general_info';
    if (!acc[key]) acc[key] = { fields: [], title_en: f.section_label_en || key };
    acc[key].fields.push(f);
    return acc;
  }, {}), [filteredFields]);

  // Sections filtered by currently selected record types in the modal form
  const knownSections = useMemo(
    () => sectionsFromFields(globalFields, form.applicable_record_types),
    [globalFields, form.applicable_record_types]
  );

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (payload) => { log.info('action:field_create_start', { fieldKey: payload.field_key }); return api.post('/fields', payload); },
    onSuccess: (res, payload) => {
      log.info('action:field_create_success', { fieldKey: payload.field_key });
      toast.success('Field published to registry');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['admin', 'fields', 'all'] });
    },
    onError: (err, payload) => { log.error('action:field_create_failed', { fieldKey: payload?.field_key, err }); toast.error(err.response?.data?.message || 'Failed to create field'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => { log.info('action:field_update_start', { fieldId: id }); return api.patch(`/fields/${id}`, payload); },
    onSuccess: (res, { id }) => {
      log.info('action:field_update_success', { fieldId: id });
      toast.success('Field updated');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['admin', 'fields', 'all'] });
    },
    onError: (err, { id }) => { log.error('action:field_update_failed', { fieldId: id, err }); toast.error(err.response?.data?.message || 'Failed to update field'); },
  });

  const toggleMutation = useMutation({
    mutationFn: (id) => { log.debug('action:field_toggle_start', { fieldId: id }); return api.patch(`/fields/${id}/toggle`); },
    onSuccess: (res, id) => { log.info('action:field_toggle_success', { fieldId: id }); queryClient.invalidateQueries({ queryKey: ['admin', 'fields', 'all'] }); },
    onError: (err, id) => { log.error('action:field_toggle_failed', { fieldId: id, err }); toast.error(err.response?.data?.message || 'Toggle failed'); },
  });

  // ── Modal helpers ──────────────────────────────────────────────────────────
  const openCreate = () => { setForm(emptyForm()); setEditTarget(null); setShowModal(true); };

  const openEdit = (field) => {
    setForm({
      field_key:        field.field_key,
      label_en:         field.label_en,
      label_hi:         field.label_hi || '',
      field_type:       field.field_type,
      section:          field.section || '',
      section_label_en: field.section_label_en || '',
      section_label_hi: field.section_label_hi || '',
      isNewSection:     false,
      applicable_record_types: ensureArray(field.applicable_record_types),
      is_required:      !!field.validation_rules?.required,
      sort_order:       field.sort_order || 0,
      options:          ensureArray(field.options),
    });
    setEditTarget(field.id);
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setForm(emptyForm()); setEditTarget(null); };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.applicable_record_types.length) { toast.error('Select at least one record type'); return; }
    if (form.isNewSection && !form.section)   { toast.error('Section key is required for new section'); return; }

    const payload = {
      label_en:                form.label_en,
      label_hi:                form.label_hi,
      field_type:              form.field_type,
      section:                 form.section || 'general_info',
      section_label_en:        form.isNewSection ? form.section_label_en : undefined,
      section_label_hi:        form.isNewSection ? form.section_label_hi : undefined,
      applicable_record_types: form.applicable_record_types,
      is_required:             form.is_required,
      sort_order:              form.sort_order,
      options:                 form.field_type === 'SELECT' ? form.options : [],
    };

    log.debug('action:field_form_submit', { editTarget, fieldKey: form.field_key || editTarget });
    if (editTarget) {
      updateMutation.mutate({ id: editTarget, payload });
    } else {
      createMutation.mutate({ ...payload, field_key: form.field_key });
    }
  };

  const toggleRecordType = (rt) => {
    setForm((f) => {
      const next = f.applicable_record_types.includes(rt)
        ? f.applicable_record_types.filter((t) => t !== rt)
        : [...f.applicable_record_types, rt];
      // Reset section when record types change so the filtered list is fresh
      return { ...f, applicable_record_types: next, section: '', isNewSection: false };
    });
  };

  const addOption    = () => setForm((f) => ({ ...f, options: [...f.options, { value: '', label_en: '', label_hi: '' }] }));
  const removeOption = (i) => setForm((f) => ({ ...f, options: f.options.filter((_, idx) => idx !== i) }));
  const updateOption = (i, key, val) =>
    setForm((f) => ({ ...f, options: f.options.map((o, idx) => idx === i ? { ...o, [key]: val } : o) }));

  const toggleSection    = (key) => setExpandedSections((p) => ({ ...p, [key]: !p[key] }));
  const isSectionExpanded = (key) => expandedSections[key] !== false;

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6 theme-admin-page p-5 rounded-2xl bg-[var(--bg-page-main)] border border-slate-200 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 font-display">
            <Settings className="text-[var(--accent-color)]" />
            Field Registry Manager
          </h1>
          <p className="text-slate-500 text-xs mt-1 font-semibold">
            Define form fields for all police stations or specific districts, no code changes required.
          </p>
        </div>
        {activeTab === 'global' && (
          <button onClick={openCreate}
            className="bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md cursor-pointer border-none active:scale-95">
            <Plus size={14} /> Add Global Field
          </button>
        )}
      </div>
 
      {/* Tabs */}
      <div className="border-b border-slate-200 flex gap-1">
        {[
          { key: 'global',   label: 'Global Field Registry', icon: <Globe size={12} /> },
          { key: 'district', label: 'District Extensions' },
        ].map((tab) => (
          <button key={tab.key} onClick={() => { log.debug('action:field_tab_change', { tab: tab.key }); setActiveTab(tab.key); }}
            className={`px-5 py-3 text-xs font-bold tracking-wide border-b-2 transition-all -mb-[2px] flex items-center gap-1.5 cursor-pointer border-none bg-transparent ${
              activeTab === tab.key
                ? 'border-[var(--accent-color)] text-[var(--accent-color)]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {tab.icon}{tab.label}
            <span className="ml-1 text-[9px] bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded font-mono text-slate-600">
              {tab.key === 'global' ? globalFields.length : districtFields.length}
            </span>
          </button>
        ))}
      </div>
 
      {/* Record type filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-slate-500 text-xs font-semibold">Filter:</span>
        {['ALL', ...RECORD_TYPES].map((type) => (
          <button key={type} onClick={() => setFilterType(type)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
              filterType === type
                ? 'bg-[var(--accent-color)] text-white border-transparent shadow-md'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-800 hover:bg-slate-50'
            }`}>
            {type}
          </button>
        ))}
      </div>
 
      {/* Field list */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent-color)] mb-4" />
          <p className="text-sm">Loading field registry…</p>
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="text-center text-slate-500 py-12 border border-dashed border-slate-200 bg-white rounded-xl shadow-sm">
          <Settings size={40} className="mx-auto mb-3 text-slate-350" />
          <p className="text-sm font-semibold">No fields found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([sectionKey, { fields, title_en }]) => (
            <div key={sectionKey} className="border border-slate-200 bg-white rounded-xl overflow-hidden shadow-sm">
              <button onClick={() => toggleSection(sectionKey)}
                className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 hover:bg-slate-100/65 transition-colors cursor-pointer border-none">
                <span className="text-xs font-bold text-slate-800 tracking-wide uppercase font-display">{title_en || sectionKey}</span>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-550 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded font-mono">
                    {fields.length} fields
                  </span>
                  {isSectionExpanded(sectionKey)
                    ? <ChevronDown size={14} className="text-slate-500" />
                    : <ChevronRight size={14} className="text-slate-500" />}
                </div>
              </button>
 
              {isSectionExpanded(sectionKey) && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="text-slate-500 uppercase font-semibold border-b border-slate-200 bg-slate-50/50 tracking-wider">
                        <th className="p-3 pl-5">Field Key</th>
                        <th className="p-3">Type</th>
                        <th className="p-3">English Label</th>
                        <th className="p-3">Hindi Label</th>
                        <th className="p-3">Applies To</th>
                        <th className="p-3">Req</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {fields.map((f) => (
                        <tr key={f.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3 pl-5 font-mono font-bold text-[var(--accent-color)] text-[11px]">{f.field_key}</td>
                          <td className="p-3">
                            <span className="bg-slate-100 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono">
                              {f.field_type}
                            </span>
                          </td>
                          <td className="p-3 text-slate-750 font-medium">{f.label_en}</td>
                          <td className="p-3 text-slate-500 font-sans">{f.label_hi || '—'}</td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {ensureArray(f.applicable_record_types).map((rt) => (
                                <span key={rt} className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${TYPE_COLORS[rt] || 'text-slate-500 border-slate-200'}`}>
                                  {rt}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="p-3">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                              f.validation_rules?.required
                                ? 'text-red-605 bg-red-50 border-red-200'
                                : 'text-slate-450 border-slate-200 bg-slate-50'
                            }`}>
                              {f.validation_rules?.required ? 'REQ' : 'OPT'}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                              f.is_active
                                ? 'text-emerald-600 border-emerald-250 bg-emerald-50'
                                : 'text-slate-450 border-slate-200 bg-slate-50'
                            }`}>
                              {f.is_active ? 'ACTIVE' : 'INACTIVE'}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <button onClick={() => openEdit(f)} title="Edit"
                                className="text-slate-450 hover:text-[var(--accent-color)] transition-colors cursor-pointer border-none bg-transparent">
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => toggleMutation.mutate(f.id)}
                                title={f.is_active ? 'Deactivate' : 'Activate'}
                                className={`transition-colors cursor-pointer border-none bg-transparent ${f.is_active ? 'text-emerald-500 hover:text-red-450' : 'text-slate-405 hover:text-emerald-500'}`}>
                                {f.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Modal ─────────────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-2xl shadow-2xl">

              {/* Modal header */}
              <div className="flex justify-between items-center bg-zinc-950/80 border-b border-zinc-800 px-5 py-3.5">
                <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                  <Plus size={14} className="text-[#cca43b]" />
                  {editTarget ? 'Edit Field' : 'Add Global Field'}
                </h3>
                <button onClick={closeModal} className="text-zinc-500 hover:text-zinc-200 cursor-pointer">
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">

                {/* Row 1: Key + Type */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-zinc-400 font-semibold">
                      Field Key * <span className="text-zinc-600 font-normal">(snake_case, globally unique)</span>
                    </label>
                    <input type="text" required disabled={!!editTarget}
                      value={form.field_key}
                      onChange={(e) => setForm({ ...form, field_key: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') })}
                      placeholder="e.g. court_hearing_date"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-[#cca43b] font-mono disabled:opacity-50" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-zinc-400 font-semibold">Field Type *</label>
                    <select value={form.field_type} onChange={(e) => setForm({ ...form, field_type: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-[#cca43b] cursor-pointer">
                      {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                {/* Row 2: Labels */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-zinc-400 font-semibold">English Label *</label>
                    <input type="text" required value={form.label_en}
                      onChange={(e) => setForm({ ...form, label_en: e.target.value })}
                      placeholder="e.g. Court Hearing Date"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-[#cca43b]" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-zinc-400 font-semibold">Hindi Label</label>
                    <input type="text" value={form.label_hi}
                      onChange={(e) => setForm({ ...form, label_hi: e.target.value })}
                      placeholder="e.g. न्यायालय सुनवाई तिथि"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-[#cca43b] font-sans" />
                  </div>
                </div>

                {/* Step 1: Pick record types FIRST so sections can filter */}
                <div className="space-y-1.5">
                  <label className="text-zinc-400 font-semibold">
                    Applicable Record Types * <span className="text-zinc-600 font-normal">(select first, sections will filter accordingly)</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {RECORD_TYPES.map((rt) => (
                      <button key={rt} type="button" onClick={() => toggleRecordType(rt)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
                          form.applicable_record_types.includes(rt)
                            ? TYPE_COLORS[rt] || 'text-zinc-200 border-zinc-500 bg-zinc-700'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                        }`}>
                        {rt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Step 2: Section — options filtered by selected record types */}
                <div className="space-y-1.5">
                  <label className="text-zinc-400 font-semibold">Section</label>
                  {form.applicable_record_types.length === 0 ? (
                    <div className="w-full bg-zinc-950/60 border border-zinc-800 rounded-lg p-2.5 text-zinc-600 text-[11px]">
                      Select at least one record type above to see available sections.
                    </div>
                  ) : (
                    <select value={form.isNewSection ? '__new__' : form.section}
                      onChange={(e) => {
                        if (e.target.value === '__new__') {
                          setForm({ ...form, isNewSection: true, section: '' });
                        } else {
                          setForm({ ...form, isNewSection: false, section: e.target.value });
                        }
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-[#cca43b] cursor-pointer">
                      <option value="">Choose a section</option>
                      {knownSections.map((s) => (
                        <option key={s.key} value={s.key}>{s.label || s.key}</option>
                      ))}
                      {!form.isNewSection && form.section && !knownSections.find((s) => s.key === form.section) && (
                        <option value={form.section}>{form.section}</option>
                      )}
                      <option value="__new__">+ Create new section…</option>
                    </select>
                  )}
                </div>

                {form.isNewSection && (
                  <div className="border border-zinc-700/60 rounded-lg p-3 bg-zinc-950/40 space-y-3">
                    <p className="text-zinc-400 font-semibold text-[11px] uppercase tracking-wide">New Section Details</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-zinc-500">Key (snake_case) *</label>
                        <input type="text" required={form.isNewSection}
                          value={form.section}
                          onChange={(e) => setForm({ ...form, section: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') })}
                          placeholder="court_details"
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-zinc-200 outline-none focus:border-[#cca43b] font-mono" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-zinc-500">English Name *</label>
                        <input type="text" required={form.isNewSection}
                          value={form.section_label_en}
                          onChange={(e) => setForm({ ...form, section_label_en: e.target.value })}
                          placeholder="Court Details"
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-zinc-200 outline-none focus:border-[#cca43b]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-zinc-500">Hindi Name</label>
                        <input type="text"
                          value={form.section_label_hi}
                          onChange={(e) => setForm({ ...form, section_label_hi: e.target.value })}
                          placeholder="न्यायालय विवरण"
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-zinc-200 outline-none focus:border-[#cca43b] font-sans" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Options for SELECT type */}
                {form.field_type === 'SELECT' && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-zinc-400 font-semibold">Dropdown Options</label>
                      <button type="button" onClick={addOption}
                        className="text-[11px] text-[#cca43b] hover:text-amber-500 font-bold flex items-center gap-1 cursor-pointer">
                        <Plus size={11} /> Add Option
                      </button>
                    </div>
                    {form.options.map((opt, i) => (
                      <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-center">
                        <input type="text" placeholder="value (stored)" value={opt.value}
                          onChange={(e) => updateOption(i, 'value', e.target.value)}
                          className="bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 outline-none focus:border-[#cca43b] font-mono" />
                        <input type="text" placeholder="English label" value={opt.label_en}
                          onChange={(e) => updateOption(i, 'label_en', e.target.value)}
                          className="bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 outline-none focus:border-[#cca43b]" />
                        <input type="text" placeholder="Hindi label" value={opt.label_hi || ''}
                          onChange={(e) => updateOption(i, 'label_hi', e.target.value)}
                          className="bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 outline-none focus:border-[#cca43b] font-sans" />
                        <button type="button" onClick={() => removeOption(i)}
                          className="text-zinc-600 hover:text-red-400 cursor-pointer">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Meta */}
                <div className="flex items-center justify-between pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.is_required}
                      onChange={(e) => setForm({ ...form, is_required: e.target.checked })}
                      className="accent-[#cca43b]" />
                    <span className="text-zinc-400 font-semibold">Mark as required</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="text-zinc-500">Sort order</label>
                    <input type="number" value={form.sort_order}
                      onChange={(e) => setForm({ ...form, sort_order: parseInt(e.target.value) || 0 })}
                      className="w-20 bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 outline-none focus:border-[#cca43b] text-center" />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                  <button type="button" onClick={closeModal}
                    className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg font-semibold cursor-pointer">
                    Cancel
                  </button>
                  <button type="submit" disabled={isPending}
                    className="bg-[#cca43b] hover:bg-amber-600 text-zinc-950 px-5 py-2 rounded-lg font-bold shadow-md cursor-pointer disabled:opacity-60">
                    {isPending
                      ? (editTarget ? 'Saving…' : 'Publishing…')
                      : (editTarget ? 'Save Changes' : 'Publish Field')}
                  </button>
                </div>

              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
