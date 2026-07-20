import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, AlertTriangle, AlertCircle, Search, Calendar, User, Check, Database, Plus, X, Bookmark } from 'lucide-react';
import toast from 'react-hot-toast';

import { useFormSchema } from '../../hooks/useFormSchema.js';
import { useAutosave } from '../../hooks/useAutosave.js';
import useAuthStore from '../../store/authStore.js';
import { findNodeById } from '../../utils/hierarchyData.js';
import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api.js';

import FormSection, { evaluateShowWhen } from './FormSection.jsx';
import FormToolbar from './FormToolbar.jsx';
import FormAutosave from './FormAutosave.jsx';
import FieldRenderer from './FieldRenderer.jsx';
import SearchableSelect from './SearchableSelect.jsx';
import DateInput from '../ui/DateInput.jsx';
import { parseDMY, formatDMY } from '../../utils/dateFormat.js';
import ActsSectionsTable from './ActsSectionsTable.jsx';
import { validateFieldPattern } from '../../utils/fieldPatterns.js';
/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function parseRules(rawRules) {
  if (!rawRules) return {};
  if (typeof rawRules === 'object') return rawRules;
  try { return JSON.parse(rawRules); } catch { return {}; }
}
function getFieldOptions(fieldsArr, key) {
  const field = fieldsArr.find((f) => f.field_key === key);
  if (!field?.options) return [];
  if (Array.isArray(field.options)) return field.options;
  try {
    const parsed = JSON.parse(field.options);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const PERM_ADDRESS_FIELDS = ['house_no', 'street', 'colony', 'city_town_village', 'tehsil_block_mandal', 'country', 'state', 'district', 'police_station', 'pincode'];

/**
 * Shared by Victim/Accused/Complainant/Arrested's "Permanent address same as Present"
 * toggle: one-time bulk copy the moment the toggle flips on, then live-mirror any further
 * present-address edits into their permanent-address twin while it stays on. Mutates `next`
 * in place (matches how every call site already builds up `next` before returning it).
 * `extraFields` lets a prefix add pairs beyond the standard 10 (Arrested also has
 * present_address -> perm_address).
 */
function syncPermAddress(next, prefix, key, val, extraFields = []) {
  const sameKey = `${prefix}_perm_same`;
  const fields = [...PERM_ADDRESS_FIELDS.map(f => ({ from: f, to: f })), ...extraFields];

  if (key === sameKey && (val === true || val === 'Yes')) {
    fields.forEach(({ from, to }) => {
      next[`${prefix}_perm_${to}`] = next[`${prefix}_${from}`] || (to === 'country' ? 'Indian' : '');
    });
  }

  if (next[sameKey] === true || next[sameKey] === 'Yes') {
    fields.forEach(({ from, to }) => {
      if (key === `${prefix}_${from}`) next[`${prefix}_perm_${to}`] = val;
    });
  }
}

/**
 * Wizard step order per record type, keyed by the backend's `section` value
 * 'select_fir' is a synthetic step (see finalSchema) not present in the backend response.
 */
const SECTION_KEY_ORDER = {
  CASE: ['acts_and_sections', 'occurrence_info', 'complainant_info', 'fir_contents', 'victim_info', 'accused_info', 'property_details', 'action_taken'],
  ARREST: ['select_fir', 'general_info', 'arrested_info', 'property_details', 'investigation_officer'],
  UIDB: ['general_info', 'corpse_desc', 'corpse_physical', 'inquest_details', 'investigation_officer'],
  MISSING: ['general_info', 'person_details', 'missing_address', 'missing_physical', 'contacts_assigned', 'investigation_officer'],
};

// Repeater sections need is_repeater/entity_type/person_type so the person/property
// add-edit-delete modals and the final-submit persons/properties builder can find them.
const REPEATER_SECTION_META = {
  property_details: { is_repeater: true, entity_type: 'property' },
  arrested_info: { is_repeater: true, entity_type: 'person', person_type: 'ARRESTED' },
  victim_info: { is_repeater: true, entity_type: 'person', person_type: 'VICTIM' },
  accused_info: { is_repeater: true, entity_type: 'person', person_type: 'ACCUSED' },
};

/** Sections with sub_tabs (Complainant/Victim/Accused/Arrested) don't carry
 * a flat `fields` array — concatenate every sub-tab's fields for validation purposes. */
function flattenSectionFields(section) {
  if (!section) return [];
  if (section.sub_tabs?.length) {
    return section.sub_tabs.reduce((acc, st) => [...acc, ...(st.fields || [])], []);
  }
  return section.fields || [];
}

/**
 * Flat list of every field across every schema section, INCLUDING sub_tab-nested
 * fields (Complainant/Victim/Accused/Arrested sections carry their fields
 * under `sub_tabs[].fields`, not a top-level `.fields` array — a plain
 * `sec.fields || []` reduce silently drops all of them).
 */
function deepFlattenSchema(schema) {
  if (!schema) return [];
  return schema.reduce((acc, sec) => [...acc, ...flattenSectionFields(sec)], []);
}

/* ─── StepDot ─────────────────────────────────────────────────────────────── */
function StepDot({ index, active, completed, hasError, title, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center gap-1 cursor-pointer outline-none"
      title={title}
    >
      <span className={`
        flex items-center justify-center w-8 h-8 rounded-full border-2 text-xs font-bold transition-all duration-300
        ${active
          ? 'bg-[var(--accent-color)] border-[var(--accent-color)] text-white shadow-md shadow-[var(--accent-glow)] scale-110'
          : hasError
            ? 'bg-red-50 border-red-500 text-red-600'
            : completed
              ? 'bg-emerald-50 border-emerald-500 text-emerald-600'
              : 'bg-white border-slate-300 text-slate-400 group-hover:border-slate-400 group-hover:text-slate-600'
        }
      `}>
        {completed && !active ? <CheckCircle2 size={14} /> : index + 1}
      </span>
      <span className={`text-[11px] font-semibold max-w-[90px] text-center leading-tight hidden sm:block transition-colors ${active ? 'text-[var(--accent-color)]' : hasError ? 'text-red-600' : 'text-slate-400'
        }`}>
        {title}
      </span>
    </button>
  );
}

const MOCK_FIR_LIST = [
  { fir_no: '104/2026', fir_date: '20/06/2026', complainant_name: 'Ramesh Singh', police_station: 'Parliament Street', crime_head: 'House Theft', sections: 'Sec 379 IPC' },
  { fir_no: '112/2026', fir_date: '19/06/2026', complainant_name: 'Sunita Devi', police_station: 'Chanakyapuri', crime_head: 'Murder', sections: 'Sec 302 IPC' },
  { fir_no: '125/2026', fir_date: '18/06/2026', complainant_name: 'Amit Kumar', police_station: 'Mandir Marg', crime_head: 'Simple Hurt', sections: 'Sec 323 IPC' },
  { fir_no: '150/2026', fir_date: '21/06/2026', complainant_name: 'Gurpreet Singh', police_station: 'Tughlak Road', crime_head: 'Cheating', sections: 'Sec 406 IPC' },
  { fir_no: '201/2026', fir_date: '21/06/2026', complainant_name: 'Vikram Singh', police_station: 'Parliament Street', crime_head: 'Robbery', sections: 'Sec 392 IPC' },
  { fir_no: '88/2026', fir_date: '20/06/2026', complainant_name: 'Manish Sharma', police_station: 'Chanakyapuri', crime_head: 'Delhi Excise Act', sections: 'Sec 33/38 Excise Act' },
  { fir_no: '92/2026', fir_date: '20/06/2026', complainant_name: 'Priyanka Sen', police_station: 'Mandir Marg', crime_head: 'Snatching', sections: 'Sec 356/379 IPC' },
];

// Maps UI act display names -> schema show_when values used in major_head fields
const ACT_NAME_ALIAS = {
  'Indian Penal Code (IPC)': 'IPC',
  'IPC': 'IPC',
  'Arms Act': 'Arms Act',
  'Delhi Excise Act': 'Delhi Excise Act',
  'Gambling Act': 'Gambling Act',
  'NDPS Act': 'NDPS Act',
  'Motor Vehicles Act': 'Motor Vehicles Act',
  'Information Technology Act (IT Act)': 'Other Act',
  'Other Act': 'Other Act',
};

/**
 * DynamicForm
 *
 * @param {string}   recordType        - 'CASE' | 'ARREST' | 'PCR_CALL' | 'MISSING' | 'UIDB'
 * @param {object}   initialValues     - Pre-populated data (from existing record.data or record object)
 * @param {Array}    initialPersons    - Pre-populated person entries [{person_type, data}]
 * @param {Array}    initialProperties - Pre-populated property entries [{major_category, ...}]
 * @param {function} onSubmit          - Final submit callback(formValues, persons, properties, activeRecordId)
 * @param {boolean}  readOnly          - Lock all inputs for review
 * @param {string[]} targetFields      - Field keys flagged for correction (send-back)
 */
export default function DynamicForm({
  recordType,
  initialValues = {},
  initialPersons = [],
  initialProperties = [],
  onSubmit,
  readOnly = false,
  targetFields = [],
  caseType = null,
  onBack = null,
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const navigate = useNavigate();

  const { user } = useAuthStore();
  const getThemeClass = (role) => {
    switch (role) {
      case 'HC': return 'theme-hc-page';
      case 'SHO': return 'theme-sho-page';
      case 'ACP': return 'theme-acp-page';
      case 'DISTRICT_OFFICER': return 'theme-district-page';
      case 'HQ_ANALYST':
      case 'HQ_ADMIN': return 'theme-hq-page';
      case 'SYSTEM_ADMIN': return 'theme-admin-page';
      default: return 'theme-shared-page';
    }
  };
  const themeClass = getThemeClass(user?.role);
  const { schema, isLoading, isError, schemaError } = useFormSchema(recordType, caseType);
  const activeRecordIdRef = useRef(initialValues?.id || null);

  // FIR Search State
  const [searchDate, setSearchDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Fetch existing cases to populate FIR dropdown dynamically
  const { data: casesData = [] } = useQuery({
    queryKey: ['records', 'cases-list'],
    queryFn: async () => {
      try {
        const res = await api.get('/records');
        const payload = res.data?.data;
        let cases = [];
        if (payload?.cases) cases = payload.cases;
        else if (payload?.queue) cases = payload.queue;
        else if (Array.isArray(payload)) cases = payload;
        else if (Array.isArray(res.data)) cases = res.data;
        return cases.filter(c => c.record_type === 'CASE');
      } catch (err) {
        console.error('Failed to load cases', err);
        return [];
      }
    },
    enabled: recordType === 'ARREST' && caseType === 'against_fir',
  });

  const handleFirSearch = () => {
    if (!searchDate) {
      setSearchError(lang === 'hi' ? 'एफआईआर दिनांक चुनना अनिवार्य है।' : 'FIR Date is required.');
      return;
    }
    setSearchError('');

    // Real backend cases only; MOCK_FIR_LIST is a fallback for when the backend has none
    // (e.g. dev/demo environments), not something to permanently mix into live results.
    const backendCases = (casesData || []).map(c => ({
      fir_no: c.data?.fir_no || c.fir_no || `FIR No. ${c.id}`,
      fir_date: c.data?.fir_date || c.fir_date || c.record_date,
      complainant_name: c.data?.complainant_name || c.complainant_name || 'N/A',
      police_station: c.data?.police_station || c.police_station || 'Unknown',
      crime_head: c.data?.local_head || c.data?.crime_head || c.local_head || c.crime_head || 'N/A',
      sections: c.data?.sections || c.sections || 'N/A',
      isBackend: true
    }));
    const unifiedCases = backendCases.length > 0 ? backendCases : MOCK_FIR_LIST;

    // Filter unified list
    const filtered = unifiedCases.filter(c => {
      // Date exact match — both sides are dd/mm/yyyy
      const sDate = formatDMY(parseDMY(searchDate)) || searchDate;
      const cDate = formatDMY(parseDMY(c.fir_date)) || c.fir_date;
      if (cDate !== sDate) return false;

      // Query (complainant name or FIR no) match
      if (searchQuery) {
        const q = searchQuery.toLowerCase().trim();
        const matchesComplainant = c.complainant_name ? c.complainant_name.toLowerCase().includes(q) : false;
        const matchesFirNo = c.fir_no ? c.fir_no.toLowerCase().includes(q) : false;
        if (!matchesComplainant && !matchesFirNo) return false;
      }
      return true;
    });

    setSearchResults(filtered);
    setHasSearched(true);
  };

  const renderFirSearchStep = () => {
    const title = lang === 'hi' ? 'प्राथमिकी (FIR) खोजें और लिंक करें' : 'Search & Link First Information Report (FIR)';
    const dateLabel = lang === 'hi' ? 'प्राथमिकी दिनांक (FIR Date) *' : 'FIR Date *';
    const queryLabel = lang === 'hi' ? 'शिकायतकर्ता का नाम / प्राथमिकी संख्या (वैकल्पिक)' : 'Complainant Name / FIR No. (Optional)';
    const queryPlaceholder = lang === 'hi' ? 'खोजने के लिए लिखें...' : 'Type to search...';
    const btnText = lang === 'hi' ? 'प्राथमिकी खोजें' : 'Search FIR';

    const selectedFir = values.selected_fir;
    const currentAct = values.act_name || 'IPC';

    const currentSections = values.sections ? String(values.sections) : '';

    // Parse sections list
    const sectionsList = currentSections
      ? currentSections.split(/[\/,]/).map(s => s.trim()).filter(Boolean)
      : [];

    const handleAddSection = () => {
      const cleanSecs = newSectionVal.split(/[\/,]/).map(s => s.trim()).filter(Boolean);
      if (!cleanSecs.length) return;
      
      const updatedList = [...sectionsList];
      cleanSecs.forEach(sec => {
        if (!updatedList.includes(sec)) {
          updatedList.push(sec);
        }
      });
      
      handleChange('sections', updatedList.join(', '));
      setNewSectionVal('');
    };

    const handleRemoveSection = (secToRemove) => {
      const updatedList = sectionsList.filter(s => s !== secToRemove);
      handleChange('sections', updatedList.join(', '));
    };

    return (
      <div className="space-y-6">
        {/* Search Panel Card */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Mandatory Date Field */}
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 tracking-wide">
                  <Calendar size={14} className="text-slate-400" />
                  <span>{dateLabel}</span>
                </label>
                <DateInput
                  disabled={readOnly}
                  value={searchDate}
                  onChange={(val) => {
                    setSearchDate(val);
                    if (searchError) setSearchError('');
                  }}
                  status={searchError ? 'error' : undefined}
                  inputClassName={`w-full bg-white border-2 border-slate-200 text-slate-800 text-sm px-3.5 py-2.5 pr-9 rounded-xl outline-none focus:border-[var(--accent-color)] transition-all ${searchError ? 'border-red-400 focus:border-red-500 bg-red-50' : ''
                    }`}
                />
                {searchError && (
                  <span className="flex items-center gap-1 text-xs text-red-500 font-medium mt-1">
                    <AlertCircle size={12} className="flex-shrink-0" />
                    {searchError}
                  </span>
                )}
              </div>

              {/* Optional Name / FIR No Field */}
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-700 tracking-wide">
                  <Search size={14} className="text-slate-400" />
                  <span>{queryLabel}</span>
                </label>
                <input
                  type="text"
                  disabled={readOnly}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={queryPlaceholder}
                  className="w-full bg-white border-2 border-slate-200 text-slate-800 text-sm px-3.5 py-2.5 rounded-xl outline-none focus:border-[var(--accent-color)] transition-all placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Action button */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleFirSearch}
                className="flex items-center gap-2 px-6 py-2.5 bg-[var(--accent-color)] hover:bg-[var(--accent-color)]/90 text-white font-bold text-sm rounded-xl transition-all shadow-md shadow-[var(--accent-glow)] active:scale-95 cursor-pointer"
              >
                <Search size={16} />
                <span>{btnText}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Results Card */}
        {hasSearched && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden transition-all duration-300">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800 tracking-wide flex items-center gap-2 font-display">
                <Database size={16} className="text-[var(--accent-color)]" />
                <span>
                  {lang === 'hi' ? 'खोज परिणाम' : 'Search Results'} ({searchResults.length})
                </span>
              </h3>
            </div>

            {searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-12 text-slate-400 gap-2">
                <AlertCircle size={28} className="text-slate-300" />
                <p className="text-sm font-bold">
                  {lang === 'hi' ? 'कोई परिणाम नहीं मिला' : 'No FIR records found'}
                </p>
                <p className="text-xs text-slate-400">
                  {lang === 'hi' ? 'कृपया अलग तिथि या शिकायतकर्ता नाम आज़माएं।' : 'Try using a different date or checking the complainant details.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-400 text-[11px] font-extrabold uppercase tracking-wider">
                      <th className="px-6 py-3.5">{lang === 'hi' ? 'प्राथमिकी संख्या' : 'FIR Number'}</th>
                      <th className="px-6 py-3.5">{lang === 'hi' ? 'दिनांक' : 'Date'}</th>
                      <th className="px-6 py-3.5">{lang === 'hi' ? 'शिकायतकर्ता' : 'Complainant'}</th>
                      <th className="px-6 py-3.5">{lang === 'hi' ? 'थाना' : 'Police Station'}</th>
                      <th className="px-6 py-3.5">{lang === 'hi' ? 'अपराध शीर्ष' : 'Crime Head'}</th>
                      <th className="px-6 py-3.5">{lang === 'hi' ? 'धाराएं' : 'Sections'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {searchResults.map((row) => {
                      const isSelected = values.selected_fir === row.fir_no;
                      return (
                        <tr
                          key={row.fir_no}
                          onClick={() => {
                            if (readOnly) return;

                            // Find the full details from row or casesData
                            let actName = 'IPC';
                            let sections = row.sections && row.sections !== 'N/A' ? row.sections : '';
                            let ioName = '';
                            let ioRank = '';
                            let ioPis = '';
                            let ioMobile = '';
                            let caseTypeVal = 'cctns(manual FIR)';

                            if (row.isBackend) {
                              const matched = (casesData || []).find(c => {
                                if (!c) return false;
                                const firNo = c.data?.fir_no || c.fir_no || `FIR No. ${c.id}`;
                                return firNo === row.fir_no;
                              });
                              if (matched) {
                                const cData = matched.data || {};
                                actName = cData.act_name || 'IPC';
                                sections = cData.sections || '';
                                ioName = cData.io_name || '';
                                ioRank = cData.io_rank || '';
                                ioPis = cData.io_pis || '';
                                ioMobile = cData.io_mobile || '';
                                caseTypeVal = cData.case_type || matched.case_type || 'cctns(manual FIR)';
                              }
                            } else {
                              // It's a mock case
                              actName = 'IPC';
                              sections = row.sections && row.sections !== 'N/A' ? row.sections : '';
                              ioName = 'Inspector Satish Kumar';
                              ioRank = 'Inspector';
                              ioPis = '28081234';
                              ioMobile = '9876543210';
                              caseTypeVal = 'cctns(manual FIR)';
                            }

                            // Directly update values
                            setValues(prev => ({
                              ...prev,
                              selected_fir: row.fir_no,
                              linked_fir_dd_no: row.fir_no,
                              act_name: actName,
                              sections: sections,
                              io_name: ioName,
                              io_rank: ioRank,
                              io_pis: ioPis,
                              io_mobile: ioMobile,
                              case_type: caseTypeVal
                            }));
                          }}
                          className={`group cursor-pointer hover:bg-slate-50/80 transition-all ${isSelected
                              ? 'bg-[var(--accent-glow)] hover:bg-[var(--accent-glow)]'
                              : ''
                            }`}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${isSelected
                                  ? 'border-[var(--accent-color)] bg-[var(--accent-color)] text-white scale-110'
                                  : 'border-slate-300 bg-white group-hover:border-slate-400'
                                }`}>
                                {isSelected && <Check size={10} className="stroke-[3]" />}
                              </span>
                              <span className={`text-sm font-bold ${isSelected ? 'text-[var(--accent-color)] font-extrabold' : 'text-slate-800'
                                }`}>
                                {row.fir_no}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-slate-600">
                            {row.fir_date}
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-slate-700">
                            {row.complainant_name}
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-slate-500">
                            {row.police_station}
                          </td>
                          <td className="px-6 py-4 text-xs font-semibold text-slate-600">
                            {row.crime_head}
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500 font-mono">
                            {row.sections}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Linked FIR Offence Details Card */}
        {selectedFir && (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mt-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
              <h3 className="text-sm font-bold text-slate-800 tracking-wide flex items-center gap-2 font-display">
                <Bookmark size={16} className="text-[var(--accent-color)]" />
                <span>
                  {lang === 'hi' ? 'संबद्ध प्राथमिकी अपराध विवरण (संपादित करें)' : 'Linked FIR Offence Details (Edit)'}
                </span>
              </h3>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Act Name Selection */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 tracking-wide">
                    {lang === 'hi' ? 'अधिनियम का नाम *' : 'Act Name *'}
                  </label>
                  <SearchableSelect
                    disabled={readOnly}
                    value={currentAct}
                    onChange={(val) => handleChange('act_name', val)}
                    options={getFieldOptions(allSchemaFields, 'act_name')}
                    lang={lang}
                    className="w-full bg-white border-2 border-slate-200 text-slate-800 text-sm px-3.5 py-2.5 rounded-xl outline-none focus:border-[var(--accent-color)] transition-all cursor-text"
                    dropdownClassName="max-h-48 overflow-y-auto border-2 border-slate-200 rounded-xl bg-white shadow-xl text-left"
                  />
                </div>

                {/* Act Name Sub-input if Other Act is selected */}
                {currentAct === 'Other Act' && (
                  <div className="flex flex-col gap-1.5 animate-in fade-in duration-200">
                    <label className="text-xs font-bold text-slate-700 tracking-wide">
                      {lang === 'hi' ? 'अधिनियम का नाम दर्ज करें' : 'Specify Act Name'}
                    </label>
                    <input
                      type="text"
                      disabled={readOnly}
                      value={values.other_act_name || ''}
                      onChange={(e) => handleChange('other_act_name', e.target.value)}
                      placeholder={lang === 'hi' ? 'अधिनियम का नाम लिखें...' : 'Enter custom act...'}
                      className="w-full bg-white border-2 border-slate-200 text-slate-800 text-sm px-3.5 py-2.5 rounded-xl outline-none focus:border-[var(--accent-color)] transition-all"
                    />
                  </div>
                )}
              </div>

              {/* Sections Editor */}
              <div className="flex flex-col gap-3">
                <label className="text-xs font-bold text-slate-700 tracking-wide">
                  {lang === 'hi' ? 'धारा संख्या(एँ) *' : 'Sections Code *'}
                </label>

                {/* Section Chips Container */}
                <div className="flex flex-wrap gap-2 min-h-[44px] p-2 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl items-center">
                  {sectionsList.length === 0 ? (
                    <span className="text-xs text-slate-400 font-medium px-2 py-1">
                      {lang === 'hi' ? 'कोई धारा जोड़ी नहीं गई है' : 'No sections added yet.'}
                    </span>
                  ) : (
                    sectionsList.map((sec, idx) => (
                      <span
                        key={`${sec}-${idx}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 shadow-sm animate-in zoom-in-75 duration-200"
                      >
                        <span>{sec}</span>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSection(sec)}
                            className="p-0.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-md transition-colors cursor-pointer"
                          >
                            <X size={12} className="stroke-[2.5]" />
                          </button>
                        )}
                      </span>
                    ))
                  )}
                </div>

                {/* Add Section Input Bar */}
                {!readOnly && (
                  <div className="flex items-center gap-2 max-w-sm mt-1">
                    <input
                      type="text"
                      disabled={readOnly}
                      value={newSectionVal}
                      onChange={(e) => setNewSectionVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSection();
                        }
                      }}
                      placeholder={lang === 'hi' ? 'उदा. 379 या 34' : 'e.g. 379 or 34'}
                      className="flex-1 bg-white border-2 border-slate-200 text-slate-800 text-sm px-3.5 py-2 rounded-xl outline-none focus:border-[var(--accent-color)] transition-all"
                    />
                    <button
                      type="button"
                      onClick={handleAddSection}
                      className="px-4 py-2 bg-slate-800 text-white hover:bg-slate-700 font-bold text-xs rounded-xl transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>{lang === 'hi' ? 'जोड़ें' : 'Add'}</span>
                    </button>
                  </div>
                )}
                <span className="text-[10px] text-slate-400 font-medium leading-normal">
                  {lang === 'hi'
                    ? 'धारा दर्ज करें और Enter दबाएं या "जोड़ें" पर क्लिक करें।'
                    : 'Type a section code and press Enter or click "Add" to update.'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderArrestGeneralInfoStep = () => {
    const renderReadOnlyRow = (label, val, isFirst = false, isLast = false) => (
      <React.Fragment>
        <div className={`bg-[#dfeaf5] px-3 py-2 text-[12px] font-semibold text-[#0d2a4a] flex items-center min-h-[40px] ${!isLast ? 'border-b border-[#c7d8ea]' : ''} ${isFirst ? 'rounded-tl' : ''}`}>
          {label}
        </div>
        <div className={`px-3 py-1 bg-white text-slate-700 text-[12px] flex items-center min-h-[40px] ${!isLast ? 'border-b border-[#c7d8ea]' : ''} ${isFirst ? 'rounded-tr' : ''}`}>
          {val || '—'}
        </div>
      </React.Fragment>
    );

    return (
      <div className="space-y-4">
        {/* Top card fields */}
        <div className="grid grid-cols-[220px_1fr] border border-[#7a9cc5] rounded overflow-visible mt-2">
          {renderReadOnlyRow(fieldLabel('uid') || (lang === 'hi' ? 'रिकॉर्ड यूआईडी (UID)' : 'Record UID'), values.uid || 'NEW_DRAFT_PENDING', true)}
          {renderReadOnlyRow(fieldLabel('district') || (lang === 'hi' ? 'जिला' : 'District'), values.district || user?.district)}
          {renderReadOnlyRow(fieldLabel('police_station') || (lang === 'hi' ? 'थाना' : 'Police Station'), values.police_station || user?.police_station)}
          {renderReadOnlyRow(fieldLabel('submission_status') || (lang === 'hi' ? 'प्रस्तुति स्थिति' : 'Submission Status'), values.status || 'DRAFT')}

          {/* Case Type field */}
          <React.Fragment>
            <div className="bg-[#dfeaf5] px-3 py-2 text-[12px] font-semibold text-[#0d2a4a] flex items-center border-b border-[#c7d8ea] min-h-[40px]">
              {fieldLabel('case_type') || (lang === 'hi' ? 'मामले का प्रकार' : 'CASE TYPE')}
            </div>
            <div className="px-3 py-1 bg-white flex items-center border-b border-[#c7d8ea] min-h-[40px]">
              <div className="w-full max-w-md">
                <FieldRenderer
                  field={allSchemaFields.find(f => f.field_key === 'case_type')}
                  value={values.case_type || ''}
                  onChange={handleChange}
                  readOnly={readOnly}
                  lang={lang}
                  values={values}
                />
              </div>
            </div>
          </React.Fragment>

          {/* GD Number, Date & Time */}
          <React.Fragment>
            <div className="bg-[#dfeaf5] px-3 py-2 text-[12px] font-semibold text-[#0d2a4a] flex items-center min-h-[40px] rounded-bl">
              {(fieldLabel('gd_no') || (lang === 'hi' ? 'जीडी नंबर, दिनांक और समय' : 'GD Number, Date & Time'))}{' *'}
            </div>
            <div className="px-3 py-1 bg-white flex items-center gap-2 min-h-[40px] relative rounded-br">
              <FieldRenderer
                field={allSchemaFields.find(f => f.field_key === 'gd_no')}
                value={values.gd_no}
                handleChange={handleChange}
                values={values}
                readOnly={readOnly}
              />
            </div>
          </React.Fragment>
        </div>

        {/* Acts, Sections, Major/Minor, Local Head Panels */}
        <ActsSectionsTable {...actsSectionsProps} localHeadLayout={recordType === 'UIDB' ? 'hidden' : 'split'} />
      </div>
    );
  };


  const renderActsAndSectionsStep = () => {
    const allFields = deepFlattenSchema(schema);

    return (
      <div className="space-y-3">
        {/* Main Table for GD and Complaint details */}
        <div className="bg-[#f0f4f8] border border-[#7a9cc5] rounded overflow-visible shadow-sm">
          <table className="w-full border-collapse">
            <tbody>
              {/* Row 1: GD/SD/DD Number / Date / Time */}
              <tr className="border-b border-[#7a9cc5]">
                <td className="w-1/3 bg-[#d0e0f8] text-[#0d2a4a] text-[11px] font-bold px-2.5 py-1 border-r border-[#7a9cc5] align-middle">
                  {fieldLabel('gd_no') || 'GD/SD/DD Number / Date / Time'} <span className="text-red-500">*</span>
                </td>
                <td className="w-2/3 bg-white px-2.5 py-1 flex items-center gap-2" style={{ position: 'relative' }}>
                  <FieldRenderer
                    field={allFields.find(f => f.field_key === 'gd_no')}
                    value={values.gd_no}
                    handleChange={handleChange}
                    values={values}
                    readOnly={readOnly}
                  />
                </td>
              </tr>
              
              {/* Row: Case Registration Type */}
              <tr className="border-b border-[#7a9cc5]">
                <td className="w-1/3 bg-[#d0e0f8] text-[#0d2a4a] text-[11px] font-bold px-2.5 py-1 border-r border-[#7a9cc5] align-middle">
                  {fieldLabel('case_type') || (lang === 'hi' ? 'मामला पंजीकरण प्रकार' : 'Case Registration Type')}
                </td>
                <td className="w-2/3 bg-white px-2.5 py-1">
                  <div className="w-64">
                    <FieldRenderer
                      field={allFields.find(f => f.field_key === 'case_type')}
                      value={values.case_type || ''}
                      onChange={handleChange}
                      readOnly={readOnly}
                      lang={lang}
                      values={values}
                      selectVariant="compact"
                      selectClassName="w-64 h-7 px-2 border border-[#7a9cc5] rounded bg-white text-[12px] outline-none focus:border-blue-500 cursor-text"
                    />
                  </div>
                </td>
              </tr>

              {/* Row 3: FIR/Complaint Number, Date & Time — "Complaint No." is this
                  station's name for the FIR number, same field_key (fir_no). There is no
                  separate `complaint_no` field_registry row (only referenced by the old,
                  still-on-legacy-schema import module) — looking one up here previously
                  returned undefined, which FieldRenderer silently renders as nothing,
                  leaving this row permanently blank with no way to enter the FIR number
                  at all. Renders the same composite Number+Date+Time widget as GD Number
                  above (FieldRenderer's dedicated `fir_no` branch). */}
              <tr className="border-b border-[#7a9cc5]">
                <td className="w-1/3 bg-[#d0e0f8] text-[#0d2a4a] text-[11px] font-bold px-2.5 py-1 border-r border-[#7a9cc5] align-middle">
                  {fieldLabel('fir_no') || 'Complaint No.'}
                </td>
                <td className="w-2/3 bg-white px-2.5 py-1 flex items-center gap-2" style={{ position: 'relative' }}>
                  <FieldRenderer
                    field={allFields.find(f => f.field_key === 'fir_no')}
                    value={values.fir_no}
                    handleChange={handleChange}
                    values={values}
                    readOnly={readOnly}
                    lang={lang}
                  />
                </td>
              </tr>

              {/* Row 4: Source / Reference of Complaint */}
              <tr>
                <td className="w-1/3 bg-[#d0e0f8] text-[#0d2a4a] text-[11px] font-bold px-2.5 py-1 border-r border-[#7a9cc5] align-middle">
                  {fieldLabel('source_reference') || 'Source / Reference of Complaint'} <span className="text-red-500">*</span>
                </td>
                <td className="w-2/3 bg-white px-2.5 py-1">
                  <FieldRenderer
                    field={allFields.find(f => f.field_key === 'source_reference')}
                    value={values.source_reference}
                    handleChange={handleChange}
                    values={values}
                    readOnly={readOnly}
                    lang={lang}
                    selectVariant="compact"
                    selectClassName="w-64 h-6 px-1 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-blue-500 cursor-pointer"
                    selectPlaceholder="Select an option"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <ActsSectionsTable {...actsSectionsProps} localHeadLayout="split" />
      </div>
    );
  };

  const renderOccurrenceStep = () => {
    const sectionFields = activeSection?.fields || [];
    const occInfoFields = sectionFields.filter(f => f.sort_order < 3 && f.field_type !== 'RADIO');
    // Place-of-occurrence = every address field with sort_order >= 3 (house_no 3 … police_station
    // 3.9, then pincode 4, latitude 4.1, longitude 4.2). The old `< 4` upper cap silently dropped
    // occurrence_pincode / occurrence_latitude / occurrence_longitude from the form entirely
    // (they exist in config + DB but never rendered). No occurrence field has sort_order >= 5.
    const occPlaceFields = sectionFields.filter(f => f.sort_order >= 3);

    const occRadioFields = sectionFields.filter(f => f.sort_order < 3 && f.field_type === 'RADIO');

    const renderFieldRow = (field, isLast = false) => {
      const key = field.field_key;
      const label = lang === 'hi' ? (field.label_hi || field.label_en) : field.label_en;
      const rules = parseRules(field.validation_rules);
      const isRequired = !!rules.required;
      const isDisabled = readOnly || field.readonly === true || field.readonly === 'true';
      return (
        <React.Fragment key={key}>
          <div className={`bg-[#dfeaf5] px-2 py-2 text-[12px] font-medium flex items-center gap-1 ${!isLast ? 'border-b border-[#c7d8ea]' : ''}`}>
            <span>{label}</span>
            {isRequired && <span className="text-red-500 font-bold">*</span>}
          </div>
          <div className={`px-2 py-1 ${!isLast ? 'border-b border-[#c7d8ea]' : ''}`}>
            <FieldRenderer field={field} value={values[key]} onChange={handleChange} readOnly={isDisabled} hasError={touched[key] && !!errors[key]} lang={lang} values={values} />
          </div>
        </React.Fragment>
      );
    };

    return (
      <div className="grid grid-cols-2 gap-4 text-sm">
        {/* LEFT COLUMN */}
        <div className="space-y-3">
          {/* OCCURRENCE INFORMATION — driven by backend fields with sort_order < 3 */}
          <fieldset className="border border-[#7a9cc5] rounded px-2 py-2">
            <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
              {lang === 'hi' ? 'घटना की जानकारी' : 'Occurrence Information'}
            </legend>
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea]">
              {occInfoFields.map((f, i) => renderFieldRow(f, i === occInfoFields.length - 1))}
            </div>
          </fieldset>

          {occRadioFields.map((radioField) => (
            <fieldset key={radioField.field_key} className={`border rounded px-2 py-3 ${touched[radioField.field_key] && errors[radioField.field_key] ? 'border-red-400 bg-red-50' : 'border-[#7a9cc5]'}`}>
              <div className="flex items-center gap-6 text-[12px]">
                <span className="font-medium">
                  {lang === 'hi' ? (radioField.label_hi || radioField.label_en) : radioField.label_en}
                  {!!parseRules(radioField.validation_rules).required && <span className="text-red-500 font-bold ml-0.5">*</span>}
                </span>
                {getFieldOptions(sectionFields, radioField.field_key).map((opt) => (
                  <label key={opt.value} className="flex items-center gap-1">
                    <input type="radio" checked={values?.[radioField.field_key] === opt.value} onChange={() => handleChange(radioField.field_key, opt.value)} />
                    {lang === 'hi' ? (opt.label_hi || opt.label_en) : opt.label_en}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>

        {/* RIGHT COLUMN — Place of Occurrence driven by backend address fields (sort_order >= 3: address 3.x + pincode/lat/long 4.x) */}
        <div>
          <fieldset className="border border-[#7a9cc5] rounded px-2 py-2 h-full">
            <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
              {lang === 'hi' ? 'घटनास्थल' : 'Place of Occurrence'}
            </legend>
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea]">
              {occPlaceFields.map((f, i) => renderFieldRow(f, i === occPlaceFields.length - 1))}
            </div>
          </fieldset>
        </div>
      </div>
    );
  };


  const PERSON_TAB_VARIANTS = {
    complainant: { hasNickname: false, extraContactField: 'complainant_same_as_victim' },
    victim: { hasNickname: true, extraContactField: null },
    accused: { hasNickname: true, extraContactField: null },
    arrested: { hasNickname: true, extraContactField: null },
  };

  function renderPersonPersonalInfoSubTab(prefix, allFields, valuesObj, onFieldChange, touchedObj, errorsObj, showInlineErrors, lang, readOnly) {
    const cfg = PERSON_TAB_VARIANTS[prefix];
    const extraRequired = prefix === 'complainant' ? [] : [`${prefix}_first_name`, `${prefix}_gender`];


    const field = (key, customLabel = null, isLast = false, forceReadOnly = false, extraRequiredKeys = []) => {
      const f = allFields.find((x) => x.field_key === key);
      if (!f) return null;
      const label = customLabel || (lang === 'hi' ? (f.label_hi || f.label_en) : f.label_en);
      const rules = parseRules(f.validation_rules);
      const isRequired = !!rules.required || extraRequiredKeys.includes(key);
      const isDisabled = forceReadOnly || readOnly || f.readonly === true || f.readonly === 'true';
      return (
        <React.Fragment key={key}>
          <div className={`bg-[#dfeaf5] px-2 py-2 text-[12px] font-medium flex items-center gap-1 ${!isLast ? 'border-b border-[#c7d8ea]' : ''}`}>
            <span>{label}</span>
            {isRequired && <span className="text-red-500 font-bold">*</span>}
          </div>
          <div className={`px-2 py-1 ${!isLast ? 'border-b border-[#c7d8ea]' : ''}`}>
            <FieldRenderer
              field={f}
              value={valuesObj[key]}
              onChange={onFieldChange}
              readOnly={isDisabled}
              hasError={touchedObj?.[key] && !!errorsObj?.[key]}
              lang={lang}
              values={valuesObj}
            />
            {showInlineErrors && touchedObj?.[key] && errorsObj?.[key] && (
              <p className="text-red-500 text-[10px] mt-0.5">{errorsObj[key]}</p>
            )}
          </div>
        </React.Fragment>
      );
    };

    const rawField = (key, fallback) => (
      <FieldRenderer
        field={allFields.find((x) => x.field_key === key)}
        value={valuesObj[key] ?? fallback}
        onChange={onFieldChange}
        readOnly={readOnly}
        lang={lang}
        values={valuesObj}
      />
    );

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">

          {/* Left Column - Personal Info (no border outline) */}
          <div className="space-y-3">
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea]">
              {field(`${prefix}_npr`, lang === 'hi' ? 'यूआईडी (UID)' : 'UID')}
              {field(`${prefix}_first_name`, null, false, false, extraRequired)}
              {field(`${prefix}_middle_name`)}
              {cfg.hasNickname ? (
                <React.Fragment>
                  {field(`${prefix}_last_name`)}
                  {field(`${prefix}_nickname`, lang === 'hi' ? 'उपनाम / Alias' : 'Nickname/Alias', true)}
                </React.Fragment>
              ) : (
                field(`${prefix}_last_name`, null, true)
              )}
            </div>
          </div>

          {/* Right Column - Gender, Marital Status, Mobile, Email, extra */}
          <div className="border border-[#7a9cc5] rounded px-2 py-2 self-start">
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea]">
              {field(`${prefix}_gender`, null, false, false, extraRequired)}

              {/* Mobile number with country code */}
              <React.Fragment>
                <div className="bg-[#dfeaf5] px-2 py-2 border-b text-[12px] font-medium flex items-center gap-1">
                  <span>{lang === 'hi' ? 'मोबाइल नंबर' : 'Mobile No.'}</span>
                </div>
                <div className="px-2 py-1 border-b flex gap-1.5 items-center">
                  <div className="w-14">{rawField(`${prefix}_mobile_country_code`, '+91')}</div>
                  <div className="flex-1">{rawField(`${prefix}_mobile`)}</div>
                </div>
              </React.Fragment>

              {prefix === 'arrested' && field('scheme_of_arrest', null, true)}

              {cfg.extraContactField ? (
                <React.Fragment>
                  {field(`${prefix}_email`)}
                  {field(cfg.extraContactField, null, true)}
                </React.Fragment>
              ) : (
                field(`${prefix}_email`, null, true)
              )}
            </div>
          </div>

        </div>

        {/* Bottom part */}
        <div className="grid grid-cols-2 gap-4 mt-6">

          {/* Relation Details */}
          <div className="border border-[#7a9cc5] rounded px-2 py-2 self-start">
            <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
              {lang === 'hi' ? 'रिश्तेदार का विवरण' : 'Relative Details'}
            </legend>
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] mt-2">
              {field(`${prefix}_relation_type`)}
              {field(`${prefix}_relative_name`, null, true)}
            </div>
          </div>

          {/* Age Panel */}
          <fieldset className="border border-[#7a9cc5] rounded px-2 py-2">
            <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
              {lang === 'hi' ? 'आयु विवरण' : 'Age Panel'}
            </legend>
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] mt-2">
              {field(`${prefix}_dob`)}

              {/* Age (Year / Month) */}
              <React.Fragment>
                <div className="bg-[#dfeaf5] px-2 py-2 border-b text-[12px] font-medium flex items-center gap-1">
                  <span>{lang === 'hi' ? 'आयु (वर्ष / महीने)' : 'Age (Year / Month)'}</span>
                </div>
                <div className="px-2 py-1 border-b flex gap-2">
                  <div className="flex-1">{rawField(`${prefix}_age_year`)}</div>
                  <div className="flex-1">{rawField(`${prefix}_age_month`)}</div>
                </div>
              </React.Fragment>

              {field(`${prefix}_birth_year`, null, true)}
            </div>
          </fieldset>

        </div>
      </div>
    );
  }

  function renderPersonAddressSubTab(prefix, allFields, valuesObj, onFieldChange, touchedObj, errorsObj, showInlineErrors, lang, readOnly) {
    const isSame = valuesObj[`${prefix}_perm_same`] === 'Yes' || valuesObj[`${prefix}_perm_same`] === true;

    const field = (key, customLabel = null, isLast = false, forceReadOnly = false) => {
      const f = allFields.find((x) => x.field_key === key);
      if (!f) return null;
      const label = customLabel || (lang === 'hi' ? (f.label_hi || f.label_en) : f.label_en);
      const rules = parseRules(f.validation_rules);
      const isRequired = !!rules.required;
      const isDisabled = forceReadOnly || readOnly || f.readonly === true || f.readonly === 'true';
      return (
        <React.Fragment key={key}>
          <div className={`bg-[#dfeaf5] px-2 py-2 text-[12px] font-medium flex items-center gap-1 ${!isLast ? 'border-b border-[#c7d8ea]' : ''}`}>
            <span>{label}</span>
            {isRequired && <span className="text-red-500 font-bold">*</span>}
          </div>
          <div className={`px-2 py-1 ${!isLast ? 'border-b border-[#c7d8ea]' : ''}`}>
            <FieldRenderer
              field={f}
              value={valuesObj[key]}
              onChange={onFieldChange}
              readOnly={isDisabled}
              hasError={touchedObj?.[key] && !!errorsObj?.[key]}
              lang={lang}
              values={valuesObj}
            />
            {showInlineErrors && touchedObj?.[key] && errorsObj?.[key] && (
              <p className="text-red-500 text-[10px] mt-0.5">{errorsObj[key]}</p>
            )}
          </div>
        </React.Fragment>
      );
    };

    return (
      <div className="space-y-6">

        {/* PRESENT ADDRESS PANEL */}
        <fieldset className="border border-[#7a9cc5] rounded px-2 py-2">
          <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
            {lang === 'hi' ? 'वर्तमान पता' : 'Present Address'}
          </legend>

          <div className="grid grid-cols-2 gap-4 mt-2">
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] self-start">
              {field(`${prefix}_house_no`)}
              {field(`${prefix}_street`)}
              {field(`${prefix}_colony`)}
              {field(`${prefix}_city_town_village`)}
              {field(`${prefix}_tehsil_block_mandal`, null, true)}
            </div>
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] self-start">
              {field(`${prefix}_country`)}
              {field(`${prefix}_state`)}
              {field(`${prefix}_district`)}
              {field(`${prefix}_police_station`)}
              {field(`${prefix}_pincode`, null, true)}
            </div>
          </div>
        </fieldset>

        {/* PERMANENT ADDRESS PANEL */}
        <fieldset className="border border-[#7a9cc5] rounded px-2 py-2">
          <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
            {lang === 'hi' ? 'स्थायी पता' : 'Permanent Address'}
          </legend>

          {/* Same as present toggle */}
          <div className="bg-[#dfeaf5]/50 border border-[#c7d8ea] px-3 py-2 flex items-center justify-between mb-4 text-xs font-semibold rounded">
            <span>{lang === 'hi' ? 'क्या स्थायी पता वर्तमान पते के समान है?' : 'Is Permanent Address same as Present Address?'}</span>
            <div className="w-24">
              <FieldRenderer
                field={allFields.find((x) => x.field_key === `${prefix}_perm_same`)}
                value={valuesObj[`${prefix}_perm_same`]}
                onChange={onFieldChange}
                readOnly={readOnly}
                lang={lang}
                values={valuesObj}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] self-start">
              {field(`${prefix}_perm_house_no`, null, false, isSame)}
              {field(`${prefix}_perm_street`, null, false, isSame)}
              {field(`${prefix}_perm_colony`, null, false, isSame)}
              {field(`${prefix}_perm_city_town_village`, null, false, isSame)}
              {field(`${prefix}_perm_tehsil_block_mandal`, null, true, isSame)}
            </div>
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] self-start">
              {field(`${prefix}_perm_country`, null, false, isSame)}
              {field(`${prefix}_perm_state`, null, false, isSame)}
              {field(`${prefix}_perm_district`, null, false, isSame)}
              {field(`${prefix}_perm_police_station`, null, false, isSame)}
              {field(`${prefix}_perm_pincode`, null, true, isSame)}
            </div>
          </div>
        </fieldset>
      </div>
    );
  }

  const renderComplainantStep = () => {
    const allFields = deepFlattenSchema(schema);

    return (
      <div className="space-y-4">
        {/* Sub-Tab selection bar */}
        {renderSubTabBar('complainant_info', complainantTab, setComplainantTab, 'rounded-t')}

        {/* Sub-tab content */}
        <div className="p-2 border border-t-0 border-[#7a9cc5] rounded-b bg-transparent">
          {complainantTab === 'personal'
            ? renderPersonPersonalInfoSubTab('complainant', allFields, values, handleChange, touched, errors, false, lang, readOnly)
            : renderPersonAddressSubTab('complainant', allFields, values, handleChange, touched, errors, false, lang, readOnly)}
        </div>
      </div>
    );
  };

  const renderVictimStep = () => {
    const victims = repeaterState?.victim_info || [];
    const allFields = deepFlattenSchema(schema);

    const getVictimName = (v) => [v.victim_first_name, v.victim_middle_name, v.victim_last_name].filter(Boolean).join(' ') || '—';
    const getVictimAddress = (v) => [v.victim_house_no, v.victim_street, v.victim_colony, v.victim_city_town_village, v.victim_district, v.victim_state].filter(Boolean).join(', ') || '—';

    return (
      <div className="space-y-4">

        {/* Header bar with "+ Add Victim" button at top-right */}
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold text-[#0d2a4a] uppercase tracking-wide">
            {lang === 'hi' ? `पीड़ित सूची (${victims.length})` : `Victim List (${victims.length})`}
          </h3>
          <button
            type="button"
            onClick={openVictimAddModal}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#0d2a4a] text-white text-xs font-bold rounded hover:bg-[#16406d] transition-colors cursor-pointer"
          >
            <span className="text-base leading-none">+</span>
            {lang === 'hi' ? 'पीड़ित जोड़ें' : 'Add Victim'}
          </button>
        </div>

        {/* Summary Table */}
        <div className="border border-[#7a9cc5] rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#0d2a4a] text-white">
                <th className="px-3 py-2 text-left w-14 font-semibold">{lang === 'hi' ? 'क्र.सं.' : 'S.No.'}</th>
                <th className="px-3 py-2 text-left font-semibold">{lang === 'hi' ? 'नाम' : 'Name'}</th>
                <th className="px-3 py-2 text-left font-semibold">{lang === 'hi' ? 'पता' : 'Address'}</th>
                <th className="px-3 py-2 text-center w-28 font-semibold">{lang === 'hi' ? 'कार्रवाई' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {victims.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-400 italic">
                    {lang === 'hi' ? 'कोई पीड़ित नहीं जोड़ा गया। "+ पीड़ित जोड़ें" पर क्लिक करें।' : 'No victims added yet. Click "+ Add Victim" to add.'}
                  </td>
                </tr>
              ) : (
                victims.map((victim, idx) => (
                  <tr key={idx} className={`border-t border-[#c7d8ea] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#f0f5fa]'}`}>
                    <td className="px-3 py-2 font-medium">{idx + 1}</td>
                    <td className="px-3 py-2">{getVictimName(victim)}</td>
                    <td className="px-3 py-2 text-slate-600">{getVictimAddress(victim)}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => openVictimEditModal(idx)}
                        className="text-[#0d2a4a] hover:text-[#ea580c] font-semibold mr-3 cursor-pointer underline transition-colors"
                      >
                        {lang === 'hi' ? 'संपादन' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteVictimEntry(idx)}
                        className="text-red-500 hover:text-red-700 font-semibold cursor-pointer underline transition-colors"
                      >
                        {lang === 'hi' ? 'हटाएं' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Victim Modal Dialog ── */}
        {isVictimModalOpen && createPortal(
          <div className={`${themeClass} fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4`}>
            <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-[1050px] h-[85vh] max-h-[750px] flex flex-col overflow-hidden">

              {/* Modal Header */}
              <div className="flex items-center justify-between bg-[#0d2a4a] text-white px-5 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wide">
                  {activeVictimIndex !== null
                    ? (lang === 'hi' ? 'पीड़ित जानकारी संपादित करें' : 'Edit Victim Information')
                    : (lang === 'hi' ? 'पीड़ित जानकारी' : 'Victim Information')}
                </h2>
                <button
                  type="button"
                  onClick={() => setIsVictimModalOpen(false)}
                  className="text-white/80 hover:text-white text-2xl leading-none font-bold cursor-pointer transition-colors"
                  title="Close"
                >
                  ×
                </button>
              </div>

              {/* Sub-tab selection bar */}
              {renderSubTabBar('victim_info', victimSubTab, setVictimSubTab)}

              {/* Modal Body (scrollable) */}
              <div className="flex-1 overflow-y-auto p-4 border border-t-0 border-[#7a9cc5] bg-white">
                {victimSubTab === 'personal'
                  ? renderPersonPersonalInfoSubTab('victim', allFields, victimTempValues, handleVictimModalChange, victimModalTouched, victimModalErrors, true, lang, readOnly)
                  : renderPersonAddressSubTab('victim', allFields, victimTempValues, handleVictimModalChange, victimModalTouched, victimModalErrors, true, lang, readOnly)}
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end gap-3 px-5 py-3 border-t border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={saveVictimEntry}
                  className="px-6 py-2 bg-[#0d2a4a] text-white text-xs font-bold rounded hover:bg-[#16406d] cursor-pointer transition-colors"
                >
                  {lang === 'hi' ? 'सहेजें' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsVictimModalOpen(false)}
                  className="px-6 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded hover:bg-slate-300 cursor-pointer transition-colors"
                >
                  {lang === 'hi' ? 'बंद करें' : 'Close'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      </div>
    );
  };

  const renderAccusedStep = () => {
    const accusedList = repeaterState?.accused_info || [];
    const allFields = deepFlattenSchema(schema);

    const getAccusedName = (v) => [v.accused_first_name, v.accused_middle_name, v.accused_last_name].filter(Boolean).join(' ') || '—';
    const getAccusedAddress = (v) => [v.accused_house_no, v.accused_street, v.accused_colony, v.accused_city_town_village, v.accused_district, v.accused_state].filter(Boolean).join(', ') || '—';

    return (
      <div className="space-y-4">

        {/* Header bar with "+ Add Accused" button at top-right */}
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold text-[#0d2a4a] uppercase tracking-wide">
            {lang === 'hi' ? `अभियुक्त सूची (${accusedList.length})` : `Accused List (${accusedList.length})`}
          </h3>
          <button
            type="button"
            onClick={openAccusedAddModal}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#0d2a4a] text-white text-xs font-bold rounded hover:bg-[#16406d] transition-colors cursor-pointer"
          >
            <span className="text-base leading-none">+</span>
            {lang === 'hi' ? 'अभियुक्त जोड़ें' : 'Add Accused'}
          </button>
        </div>

        {/* Summary Table */}
        <div className="border border-[#7a9cc5] rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#0d2a4a] text-white">
                <th className="px-3 py-2 text-left w-14 font-semibold">{lang === 'hi' ? 'क्र.सं.' : 'S.No.'}</th>
                <th className="px-3 py-2 text-left font-semibold">{lang === 'hi' ? 'नाम' : 'Name'}</th>
                <th className="px-3 py-2 text-left font-semibold">{lang === 'hi' ? 'पता' : 'Address'}</th>
                <th className="px-3 py-2 text-center w-28 font-semibold">{lang === 'hi' ? 'कार्रवाई' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {accusedList.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-400 italic">
                    {lang === 'hi' ? 'कोई अभियुक्त नहीं जोड़ा गया। "+ अभियुक्त जोड़ें" पर क्लिक करें।' : 'No accused added yet. Click "+ Add Accused" to add.'}
                  </td>
                </tr>
              ) : (
                accusedList.map((accused, idx) => (
                  <tr key={idx} className={`border-t border-[#c7d8ea] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#f0f5fa]'}`}>
                    <td className="px-3 py-2 font-medium">{idx + 1}</td>
                    <td className="px-3 py-2">{getAccusedName(accused)}</td>
                    <td className="px-3 py-2 text-slate-600">{getAccusedAddress(accused)}</td>
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => openAccusedEditModal(idx)}
                        className="text-[#0d2a4a] hover:text-[#ea580c] font-semibold mr-3 cursor-pointer underline transition-colors"
                      >
                        {lang === 'hi' ? 'संपादन' : 'Edit'}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteAccusedEntry(idx)}
                        className="text-red-500 hover:text-red-700 font-semibold cursor-pointer underline transition-colors"
                      >
                        {lang === 'hi' ? 'हटाएं' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Accused Modal Dialog ── */}
        {isAccusedModalOpen && createPortal(
          <div className={`${themeClass} fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4`}>
            <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-[1050px] h-[85vh] max-h-[750px] flex flex-col overflow-hidden">

              {/* Modal Header */}
              <div className="flex items-center justify-between bg-[#0d2a4a] text-white px-5 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wide">
                  {activeAccusedIndex !== null
                    ? (lang === 'hi' ? 'अभियुक्त जानकारी संपादित करें' : 'Edit Accused Information')
                    : (lang === 'hi' ? 'अभियुक्त जानकारी' : 'Accused Information')}
                </h2>
                <button
                  type="button"
                  onClick={() => setIsAccusedModalOpen(false)}
                  className="text-white/80 hover:text-white text-2xl leading-none font-bold cursor-pointer transition-colors"
                  title="Close"
                >
                  ×
                </button>
              </div>

              {/* Sub-tab selection bar */}
              {renderSubTabBar('accused_info', accusedSubTab, setAccusedSubTab)}

              {/* Modal Body (scrollable) */}
              <div className="flex-1 overflow-y-auto p-4 border border-t-0 border-[#7a9cc5] bg-white">
                {accusedSubTab === 'personal'
                  ? renderPersonPersonalInfoSubTab('accused', allFields, accusedTempValues, handleAccusedModalChange, accusedModalTouched, accusedModalErrors, true, lang, readOnly)
                  : renderPersonAddressSubTab('accused', allFields, accusedTempValues, handleAccusedModalChange, accusedModalTouched, accusedModalErrors, true, lang, readOnly)}
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end gap-3 px-5 py-3 border-t border-slate-200 bg-slate-50">
                <button
                  type="button"
                  onClick={saveAccusedEntry}
                  className="px-6 py-2 bg-[#0d2a4a] text-white text-xs font-bold rounded hover:bg-[#16406d] cursor-pointer transition-colors"
                >
                  {lang === 'hi' ? 'सहेजें' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsAccusedModalOpen(false)}
                  className="px-6 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded hover:bg-slate-300 cursor-pointer transition-colors"
                >
                  {lang === 'hi' ? 'बंद करें' : 'Close'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      </div>
    );
  };

  /** Shared property-list editor (category/type cascades, extra detail fields) — used by
   * both CASE's record-level Property step and ARREST's per-arrested-person Property tab. */
  const renderPropertyEditor = (list, onChange) => {
    const propertyList = list;
    const allFields = deepFlattenSchema(schema);
    const majorCategoryField = allFields.find(f => f.field_key === 'property_major_category');

    const majorCategoryOptions = (() => {
      if (!majorCategoryField) return [];
      try {
        const opts = typeof majorCategoryField.options === 'string'
          ? JSON.parse(majorCategoryField.options)
          : majorCategoryField.options;
        return Array.isArray(opts) ? opts : [];
      } catch (e) {
        return Array.isArray(majorCategoryField.options) ? majorCategoryField.options : [];
      }
    })();

    const getMinorCategoryOptions = (majorCategory) => {
      if (!majorCategory) return [];
      return propertyMinorOptionsMap[majorCategory] || [];
    };

    // ── Extra detail field helpers ─────────────────────────────────────────────
    const BASE_PROP_KEYS = new Set([
      'property_major_category', 'property_minor_category',
      'property_details', 'property_stolen_recovered',
    ]);
    // These supply options for the "Type of Property" column — skip in detail panel
    const TYPE_COL_KEYS = new Set([
      'prop_vehicle_type', 'prop_gold_item_type', 'prop_elec_device_type',
      'prop_doc_type', 'prop_drug_type', 'prop_arms_type', 'prop_cash_currency',
    ]);

    const evalPropCond = (cond, row) => {
      if (!cond) return true;
      if (cond.and) return cond.and.every(c => evalPropCond(c, row));
      const { field: tf, value: tv, operator } = cond;
      let cv = row[tf];
      if (operator === 'filled') return cv !== undefined && cv !== null && String(cv).trim() !== '';

      if (tf === 'property_major_category' && cv) {
        const matchOpt = majorCategoryOptions.find(o => String(o.value) === String(cv));
        if (matchOpt) {
          const label = String(matchOpt.label_en || matchOpt.value).toUpperCase();
          if (label === 'ELECTRICAL AND ELECTRONIC GOODS') {
            if (String(row.property_minor_category) === '470') {
              cv = 'Mobile Phone';
            } else {
              cv = 'Electronics';
            }
          } else if (label === 'AUTOMOBILES AND OTHERS') {
            cv = 'Vehicle';
          } else if (label === 'COIN AND CURRENCY') {
            cv = 'Cash';
          } else if (label === 'JEWELLERY') {
            cv = 'Jewellery';
          } else if (label === 'ARMS AND AMMUNITION') {
            cv = 'Arms';
          } else if (label === 'DOCUMENTS AND VALUABLE SECURITIES') {
            cv = 'Documents';
          } else if (label === 'DRUGS/NARCOTIC DRUGS') {
            cv = 'Drugs';
          } else {
            cv = matchOpt.label_en || matchOpt.value;
          }
        }
      }

      return Array.isArray(tv)
        ? tv.map(v => String(v || '').toLowerCase()).includes(String(cv || '').toLowerCase())
        : String(cv || '').toLowerCase() === String(tv || '').toLowerCase();
    };

    const getExtraFields = (row) =>
      allFields.filter(f => {
        if (!f.repeater_entity || f.repeater_entity.toUpperCase() !== 'PROPERTY') return false;
        if (BASE_PROP_KEYS.has(f.field_key)) return false;
        if (TYPE_COL_KEYS.has(f.field_key)) return false;
        // Commented out redundant duplicate fields for OTHERS category
        if (f.field_key === 'prop_other_desc' || f.field_key === 'prop_other_value') return false;
        const cond = f.show_when
          ? (typeof f.show_when === 'string' ? JSON.parse(f.show_when) : f.show_when)
          : null;
        return evalPropCond(cond, row);
      });

    const renderExtraDetailRow = (row, idx) => {
      const extraFields = getExtraFields(row);
      if (!row.property_major_category || extraFields.length === 0) return null;
      const cls = 'w-full px-2 py-1.5 text-xs border border-[#c7d8ea] rounded bg-white focus:outline-none focus:border-[#0d2a4a] disabled:bg-slate-50 disabled:text-slate-400';
      return (
        <tr key={`${idx}-extra`} className="border-t border-[#dce9f4] bg-[#f3f8fd]">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {extraFields.map(field => {
                const label = lang === 'hi' ? (field.label_hi || field.label_en) : field.label_en;
                const fieldVal = row[field.field_key] || '';
                const wrapCls = `flex flex-col gap-1${field.full_width ? ' col-span-full' : ''}`;
                const labelEl = <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{label}</label>;

                // Type of Arm — cascades off "Type of Property" (row.property_minor_category,
                // which holds the selected arms_category_cd), listing only fire_arms rows whose
                // parent_id matches it. Options come from the live lookup fetch, not field.options.
                if (field.field_key === 'prop_fire_arms_type') {
                  const fireArmsOpts = (armsLookupMap[row.property_major_category]?.fireArms || [])
                    .filter(f => String(f.parent_id) === String(row.property_minor_category));
                  const isDisabled = readOnly || !row.property_minor_category;
                  return (
                    <div key={field.field_key} className={wrapCls}>
                      {labelEl}
                      <SearchableSelect value={fieldVal} onChange={val => handlePropertyRowChange(idx, field.field_key, val)} disabled={isDisabled} className={cls} options={fireArmsOpts} lang={lang} />
                    </div>
                  );
                }

                // Subtype of Arm — cascades off Type of Arm (row.prop_fire_arms_type, holding
                // the selected fire_arms_cd) via excel_fire_arms_subtypes.arms_type_cd.
                if (field.field_key === 'prop_arms_made') {
                  const subtypeOpts = (armsLookupMap[row.property_major_category]?.fireArmsSubtypes || [])
                    .filter(o => String(o.parent_id) === String(row.prop_fire_arms_type));
                  const isDisabled = readOnly || !row.prop_fire_arms_type;
                  return (
                    <div key={field.field_key} className={wrapCls}>
                      {labelEl}
                      <SearchableSelect value={fieldVal} onChange={val => handlePropertyRowChange(idx, field.field_key, val)} disabled={isDisabled} className={cls} options={subtypeOpts} lang={lang} />
                    </div>
                  );
                }

                // Property Subtype ("Others" category) — cascades off "Type of Property"
                // (row.property_minor_category, holding the selected other-category parent_cd).
                if (field.field_key === 'prop_other_subtype') {
                  const subtypeOpts = (armsLookupMap[row.property_major_category]?.otherSubtype || [])
                    .filter(o => String(o.parent_id) === String(row.property_minor_category));
                  const isDisabled = readOnly || !row.property_minor_category;
                  return (
                    <div key={field.field_key} className={wrapCls}>
                      {labelEl}
                      <SearchableSelect value={fieldVal} onChange={val => handlePropertyRowChange(idx, field.field_key, val)} disabled={isDisabled} className={cls} options={subtypeOpts} lang={lang} />
                    </div>
                  );
                }

                if (field.field_type === 'SELECT') {
                  const opts = (() => { try { return typeof field.options === 'string' ? JSON.parse(field.options) : (field.options || []); } catch { return []; } })();
                  return (
                    <div key={field.field_key} className={wrapCls}>
                      {labelEl}
                      <SearchableSelect value={fieldVal} onChange={val => handlePropertyRowChange(idx, field.field_key, val)} disabled={readOnly} className={cls} options={opts} lang={lang} />
                    </div>
                  );
                }
                if (field.field_type === 'TEXTAREA') {
                  return (
                    <div key={field.field_key} className={wrapCls}>
                      {labelEl}
                      <textarea value={fieldVal} onChange={e => handlePropertyRowChange(idx, field.field_key, e.target.value)} disabled={readOnly} rows={2} className={`${cls} resize-none`} />
                    </div>
                  );
                }
                return (
                  <div key={field.field_key} className={wrapCls}>
                    {labelEl}
                    <input type={field.field_type === 'NUMBER' ? 'number' : 'text'} value={fieldVal} onChange={e => handlePropertyRowChange(idx, field.field_key, e.target.value)} disabled={readOnly} className={cls} />
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      );
    };
    // ── End extra detail field helpers ─────────────────────────────────────────

    const addPropertyRow = () => {
      const nextList = [...propertyList];
      nextList.push({
        property_major_category: '',
        property_minor_category: '',
        property_details: '',
        property_value_inr: '',
        property_stolen_recovered: 'Stolen'
      });
      onChange(nextList);
    };

    const clearAllProperties = () => {
      onChange([]);
    };

    const deletePropertyRow = (idx) => {
      onChange(propertyList.filter((_, i) => i !== idx));
    };

    const handlePropertyRowChange = (idx, key, val) => {
      const nextList = [...propertyList];
      if (!nextList[idx]) return;
      const updatedRow = { ...nextList[idx], [key]: val };
      if (key === 'property_major_category') {
        // Clear minor category and any category-specific extra detail fields
        const KEEP = new Set(['property_major_category', 'property_minor_category', 'property_details', 'property_stolen_recovered', 'property_value_inr']);
        Object.keys(updatedRow).forEach(k => { if (!KEEP.has(k)) delete updatedRow[k]; });
        updatedRow.property_minor_category = '';
      } else if (key === 'property_minor_category') {
        // Clear any category-specific extra detail fields
        const KEEP = new Set(['property_major_category', 'property_minor_category', 'property_details', 'property_stolen_recovered', 'property_value_inr']);
        Object.keys(updatedRow).forEach(k => { if (!KEEP.has(k)) delete updatedRow[k]; });
      } else if (key === 'prop_fire_arms_type') {
        // Type of Arm changed — reset the dependent Subtype of Arm selection
        updatedRow.prop_arms_made = '';
      }
      nextList[idx] = updatedRow;
      onChange(nextList);
    };

    const renderTypeCell = (row, idx) => {
      const opts = getMinorCategoryOptions(row.property_major_category);
      const isDisabled = !row.property_major_category || readOnly;

      if (opts.length > 0) {
        return (
          <SearchableSelect
            value={row.property_minor_category || ''}
            onChange={(val) => handlePropertyRowChange(idx, 'property_minor_category', val)}
            disabled={isDisabled}
            options={opts}
            lang={lang}
            className="w-full px-2 py-1 text-xs border border-[#c7d8ea] rounded bg-white focus:outline-none focus:border-[#0d2a4a] disabled:bg-slate-50 disabled:text-slate-400 font-semibold cursor-text"
          />
        );
      }

      return (
        <input
          type="text"
          value={row.property_minor_category || ''}
          onChange={(e) => handlePropertyRowChange(idx, 'property_minor_category', e.target.value)}
          disabled={isDisabled}
          placeholder={row.property_major_category ? (lang === 'hi' ? 'विवरण दर्ज करें...' : 'Enter details...') : (lang === 'hi' ? 'श्रेणी चुनें' : 'Select Category')}
          className="w-full px-2 py-1 text-xs border border-[#c7d8ea] rounded bg-white focus:outline-none focus:border-[#0d2a4a] disabled:bg-slate-50 disabled:text-slate-400 font-semibold"
        />
      );
    };
    return (
      <div className="space-y-4">
        {/* Action Buttons bar at the top-right */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={addPropertyRow}
            disabled={readOnly}
            className="px-4 py-1.5 bg-[#0d2a4a] hover:bg-[#16406d] text-white text-xs font-bold rounded transition-colors cursor-pointer disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {lang === 'hi' ? 'नया जोड़ें' : 'Add New'}
          </button>
          <button
            type="button"
            onClick={clearAllProperties}
            disabled={readOnly}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded transition-colors cursor-pointer disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
          >
            {lang === 'hi' ? 'सभी साफ़ करें' : 'Clear All'}
          </button>
        </div>
        {/* Property Repeater Table */}
        <div className="border border-[#7a9cc5] rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#0d2a4a] text-white">
                <th className="px-3 py-2 text-left w-14 font-semibold">{lang === 'hi' ? 'क्र.सं.' : 'S.No.'}</th>
                <th className="px-3 py-2 text-left font-semibold">{lang === 'hi' ? 'संपत्ति श्रेणी *' : 'Property Category *'}</th>
                <th className="px-3 py-2 text-left font-semibold">{lang === 'hi' ? 'संपत्ति का प्रकार *' : 'Type of Property *'}</th>
                <th className="px-3 py-2 text-left w-32 font-semibold">{lang === 'hi' ? 'स्थिति' : 'Status'}</th>
                <th className="px-3 py-2 text-left font-semibold">{lang === 'hi' ? 'विवरण' : 'Description'}</th>
                <th className="px-3 py-2 text-left w-44 font-semibold">{lang === 'hi' ? 'मूल्य (INR में)' : 'Value in INR'}</th>
                <th className="px-3 py-2 text-center w-16 font-semibold">{lang === 'hi' ? 'हटाएं' : 'Delete'}</th>
              </tr>
            </thead>
            <tbody>
              {propertyList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-400 italic">
                    {lang === 'hi' ? 'कोई संपत्ति नहीं जोड़ी गई है।' : 'No property items added yet.'}
                  </td>
                </tr>
              ) : (
                propertyList.map((row, idx) => (
                  <React.Fragment key={idx}>
                    <tr className={`border-t border-[#c7d8ea] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#f0f5fa]'}`}>
                      {/* S.No */}
                      <td className="px-3 py-2 font-medium">{idx + 1}</td>
                      {/* Property Category */}
                      <td className="px-3 py-2 min-w-[200px]">
                        <SearchableSelect
                          value={row.property_major_category || ''}
                          onChange={(val) => handlePropertyRowChange(idx, 'property_major_category', val)}
                          disabled={readOnly}
                          options={majorCategoryOptions}
                          lang={lang}
                          className="w-full px-2 py-1 text-xs border border-[#c7d8ea] rounded bg-white focus:outline-none focus:border-[#0d2a4a] disabled:bg-slate-50 disabled:text-slate-400 font-semibold cursor-text"
                        />
                      </td>
                      {/* Type of Property */}
                      <td className="px-3 py-2 min-w-[180px]">
                        {renderTypeCell(row, idx)}
                      </td>
                      {/* Status (Stolen / Recovered / Involved / Seized) */}
                      <td className="px-3 py-2 w-32">
                        <SearchableSelect
                          value={row.property_stolen_recovered || 'Stolen'}
                          onChange={(val) => handlePropertyRowChange(idx, 'property_stolen_recovered', val)}
                          disabled={readOnly}
                          options={getFieldOptions(allFields, 'property_stolen_recovered')}
                          lang={lang}
                          className="w-full px-2 py-1 text-xs border border-[#c7d8ea] rounded bg-white focus:outline-none focus:border-[#0d2a4a] disabled:bg-slate-50 disabled:text-slate-400 font-semibold cursor-text"
                        />
                      </td>
                      {/* Description */}
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={row.property_details || ''}
                          onChange={(e) => handlePropertyRowChange(idx, 'property_details', e.target.value)}
                          disabled={readOnly}
                          placeholder={lang === 'hi' ? 'संपत्ति का विवरण दर्ज करें...' : 'Enter description details...'}
                          className="w-full px-2 py-1 text-xs border border-[#c7d8ea] rounded bg-white focus:outline-none focus:border-[#0d2a4a] disabled:bg-slate-50 disabled:text-slate-400 font-semibold"
                        />
                      </td>
                      {/* Value in INR */}
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          value={row.property_value_inr || ''}
                          onChange={(e) => handlePropertyRowChange(idx, 'property_value_inr', e.target.value)}
                          disabled={readOnly}
                          placeholder={lang === 'hi' ? 'मूल्य दर्ज करें (INR में)' : 'Enter value in INR'}
                          className="w-full px-2 py-1 text-xs border border-[#c7d8ea] rounded bg-white focus:outline-none focus:border-[#0d2a4a] disabled:bg-slate-50 disabled:text-slate-400 font-semibold"
                        />
                      </td>
                      {/* Delete */}
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => deletePropertyRow(idx)}
                          disabled={readOnly}
                          className="text-red-500 hover:text-red-700 font-bold transition-colors cursor-pointer disabled:text-slate-300 disabled:cursor-not-allowed"
                        >
                          ✖
                        </button>
                      </td>
                    </tr>
                    {renderExtraDetailRow(row, idx)}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  /** CASE's record-level Property step — one shared property list per case. */
  const renderPropertyStep = () => renderPropertyEditor(
    repeaterState?.property_details || [],
    (newList) => setRepeaterState(prev => ({ ...prev, property_details: newList }))
  );

  const renderArrestedStep = () => {
    const arrestedList = repeaterState?.arrested_info || [];
    const allFields = deepFlattenSchema(schema);
    const subTabs = getSectionSubTabs('arrested_info');
    /** Generic field grid renderer for a sub-tab's fields (used by arrest_details, particular_details, etc.) */
    const renderSubTabFieldGrid = (tabId) => {
      const tab = subTabs.find(t => t.id === tabId);
      const fields = tab?.fields || [];
      if (fields.length === 0) return null;

      // Evaluate show_when conditions against arrestedTempValues
      const evalCond = (cond, vals) => {
        if (!cond) return true;
        try {
          const parsed = typeof cond === 'string' ? JSON.parse(cond) : cond;
          if (parsed.field) {
            const cv = vals[parsed.field];
            const checkVals = Array.isArray(parsed.value) ? parsed.value : [parsed.value];
            return checkVals.some(v => String(v || '').toLowerCase() === String(cv || '').toLowerCase());
          }
        } catch { /* ignore */ }
        return true;
      };
      const visibleFields = fields.filter(f => evalCond(f.show_when, arrestedTempValues));
      return (
        <fieldset className="bg-white">
          <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
            {lang === 'hi' ? (tab.title_hi || tab.title_en) : tab.title_en}
          </legend>
          <div className="grid grid-cols-[220px_1fr] border border-[#7a9cc5] rounded overflow-hidden mt-2">
            {visibleFields.map((field, idx) => {
              const key = field.field_key;
              const label = lang === 'hi' ? (field.label_hi || field.label_en) : field.label_en;
              const rules = parseRules(field.validation_rules);
              const isRequired = !!rules.required;
              const isLast = idx === visibleFields.length - 1;
              const isDisabled = readOnly || field.readonly === true || field.readonly === 'true';
              return (
                <React.Fragment key={key}>
                  <div className={`bg-[#dfeaf5] px-2 py-2 text-[12px] font-medium flex items-center gap-1 ${!isLast ? 'border-b border-[#c7d8ea]' : ''}`}>
                    <span>{label}</span>
                    {isRequired && <span className="text-red-500 font-bold">*</span>}
                  </div>
                  <div className={`px-2 py-1 ${!isLast ? 'border-b border-[#c7d8ea]' : ''}`}>
                    <FieldRenderer field={field} value={arrestedTempValues[key]} onChange={handleArrestedModalChange} readOnly={isDisabled} hasError={arrestedModalTouched[key] && !!arrestedModalErrors[key]} lang={lang} values={arrestedTempValues} />
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </fieldset>
      );
    };

    /** Render the active sub-tab content — uses shared person helpers for person_particulars/address, generic grid for others */
    const renderActiveSubTabContent = () => {
      if (arrestedSubTab === 'person_particulars') {
        return renderPersonPersonalInfoSubTab('arrested', allFields, arrestedTempValues, handleArrestedModalChange, arrestedModalTouched, arrestedModalErrors, true, lang, readOnly);
      }
      if (arrestedSubTab === 'address') {
        return renderPersonAddressSubTab('arrested', allFields, arrestedTempValues, handleArrestedModalChange, arrestedModalTouched, arrestedModalErrors, true, lang, readOnly);
      }
      if (arrestedSubTab === 'property') {
        return renderPropertyEditor(
          arrestedTempValues?.property_details || [],
          (newList) => setArrestedTempValues(prev => ({ ...prev, property_details: newList }))
        );
      }
      // arrest_details, particular_details, custody_status — generic flat grid from backend fields
      return renderSubTabFieldGrid(arrestedSubTab);
    };



    const getArrestedName = (v) => [v.arrested_first_name, v.arrested_middle_name, v.arrested_last_name].filter(Boolean).join(' ') || '—';
    const getArrestedAddress = (v) => [v.arrested_house_no, v.arrested_street, v.arrested_colony, v.arrested_city_town_village, v.arrested_district, v.arrested_state].filter(Boolean).join(', ') || '—';

    return (
      <div className="space-y-4">
        {/* Header bar with Add Button */}
        <div className="flex justify-between items-center">
          <h3 className="text-sm font-bold text-[#0d2a4a] uppercase tracking-wide">
            {lang === 'hi' ? `गिरफ्तार व्यक्तियों की सूची (${arrestedList.length})` : `Arrested Persons List (${arrestedList.length})`}
          </h3>
          <button
            type="button"
            onClick={openArrestedAddModal}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#0d2a4a] text-white text-xs font-bold rounded hover:bg-[#16406d] transition-colors cursor-pointer"
          >
            <span className="text-base leading-none">+</span>
            {lang === 'hi' ? 'गिरफ्तार व्यक्ति जोड़ें' : 'Add Arrested Person'}
          </button>
        </div>

        {/* Summary Table */}
        <div className="border border-[#7a9cc5] rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#0d2a4a] text-white">
                <th className="px-3 py-2 text-left w-14 font-semibold">{lang === 'hi' ? 'क्र.सं.' : 'S.No.'}</th>
                <th className="px-3 py-2 text-left font-semibold">{lang === 'hi' ? 'नाम' : 'Name'}</th>
                <th className="px-3 py-2 text-left font-semibold">{lang === 'hi' ? 'पता' : 'Address'}</th>
                <th className="px-3 py-2 text-center w-28 font-semibold">{lang === 'hi' ? 'कार्रवाई' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {arrestedList.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-400 italic">
                    {lang === 'hi' ? 'कोई गिरफ्तार व्यक्ति नहीं जोड़ा गया। "+ गिरफ्तार व्यक्ति जोड़ें" पर क्लिक करें।' : 'No arrested persons added yet. Click "+ Add Arrested Person" to add.'}
                  </td>
                </tr>
              ) : (
                arrestedList.map((arr, idx) => (
                  <tr key={idx} className={`border-t border-[#c7d8ea] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#f0f5fa]'}`}>
                    <td className="px-3 py-2 font-medium">{idx + 1}</td>
                    <td className="px-3 py-2">{getArrestedName(arr)}</td>
                    <td className="px-3 py-2 text-slate-600">{getArrestedAddress(arr)}</td>
                    <td className="px-3 py-2 text-center">
                      <button type="button" onClick={() => openArrestedEditModal(idx)} className="text-[#0d2a4a] hover:text-[#ea580c] font-semibold mr-3 cursor-pointer underline transition-colors">
                        {lang === 'hi' ? 'संपादन' : 'Edit'}
                      </button>
                      <button type="button" onClick={() => deleteArrestedEntry(idx)} className="text-red-500 hover:text-red-700 font-semibold cursor-pointer underline transition-colors">
                        {lang === 'hi' ? 'हटाएं' : 'Delete'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Modal Dialog */}
        {isArrestedModalOpen && createPortal(
          <div className={`${themeClass} fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4`}>
            <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-[1050px] h-[85vh] max-h-[750px] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between bg-[#0d2a4a] text-white px-5 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wide">
                  {activeArrestedIndex !== null
                    ? (lang === 'hi' ? 'गिरफ्तार व्यक्ति की जानकारी संपादित करें' : 'Edit Arrested Person Information')
                    : (lang === 'hi' ? 'गिरफ्तार व्यक्ति की जानकारी' : 'Arrested Person Information')}
                </h2>
                <button type="button" onClick={() => setIsArrestedModalOpen(false)} className="text-white/80 hover:text-white text-2xl leading-none font-bold cursor-pointer transition-colors" title="Close">×</button>
              </div>

              {/* Sub-tabs from backend */}
              {renderSubTabBar('arrested_info', arrestedSubTab, setArrestedSubTab)}

              {/* Body — renders active sub-tab content from schema */}
              <div className="flex-1 overflow-y-auto p-4 border border-t-0 border-[#7a9cc5] bg-white">
                {renderActiveSubTabContent()}
              </div>

              {/* Footer */}
              <div className="flex justify-end gap-3 px-5 py-3 border-t border-slate-200 bg-slate-50">
                <button type="button" onClick={saveArrestedEntry} className="px-6 py-2 bg-[#0d2a4a] text-white text-xs font-bold rounded hover:bg-[#16406d] cursor-pointer transition-colors">
                  {lang === 'hi' ? 'सहेजें' : 'Save'}
                </button>
                <button type="button" onClick={() => setIsArrestedModalOpen(false)} className="px-6 py-2 bg-slate-200 text-slate-700 text-xs font-bold rounded hover:bg-slate-300 cursor-pointer transition-colors">
                  {lang === 'hi' ? 'बंद करें' : 'Close'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  };


  const renderActionTakenStep = () => {
    const actionTakenFields = finalSchema.find(s => s.section === 'action_taken')?.fields || [];

    const evalActionCond = (cond, vals) => {
      if (!cond) return true;
      const parsed = typeof cond === 'string' ? JSON.parse(cond) : cond;
      if (parsed.and) return parsed.and.every(c => evalActionCond(c, vals));
      const { field: tf, value: tv, operator } = parsed;
      const cv = vals[tf];
      if (operator === 'filled') return cv !== undefined && cv !== null && String(cv).trim() !== '';
      return Array.isArray(tv)
        ? tv.map(v => String(v || '').toLowerCase()).includes(String(cv || '').toLowerCase())
        : String(cv || '').toLowerCase() === String(tv || '').toLowerCase();
    };

    const activeFields = actionTakenFields.filter(f => evalActionCond(f.show_when, values));

    const renderFieldWithLabel = (field, index) => {
      const key = field.field_key;
      const label = lang === 'hi' ? (field.label_hi || field.label_en) : field.label_en;
      const rules = parseRules(field.validation_rules);
      const isRequired = !!rules.required;
      const isLast = index === activeFields.length - 1;
      const isDisabled = readOnly || field.readonly === true || field.readonly === 'true';

      return (
        <React.Fragment key={key}>
          <div className={`bg-[#dfeaf5] px-2 py-2 text-[12px] font-medium flex items-center gap-1 ${!isLast ? 'border-b border-[#c7d8ea]' : ''}`}>
            <span>{label}</span>
            {isRequired && <span className="text-red-500 font-bold">*</span>}
          </div>
          <div className={`px-2 py-1 ${!isLast ? 'border-b border-[#c7d8ea]' : ''}`}>
            <FieldRenderer
              field={field}
              value={values[key]}
              onChange={handleChange}
              readOnly={isDisabled}
              hasError={touched[key] && !!errors[key]}
              lang={lang}
              values={values}
            />
          </div>
        </React.Fragment>
      );
    };

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-[220px_1fr] border border-[#7a9cc5] rounded overflow-hidden">
          {activeFields.map((field, idx) => renderFieldWithLabel(field, idx))}
        </div>
      </div>
    );
  };

  const firOptions = React.useMemo(() => {
    return (casesData || []).map(c => {
      const firNo = c.data?.fir_no || c.fir_no || `FIR No. ${c.id}`;
      const ps = c.data?.police_station || 'Unknown';
      const date = c.data?.fir_date || 'N/A';
      return {
        value: firNo,
        label_en: `${firNo} (PS: ${ps}, Date: ${date})`,
        label_hi: `${firNo} (थाना: ${ps}, दिनांक: ${date})`
      };
    });
  }, [casesData]);

  const mockOptions = React.useMemo(() => [
    { value: 'FIR No. 104/2026', label_en: 'FIR No. 104/2026 (PS: Parliament Street, Sec 379 IPC)', label_hi: 'एफआईआर संख्या 104/2026 (थाना: पार्लियामेंट स्ट्रीट, धारा 379 आईपीसी)' },
    { value: 'FIR No. 112/2026', label_en: 'FIR No. 112/2026 (PS: Chanakyapuri, Sec 302 IPC)', label_hi: 'एफआईआर संख्या 112/2026 (थाना: चाणक्यपुरी, धारा 302 आईपीसी)' },
    { value: 'FIR No. 125/2026', label_en: 'FIR No. 125/2026 (PS: Mandir Marg, Sec 323 IPC)', label_hi: 'एफआईआर संख्या 125/2026 (थाना: मंदिर मार्ग, धारा 323 आईपीसी)' },
    { value: 'FIR No. 150/2026', label_en: 'FIR No. 150/2026 (PS: Tughlak Road, Sec 406 IPC)', label_hi: 'एफआईआर संख्या 150/2026 (थाना: तुगलक रोड, धारा 406 आईपीसी)' },
  ], []);

  const finalFirOptions = firOptions.length > 0 ? firOptions : mockOptions;

  const finalSchema = React.useMemo(() => {
    if (!schema || schema.length === 0) return [];

    const order = SECTION_KEY_ORDER[recordType];
    if (!order) return schema;

    const bySection = new Map(schema.map((sec) => [sec.section, sec]));

    const orderedSections = order
      .filter((key) => key !== 'select_fir' || (recordType === 'ARREST' && caseType === 'against_fir'))
      .map((key) => {
        if (key === 'select_fir') {
          return {
            section: 'select_fir',
            title_en: 'Select FIR',
            title_hi: 'प्राथमिकी (FIR) चुनें',
            fields: [{
              field_key: 'selected_fir',
              field_type: 'SELECT',
              label_en: 'Select FIR Number',
              label_hi: 'प्राथमिकी (FIR) संख्या चुनें',
              validation_rules: { required: true },
              options: finalFirOptions,
            }],
          };
        }

        const section = bySection.get(key);
        if (!section) return null;
        // view_only_when_populated (ARREST record-level "Property (Imported)" section, #8):
        // render ONLY when the record actually has record-level properties (person_id == null —
        // only bulk import produces these). This keeps interactive ARREST entry unchanged (no
        // empty second property section) while making imported ARREST properties visible.
        if (section.view_only_when_populated) {
          const hasRecordLevelProps = (initialProperties || []).some(p => !p.person_id);
          if (!hasRecordLevelProps) return null;
        }
        return {
          section: key,
          title_en: section.title_en,
          title_hi: section.title_hi,
          fields: flattenSectionFields(section),
          sub_tabs: section.sub_tabs,
          is_repeater: section.is_repeater,
          entity_type: section.entity_type,
          person_type: section.person_type,
          view_only_when_populated: section.view_only_when_populated,
        };
      })
      .filter(Boolean);

    // Append extra sections that are not in the hardcoded order list and contain custom fields
    const orderSet = new Set(order);
    const extraSections = schema
      .filter((sec) => {
        if (orderSet.has(sec.section)) return false;
        const fields = sec.fields || [];
        const hasCustomField = fields.some(f => f.created_by !== null && f.created_by !== undefined);
        return hasCustomField;
      })
      .map((sec) => ({
        section: sec.section,
        title_en: sec.title_en,
        title_hi: sec.title_hi,
        fields: flattenSectionFields(sec),
        sub_tabs: sec.sub_tabs,
        is_repeater: sec.is_repeater,
        entity_type: sec.entity_type,
        person_type: sec.person_type,
      }));

    return [...orderedSections, ...extraSections];
  }, [schema, recordType, caseType, finalFirOptions, initialProperties]);

  const { triggerAutosave, saveImmediately, saveStatus, savedRecord } = useAutosave(
    recordType,
    initialValues?.id
  );

  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [repeaterState, setRepeaterState] = useState({});
  const [propertyMinorOptionsMap, setPropertyMinorOptionsMap] = useState({});

  const [armsLookupMap, setArmsLookupMap] = useState({});



  const [showAddRow, setShowAddRow] = useState(false);
  const [newAct, setNewAct] = useState('');
  const [newSection, setNewSection] = useState('');
  const [newSectionVal, setNewSectionVal] = useState('');
  const [actsSectionsRegistry, setActsSectionsRegistry] = useState([]);
  const [dbMajorHeadOptions, setDbMajorHeadOptions] = useState([]);
  const [dbMinorHeadOptions, setDbMinorHeadOptions] = useState([]);
  const [showOccurrencePlace, setShowOccurrencePlace] = useState(false);

  // Victim Modal state hooks
  const [isVictimModalOpen, setIsVictimModalOpen] = useState(false);
  const [activeVictimIndex, setActiveVictimIndex] = useState(null);
  const [victimTempValues, setVictimTempValues] = useState({});
  const [victimSubTab, setVictimSubTab] = useState('personal');
  const [victimModalErrors, setVictimModalErrors] = useState({});
  const [victimModalTouched, setVictimModalTouched] = useState({});

  // Accused Modal state hooks
  const [isAccusedModalOpen, setIsAccusedModalOpen] = useState(false);
  const [activeAccusedIndex, setActiveAccusedIndex] = useState(null);
  const [accusedTempValues, setAccusedTempValues] = useState({});
  const [accusedSubTab, setAccusedSubTab] = useState('personal');
  const [accusedModalErrors, setAccusedModalErrors] = useState({});
  const [accusedModalTouched, setAccusedModalTouched] = useState({});

  // Arrested Modal state hooks
  const [isArrestedModalOpen, setIsArrestedModalOpen] = useState(false);
  const [activeArrestedIndex, setActiveArrestedIndex] = useState(null);
  const [arrestedTempValues, setArrestedTempValues] = useState({});
  const [arrestedSubTab, setArrestedSubTab] = useState('arrest_details'); // 'arrest_details' | 'person_particulars' | 'particular_details' | 'address'
  const [arrestedModalErrors, setArrestedModalErrors] = useState({});
  const [arrestedModalTouched, setArrestedModalTouched] = useState({});

  useEffect(() => {
    const list = repeaterState?.property_details || [];
    const arrestedList = arrestedTempValues?.property_details || [];
    const combinedList = [...list, ...arrestedList];
    // NOT .filter(Boolean) — "Others" has parent_cd 0, which Boolean() treats as falsy and
    // would silently drop, leaving its Type of Property dropdown permanently unpopulated.
    const majorCategories = Array.from(new Set(
      combinedList.map(row => row.property_major_category).filter(v => v !== undefined && v !== null && v !== '')
    ));

    majorCategories.forEach(cat => {
      if (propertyMinorOptionsMap[cat]) return; // already loaded or loading

      // Pre-populate to avoid multiple requests in flight
      setPropertyMinorOptionsMap(prev => ({ ...prev, [cat]: [] }));

      api.get(`/fields/lookup/property-items/${cat}`)
        .then(res => {
          if (res.data?.success) {
            const data = res.data.data;
            let options = [];
            if (data?.type === 'ARMS') {
              options = (data.categories || []).map(c => ({
                value: c.arms_category_cd ?? c.value ?? c,
                label_en: c.arms_category ?? c.label ?? c,
                label_hi: c.arms_category ?? c.label ?? c
              }));
              setArmsLookupMap(prev => ({
                ...prev,
                [cat]: {
                  fireArms: (data.fireArms || []).map(f => ({
                    value: f.fire_arms_cd ?? f.value ?? f,
                    label_en: f.fire_arms ?? f.label ?? f,
                    label_hi: f.fire_arms ?? f.label ?? f,
                    parent_id: f.arms_category_cd ?? f.parent_id
                  })),
                  fireArmsSubtypes: (data.fireArmsSubtypes || []).map(s => ({
                    value: s.arms_subtype_cd ?? s.value ?? s,
                    label_en: s.arms_subtype ?? s.label ?? s,
                    label_hi: s.arms_subtype ?? s.label ?? s,
                    parent_id: s.arms_type_cd ?? s.parent_id
                  }))
                }
              }));
            } else if (data?.type === 'OTHER_PROPERTY') {

              options = (data.categories || []).map(c => ({
                value: c.value ?? c.parent_cd ?? c,
                label_en: c.label ?? c.code_type ?? c,
                label_hi: c.label ?? c.code_type ?? c
              }));
              setArmsLookupMap(prev => ({
                ...prev,
                [cat]: {
                  otherSubtype: (data.items || []).map(i => ({
                    value: i.value ?? i.property_cd ?? i,
                    label_en: i.label ?? i.property ?? i,
                    label_hi: i.label ?? i.property ?? i,
                    parent_id: i.parent_id
                  }))
                }
              }));
            } else if (Array.isArray(data)) {
              options = data.map(o => ({
                value: o.value ?? o.property_cd ?? o,
                label_en: o.label ?? o.property ?? o,
                label_hi: o.label ?? o.property ?? o
              }));
            }
            setPropertyMinorOptionsMap(prev => ({
              ...prev,
              [cat]: options
            }));

            // Sync string minor categories in repeaterState to their numeric option IDs
            setRepeaterState(prev => {
              const nextState = { ...prev };
              let changed = false;
              for (const [sectionKey, sectionData] of Object.entries(nextState)) {
                if (Array.isArray(sectionData)) {
                  nextState[sectionKey] = sectionData.map(row => {
                    let updatedRow = row;
                    // Handle flat property rows
                    if (String(row.property_major_category) === String(cat) && row.property_minor_category) {
                      const val = row.property_minor_category;
                      const isAlreadyNumeric = /^\d+$/.test(String(val));
                      if (!isAlreadyNumeric) {
                        const match = options.find(o => 
                          String(o.label_en).toLowerCase().trim() === String(val).toLowerCase().trim() ||
                          String(o.label_hi).toLowerCase().trim() === String(val).toLowerCase().trim()
                        );
                        if (match) {
                          updatedRow = { ...updatedRow, property_minor_category: match.value };
                          changed = true;
                        }
                      }
                    }
                    // Handle nested property_details inside person rows (like arrested persons)
                    if (Array.isArray(updatedRow.property_details)) {
                      const updatedDetails = updatedRow.property_details.map(pRow => {
                        if (String(pRow.property_major_category) === String(cat) && pRow.property_minor_category) {
                          const val = pRow.property_minor_category;
                          const isAlreadyNumeric = /^\d+$/.test(String(val));
                          if (!isAlreadyNumeric) {
                            const match = options.find(o => 
                              String(o.label_en).toLowerCase().trim() === String(val).toLowerCase().trim() ||
                              String(o.label_hi).toLowerCase().trim() === String(val).toLowerCase().trim()
                            );
                            if (match) {
                              changed = true;
                              return { ...pRow, property_minor_category: match.value };
                            }
                          }
                        }
                        return pRow;
                      });
                      if (changed) {
                        updatedRow = { ...updatedRow, property_details: updatedDetails };
                      }
                    }
                    return updatedRow;
                  });
                }
              }
              return changed ? nextState : prev;
            });
          }
        })
        .catch(err => {
          console.error(`Failed to fetch items for property category ${cat}:`, err);
        });
    });
  }, [repeaterState?.property_details, arrestedTempValues?.property_details, propertyMinorOptionsMap]);

  /* ── Major / Minor Head state ────────────────────────────────────────────── */
  const [selectedMajorHead, setSelectedMajorHead] = useState('');
  const [selectedMinorHead, setSelectedMinorHead] = useState('');
  const [majorMinorRows, setMajorMinorRows] = useState([]);
  const allSchemaFields = React.useMemo(() => deepFlattenSchema(schema), [schema]);
  const getSectionSubTabs = (sectionKey) => schema?.find((s) => s.section === sectionKey)?.sub_tabs || [];
  const fieldLabel = (key) => {
    const f = allSchemaFields.find((x) => x.field_key === key);
    if (!f) return null;
    return lang === 'hi' ? (f.label_hi || f.label_en) : f.label_en;
  };

  const renderSubTabBar = (sectionKey, activeTab, setActiveTab, extraWrapperClass = '') => (
    <div className={`flex gap-2 border-b border-[#7a9cc5] pb-0 bg-slate-100/50 p-1 ${extraWrapperClass}`}>
      {getSectionSubTabs(sectionKey).map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setActiveTab(t.id)}
          className={`px-4 py-1.5 text-xs font-bold border border-b-0 border-[#7a9cc5] rounded-t cursor-pointer transition-colors ${activeTab === t.id
              ? 'bg-[#ea580c] text-white'
              : 'bg-[#0d2a4a] text-white hover:bg-[#16406d]'
            }`}
        >
          {lang === 'hi' ? (t.title_hi || t.title_en) : t.title_en}
        </button>
      ))}
    </div>
  );

  const openVictimAddModal = () => {
    setVictimTempValues({});
    setActiveVictimIndex(null);
    setVictimSubTab('personal');
    setVictimModalErrors({});
    setVictimModalTouched({});
    setIsVictimModalOpen(true);
  };

  const openVictimEditModal = (idx) => {
    const list = repeaterState.victim_info || [];
    const item = list[idx];
    if (item && item._is_complainant) {
      alert(lang === 'hi' ? 'यह विवरण शिकायतकर्ता से जुड़े हैं। कृपया शिकायतकर्ता टैब में बदलाव करें।' : 'These details are linked to the Complainant. Please edit them in the Complainant tab.');
      return;
    }
    setVictimTempValues({ ...(item || {}) });
    setActiveVictimIndex(idx);
    setVictimSubTab('personal');
    setVictimModalErrors({});
    setVictimModalTouched({});
    setIsVictimModalOpen(true);
  };

  const deleteVictimEntry = (idx) => {
    const list = repeaterState.victim_info || [];
    const itemToDelete = list[idx];
    if (itemToDelete && itemToDelete._is_complainant) {
      handleChange('complainant_same_as_victim', 'No');
    }
    const nextList = list.filter((_, i) => i !== idx);
    setRepeaterState(prev => ({ ...prev, victim_info: nextList }));
  };

  const handleVictimModalChange = (key, val) => {
    setVictimTempValues((prev) => {
      const next = { ...prev, [key]: val };

      // DOB, Age (Years) and Year of Birth interlinking
      if (key === 'victim_dob') {
        const dateStr = val;
        if (dateStr && dateStr.length >= 4) {
          const dobDate = parseDMY(dateStr);
          if (dobDate && !isNaN(dobDate.getTime())) {
            const birthY = dobDate.getFullYear();
            next.victim_birth_year = birthY;
            const diffMs = Date.now() - dobDate.getTime();
            const ageY = Math.max(0, Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000)));
            next.victim_age_year = ageY;
            const ageM = Math.max(0, Math.floor((diffMs % (365.25 * 24 * 60 * 60 * 1000)) / (30.43 * 24 * 60 * 60 * 1000)));
            next.victim_age_month = ageM;
          }
        } else {
          next.victim_birth_year = '';
          next.victim_age_year = '';
          next.victim_age_month = '';
        }
      }

      if (key === 'victim_age_year') {
        const num = parseInt(val, 10);
        if (!isNaN(num) && num >= 0) {
          next.victim_birth_year = new Date().getFullYear() - num;
        } else {
          next.victim_birth_year = '';
        }
      }

      // Address copying and auto-sync
      syncPermAddress(next, 'victim', key, val);

      // Clear error on change
      if (victimModalErrors[key]) {
        setVictimModalErrors((e) => { const n = { ...e }; delete n[key]; return n; });
      }

      return next;
    });
  };

  const openAccusedAddModal = () => {
    setAccusedTempValues({});
    setActiveAccusedIndex(null);
    setAccusedSubTab('personal');
    setAccusedModalErrors({});
    setAccusedModalTouched({});
    setIsAccusedModalOpen(true);
  };

  const openAccusedEditModal = (idx) => {
    const list = repeaterState.accused_info || [];
    setAccusedTempValues({ ...(list[idx] || {}) });
    setActiveAccusedIndex(idx);
    setAccusedSubTab('personal');
    setAccusedModalErrors({});
    setAccusedModalTouched({});
    setIsAccusedModalOpen(true);
  };

  const deleteAccusedEntry = (idx) => {
    const list = repeaterState.accused_info || [];
    const nextList = list.filter((_, i) => i !== idx);
    setRepeaterState(prev => ({ ...prev, accused_info: nextList }));
  };

  const handleAccusedModalChange = (key, val) => {
    setAccusedTempValues((prev) => {
      const next = { ...prev, [key]: val };

      // DOB, Age (Years) and Year of Birth interlinking
      if (key === 'accused_dob') {
        const dateStr = val;
        if (dateStr && dateStr.length >= 4) {
          const dobDate = parseDMY(dateStr);
          if (dobDate && !isNaN(dobDate.getTime())) {
            const birthY = dobDate.getFullYear();
            next.accused_birth_year = birthY;
            const diffMs = Date.now() - dobDate.getTime();
            const ageY = Math.max(0, Math.floor(diffMs / (365.25 * 24 * 60 * 60 * 1000)));
            next.accused_age_year = ageY;
            const ageM = Math.max(0, Math.floor((diffMs % (365.25 * 24 * 60 * 60 * 1000)) / (30.43 * 24 * 60 * 60 * 1000)));
            next.accused_age_month = ageM;
          }
        } else {
          next.accused_birth_year = '';
          next.accused_age_year = '';
          next.accused_age_month = '';
        }
      }

      if (key === 'accused_age_year') {
        const num = parseInt(val, 10);
        if (!isNaN(num) && num >= 0) {
          next.accused_birth_year = new Date().getFullYear() - num;
        } else {
          next.accused_birth_year = '';
        }
      }

      // Address copying and auto-sync
      syncPermAddress(next, 'accused', key, val);

      // Clear error on change
      if (accusedModalErrors[key]) {
        setAccusedModalErrors((e) => { const n = { ...e }; delete n[key]; return n; });
      }

      return next;
    });
  };

  const saveAccusedEntry = () => {
    const accusedFields = allSchemaFields.filter(f => f.field_key?.startsWith('accused_') || f.section === 'accused_address' || f.section === 'accused_personal_info');
    const errs = {};
    const touchedFields = {};

    accusedFields.forEach(f => {
      if (f.show_when) {
        const { field: targetField, value: targetValue } = f.show_when;
        const currentValue = String(accusedTempValues[targetField] || '').toLowerCase();
        const allowed = Array.isArray(targetValue)
          ? targetValue.map(v => String(v).toLowerCase())
          : [String(targetValue || '').toLowerCase()];
        if (!allowed.includes(currentValue)) return;
      }

      const rules = parseRules(f.validation_rules);
      if (rules.required) {
        const val = accusedTempValues[f.field_key];
        const isEmpty = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);
        if (isEmpty) {
          const label = lang === 'hi' ? (f.label_hi || f.label_en) : f.label_en;
          errs[f.field_key] = lang === 'hi' ? `${label} आवश्यक है` : `${label} is required`;
        }
      }
    });

    if (!accusedTempValues.accused_first_name) {
      errs.accused_first_name = lang === 'hi' ? 'पहला नाम आवश्यक है' : 'First Name is required';
    }
    if (!accusedTempValues.accused_gender) {
      errs.accused_gender = lang === 'hi' ? 'लिंग आवश्यक है' : 'Gender is required';
    }

    if (Object.keys(errs).length > 0) {
      setAccusedModalErrors(errs);
      accusedFields.forEach(f => { touchedFields[f.field_key] = true; });
      setAccusedModalTouched(touchedFields);
      toast.error(lang === 'hi' ? 'कृपया सभी आवश्यक फ़ील्ड भरें।' : 'Please fill all required fields.');
      return;
    }

    const list = [...(repeaterState.accused_info || [])];
    if (activeAccusedIndex !== null) {
      list[activeAccusedIndex] = accusedTempValues;
    } else {
      list.push(accusedTempValues);
    }

    setRepeaterState(prev => ({ ...prev, accused_info: list }));
    setIsAccusedModalOpen(false);
  };

  const openArrestedAddModal = () => {
    setArrestedTempValues({
      property_details: [{
        property_major_category: '',
        property_minor_category: '',
        property_details: '',
        property_value_inr: '',
        property_stolen_recovered: 'Stolen'
      }]
    });
    setActiveArrestedIndex(null);
    setArrestedSubTab('arrest_details');
    setArrestedModalErrors({});
    setArrestedModalTouched({});
    setIsArrestedModalOpen(true);
  };

  const openArrestedEditModal = (idx) => {
    const list = repeaterState.arrested_info || [];
    const entry = { ...(list[idx] || {}) };
    if (!entry.property_details || entry.property_details.length === 0) {
      entry.property_details = [{
        property_major_category: '',
        property_minor_category: '',
        property_details: '',
        property_value_inr: '',
        property_stolen_recovered: 'Stolen'
      }];
    }
    setArrestedTempValues(entry);
    setActiveArrestedIndex(idx);
    setArrestedSubTab('arrest_details');
    setArrestedModalErrors({});
    setArrestedModalTouched({});
    setIsArrestedModalOpen(true);
  };

  const deleteArrestedEntry = (idx) => {
    const list = repeaterState.arrested_info || [];
    const nextList = list.filter((_, i) => i !== idx);
    setRepeaterState(prev => ({ ...prev, arrested_info: nextList }));
  };

  const handleArrestedDobChange = (dobVal, currentTemp) => {
    if (!dobVal) return currentTemp;
    const next = { ...currentTemp, arrested_dob: dobVal };
    const dobDate = parseDMY(dobVal);
    if (dobDate && !isNaN(dobDate.getTime())) {
      const today = new Date();
      let age = today.getFullYear() - dobDate.getFullYear();
      const m = today.getMonth() - dobDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
        age--;
      }
      next.arrested_age_year = age >= 0 ? age : '';
      next.arrested_birth_year = dobDate.getFullYear();
    }
    return next;
  };

  const handleArrestedAgeChange = (ageVal, currentTemp) => {
    const next = { ...currentTemp, arrested_age_year: ageVal };
    if (ageVal !== '') {
      const ageNum = parseInt(ageVal, 10);
      if (!isNaN(ageNum)) {
        const today = new Date();
        next.arrested_birth_year = today.getFullYear() - ageNum;
        next.arrested_dob = '';
      }
    }
    return next;
  };

  const handleArrestedModalChange = (key, val) => {
    setArrestedTempValues((prev) => {
      let next = { ...prev, [key]: val };

      if (key === 'arrested_dob') {
        next = handleArrestedDobChange(val, next);
      }

      if (key === 'arrested_age_year') {
        next = handleArrestedAgeChange(val, next);
      }

      syncPermAddress(next, 'arrested', key, val);

      if (arrestedModalErrors[key]) {
        setArrestedModalErrors((e) => { const n = { ...e }; delete n[key]; return n; });
      }

      return next;
    });
  };

  const saveArrestedEntry = () => {
    const arrestedFields = allSchemaFields.filter(f => f.field_key?.startsWith('arrested_') || f.field_key?.startsWith('arrest_') || f.section === 'arrestee_info' || f.section === 'arrested_personal_info' || f.section === 'arrested_address' || f.section === 'arrest_details' || f.field_key === 'scheme_of_arrest' || f.section === 'custody_status' || f.field_key === 'status');
    const errs = {};
    const touchedFields = {};

    arrestedFields.forEach(f => {
      if (f.show_when) {
        try {
          const cond = typeof f.show_when === 'string' ? JSON.parse(f.show_when) : f.show_when;
          if (cond && cond.field) {
            const currentValue = String(arrestedTempValues[cond.field] || '').toLowerCase();
            const allowed = Array.isArray(cond.value)
              ? cond.value.map(v => String(v).toLowerCase())
              : [String(cond.value || '').toLowerCase()];
            if (!allowed.includes(currentValue)) return;
          }
        } catch (e) { }
      }

      const rules = parseRules(f.validation_rules);
      if (rules.required) {
        const val = arrestedTempValues[f.field_key];
        const isEmpty = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);
        if (isEmpty) {
          const label = lang === 'hi' ? (f.label_hi || f.label_en) : f.label_en;
          errs[f.field_key] = lang === 'hi' ? `${label} आवश्यक है` : `${label} is required`;
        }
      }
    });

    if (!arrestedTempValues.arrested_first_name) {
      errs.arrested_first_name = lang === 'hi' ? 'पहला नाम आवश्यक है' : 'First Name is required';
    }
    if (!arrestedTempValues.arrested_gender) {
      errs.arrested_gender = lang === 'hi' ? 'लिंग आवश्यक है' : 'Gender is required';
    }

    if (Object.keys(errs).length > 0) {
      setArrestedModalErrors(errs);
      arrestedFields.forEach(f => { touchedFields[f.field_key] = true; });
      setArrestedModalTouched(touchedFields);
      toast.error(lang === 'hi' ? 'कृपया सभी आवश्यक फ़ील्ड भरें।' : 'Please fill all required fields.');
      return;
    }

    const list = [...(repeaterState.arrested_info || [])];
    if (activeArrestedIndex !== null) {
      list[activeArrestedIndex] = arrestedTempValues;
    } else {
      list.push(arrestedTempValues);
    }

    setRepeaterState(prev => ({ ...prev, arrested_info: list }));
    setIsArrestedModalOpen(false);
  };

  const saveVictimEntry = () => {
    const victimFields = allSchemaFields.filter(f => f.field_key?.startsWith('victim_') || f.section === 'victim_address' || f.section === 'victim_personal_info');
    const errs = {};
    const touchedFields = {};

    victimFields.forEach(f => {
      if (f.show_when) {
        const { field: targetField, value: targetValue } = f.show_when;
        const currentValue = String(victimTempValues[targetField] || '').toLowerCase();
        const allowed = Array.isArray(targetValue)
          ? targetValue.map(v => String(v).toLowerCase())
          : [String(targetValue || '').toLowerCase()];
        if (!allowed.includes(currentValue)) return;
      }

      const rules = parseRules(f.validation_rules);
      if (!rules.required) return;

      const val = victimTempValues[f.field_key];
      const isEmpty = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);
      if (isEmpty) {
        const label = lang === 'hi' ? (f.label_hi || f.label_en) : f.label_en;
        errs[f.field_key] = lang === 'hi' ? `${label} आवश्यक है` : `${label} is required`;
      }
    });

    if (!victimTempValues.victim_first_name) {
      errs.victim_first_name = lang === 'hi' ? 'पहला नाम आवश्यक है' : 'First Name is required';
    }
    if (!victimTempValues.victim_gender) {
      errs.victim_gender = lang === 'hi' ? 'लिंग आवश्यक है' : 'Gender is required';
    }

    if (Object.keys(errs).length > 0) {
      setVictimModalErrors(errs);
      victimFields.forEach(f => { touchedFields[f.field_key] = true; });
      setVictimModalTouched(touchedFields);
      toast.error(lang === 'hi' ? 'कृपया सभी आवश्यक फ़ील्ड भरें।' : 'Please fill all required fields.');
      return;
    }

    const list = [...(repeaterState.victim_info || [])];
    if (activeVictimIndex !== null) {
      list[activeVictimIndex] = victimTempValues;
    } else {
      list.push(victimTempValues);
    }

    setRepeaterState(prev => ({ ...prev, victim_info: list }));
    setIsVictimModalOpen(false);
  };


  const getMajorHeadOptions = useCallback(() => {
    const actNameRaw = values.act_name || '';
    if (!actNameRaw) return [];
  // Split comma-separated acts and normalise to schema keys
  const rawActKeys = actNameRaw
    .split(',')
    .map(a => a.trim())
    .filter(Boolean);
  const actKeys = [];
  for (const item of rawActKeys) {
    if (/^\d{4}$/.test(item) && actKeys.length > 0) {
      actKeys[actKeys.length - 1] = `${actKeys[actKeys.length - 1]}, ${item}`;
    } else {
      actKeys.push(item);
    }
  }
  const normalizedActKeys = actKeys.map(a => ACT_NAME_ALIAS[a] || a);

  const seen = new Set();
  const allOptions = [];
  for (const actKey of normalizedActKeys) {
    const majorFields = allSchemaFields.filter(
      f => f.field_key?.includes('major_head') && f.show_when?.value === actKey
    );
    for (const mf of majorFields) {
      let opts = mf.options;
      if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch { } }
      if (opts && Array.isArray(opts)) {
        for (const opt of opts) {
          if (!seen.has(opt.value)) {
            seen.add(opt.value);
            allOptions.push(opt);
          }
        }
      }
    }
  }
  return allOptions;
}, [allSchemaFields, values.act_name]);

const getMinorHeadOptions = useCallback(() => {
  if (!selectedMajorHead) return [];
  const minorField = allSchemaFields.find(
    f => f.field_key?.includes('minor_head') && f.show_when?.value === selectedMajorHead
  );
  let opts = minorField?.options;
  if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch { } }
  if (opts && Array.isArray(opts)) {
    return opts;
  }
  return [];
}, [allSchemaFields, selectedMajorHead]);

const getLocalHeadOptions = useCallback(() => {
  const localField = allSchemaFields.find(f => f.field_key === 'local_head');
  let opts = localField?.options;
  if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch { } }
  if (opts && Array.isArray(opts)) {
    return opts;
  }
  return [];
}, [allSchemaFields]);

const [complainantTab, setComplainantTab] = useState('personal');

useEffect(() => {
  let active = true;
  api.get('/acts-sections')
    .then(res => {
      if (active && res.data?.data && Array.isArray(res.data.data)) {
        setActsSectionsRegistry(res.data.data);
      }
    })
    .catch((err) => {
      console.log('Acts & Sections API not available yet, using dynamic local registry:', err.message);
    });
  return () => {
    active = false;
  };
}, []);
useEffect(() => {
  let active = true;
  let actNamesParam = '';
  if (Array.isArray(values.act_registered_list) && values.act_registered_list.length > 0) {
    actNamesParam = values.act_registered_list.map(r => r.act).join(',');
  } else if (values.act_name) {
    actNamesParam = values.act_name;
  }

  if (!actNamesParam) {
    setDbMajorHeadOptions([]);
    return;
  }

  const rawActs = values.act_name.split(',').map((s) => s.trim()).filter(Boolean);
  const acts = [];
  for (const item of rawActs) {
    if (/^\d{4}$/.test(item) && acts.length > 0) {
      acts[acts.length - 1] = `${acts[acts.length - 1]}, ${item}`;
    } else {
      acts.push(item);
    }
  }
  const secs = values.sections ? values.sections.split(',').map((s) => s.trim()).filter(Boolean) : [];

  const sectionCodes = [];
  acts.forEach((actLabel, i) => {
    const secLabel = secs[i];
    if (!secLabel) return;
    const actEntry = actsSectionsRegistry.find(r => r.act === actLabel);
    const code = actEntry?.sections.find(s => s.section === secLabel)?.section_code;
    if (code) sectionCodes.push(code);
  });

  const params = sectionCodes.length > 0
    ? { section_codes: sectionCodes.join(',') }
    : { act_name: values.act_name };

  api.get('/fields/lookup/major-heads', { params })
    .then(res => {
      if (active && res.data?.success && Array.isArray(res.data.data)) {
        setDbMajorHeadOptions(res.data.data);
      }
    })
    .catch(err => {
      console.error('Failed to fetch major heads:', err.message);
    });

  return () => {
    active = false;
  };
}, [values.act_name, values.sections, actsSectionsRegistry]);

// Fetch Minor Heads dynamically from the database based on selected Major Head
useEffect(() => {
  let active = true;
  if (!selectedMajorHead) {
    setDbMinorHeadOptions([]);
    return;
  }

  api.get(`/fields/lookup/major-heads/${selectedMajorHead}/minor-heads`)
    .then(res => {
      if (active && res.data?.success && Array.isArray(res.data.data)) {
        setDbMinorHeadOptions(res.data.data);
      }
    })
    .catch(err => {
      console.error('Failed to fetch minor heads:', err.message);
    });

  return () => {
    active = false;
  };
}, [selectedMajorHead]);

const formRef = useRef(null);

const prevRecordTypeRef = useRef(recordType);
const prevCaseTypeRef = useRef(caseType);
const prevInitialIdRef = useRef(initialValues?.id);

/* ── Sync saved record ID ─────────────────────────────────────────────── */
useEffect(() => {
  if (savedRecord?.id) {
    activeRecordIdRef.current = savedRecord.id;
  }
}, [savedRecord]);

/* ── Adjust step bounds if schema changes ───────────────────────────────── */
useEffect(() => {
  if (finalSchema.length > 0 && currentStep >= finalSchema.length) {
    setCurrentStep(finalSchema.length - 1);
  }
}, [finalSchema.length, currentStep]);


const initialValuesStr = JSON.stringify(initialValues || {});
const userStr = user ? JSON.stringify({
  id: user.id,
  role: user.role,
  psId: user.psId,
  districtId: user.districtId,
  stationName: user.stationName,
  districtKey: user.districtKey
}) : '';

/* ── Reset wizard progress and errors when navigating to a different record/form ── */
useEffect(() => {
  const typeChanged = prevRecordTypeRef.current !== recordType;
  const caseTypeChanged = prevCaseTypeRef.current !== caseType;
  const recordIdChanged = prevInitialIdRef.current !== initialValues?.id;

  // Avoid resetting state if we are just receiving the ID of the new draft we saved ourselves
  const isAutosaveInit = !prevInitialIdRef.current && initialValues?.id && (initialValues.id === activeRecordIdRef.current);

  if (typeChanged || caseTypeChanged || (recordIdChanged && !isAutosaveInit)) {
    setCurrentStep(0);
    setCompletedSteps(new Set());
    setErrors({});
    setTouched({});
  }

  prevRecordTypeRef.current = recordType;
  prevCaseTypeRef.current = caseType;
  prevInitialIdRef.current = initialValues?.id;
}, [recordType, caseType, initialValues?.id]);
/* ── Seed repeater entries from initialPersons / initialProperties ─────── */
// Shapes here are the backend recompose contract (records.mapper.js recomposeRecord):
// persons[] = { id, person_type, data: {<field_key>: value} }; properties[] are FLAT
// objects already keyed by field_key (property_major_category, …) plus { id, person_id }.
// `id` MUST round-trip on every entry — the backend upsert is id-preserving and DELETES
// any existing person/property row the client doesn't echo back with its id.
useEffect(() => {
  if (!finalSchema.length) return;
  const initial = {};
  // Build section-key → entries map for person sections
  for (const section of finalSchema) {
    if (!section.is_repeater) continue;
    if (section.entity_type === 'person' && section.person_type) {
      const matching = initialPersons.filter(
        p => p.person_type === section.person_type
      );
      if (matching.length > 0) {
        initial[section.section] = matching.map(p => {
          const personData = { id: p.id, ...(p.data || {}) };
          // ARRESTED persons carry their own property list (per-person, not record-level)
          if (section.person_type === 'ARRESTED') {
            personData.property_details = initialProperties
              .filter(prop => prop.person_id === p.id)
              .map(prop => ({
                ...prop,
                property_stolen_recovered: prop.property_stolen_recovered || 'Stolen',
              }));
          }
          return personData;
        });
      }
    } else if (section.entity_type === 'property') {
      // Only record-level properties — per-person ones are nested under their arrestee above.
      const recordLevel = initialProperties.filter(prop => !prop.person_id);
      if (recordLevel.length > 0) {
        initial[section.section] = recordLevel.map(prop => ({
          ...prop,
          property_stolen_recovered: prop.property_stolen_recovered || 'Stolen',
        }));
      }
    }
  }
  if (Object.keys(initial).length > 0) {
    repeaterSeedSkipRef.current = true; // seeding is not a user edit — don't autosave it back
    setRepeaterState(prev => ({ ...prev, ...initial }));
  }
}, [initialPersons, initialProperties, finalSchema.length]);

// Auto-populate 1 empty row for property details if empty and not read-only.
// ARREST's property list is per-arrested-person now (seeded in openArrestedAddModal/
// openArrestedEditModal instead) — this record-level list only applies to CASE.
useEffect(() => {
  if (!readOnly && recordType === 'CASE') {
    const propertyList = repeaterState?.property_details || [];
    if (propertyList.length === 0) {
      repeaterSeedSkipRef.current = true; // starter row is not a user edit — don't autosave it
      setRepeaterState(prev => ({
        ...prev,
        property_details: [{
          property_major_category: '',
          property_minor_category: '',
          property_details: '',
          property_value_inr: '',
          property_stolen_recovered: 'Stolen'
        }]
      }));
    }
  }
}, [repeaterState?.property_details?.length, readOnly, recordType]);

/* ── Autosave repeater (persons/properties) changes ─────────────────────── */
// Victim/Accused/Arrested entries and property rows live in `repeaterState`, NOT in
// `values` — the field-level autosave never sees them. Before this effect existed, they
// were only sent on the final wizard Submit: every draft saved via autosave or the
// "Save Draft" button silently dropped them (the "victim info doesn't get saved" bug).
// Seed/starter-row writes raise repeaterSeedSkipRef (a flag, not a counter — multiple
// programmatic writes can batch into a single commit and therefore a single run of this
// effect) so reopening a draft doesn't immediately PUT its own data back.
const repeaterSeedSkipRef = useRef(false);
const repeaterAutosaveReadyRef = useRef(false);
useEffect(() => {
  if (!repeaterAutosaveReadyRef.current) { repeaterAutosaveReadyRef.current = true; return; }
  if (readOnly) return;
  if (repeaterSeedSkipRef.current) { repeaterSeedSkipRef.current = false; return; }
  const { persons, properties } = buildRepeaterPayload();
  // Never CREATE a record off repeater churn alone (e.g. deleting the blank starter row).
  if (!activeRecordIdRef.current && persons.length === 0 && properties.length === 0) return;
  const data = { ...values };
  if (data.time_of_occurrence !== undefined) data.occurrence_time = data.time_of_occurrence;
  triggerAutosave(data, activeRecordIdRef.current, persons, properties);
}, [repeaterState]);

useEffect(() => {
  const seed = { ...(initialValues?.data || initialValues || {}) };

  console.log('[PHAROS-DEBUG][seed-effect] RUNNING — this rebuilds `values` from initialValues and calls setValues() at the end, which will CLOBBER any in-progress user edits if this effect fires again mid-edit.', {
    isEdit: !!initialValues?.id,
    recordType,
    incomingSeedSnapshot: {
      gd_no: seed.gd_no, gd_date: seed.gd_date, gd_time: seed.gd_time,
      fir_no: seed.fir_no, fir_date: seed.fir_date, fir_time: seed.fir_time,
    },
  });

  // NOTE: this used to also auto-populate gd_date/gd_time/fir_date/fir_time (and
  // dd_date/dd_time for UIDB) with the current time on new records, and cross-fill
  // fir_date/fir_time from gd_date/gd_time whenever gd_date_time was present. That
  // silently gave gd_no/fir_no a filled date+time while the number itself stayed
  // blank, which made validateSection's "fill all three or none" check for the
  // gd_no/fir_no composite fields fire on step 0 of every new (and existing) CASE
  // record, permanently blocking Next. Removed — DateTimePickerPopup already
  // defaults to "now" when opened with no value, so today's date/time is still one
  // click away without pre-seeding state behind the user's back.
  if (!initialValues?.id && recordType === 'CASE' && !seed.case_type) {
    seed.case_type = 'cctns(manual FIR)';
  }

  // Resolve station and district dynamically based on record metadata or active user node
  const recordPsId = initialValues?.ps_id || initialValues?.psId;
  const recordDistId = initialValues?.district_id || initialValues?.districtId;

  let resolvedStation = seed.police_station;
  let resolvedDistrict = seed.district;

  if (!resolvedStation) {
    if (recordPsId) {
      const node = findNodeById(recordPsId);
      if (node && node.type === 'PS') {
        resolvedStation = node.stationName || node.name;
      }
    } else if (user?.stationName) {
      resolvedStation = user.stationName;
    } else if (user?.psId) {
      const node = findNodeById(user.psId);
      if (node && node.type === 'PS') {
        resolvedStation = node.stationName || node.name;
      }
    } else {
      // Fallback only for Police Station level roles
      const isPsLevel = user?.role === 'PS' || user?.role === 'HC' || user?.role === 'SHO';
      resolvedStation = isPsLevel ? 'Parliament Street' : '';
    }
  }

  if (!resolvedDistrict) {
    if (recordDistId) {
      const node = findNodeById(recordDistId);
      if (node) {
        resolvedDistrict = node.districtKey || node.name;
      }
    } else if (user?.districtKey) {
      resolvedDistrict = user.districtKey;
    } else if (user?.districtId) {
      const node = findNodeById(user.districtId);
      if (node) {
        resolvedDistrict = node.districtKey || node.name;
      }
    } else {
      const isHqLevel = user?.role === 'HQ' || user?.role === 'HQ_ANALYST' || user?.role === 'HQ_ADMIN';
      resolvedDistrict = isHqLevel ? '' : 'New Delhi District (NDD)';
    }
  }

  // Auto-populate readonly system fields from session/metadata
  const updatedSeed = {
    ...seed,
    uid: initialValues?.id || seed.uid || 'NEW_DRAFT_PENDING',
    district: resolvedDistrict,
    police_station: resolvedStation,
    submission_status: initialValues?.current_status || seed.submission_status || 'DRAFT'
  };

  // Synchronize gd_no and linked_fir_dd_no
  updatedSeed.gd_no = updatedSeed.gd_no || updatedSeed.linked_fir_dd_no || '';
  updatedSeed.linked_fir_dd_no = updatedSeed.linked_fir_dd_no || updatedSeed.gd_no || '';

  // Synchronize local_head and crime_head
  updatedSeed.local_head = updatedSeed.local_head || updatedSeed.crime_head || '';
  updatedSeed.crime_head = updatedSeed.crime_head || updatedSeed.local_head || '';

  // Synchronize parent arrest date/time/place fields
  updatedSeed.arrest_date = updatedSeed.arrest_date || updatedSeed.date_of_arrest || '';
  updatedSeed.date_of_arrest = updatedSeed.date_of_arrest || updatedSeed.arrest_date || '';
  updatedSeed.arrest_time = updatedSeed.arrest_time || updatedSeed.time_of_arrest || '';
  updatedSeed.time_of_arrest = updatedSeed.time_of_arrest || updatedSeed.arrest_time || '';
  updatedSeed.arrest_place = updatedSeed.arrest_place || updatedSeed.place_of_arrest || '';
  updatedSeed.place_of_arrest = updatedSeed.place_of_arrest || updatedSeed.arrest_place || '';

  // Synchronize complainant permanent address if complainant_perm_same is true / Yes
  if (updatedSeed.complainant_perm_same === 'Yes' || updatedSeed.complainant_perm_same === true) {
    const addrFields = ['house_no', 'street', 'colony', 'city_town_village', 'tehsil_block_mandal', 'district', 'police_station', 'state', 'pincode', 'country'];
    for (const field of addrFields) {
      const presVal = updatedSeed[`complainant_${field}`];
      if (presVal && !updatedSeed[`complainant_perm_${field}`]) {
        updatedSeed[`complainant_perm_${field}`] = presVal;
      }
    }
  }

  // Formulate gd_date_time if missing but gd_date/gd_time exist
  // gd_date is stored as dd/mm/yyyy, so no format conversion is needed here.
  if (!updatedSeed.gd_date_time && updatedSeed.gd_date) {
    const timePart = updatedSeed.gd_time || '00:00';
    updatedSeed.gd_date_time = `${updatedSeed.gd_date} ${timePart.substring(0, 5)}`;
  }

  // Backfill crime_head (primary offence head) for drafts saved before the
  // add/delete-row handlers started writing it — it's derived from the first
  // Major Head row, and without it ARREST's required-field check can't pass.
  if (!updatedSeed.crime_head) {
    const firstMajor = String(updatedSeed.major_heads || updatedSeed.major_head || '')
      .split(',').map(s => s.trim()).filter(Boolean)[0];
    if (firstMajor) updatedSeed.crime_head = firstMajor;
  }

  console.log('[PHAROS-DEBUG][seed-effect] setValues() about to run — final composite snapshot being written into form state:', {
    gd_no: updatedSeed.gd_no, gd_date: updatedSeed.gd_date, gd_time: updatedSeed.gd_time,
    fir_no: updatedSeed.fir_no, fir_date: updatedSeed.fir_date, fir_time: updatedSeed.fir_time,
  });
  setValues(updatedSeed);

  // Initialize majorMinorRows from seed major_heads / minor_heads
  const majorsStr = String(updatedSeed.major_heads || updatedSeed.major_head || '');
  const minorsStr = String(updatedSeed.minor_heads || updatedSeed.minor_head || '');
  if (majorsStr || minorsStr) {
    const majors = majorsStr.split(',').map(s => s.trim()).filter(Boolean);
    const minors = minorsStr.split(',').map(s => s.trim()).filter(Boolean);
    const rows = [];
    const len = Math.max(majors.length, minors.length);
    for (let i = 0; i < len; i++) {
      rows.push({
        majorHead: majors[i] || '',
        minorHead: minors[i] || ''
      });
    }
    setMajorMinorRows(rows);
  }

  if (initialValues?.id) {
    activeRecordIdRef.current = initialValues.id;
  } else {
    activeRecordIdRef.current = null;
  }
}, [initialValuesStr, userStr, recordType, caseType]);

/* ── Validate a single section (step) ─────────────────────────────────── */
const validateSection = useCallback((stepIdx, currentValues = values) => {
  const section = finalSchema[stepIdx];
  if (!section) return {};
  if (section.is_repeater) return {}; // repeater sections have no flat-field validation

  const errs = {};
  const requiredKeys = section.fields.filter(f => parseRules(f.validation_rules).required).map(f => f.field_key);
  const dupeKeys = section.fields.map(f => f.field_key).filter((k, i, arr) => arr.indexOf(k) !== i);
  console.log('[PHAROS-DEBUG][validateSection] step', stepIdx, 'section=', section.section, {
    requiredKeys,
    dupeFieldKeysInThisSection: [...new Set(dupeKeys)],
    fieldCount: section.fields.length,
  });
  section.fields.forEach((field) => {
    // Skip validating if field is hidden by condition — MUST use the same
    // evaluator as the render path (FormSection), or we block on invisible fields.
    if (field.show_when) {
      const isShown = (() => {
        try {
          const cond = typeof field.show_when === 'string' ? JSON.parse(field.show_when) : field.show_when;
          return evaluateShowWhen(cond, currentValues);
        } catch (e) {
          return true;
        }
      })();
      if (!isShown) {
        console.log('[PHAROS-DEBUG][validateSection] field hidden by show_when, skipping:', field.field_key, field.show_when);
        return;
      }
    }

    const rules = parseRules(field.validation_rules);

    // Format validation (#10, 2026-07-20) — runs for ANY non-empty value, required or not, so a
    // name with digits / a non-numeric lat-long is rejected even on an optional field. Empty is
    // left to the requiredness check below. Single source of rules: utils/fieldPatterns.js.
    const patternErr = validateFieldPattern(rules, currentValues[field.field_key], lang);
    if (patternErr) {
      errs[field.field_key] = patternErr;
      return;
    }

    // Composite Number+Date(+Time) widgets. Anchored on the NUMBER — a stray date with
    // no number must never block Next. Time is deliberately NOT validated: fir_time has
    // no storage anywhere (fir_details.fir_date is a DATE column), and *_time values
    // that aren't registry fields for this record type vanish on draft reload while the
    // picker still displays a default "00:00" — demanding them made every reopened
    // draft fail with "fill all three" on data the officer had genuinely entered.
    if (field.field_key === 'gd_no' || field.field_key === 'fir_no') {
      const prefix = field.field_key === 'gd_no' ? 'gd' : 'fir';
      const num = currentValues[`${prefix}_no`];
      const dt = currentValues[`${prefix}_date`];
      console.log('[PHAROS-DEBUG][validateSection]', field.field_key, 'composite check:', {
        num: JSON.stringify(num), dt: JSON.stringify(dt), required: !!rules.required,
      });
      const labels = prefix === 'gd'
        ? { en: 'GD', hi: 'जीडी' }
        : { en: 'FIR', hi: 'प्राथमिकी' };
      if (rules.required && !(num && dt)) {
        errs[field.field_key] = lang === 'hi'
          ? `${labels.hi} नंबर और दिनांक भरना आवश्यक है।`
          : `${labels.en} Number and Date are required.`;
      } else if (num && !dt) {
        errs[field.field_key] = lang === 'hi'
          ? `${labels.hi} दिनांक भी भरें।`
          : `Please also fill the ${labels.en} Date.`;
      }
      return;
    }

    if (!rules.required) return;

    const val = currentValues[field.field_key];
    const isEmpty = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);
    console.log('[PHAROS-DEBUG][validateSection] required-field check:', field.field_key, {
      value: val, typeofValue: typeof val, isEmpty, fieldType: field.field_type,
      show_when: field.show_when || null,
    });

    if (isEmpty) {
      // `sections` has no direct input — it is only written by the Acts & Sections
      // table's "+ Add Acts & Section" modal. Point the officer at that button
      // instead of naming a field they cannot find on the form.
      if (field.field_key === 'sections') {
        errs.sections = lang === 'hi'
          ? 'कम से कम एक अधिनियम और धारा जोड़ें ("+ Add Acts & Section" बटन से)।'
          : 'Add at least one Act & Section (use the "+ Add Acts & Section" button).';
        return;
      }
      const label = lang === 'hi' ? (field.label_hi || field.label_en) : field.label_en;
      errs[field.field_key] = lang === 'hi'
        ? `${label} आवश्यक है`
        : `${label} is required`;
    }
  });
  return errs;
}, [finalSchema, values, lang]);

/* ── Validate ALL sections ─────────────────────────────────────────────── */
const validateAll = useCallback((currentValues = values) => {
  const allErrs = {};
  finalSchema.forEach((section, idx) => {
    const errs = validateSection(idx, currentValues);
    Object.assign(allErrs, errs);
  });
  return allErrs;
}, [finalSchema, values, validateSection]);

/* ── Handle field change ──────────────────────────────────────────────── */
const handleChange = useCallback((key, val) => {
  if (readOnly) return;

  const COMPOSITE_KEYS = ['gd_no', 'gd_date', 'gd_time', 'fir_no', 'fir_date', 'fir_time'];
  if (COMPOSITE_KEYS.includes(key)) {
    console.log('[PHAROS-DEBUG][handleChange] composite field changed:', key, '=', JSON.stringify(val));
  }

  setValues((prev) => {
    const next = { ...prev, [key]: val };

    if (COMPOSITE_KEYS.includes(key)) {
      console.log('[PHAROS-DEBUG][handleChange] setValues updater ran — resulting composite snapshot:', {
        gd_no: next.gd_no, gd_date: next.gd_date, gd_time: next.gd_time,
        fir_no: next.fir_no, fir_date: next.fir_date, fir_time: next.fir_time,
      });
    }

    // DOB, Age (Years) and Year of Birth interlinking
    if (key.endsWith('_dob')) {
      const prefix = key.substring(0, key.lastIndexOf('_dob'));
      if (val) {
        const dobDate = parseDMY(val);
        if (dobDate && !isNaN(dobDate.getTime())) {
          const birthYear = dobDate.getFullYear();
          const currentYear = new Date().getFullYear();
          next[`${prefix}_birth_year`] = birthYear;
          next[`${prefix}_age_year`] = Math.max(0, currentYear - birthYear);
        }
      } else {
        next[`${prefix}_birth_year`] = '';
        next[`${prefix}_age_year`] = '';
      }
    } else if (key.endsWith('_birth_year')) {
      const prefix = key.substring(0, key.lastIndexOf('_birth_year'));
      if (val) {
        const birthYear = parseInt(val, 10);
        if (!isNaN(birthYear)) {
          const currentYear = new Date().getFullYear();
          next[`${prefix}_age_year`] = Math.max(0, currentYear - birthYear);
        }
      } else {
        next[`${prefix}_age_year`] = '';
      }
    } else if (key.endsWith('_age_year')) {
      const prefix = key.substring(0, key.lastIndexOf('_age_year'));
      if (val) {
        const ageYear = parseInt(val, 10);
        if (!isNaN(ageYear)) {
          const currentYear = new Date().getFullYear();
          next[`${prefix}_birth_year`] = currentYear - ageYear;
        }
      } else {
        next[`${prefix}_birth_year`] = '';
      }
    }

    if (next.time_of_occurrence !== undefined) {
      next.occurrence_time = next.time_of_occurrence;
    }

    syncPermAddress(next, 'arrested', key, val, [{ from: 'present_address', to: 'address' }]);
    syncPermAddress(next, 'complainant', key, val);

    // Auto-set mp_known based on missing_type (Missing -> Known/Identified=true, Found -> Unknown=false)
    if (key === 'missing_type') {
      if (val === 'Missing') {
        next.mp_known = true;
      } else if (val === 'Found') {
        next.mp_known = false;
      }
    }
    // Clear error on change
    if (errors[key]) {
      setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
    }
    // Auto-save using custom hook (2 seconds debounce). Repeater data rides along on
    // every save — a flat-field autosave that omitted `persons` used to be the write
    // that (on create) froze the record's persons at [] forever.
    const { persons, properties } = buildRepeaterPayload();
    triggerAutosave(next, activeRecordIdRef.current, persons, properties);
    return next;
  });

  // Sync complainant to victim if complainant_same_as_victim is Yes
  const next = { ...values, [key]: val };
  if (key.endsWith('_dob')) {
    const prefix = key.substring(0, key.lastIndexOf('_dob'));
    if (val) {
      const dobDate = parseDMY(val);
      if (dobDate && !isNaN(dobDate.getTime())) {
        const birthYear = dobDate.getFullYear();
        const currentYear = new Date().getFullYear();
        next[`${prefix}_birth_year`] = birthYear;
        next[`${prefix}_age_year`] = Math.max(0, currentYear - birthYear);
      }
    } else {
      next[`${prefix}_birth_year`] = '';
      next[`${prefix}_age_year`] = '';
    }
  } else if (key.endsWith('_birth_year')) {
    const prefix = key.substring(0, key.lastIndexOf('_birth_year'));
    if (val) {
      const birthYear = parseInt(val, 10);
      if (!isNaN(birthYear)) {
        const currentYear = new Date().getFullYear();
        next[`${prefix}_age_year`] = Math.max(0, currentYear - birthYear);
      }
    } else {
      next[`${prefix}_age_year`] = '';
    }
  } else if (key.endsWith('_age_year')) {
    const prefix = key.substring(0, key.lastIndexOf('_age_year'));
    if (val) {
      const ageYear = parseInt(val, 10);
      if (!isNaN(ageYear)) {
        const currentYear = new Date().getFullYear();
        next[`${prefix}_birth_year`] = currentYear - ageYear;
      }
    } else {
      next[`${prefix}_birth_year`] = '';
    }
  }

  if (key === 'complainant_same_as_victim') {
    if (val === 'Yes') {
      setRepeaterState(prev => {
        const list = prev.victim_info || [];
        const existingIdx = list.findIndex(v => v._is_complainant);
        const newVictim = {
          _is_complainant: true,
          victim_first_name: next.complainant_first_name || '',
          victim_middle_name: next.complainant_middle_name || '',
          victim_last_name: next.complainant_last_name || '',
          victim_gender: next.complainant_gender || '',
          victim_mobile: next.complainant_mobile || '',
          victim_mobile_country_code: next.complainant_mobile_country_code || '',
          victim_email: next.complainant_email || '',
          victim_relation_type: next.complainant_relation_type || '',
          victim_relative_name: next.complainant_relative_name || '',
          victim_dob: next.complainant_dob || '',
          victim_age_year: next.complainant_age_year || '',
          victim_age_month: next.complainant_age_month || '',
          victim_birth_year: next.complainant_birth_year || '',
          
          victim_house_no: next.complainant_house_no || '',
          victim_street: next.complainant_street || '',
          victim_colony: next.complainant_colony || '',
          victim_city_town_village: next.complainant_city_town_village || '',
          victim_tehsil_block_mandal: next.complainant_tehsil_block_mandal || '',
          victim_country: next.complainant_country || '',
          victim_state: next.complainant_state || '',
          victim_district: next.complainant_district || '',
          victim_police_station: next.complainant_police_station || '',
          victim_pincode: next.complainant_pincode || '',
          
          victim_perm_same: next.complainant_perm_same || false,
          victim_perm_house_no: next.complainant_perm_same === 'Yes' || next.complainant_perm_same === true ? (next.complainant_house_no || '') : (next.complainant_perm_house_no || ''),
          victim_perm_street: next.complainant_perm_same === 'Yes' || next.complainant_perm_same === true ? (next.complainant_street || '') : (next.complainant_perm_street || ''),
          victim_perm_colony: next.complainant_perm_same === 'Yes' || next.complainant_perm_same === true ? (next.complainant_colony || '') : (next.complainant_perm_colony || ''),
          victim_perm_city_town_village: next.complainant_perm_same === 'Yes' || next.complainant_perm_same === true ? (next.complainant_city_town_village || '') : (next.complainant_perm_city_town_village || ''),
          victim_perm_tehsil_block_mandal: next.complainant_perm_same === 'Yes' || next.complainant_perm_same === true ? (next.complainant_tehsil_block_mandal || '') : (next.complainant_perm_tehsil_block_mandal || ''),
          victim_perm_country: next.complainant_perm_same === 'Yes' || next.complainant_perm_same === true ? (next.complainant_country || '') : (next.complainant_perm_country || ''),
          victim_perm_state: next.complainant_perm_same === 'Yes' || next.complainant_perm_same === true ? (next.complainant_state || '') : (next.complainant_perm_state || ''),
          victim_perm_district: next.complainant_perm_same === 'Yes' || next.complainant_perm_same === true ? (next.complainant_district || '') : (next.complainant_perm_district || ''),
          victim_perm_police_station: next.complainant_perm_same === 'Yes' || next.complainant_perm_same === true ? (next.complainant_police_station || '') : (next.complainant_perm_police_station || ''),
          victim_perm_pincode: next.complainant_perm_same === 'Yes' || next.complainant_perm_same === true ? (next.complainant_pincode || '') : (next.complainant_perm_pincode || '')
        };
        const nextList = [...list];
        if (existingIdx > -1) {
          nextList[existingIdx] = newVictim;
        } else {
          nextList.push(newVictim);
        }
        return { ...prev, victim_info: nextList };
      });
    } else {
      setRepeaterState(prev => {
        const list = prev.victim_info || [];
        return { ...prev, victim_info: list.filter(v => !v._is_complainant) };
      });
    }
  } else if (key.startsWith('complainant_') && (key === 'complainant_perm_same' ? val : values.complainant_same_as_victim) === 'Yes') {
    const suffix = key.substring('complainant_'.length);
    const victimField = `victim_${suffix}`;
    setRepeaterState(prev => {
      const list = prev.victim_info || [];
      const existingIdx = list.findIndex(v => v._is_complainant);
      if (existingIdx > -1) {
        const nextList = [...list];
        nextList[existingIdx] = {
          ...nextList[existingIdx],
          [victimField]: val
        };
        if (suffix === 'dob' || suffix === 'age_year' || suffix === 'birth_year') {
          nextList[existingIdx].victim_dob = next.complainant_dob || '';
          nextList[existingIdx].victim_age_year = next.complainant_age_year || '';
          nextList[existingIdx].victim_birth_year = next.complainant_birth_year || '';
        }
        if (suffix === 'perm_same') {
          nextList[existingIdx].victim_perm_same = val;
        }
        const isPresentAddrField = ['house_no', 'street', 'colony', 'city_town_village', 'tehsil_block_mandal', 'country', 'state', 'district', 'police_station', 'pincode'].includes(suffix);
        const permSameVal = key === 'complainant_perm_same' ? val : values.complainant_perm_same;
        if (isPresentAddrField && (permSameVal === 'Yes' || permSameVal === true)) {
          nextList[existingIdx][`victim_perm_${suffix}`] = val;
        }
        return { ...prev, victim_info: nextList };
      }
      return prev;
    });
  }

  setTouched((prev) => ({ ...prev, [key]: true }));
}, [readOnly, errors, triggerAutosave, values]);

/** Add a major/minor head row to the table */
const handleAddMajorMinorRow = useCallback(() => {
  if (!selectedMajorHead || !selectedMinorHead) return;
  setMajorMinorRows(prev => [
    ...prev,
    { majorHead: selectedMajorHead, minorHead: selectedMinorHead }
  ]);
  // Persist to form values as comma-separated strings
  const updatedMajors = [...majorMinorRows.map(r => r.majorHead), selectedMajorHead].join(', ');
  const updatedMinors = [...majorMinorRows.map(r => r.minorHead), selectedMinorHead].join(', ');
  handleChange('major_heads', updatedMajors);
  handleChange('minor_heads', updatedMinors);
  // crime_head = primary offence head (registry storage: offence.major_head_id, primary).
  // The first Major Head row IS that value — without this write, ARREST's required
  // crime_head is never satisfiable and step validation blocks Next forever.
  const firstMajor = majorMinorRows[0]?.majorHead || selectedMajorHead;
  handleChange('crime_head', firstMajor);
  setSelectedMajorHead('');
  setSelectedMinorHead('');
}, [selectedMajorHead, selectedMinorHead, majorMinorRows, handleChange]);
/** Delete a major/minor head row from the table */
const handleDeleteMajorMinorRow = useCallback((index) => {
  const updated = majorMinorRows.filter((_, i) => i !== index);
  setMajorMinorRows(updated);
  handleChange('major_heads', updated.map(r => r.majorHead).join(', '));
  handleChange('minor_heads', updated.map(r => r.minorHead).join(', '));
  handleChange('crime_head', updated[0]?.majorHead || '');
}, [majorMinorRows, handleChange]);

// Single bundle of everything <ActsSectionsTable> needs, so every call site (ARREST/UIDB
// general info, CASE acts-and-sections, and the generic FormSection fallback used by
// MISSING/UIDB) spreads the same object instead of each re-declaring ~17 individual props.
const actsSectionsProps = {
  values,
  handleChange,
  readOnly,
  lang,
  actsSectionsRegistry,
  showAddRow,
  setShowAddRow,
  newAct,
  setNewAct,
  newSection,
  setNewSection,
  selectedMajorHead,
  setSelectedMajorHead,
  selectedMinorHead,
  setSelectedMinorHead,
  majorMinorRows,
  onAddMajorMinorRow: handleAddMajorMinorRow,
  onDeleteMajorMinorRow: handleDeleteMajorMinorRow,
  getMajorHeadOptions: () => dbMajorHeadOptions,
  getMinorHeadOptions: () => dbMinorHeadOptions,
  getLocalHeadOptions,
};

/* ── Navigate forward (with step validation) ──────────────────────────── */
const handleNext = () => {
  console.log('[PHAROS-DEBUG][handleNext] clicked. currentStep=', currentStep, 'live `values` composite snapshot:', {
    gd_no: values.gd_no, gd_date: values.gd_date, gd_time: values.gd_time,
    fir_no: values.fir_no, fir_date: values.fir_date, fir_time: values.fir_time,
  });
  const stepErrs = validateSection(currentStep);
  if (Object.keys(stepErrs).length > 0) {
    console.log('Block handleNext on step:', currentStep, 'Errors:', stepErrs);
    setErrors((prev) => ({ ...prev, ...stepErrs }));
    // Mark all fields in this step as touched
    const section = finalSchema[currentStep];
    const newTouched = {};
    section?.fields?.forEach((f) => { newTouched[f.field_key] = true; });
    setTouched((prev) => ({ ...prev, ...newTouched }));
    return;
  }

  // Auto-populate linked_fir_dd_no and case details when moving from Step 1 (Select FIR)
  if (recordType === 'ARREST' && caseType === 'against_fir' && currentStep === 0) {
    const selectedFir = values.selected_fir;
    if (selectedFir) {
      const matchedBackendCase = (casesData || []).find(c => {
        if (!c) return false;
        const firNo = c.data?.fir_no || c.fir_no || `FIR No. ${c.id}`;
        return firNo === selectedFir;
      });
      const matchedMockCase = MOCK_FIR_LIST.find(c => c.fir_no === selectedFir);
      let autofilled = {};
      if (matchedBackendCase) {
        const cData = matchedBackendCase.data || {};
        autofilled = {
          act_name: cData.act_name || '',
          sections: cData.sections || '',
          io_name: cData.io_name || '',
          io_rank: cData.io_rank || '',
          io_pis: cData.io_pis || '',
          io_mobile: cData.io_mobile || '',
          case_type: cData.case_type || matchedBackendCase.case_type || 'cctns(manual FIR)',
        };
      } else if (matchedMockCase) {
        autofilled = {
          act_name: 'IPC',
          sections: matchedMockCase.sections || '',
          io_name: 'Inspector Satish Kumar',
          io_rank: 'Inspector',
          io_pis: '28081234',
          io_mobile: '9876543210',
          case_type: 'cctns(manual FIR)',
        };
      }
      setValues(prev => ({
        ...prev,
        linked_fir_dd_no: selectedFir,
        act_name: prev.act_name || autofilled.act_name || '',
        sections: prev.sections !== undefined ? prev.sections : (autofilled.sections || ''),
        io_name: prev.io_name || autofilled.io_name || '',
        io_rank: prev.io_rank || autofilled.io_rank || '',
        io_pis: prev.io_pis || autofilled.io_pis || '',
        io_mobile: prev.io_mobile || autofilled.io_mobile || '',
        case_type: prev.case_type || autofilled.case_type || 'cctns(manual FIR)',
      }));
    }
  }

  setCompletedSteps((prev) => new Set([...prev, currentStep]));
  setCurrentStep((s) => Math.min(s + 1, finalSchema.length - 1));
  // Scroll to top of form
  setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
};

/* ── Navigate backward ────────────────────────────────────────────────── */
const handleBack = () => {
  setCurrentStep((s) => Math.max(s - 1, 0));
  setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
};

/* ── Jump to a specific step (click step dot / tab) ───────────────────── */
const handleStepClick = (targetIdx) => {
  if (targetIdx === currentStep) return;

  // Validate the step we are leaving (currentStep) and store errors
  const stepErrs = validateSection(currentStep);
  setErrors((prev) => {
    const next = { ...prev };
    // Clear old errors for this step
    const currentSec = finalSchema[currentStep];
    currentSec?.fields?.forEach((f) => delete next[f.field_key]);
    // Add new errors
    return { ...next, ...stepErrs };
  });

  // Mark current step fields as touched so warning indicators display
  const currentSec = finalSchema[currentStep];
  const newTouched = {};
  currentSec?.fields?.forEach((f) => { newTouched[f.field_key] = true; });
  setTouched((prev) => ({ ...prev, ...newTouched }));

  // Autofill case details if we leave step 0 in ARREST against_fir
  if (recordType === 'ARREST' && caseType === 'against_fir' && currentStep === 0) {
    const selectedFir = values.selected_fir;
    if (selectedFir) {
      const matchedBackendCase = (casesData || []).find(c => {
        if (!c) return false;
        const firNo = c.data?.fir_no || c.fir_no || `FIR No. ${c.id}`;
        return firNo === selectedFir;
      });
      const matchedMockCase = MOCK_FIR_LIST.find(c => c.fir_no === selectedFir);
      let autofilled = {};
      if (matchedBackendCase) {
        const cData = matchedBackendCase.data || {};
        autofilled = {
          act_name: cData.act_name || '',
          sections: cData.sections || '',
          io_name: cData.io_name || '',
          io_rank: cData.io_rank || '',
          io_pis: cData.io_pis || '',
          io_mobile: cData.io_mobile || '',
        };
      } else if (matchedMockCase) {
        autofilled = {
          act_name: 'IPC',
          sections: matchedMockCase.sections || '',
          io_name: 'Inspector Satish Kumar',
          io_rank: 'Inspector',
          io_pis: '28081234',
          io_mobile: '9876543210',
        };
      }
      setValues(prev => ({
        ...prev,
        linked_fir_dd_no: selectedFir,
        act_name: prev.act_name || autofilled.act_name || '',
        sections: prev.sections !== undefined ? prev.sections : (autofilled.sections || ''),
        io_name: prev.io_name || autofilled.io_name || '',
        io_rank: prev.io_rank || autofilled.io_rank || '',
        io_pis: prev.io_pis || autofilled.io_pis || '',
        io_mobile: prev.io_mobile || autofilled.io_mobile || '',
      }));
    }
  }

  setCompletedSteps((prev) => new Set([...prev, currentStep]));
  setCurrentStep(targetIdx);
  setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
};

/* ── Build persons/properties from repeater sections ───────────────────── */
// The ONE builder for every path that persists the record — final Submit, the "Save
// Draft" button, field-level autosave, and the repeaterState watcher. Repeater data
// must ride along on ALL of them: the backend's update path treats an absent `persons`
// key as "don't touch" but create defaults it to [], and any list that IS sent must
// echo existing entries (with their ids) or the id-preserving upsert deletes them.
// Latest-ref pattern: handleChange is memoized on [readOnly, errors, triggerAutosave,
// values] and does NOT recreate when repeaterState changes — a closure over repeaterState
// here would let a keystroke autosave a persons list from BEFORE the last modal save,
// and the backend's echo-or-delete upsert would then destroy the just-added entry.
const repeaterPayloadSourceRef = useRef({ finalSchema, repeaterState });
repeaterPayloadSourceRef.current = { finalSchema, repeaterState };
const buildRepeaterPayload = useCallback(() => {
  const { finalSchema: schema, repeaterState: state } = repeaterPayloadSourceRef.current;
  const persons = [];
  const properties = [];
  for (const section of schema) {
    if (!section.is_repeater) continue;
    const entries = state[section.section] || [];
    if (section.entity_type === 'person' && section.person_type) {
      for (const entry of entries) {
        // ARRESTED persons carry their own property list (per-person, not record-level) —
        // pull it out of the person's data blob and flatten into the top-level properties
        // array, tagged with this person's index so the backend can link each item back
        // to the right person after it generates real person IDs. `id` (present on entries
        // loaded from an existing record's recomposed persons[]) is likewise pulled to the
        // top level — the backend's id-preserving upsert matches edits by `persons[].id`,
        // not by a nested `data.id`.
        const { property_details: personProperties, id: personId, ...personData } = entry;
        const personIndex = persons.length;
        persons.push({ id: personId ?? undefined, person_type: section.person_type, data: personData });
        if (section.person_type === 'ARRESTED' && Array.isArray(personProperties)) {
          for (const prop of personProperties) {
            if (!prop.id && !prop.property_major_category && !prop.property_details) continue; // skip blank starter rows
            properties.push({ ...prop, person_index: personIndex });
          }
        }
      }
    } else if (section.entity_type === 'property') {
      for (const entry of entries) {
        // Skip never-saved blank starter rows (CASE auto-populates one) — but an entry
        // with an id is an existing DB row and must always be echoed back.
        if (!entry.id && !entry.property_major_category && !entry.property_details) continue;
        properties.push(entry);
      }
    }
  }
  return { persons, properties };
}, []);

/* ── Final form submission ─────────────────────────────────────────────── */
const handleFormSubmit = (e) => {
  e.preventDefault();
  if (readOnly) return;

  const allErrs = validateAll();
  if (Object.keys(allErrs).length > 0) {
    setErrors(allErrs);
    const allTouched = {};
    finalSchema.forEach((sec) => sec.fields.forEach((f) => { allTouched[f.field_key] = true; }));
    setTouched(allTouched);

    let firstErrStep = 0;
    finalSchema.forEach((sec, idx) => {
      if (sec.is_repeater) return;
      const hasErr = sec.fields.some((f) => allErrs[f.field_key]);
      if (hasErr && idx < firstErrStep + 1) firstErrStep = idx;
    });
    setCurrentStep(firstErrStep);

    toast.error(lang === 'hi'
      ? 'कृपया सभी आवश्यक फ़ील्ड भरें।'
      : 'Please complete all required fields.');

    setTimeout(() => {
      const firstErrKey = Object.keys(allErrs)[0];
      document.getElementById(`field-${firstErrKey}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return;
  }

  const finalValues = { ...values };
  if (finalValues.time_of_occurrence !== undefined) {
    finalValues.occurrence_time = finalValues.time_of_occurrence;
  }

  const { persons, properties } = buildRepeaterPayload();

  onSubmit?.(finalValues, persons, properties, activeRecordIdRef.current);
};

/* ── Manual save draft (button click) ────────────────────────────────────*/
const handleManualSave = () => {
  const finalValues = { ...values };
  if (finalValues.time_of_occurrence !== undefined) {
    finalValues.occurrence_time = finalValues.time_of_occurrence;
  }
  // persons/properties MUST ride along — omitting them dropped every victim/accused/
  // arrested entry and property row from manually-saved drafts (create defaulted them
  // to [] server-side, so the repeater data was never written at all).
  const { persons, properties } = buildRepeaterPayload();
  saveImmediately(finalValues, activeRecordIdRef.current, persons, properties);
  toast.success(lang === 'hi' ? 'ड्राफ्ट सहेज लिया गया है।' : 'Draft saved successfully.');
};

/* ── Render states ─────────────────────────────────────────────────────── */
if (isLoading) {
  return (
    <div className="flex flex-col items-center justify-center p-16 text-slate-500 gap-3">
      <Loader2 size={32} className="animate-spin text-[var(--accent-color)]" />
      <p className="text-sm font-semibold">{t('common.loading', 'Loading form schema...')}</p>
    </div>
  );
}

if (isError || finalSchema.length === 0) {
  const status = schemaError?.response?.status;
  const hint = status === 401
    ? 'Session expired — please log out and log back in with your badge credentials.'
    : status
      ? `Server returned ${status}. Check that the backend is running.`
      : 'No fields are configured for this record type. Re-run the database seed or switch to Mock Mode.';
  return (
    <div className="flex flex-col items-center justify-center p-16 text-slate-500 gap-4 bg-white border border-dashed border-slate-300 rounded-xl shadow-sm">
      <AlertTriangle size={32} className="text-amber-500" />
      <p className="text-sm font-semibold text-slate-700">Form schema not found</p>
      <p className="text-xs text-slate-400 text-center max-w-xs leading-relaxed">{hint}</p>
      <p className="text-xs text-slate-500">
        Record type: <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{recordType}</code>
      </p>
    </div>
  );
}

const activeSection = finalSchema[currentStep] || finalSchema[0];
const isLastStep = currentStep === finalSchema.length - 1;

const SECTION_RENDERERS = {
  select_fir: renderFirSearchStep,
  ...(recordType === 'CASE' || recordType === 'ARREST' ? { general_info: renderArrestGeneralInfoStep } : {}),
  acts_and_sections: renderActsAndSectionsStep,
  occurrence_info: renderOccurrenceStep,
  complainant_info: renderComplainantStep,
  victim_info: renderVictimStep,
  accused_info: renderAccusedStep,
  arrested_info: renderArrestedStep,
  property_details: renderPropertyStep,
  action_taken: renderActionTakenStep,
};

const stepHasError = (idx) => {
  const sec = finalSchema[idx];
  return sec?.fields?.some((f) => errors[f.field_key] && touched[f.field_key]);
};

return (
  <div className="space-y-3" ref={formRef}>

    {/* Horizontal Tabs Navigation */}
    <div className="flex flex-col md:flex-row md:items-center justify-between border-b-2 border-[#0d2a4a] mb-2 gap-2 pb-1.5 bg-[#f8fafc]">
      {finalSchema.length > 1 ? (
        <div className="flex flex-wrap gap-1.5 py-1">
          {finalSchema.map((sec, idx) => {
            const isSelected = idx === currentStep;
            const title = lang === 'hi' ? (sec.title_hi || sec.title_en) : sec.title_en;
            const hasError = stepHasError(idx);

            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleStepClick(idx)}
                className={`px-3 py-1.5 text-[10px] font-bold transition-all rounded-md cursor-pointer uppercase tracking-tight whitespace-nowrap flex items-center gap-1 select-none border border-[#0d2a4a] ${isSelected
                    ? 'bg-[#ea580c] border-[#ea580c] text-white shadow-sm'
                    : 'bg-[#0d2a4a] border-[#0d2a4a] text-white hover:bg-[#16406d] hover:border-[#16406d]'
                  }`}
              >
                {hasError && <AlertCircle size={10} className="text-red-300 animate-pulse" />}
                <span>{title}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div />
      )}
      <div className="flex items-center gap-3 px-2 py-1 self-end md:self-center">
        <FormAutosave status={saveStatus} lang={lang} />
        {readOnly && (
          <span className="text-[10px] font-bold text-slate-500 bg-slate-200 border border-slate-300 px-2 py-0.5 rounded uppercase tracking-wider">
            {lang === 'hi' ? 'केवल पठन' : 'Read Only'}
          </span>
        )}
      </div>
    </div>

    {/* ── Validation summary ── */}
    {Object.keys(errors).length > 0 && Object.values(touched).some(Boolean) && (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600 shadow-sm space-y-2">
        <div className="flex items-center gap-2 font-bold text-red-700 mb-1">
          <AlertCircle size={16} />
          <span>
            {lang === 'hi'
              ? `${Object.keys(errors).filter(k => touched[k]).length} फ़ील्ड अपूर्ण हैं`
              : `${Object.keys(errors).filter(k => touched[k]).length} field(s) need your attention`}
          </span>
        </div>
        {Object.entries(errors)
          .filter(([k]) => touched[k])
          .slice(0, 5)
          .map(([, msg]) => (
            <div key={msg} className="flex items-center gap-2 text-red-600">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
              {msg}
            </div>
          ))}
      </div>
    )}

    {/* ── Active Section (flat field form OR repeater panel) ── */}
    {activeSection && (
      <div className="space-y-3">
        <form onSubmit={(e) => e.preventDefault()} noValidate>
          {SECTION_RENDERERS[activeSection?.section] ? (
            SECTION_RENDERERS[activeSection.section]()
          ) : (
            <FormSection
              section={activeSection}
              currentStep={currentStep}
              totalSteps={finalSchema.length}
              values={values}
              errors={errors}
              touched={touched}
              handleChange={handleChange}
              readOnly={readOnly}
              targetFields={targetFields}
              lang={lang}
              saveStatus={saveStatus}
              hideHeader={true}
              entries={repeaterState[activeSection?.section] || []}
              onEntriesChange={(entries) =>
                setRepeaterState(prev => ({ ...prev, [activeSection.section]: entries }))
              }
              actsSectionsProps={actsSectionsProps}
              recordType={recordType}
            />
          )}
        </form>

        <FormToolbar
          currentStep={currentStep}
          totalSteps={finalSchema.length}
          readOnly={readOnly}
          onBack={onBack || (() => navigate('/records'))}
          onPrevious={handleBack}
          onSaveDraft={!readOnly ? handleManualSave : null}
          onNext={handleNext}
          onSubmit={handleFormSubmit}
          isLastStep={isLastStep}
          lang={lang}
        />
      </div>
    )}
  </div>
);
}
