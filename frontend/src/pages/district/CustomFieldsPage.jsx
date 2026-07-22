import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers, Plus, X, ToggleLeft, ToggleRight, Pencil, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import api from '../../utils/api.js';
import useAuthStore from '../../store/authStore.js';
import { log } from '../../utils/logger.js';

const ensureArray = (val) => (Array.isArray(val) ? val : []);

const RECORD_TYPES = ['CASE', 'ARREST', 'PCR_CALL', 'MISSING', 'UIDB'];
const FIELD_TYPES  = ['TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'DATETIME', 'SELECT', 'BOOLEAN'];

const SECTION_LABELS = {
  // Case sections
  general_info: { en: 'General Information', hi: 'सामान्य जानकारी' },
  incident_details: { en: 'Incident Details', hi: 'घटना का विवरण' },
  offence_info: { en: 'Offence Information', hi: 'अपराध की जानकारी' },
  occurrence_info: { en: 'Occurrence of Offence', hi: 'घटना का समय व प्रकार' },
  complainant_personal_info: { en: 'Complainant (Personal)', hi: 'शिकायतकर्ता (व्यक्तिगत)' },
  complainant_accused_info: { en: 'Complainant Details', hi: 'शिकायतकर्ता का विवरण' },
  complainant_address: { en: 'Complainant Address', hi: 'शिकायतकर्ता का पता' },
  brief_facts: { en: 'FIR Contents', hi: 'प्राथमिकी विवरण' },
  victim_personal_info: { en: 'Victim (Personal)', hi: 'पीड़ित (व्यक्तिगत)' },
  victim_address: { en: 'Victim Address', hi: 'पीड़ित का पता' },
  accused_personal_info: { en: 'Accused (Personal)', hi: 'आरोपी (व्यक्तिगत)' },
  accused_address: { en: 'Accused Address', hi: 'आरोपी का पता' },
  property_details: { en: 'Property Details', hi: 'संपत्ति का विवरण' },
  recovered_property: { en: 'Recovered Property', hi: 'बरामद संपत्ति' },
  stolen_property: { en: 'Stolen Property', hi: 'चोरी हुई संपत्ति' },
  action_taken: { en: 'Action Taken', hi: 'की गई कार्रवाई' },

  // Arrest sections
  arrest_details: { en: 'Arrest Details', hi: 'गिरफ्तारी का विवरण' },
  arrested_personal_info: { en: 'Arrested (Personal)', hi: 'गिरफ्तार व्यक्ति (व्यक्तिगत)' },
  arrested_address: { en: 'Arrested Address', hi: 'गिरफ्तार व्यक्ति का पता' },
  arrestee_info: { en: 'Arrestee Details', hi: 'गिरफ्तार व्यक्ति का विवरण' },
  custody_status: { en: 'Custody Status', hi: 'हिरासत की स्थिति' },
  // intimation_details: { en: 'Intimation Details', hi: 'सूचना का विवरण' },
  // intimation_address: { en: 'Intimation Address', hi: 'सूचना का पता' },

  // UIDB sections
  corpse_desc: { en: 'Deceased Description', hi: 'मृतक का विवरण' },
  corpse_physical: { en: 'Deceased Physical Features', hi: 'मृतक की शारीरिक विशेषताएँ' },
  inquest_details: { en: 'Inquest Details', hi: 'जांच विवरण' },
  uidb_details: { en: 'UIDB Details', hi: 'UIDB विवरण' },

  // Missing sections
  person_details: { en: 'Missing Person Particulars', hi: 'लापता व्यक्ति का विवरण' },
  missing_address: { en: 'Missing Address', hi: 'लापता होने का स्थान/पता' },
  missing_physical: { en: 'Missing Physical Description', hi: 'लापता व्यक्ति का हुलिया' },
  contacts_assigned: { en: 'Contacts Assigned', hi: 'संपर्क विवरण' },

  // Common
  investigation_officer: { en: 'Investigation Officer', hi: 'जांच अधिकारी' },
  vehicle_details: { en: 'Vehicle Details', hi: 'वाहन का विवरण' },
  financial_fraud: { en: 'Financial Fraud', hi: 'वित्तीय धोखाधड़ी' },
  special_scheme: { en: 'Special Scheme', hi: 'विशेष योजना' },
  procedure_slips: { en: 'Procedure Slips', hi: 'प्रक्रिया पर्ची' }
};

const getSectionLabel = (key, lang = 'en', fallbackObj = null) => {
  const item = SECTION_LABELS[key];
  if (item) {
    return lang === 'hi' ? (item.hi || item.en) : item.en;
  }
  if (fallbackObj) {
    return lang === 'hi' ? (fallbackObj.label_hi || fallbackObj.label_en) : fallbackObj.label_en;
  }
  return key;
};

const TYPE_COLORS = {
  CASE:     'text-blue-400 border-blue-800/40 bg-blue-950/30',
  ARREST:   'text-red-400 border-red-800/40 bg-red-950/30',
  PCR_CALL: 'text-amber-400 border-amber-800/40 bg-amber-950/30',
  MISSING:  'text-violet-400 border-violet-800/40 bg-violet-950/30',
  UIDB:     'text-zinc-400 border-zinc-600/40 bg-zinc-800/30',
};

const emptyForm = () => ({
  field_key: '', label_en: '', label_hi: '', field_type: 'TEXT',
  section: '', section_label_en: '', section_label_hi: '',
  isNewSection: false,
  applicable_record_types: [],
  is_required: false, sort_order: 0,
  options: [],
});

// Extracts unique {key, label_en, label_hi} section pairs from a flat field list,
// filtered to those matching the selected record types.
function sectionsFromFields(fieldList, selectedTypes) {
  const seen = new Set();
  const upperTypes = selectedTypes.map((t) => t.toUpperCase());

  const relevant = upperTypes.length > 0
    ? fieldList.filter((f) =>
        ensureArray(f.applicable_record_types).some((rt) => upperTypes.includes(rt.toUpperCase()))
      )
    : fieldList;

  return relevant
    .map((f) => ({
      key: f.section,
      label_en: f.section_label_en || f.section,
      label_hi: f.section_label_hi || f.section_label_en || f.section
    }))
    .filter((s) => s.key && !seen.has(s.key) && seen.add(s.key));
}

export default function CustomFieldsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [showModal,  setShowModal]  = useState(false);
  const [form,       setForm]       = useState(emptyForm());
  const [editTarget, setEditTarget] = useState(null);
  const [filterType, setFilterType] = useState('ALL');

  useEffect(() => {
    log.debug('page:mount', { route: '/district/custom-fields', userId: user?.id, role: user?.role });
    return () => log.debug('page:unmount', { route: '/district/custom-fields' });
  }, []);

  // District-scoped fields — shown in the management table
  const { data: fields = [], isLoading } = useQuery({
    queryKey: ['district', 'fields', user?.district_id],
    queryFn: async () => {
      log.debug('data:load_start', { what: 'district_fields' });
      try {
        const res = await api.get('/fields');
        const rows = res.data?.data?.fields || [];
        log.debug('data:load_success', { what: 'district_fields', count: rows.length });
        return rows;
      } catch (err) {
        log.error('data:load_error', { what: 'district_fields', err });
        throw err;
      }
    },
    staleTime: 60_000,
    enabled: !!user,
  });

  // Global fields — used only for section discovery in the modal
  const { data: globalFields = [] } = useQuery({
    queryKey: ['district', 'fields', 'global-sections'],
    queryFn: async () => {
      const res = await api.get('/fields?scope=global');
      return res.data?.data?.fields || [];
    },
    staleTime: 5 * 60_000,
    enabled: !!user,
  });

  const filtered = filterType === 'ALL'
    ? fields
    : fields.filter((f) => ensureArray(f.applicable_record_types).map((t) => t.toUpperCase()).includes(filterType));

  // Sections come from the global registry (primary) + existing district fields (secondary),
  // filtered to the record types currently selected in the form.
  const knownSections = useMemo(() => {
    const combined = [...globalFields, ...fields];
    return sectionsFromFields(combined, form.applicable_record_types);
  }, [globalFields, fields, form.applicable_record_types]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (payload) => { log.info('action:field_create_start', { fieldKey: payload.field_key }); return api.post('/fields', payload); },
    onSuccess: (res, payload) => {
      log.info('action:field_create_success', { fieldKey: payload.field_key });
      toast.success('Custom field published for your district');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['district', 'fields'] });
    },
    onError: (err, payload) => {
      log.error('action:field_create_failed', { fieldKey: payload?.field_key, err });
      toast.error(err.response?.data?.message || 'Failed to create field');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }) => { log.info('action:field_update_start', { fieldId: id }); return api.patch(`/fields/${id}`, payload); },
    onSuccess: (res, { id }) => {
      log.info('action:field_update_success', { fieldId: id });
      toast.success('Field updated');
      closeModal();
      queryClient.invalidateQueries({ queryKey: ['district', 'fields'] });
    },
    onError: (err, { id }) => {
      log.error('action:field_update_failed', { fieldId: id, err });
      toast.error(err.response?.data?.message || 'Failed to update field');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id) => { log.debug('action:field_toggle_start', { fieldId: id }); return api.patch(`/fields/${id}/toggle`); },
    onSuccess: (res, id) => { log.info('action:field_toggle_success', { fieldId: id }); queryClient.invalidateQueries({ queryKey: ['district', 'fields'] }); },
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
    if (form.isNewSection && !form.section)   { toast.error('Section key is required'); return; }

    const payload = {
      label_en:                form.label_en,
      label_hi:                form.label_hi,
      field_type:              form.field_type,
      section:                 form.section || 'district_custom',
      section_label_en:        form.section_label_en || undefined,
      section_label_hi:        form.section_label_hi || undefined,
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
      // Reset section when record types change so filtered list is fresh
      return { ...f, applicable_record_types: next, section: '', isNewSection: false };
    });
  };

  const addOption    = () => setForm((f) => ({ ...f, options: [...f.options, { value: '', label_en: '', label_hi: '' }] }));
  const removeOption = (i) => setForm((f) => ({ ...f, options: f.options.filter((_, idx) => idx !== i) }));
  const updateOption = (i, key, val) =>
    setForm((f) => ({ ...f, options: f.options.map((o, idx) => idx === i ? { ...o, [key]: val } : o) }));

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6 theme-district-page p-5 rounded-2xl bg-[var(--bg-page-main)] border border-slate-200 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2 font-display">
            <Layers className="text-[var(--accent-color)]" />
            District Custom Fields
          </h1>
          <p className="text-slate-500 text-xs mt-1 flex items-center gap-1 font-semibold">
            <MapPin size={11} className="text-[var(--accent-color)]" />
            Fields defined here are visible only within your district jurisdiction.
          </p>
        </div>
        <button onClick={openCreate}
          className="bg-[var(--accent-color)] hover:bg-[var(--accent-color-hover)] text-white px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-md cursor-pointer border-none active:scale-95">
          <Plus size={14} /> Add District Field
        </button>
      </div>
 
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Fields', value: fields.length },
          { label: 'Active',       value: fields.filter((f) => f.is_active).length },
          { label: 'Inactive',     value: fields.filter((f) => !f.is_active).length },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-slate-800">{s.value}</div>
            <div className="text-slate-500 text-xs mt-0.5 font-semibold">{s.label}</div>
          </div>
        ))}
      </div>
 
      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-slate-500 text-xs font-semibold">Filter:</span>
        {['ALL', ...RECORD_TYPES].map((type) => (
          <button key={type} onClick={() => setFilterType(type)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer border ${
              filterType === type
                ? 'bg-[var(--accent-color)] text-white border-transparent shadow-md shadow-red-500/10'
                : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-800 hover:bg-slate-50'
            }`}>
            {type}
          </button>
        ))}
      </div>
 
      {/* Table */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center p-12 text-slate-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--accent-color)] mb-4" />
          <p className="text-sm">Loading district fields…</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="border border-dashed border-slate-200 bg-white rounded-xl p-16 text-center text-slate-500">
          <Layers size={48} className="mx-auto text-slate-350 mb-3" />
          <p className="text-sm font-semibold">No district fields defined</p>
          <p className="text-xs text-slate-450 mt-1">Click "Add District Field" to extend forms for your jurisdiction.</p>
        </div>
      ) : (
        <div className="border border-slate-200 bg-white rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 tracking-wider">
                  <th className="p-3.5 pl-5">Field Key</th>
                  <th className="p-3.5">English Label</th>
                  <th className="p-3.5">Hindi Label</th>
                  <th className="p-3.5">Type</th>
                  <th className="p-3.5">Section</th>
                  <th className="p-3.5">Applies To</th>
                  <th className="p-3.5">Req</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-600">
                {filtered.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-3.5 pl-5 font-mono font-bold text-[var(--accent-color)] text-[11px]">{f.field_key}</td>
                    <td className="p-3.5 font-medium text-slate-700">{f.label_en}</td>
                    <td className="p-3.5 text-slate-500 font-sans">{f.label_hi || '—'}</td>
                    <td className="p-3.5">
                      <span className="bg-slate-150 border border-slate-200 text-slate-500 px-1.5 py-0.5 rounded text-[9px] font-bold font-mono">
                        {f.field_type}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-500 text-[11px] font-medium">
                      {getSectionLabel(f.section, i18n.language, { label_en: f.section_label_en, label_hi: f.section_label_hi })}
                    </td>
                    <td className="p-3.5">
                      <div className="flex flex-wrap gap-1">
                        {ensureArray(f.applicable_record_types).map((rt) => (
                          <span key={rt} className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${TYPE_COLORS[rt] || 'text-slate-500 border-slate-200'}`}>
                            {rt}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-3.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                        f.validation_rules?.required
                          ? 'text-red-600 bg-red-50 border-red-200'
                          : 'text-slate-400 border-slate-200'
                      }`}>
                        {f.validation_rules?.required ? 'REQ' : 'OPT'}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                        f.is_active
                          ? 'text-emerald-600 border-emerald-250 bg-emerald-50'
                          : 'text-slate-400 border-slate-200 bg-slate-50'
                      }`}>
                        {f.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEdit(f)} title="Edit"
                          className="text-slate-450 hover:text-[var(--accent-color)] transition-colors cursor-pointer border-none bg-transparent">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => toggleMutation.mutate(f.id)}
                          title={f.is_active ? 'Deactivate' : 'Activate'}
                          className={`transition-colors cursor-pointer border-none bg-transparent ${f.is_active ? 'text-emerald-500 hover:text-red-400' : 'text-slate-400 hover:text-emerald-500'}`}>
                          {f.is_active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal ─────────────────────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl w-full max-w-2xl shadow-2xl">

              <div className="flex justify-between items-center bg-zinc-950/80 border-b border-zinc-800 px-5 py-3.5">
                <h3 className="text-sm font-bold text-zinc-200 flex items-center gap-2">
                  <Plus size={14} className="text-[#cca43b]" />
                  {editTarget ? 'Edit District Field' : 'Add District Field'}
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
                      Field Key * <span className="text-zinc-600 font-normal">(globally unique)</span>
                    </label>
                    <input type="text" required disabled={!!editTarget}
                      value={form.field_key}
                      onChange={(e) => setForm({ ...form, field_key: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') })}
                      placeholder="e.g. central_court_date"
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

                {/* Labels */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-zinc-400 font-semibold">English Label *</label>
                    <input type="text" required value={form.label_en}
                      onChange={(e) => setForm({ ...form, label_en: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-[#cca43b]" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-zinc-400 font-semibold">Hindi Label</label>
                    <input type="text" value={form.label_hi}
                      onChange={(e) => setForm({ ...form, label_hi: e.target.value })}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-[#cca43b] font-sans" />
                  </div>
                </div>

                {/* Step 1: Record types first */}
                <div className="space-y-1.5">
                  <label className="text-zinc-400 font-semibold">
                    Applicable Record Types * <span className="text-zinc-600 font-normal">(select first — sections will filter accordingly)</span>
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

                {/* Step 2: Section — filtered by selected record types */}
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
                          setForm({ ...form, isNewSection: true, section: '', section_label_en: '', section_label_hi: '' });
                        } else {
                          setForm({ ...form, isNewSection: false, section: e.target.value });
                        }
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-200 outline-none focus:border-[#cca43b] cursor-pointer">
                      <option value="">— choose a section —</option>
                      {knownSections.map((s) => (
                        <option key={s.key} value={s.key}>
                          {getSectionLabel(s.key, i18n.language, s) || s.key}
                        </option>
                      ))}
                      {!form.isNewSection && form.section && !knownSections.find((s) => s.key === form.section) && (
                        <option value={form.section}>
                          {getSectionLabel(form.section, i18n.language) || form.section}
                        </option>
                      )}
                      <option value="__new__">+ Create new section…</option>
                    </select>
                  )}
                </div>

                {form.isNewSection && (
                  <div className="border border-zinc-700/60 rounded-lg p-3 bg-zinc-950/40 space-y-3">
                    <p className="text-zinc-400 font-semibold text-[11px] uppercase tracking-wide">New Section</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-zinc-500">Key (snake_case) *</label>
                        <input type="text" required={form.isNewSection} value={form.section}
                          onChange={(e) => setForm({ ...form, section: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') })}
                          placeholder="district_legal"
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-zinc-200 outline-none focus:border-[#cca43b] font-mono" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-zinc-500">English Name *</label>
                        <input type="text" required={form.isNewSection} value={form.section_label_en}
                          onChange={(e) => setForm({ ...form, section_label_en: e.target.value })}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-zinc-200 outline-none focus:border-[#cca43b]" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-zinc-500">Hindi Name</label>
                        <input type="text" value={form.section_label_hi}
                          onChange={(e) => setForm({ ...form, section_label_hi: e.target.value })}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-2 text-zinc-200 outline-none focus:border-[#cca43b] font-sans" />
                      </div>
                    </div>
                  </div>
                )}

                {/* SELECT options */}
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
                        <input type="text" placeholder="value" value={opt.value}
                          onChange={(e) => updateOption(i, 'value', e.target.value)}
                          className="bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 outline-none focus:border-[#cca43b] font-mono" />
                        <input type="text" placeholder="English label" value={opt.label_en}
                          onChange={(e) => updateOption(i, 'label_en', e.target.value)}
                          className="bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 outline-none focus:border-[#cca43b]" />
                        <input type="text" placeholder="Hindi label" value={opt.label_hi || ''}
                          onChange={(e) => updateOption(i, 'label_hi', e.target.value)}
                          className="bg-zinc-950 border border-zinc-800 rounded p-2 text-zinc-200 outline-none focus:border-[#cca43b] font-sans" />
                        <button type="button" onClick={() => removeOption(i)}
                          className="text-zinc-600 hover:text-red-400 cursor-pointer"><X size={14} /></button>
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

                <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800">
                  <button type="button" onClick={closeModal}
                    className="bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-lg font-semibold cursor-pointer">
                    Cancel
                  </button>
                  <button type="submit" disabled={isPending}
                    className="bg-[#cca43b] hover:bg-amber-600 text-zinc-950 px-5 py-2 rounded-lg font-bold shadow-md cursor-pointer disabled:opacity-60">
                    {isPending ? 'Saving…' : (editTarget ? 'Save Changes' : 'Publish Field')}
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
