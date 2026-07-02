import React, { useEffect, useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, AlertTriangle, AlertCircle, Search, Calendar, User, Check, Database, ChevronLeft, ChevronRight, Plus, X, Bookmark } from 'lucide-react';
import toast from 'react-hot-toast';

import { useFormSchema } from '../../hooks/useFormSchema.js';
import { useAutosave } from '../../hooks/useAutosave.js';
import useAuthStore from '../../store/authStore.js';
import { findNodeById } from '../../utils/hierarchyData.js';
import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api.js';

import FormSection from './FormSection.jsx';
import FormToolbar from './FormToolbar.jsx';
import FormAutosave from './FormAutosave.jsx';
import FieldRenderer from './FieldRenderer.jsx';

// Mock registry for Acts & Sections to be loaded dynamically from the backend in the future
const ACTS_SECTIONS_REGISTRY = [
  {
    act: "Indian Penal Code (IPC)",
    sections: ["379", "302", "323", "406", "506", "354", "411"]
  },
  {
    act: "Arms Act",
    sections: ["25", "27", "30"]
  },
  {
    act: "NDPS Act",
    sections: ["15", "18", "20", "21", "22"]
  },
  {
    act: "Motor Vehicles Act",
    sections: ["181", "184", "185"]
  },
  {
    act: "Information Technology Act (IT Act)",
    sections: ["66", "66C", "66D", "67"]
  }
];

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
function parseRules(rawRules) {
  if (!rawRules) return {};
  if (typeof rawRules === 'object') return rawRules;
  try { return JSON.parse(rawRules); } catch { return {}; }
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
      <span className={`text-[11px] font-semibold max-w-[90px] text-center leading-tight hidden sm:block transition-colors ${
        active ? 'text-[var(--accent-color)]' : hasError ? 'text-red-600' : 'text-slate-400'
      }`}>
        {title}
      </span>
    </button>
  );
}

const MOCK_FIR_LIST = [
  { fir_no: '104/2026', fir_date: '2026-06-20', complainant_name: 'Ramesh Singh', police_station: 'Parliament Street', crime_head: 'House Theft', sections: 'Sec 379 IPC' },
  { fir_no: '112/2026', fir_date: '2026-06-19', complainant_name: 'Sunita Devi', police_station: 'Chanakyapuri', crime_head: 'Murder', sections: 'Sec 302 IPC' },
  { fir_no: '125/2026', fir_date: '2026-06-18', complainant_name: 'Amit Kumar', police_station: 'Mandir Marg', crime_head: 'Simple Hurt', sections: 'Sec 323 IPC' },
  { fir_no: '150/2026', fir_date: '2026-06-21', complainant_name: 'Gurpreet Singh', police_station: 'Tughlak Road', crime_head: 'Cheating', sections: 'Sec 406 IPC' },
  { fir_no: '201/2026', fir_date: '2026-06-21', complainant_name: 'Vikram Singh', police_station: 'Parliament Street', crime_head: 'Robbery', sections: 'Sec 392 IPC' },
  { fir_no: '88/2026', fir_date: '2026-06-20', complainant_name: 'Manish Sharma', police_station: 'Chanakyapuri', crime_head: 'Delhi Excise Act', sections: 'Sec 33/38 Excise Act' },
  { fir_no: '92/2026', fir_date: '2026-06-20', complainant_name: 'Priyanka Sen', police_station: 'Mandir Marg', crime_head: 'Snatching', sections: 'Sec 356/379 IPC' },
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
  const { schema, isLoading, isError, schemaError } = useFormSchema(recordType);
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
    
    // Combine frontend mock cases & backend casesData
    const unifiedCases = [
      ...MOCK_FIR_LIST,
      ...(casesData || []).map(c => ({
        fir_no: c.data?.fir_no || c.fir_no || `FIR No. ${c.id}`,
        fir_date: c.data?.fir_date || c.fir_date || c.record_date,
        complainant_name: c.data?.complainant_name || c.complainant_name || 'N/A',
        police_station: c.data?.police_station || c.police_station || 'Unknown',
        crime_head: c.data?.local_head || c.data?.crime_head || c.local_head || c.crime_head || 'N/A',
        sections: c.data?.sections || c.sections || 'N/A',
        isBackend: true
      }))
    ];

    // Filter unified list
    const filtered = unifiedCases.filter(c => {
      // Date exact match (handles both YYYY-MM-DD and DD/MM/YYYY formats)
      const sDate = searchDate.substring(0, 10); // "YYYY-MM-DD"
      let cNormalized = '';
      if (c.fir_date) {
        const parts = c.fir_date.split('/');
        if (parts.length === 3) {
          const dd = parts[0].padStart(2, '0');
          const mm = parts[1].padStart(2, '0');
          const yyyy = parts[2];
          cNormalized = `${yyyy}-${mm}-${dd}`;
        } else {
          cNormalized = c.fir_date.substring(0, 10);
        }
      }
      if (cNormalized !== sDate) return false;

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
    const currentSections = values.sections || '';
    
    // Parse sections list
    const sectionsList = currentSections
      ? currentSections.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const handleAddSection = () => {
      const cleanSec = newSectionVal.trim();
      if (!cleanSec) return;
      if (sectionsList.includes(cleanSec)) {
        setNewSectionVal('');
        return;
      }
      const updatedList = [...sectionsList, cleanSec];
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
                <input
                  type="date"
                  disabled={readOnly}
                  value={searchDate}
                  onChange={(e) => {
                    setSearchDate(e.target.value);
                    if (searchError) setSearchError('');
                  }}
                  className={`w-full bg-white border-2 border-slate-200 text-slate-800 text-sm px-3.5 py-2.5 rounded-xl outline-none focus:border-[var(--accent-color)] transition-all ${
                    searchError ? 'border-red-400 focus:border-red-500 bg-red-50' : ''
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
                          className={`group cursor-pointer hover:bg-slate-50/80 transition-all ${
                            isSelected
                              ? 'bg-[var(--accent-glow)] hover:bg-[var(--accent-glow)]'
                              : ''
                          }`}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${
                                isSelected
                                  ? 'border-[var(--accent-color)] bg-[var(--accent-color)] text-white scale-110'
                                  : 'border-slate-300 bg-white group-hover:border-slate-400'
                              }`}>
                                {isSelected && <Check size={10} className="stroke-[3]" />}
                              </span>
                              <span className={`text-sm font-bold ${
                                isSelected ? 'text-[var(--accent-color)] font-extrabold' : 'text-slate-800'
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
                  <select
                    disabled={readOnly}
                    value={currentAct}
                    onChange={(e) => handleChange('act_name', e.target.value)}
                    className="w-full bg-white border-2 border-slate-200 text-slate-800 text-sm px-3.5 py-2.5 rounded-xl outline-none focus:border-[var(--accent-color)] transition-all cursor-pointer"
                  >
                    <option value="IPC">IPC</option>
                    <option value="Delhi Excise Act">Delhi Excise Act</option>
                    <option value="Arms Act">Arms Act</option>
                    <option value="Gambling Act">Gambling Act</option>
                    <option value="DP Act">DP Act</option>
                    <option value="Other Act">Other Act</option>
                  </select>
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
    const isWritten = values.type_of_information !== 'Oral';
    const acts = values.act_name ? values.act_name.split(',').map(s => s.trim()).filter(Boolean) : [];
    const secs = values.sections ? values.sections.split(',').map(s => s.trim()).filter(Boolean) : [];
    const maxLen = Math.max(acts.length, secs.length);
    const allFields = schema ? schema.reduce((acc, sec) => [...acc, ...(sec.fields || [])], []) : [];

    const chosenActObj = actsSectionsRegistry.find(item => item.act === newAct);
    const availableSections = chosenActObj ? chosenActObj.sections : [];

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
            {renderReadOnlyRow(lang === 'hi' ? 'रिकॉर्ड यूआईडी (UID)' : 'Record UID', values.uid || 'NEW_DRAFT_PENDING', true)}
            {renderReadOnlyRow(lang === 'hi' ? 'जिला' : 'District', values.district || user?.district)}
            {renderReadOnlyRow(lang === 'hi' ? 'थाना' : 'Police Station', values.police_station || user?.police_station)}
            {renderReadOnlyRow(lang === 'hi' ? 'प्रस्तुति स्थिति' : 'Submission Status', values.status || 'DRAFT')}
            
            {/* Case Type field */}
            <React.Fragment>
              <div className="bg-[#dfeaf5] px-3 py-2 text-[12px] font-semibold text-[#0d2a4a] flex items-center border-b border-[#c7d8ea] min-h-[40px]">
                {lang === 'hi' ? 'मामला पंजीकरण प्रकार' : 'Case Registration Type'}
              </div>
              <div className="px-3 py-1 bg-white flex items-center border-b border-[#c7d8ea] min-h-[40px]">
                <div className="w-full max-w-md">
                  <FieldRenderer
                    field={allFields.find(f => f.field_key === 'case_type')}
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
                {lang === 'hi' ? 'जीडी नंबर, दिनांक और समय *' : 'GD Number, Date & Time *'}
              </div>
              <div className="px-3 py-1 bg-white flex items-center gap-2 min-h-[40px] relative rounded-br">
                <input
                  type="text"
                  disabled={readOnly}
                  value={values.gd_no || ''}
                  onChange={(e) => handleChange('gd_no', e.target.value.replace(/\D/g, ''))}
                  className="w-24 h-7 px-2 border border-[#7a9cc5] rounded bg-white text-[12px] outline-none focus:border-blue-500"
                  placeholder="GD Number"
                />
                <input
                  type="text"
                  disabled={readOnly}
                  value={values.gd_date_time || ''}
                  onClick={() => setShowDatePicker(prev => !prev)}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleChange('gd_date_time', val);
                    const parts = val.split(' ');
                    if (parts[0]) {
                      const dVal = parts[0];
                      if (recordType === 'UIDB') {
                        handleChange('dd_date', dVal);
                      } else {
                        handleChange('gd_date', dVal);
                      }
                    }
                    if (parts[1]) {
                      const tVal = parts[1];
                      if (recordType === 'UIDB') {
                        handleChange('dd_time', tVal);
                      } else {
                        handleChange('gd_time', tVal);
                      }
                    }
                  }}
                  className="w-48 h-7 px-2 border border-[#7a9cc5] rounded bg-white text-[12px] outline-none focus:border-blue-500 cursor-pointer"
                  placeholder="DD/MM/YYYY HH:MM"
                  readOnly
                />
                <button 
                  ref={searchBtnRef}
                  type="button" 
                  className="p-1 text-[#0f52ba] hover:text-blue-700 bg-transparent border-none cursor-pointer flex items-center justify-center"
                  title="Pick Date & Time"
                  onClick={() => {
                    if (!showDatePicker && values.gd_date_time) {
                      const parts = values.gd_date_time.split(' ');
                      if (parts[0]) {
                        const dateParts = parts[0].split('/');
                        if (dateParts.length === 3) {
                          setPickerDay(parseInt(dateParts[0], 10) || new Date().getDate());
                          setPickerMonth((parseInt(dateParts[1], 10) || 1) - 1);
                          setPickerYear(parseInt(dateParts[2], 10) || new Date().getFullYear());
                        }
                      }
                      if (parts[1]) {
                        const timeParts = parts[1].split(':');
                        setPickerHour(parseInt(timeParts[0], 10) || 0);
                        setPickerMinute(parseInt(timeParts[1], 10) || 0);
                      }
                    } else if (!showDatePicker) {
                      const now = new Date();
                      setPickerDay(now.getDate());
                      setPickerMonth(now.getMonth());
                      setPickerYear(now.getFullYear());
                      setPickerHour(now.getHours());
                      setPickerMinute(now.getMinutes());
                    }
                    setShowDatePicker(prev => !prev);
                  }}
                >
                  <Search size={15} className="stroke-[2.5]" />
                </button>

                {/* Datepicker Popup */}
                {showDatePicker && (() => {
                  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                  const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];
                  const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
                  const firstDayOfWeek = new Date(pickerYear, pickerMonth, 1).getDay();
                  const blanks = Array.from({ length: firstDayOfWeek }, (_, i) => i);
                  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

                  const handlePrevMonth = () => {
                    if (pickerMonth === 0) { setPickerMonth(11); setPickerYear(y => y - 1); }
                    else setPickerMonth(m => m - 1);
                  };
                  const handleNextMonth = () => {
                    if (pickerMonth === 11) { setPickerMonth(0); setPickerYear(y => y + 1); }
                    else setPickerMonth(m => m + 1);
                  };
                  const handleToday = () => {
                    const now = new Date();
                    setPickerDay(now.getDate()); setPickerMonth(now.getMonth()); setPickerYear(now.getFullYear());
                    setPickerHour(now.getHours()); setPickerMinute(now.getMinutes());
                  };
                  const handleDone = () => {
                    const dd = String(pickerDay).padStart(2, '0');
                    const mm = String(pickerMonth + 1).padStart(2, '0');
                    const hh = String(pickerHour).padStart(2, '0');
                    const mi = String(pickerMinute).padStart(2, '0');
                    const formatted = `${dd}/${mm}/${pickerYear} ${hh}:${mi}`;
                    const dVal = `${dd}/${mm}/${pickerYear}`;
                    const tVal = `${hh}:${mi}`;
                    
                    handleChange('gd_date_time', formatted);
                    if (recordType === 'UIDB') {
                      handleChange('dd_date', dVal);
                      handleChange('dd_time', tVal);
                    } else {
                      handleChange('gd_date', dVal);
                      handleChange('gd_time', tVal);
                    }
                    setShowDatePicker(false);
                  };

                  return (
                    <div
                      ref={datePickerRef}
                      className="absolute top-full left-0 mt-1 bg-white border border-[#7a9cc5] shadow-2xl rounded-lg p-3 z-50 flex gap-4 text-slate-800 select-none"
                      style={{ width: 340 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <button type="button" onClick={handlePrevMonth} className="p-0.5 rounded hover:bg-slate-100 text-[#0d2a4a] cursor-pointer bg-transparent border-none">
                            <ChevronLeft size={16} />
                          </button>
                          <div className="flex items-center gap-1.5">
                            <select
                              value={pickerMonth}
                              onChange={(e) => setPickerMonth(Number(e.target.value))}
                              className="text-[11px] font-bold text-[#0d2a4a] border border-[#7a9cc5] rounded px-1.5 py-0.5 bg-white cursor-pointer outline-none"
                            >
                              {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                            </select>
                            <select
                              value={pickerYear}
                              onChange={(e) => setPickerYear(Number(e.target.value))}
                              className="text-[11px] font-bold text-[#0d2a4a] border border-[#7a9cc5] rounded px-1.5 py-0.5 bg-white cursor-pointer outline-none"
                            >
                              {Array.from({ length: 21 }, (_, i) => 2015 + i).map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                          </div>
                          <button type="button" onClick={handleNextMonth} className="p-0.5 rounded hover:bg-slate-100 text-[#0d2a4a] cursor-pointer bg-transparent border-none">
                            <ChevronRight size={16} />
                          </button>
                        </div>
                        <div className="grid grid-cols-7 gap-0 text-center mb-1">
                          {DAY_LABELS.map(d => (
                            <span key={d} className="text-[10px] font-bold text-slate-500 py-0.5">{d}</span>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-0 text-center">
                          {blanks.map(b => <span key={`b-${b}`} />)}
                          {days.map(d => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setPickerDay(d)}
                              className={`text-[11px] py-1 rounded cursor-pointer border-none transition-colors ${
                                d === pickerDay
                                  ? 'bg-[#0f52ba] text-white font-bold'
                                  : 'bg-transparent text-slate-700 hover:bg-blue-50'
                              }`}
                            >
                              {d}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200">
                          <button type="button" onClick={handleToday} className="text-[10px] font-bold text-[#0f52ba] hover:underline cursor-pointer bg-transparent border-none">
                            Today
                          </button>
                          <button type="button" onClick={handleDone} className="text-[10px] font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white px-3 py-1 rounded cursor-pointer border-none transition-colors shadow-sm">
                            Done
                          </button>
                        </div>
                      </div>
                      <div className="flex flex-col items-center gap-2 border-l border-slate-200 pl-3" style={{ minWidth: 80 }}>
                        <div className="bg-[#f0f4f8] border border-[#7a9cc5] rounded px-2.5 py-1 text-center">
                          <span className="text-[12px] font-bold text-[#0d2a4a] font-mono">
                            {String(pickerHour).padStart(2, '0')}:{String(pickerMinute).padStart(2, '0')}
                          </span>
                        </div>
                        <div className="flex gap-3 items-start" style={{ height: 150 }}>
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[9px] text-slate-500 font-bold">Hr</span>
                            <input
                              type="range"
                              min={0} max={23}
                              value={pickerHour}
                              onChange={(e) => setPickerHour(Number(e.target.value))}
                              className="datetime-picker-vertical-slider"
                            />
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[9px] text-slate-500 font-bold">Min</span>
                            <input
                              type="range"
                              min={0} max={59}
                              value={pickerMinute}
                              onChange={(e) => setPickerMinute(Number(e.target.value))}
                              className="datetime-picker-vertical-slider"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </React.Fragment>
          </div>

        {/* Acts, Sections, Major/Minor, Local Head Panels */}
        <div className="flex flex-col md:flex-row gap-3">
          {/* Left: Acts & Sections */}
          <fieldset className="flex-1 border border-[#7a9cc5] rounded px-3 py-2 bg-[#f0f4f8]/20 min-h-[140px]">
            <legend className="text-[#0d2a4a] text-[11px] font-bold px-1.5 uppercase tracking-wide">
              Acts & Sections
            </legend>

            <div className="flex items-center justify-between mb-2">
              <span className="text-[#0d2a4a] text-[10px] font-bold opacity-60">Registered List</span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setShowAddRow(true)}
                  className="bg-[#ea580c] hover:bg-[#c2410c] text-white text-[10px] font-bold px-2 py-0.5 rounded transition shadow-sm flex items-center gap-1 cursor-pointer"
                >
                  + Add Acts & Section
                </button>
              )}
            </div>

            <div className="w-full overflow-x-auto">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-[#d0e0f8] text-[#0d2a4a] border-b border-[#7a9cc5]">
                    <th className="px-2 py-1 text-left font-bold w-12 border-r border-[#7a9cc5]">S.No.</th>
                    <th className="px-2 py-1 text-left font-bold border-r border-[#7a9cc5]">Acts</th>
                    <th className="px-2 py-1 text-left font-bold border-r border-[#7a9cc5]">Sections</th>
                    {!readOnly && <th className="px-2 py-1 text-center font-bold w-16">Delete</th>}
                  </tr>
                </thead>
                <tbody>
                  {maxLen === 0 ? (
                    <tr>
                      <td colSpan={readOnly ? 3 : 4} className="px-2 py-3 text-center text-gray-500 italic">
                        No Acts & Sections added yet. Click "+ Add Acts & Section" to add.
                      </td>
                    </tr>
                  ) : (
                    Array.from({ length: maxLen }).map((_, i) => (
                      <tr key={i} className="border-b border-[#7a9cc5] bg-white">
                        <td className="px-2 py-1 border-r border-[#7a9cc5] text-[#0d2a4a] font-mono text-center">
                          {i + 1}
                        </td>
                        <td className="px-2 py-1 border-r border-[#7a9cc5] text-[#0d2a4a]">
                          {acts[i] || ''}
                        </td>
                        <td className="px-2 py-1 border-r border-[#7a9cc5] text-[#0d2a4a]">
                          {secs[i] || ''}
                        </td>
                        {!readOnly && (
                          <td className="px-2 py-1 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                const nextActs = acts.filter((_, idx) => idx !== i);
                                const nextSecs = secs.filter((_, idx) => idx !== i);
                                handleChange('act_name', nextActs.join(', '));
                                handleChange('sections', nextSecs.join(', '));
                              }}
                              className="text-red-500 hover:text-red-700 font-bold bg-transparent border-none cursor-pointer"
                            >
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </fieldset>

          {/* Right: Major/Minor / Local Head */}
          <div className="flex-1 flex flex-col gap-3">
            <fieldset className="border border-[#7a9cc5] rounded px-3 py-2 bg-[#f0f4f8]/20 min-h-[140px] flex-1">
              <legend className="text-[#0d2a4a] text-[11px] font-bold px-1.5 uppercase tracking-wide">
                Major / Minor
              </legend>

              <div className="flex flex-col gap-2 text-[11px]">
                <div className="flex flex-col gap-1">
                  <label className="text-[#0d2a4a] font-bold">Major Head</label>
                  <select
                    disabled={readOnly}
                    value={selectedMajorHead}
                    onChange={(e) => {
                      setSelectedMajorHead(e.target.value);
                      setSelectedMinorHead('');
                    }}
                    className="w-full h-6 px-1 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="">------Select------</option>
                    {getMajorHeadOptions().map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {lang === 'hi' ? (opt.label_hi || opt.label_en) : opt.label_en}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[#0d2a4a] font-bold">Minor Head</label>
                  <div className="flex items-center gap-2">
                    <select
                      disabled={readOnly || !selectedMajorHead}
                      value={selectedMinorHead}
                      onChange={(e) => setSelectedMinorHead(e.target.value)}
                      className="flex-1 h-6 px-1 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-blue-500 cursor-pointer"
                    >
                      <option value="">------Select------</option>
                      {getMinorHeadOptions().map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {lang === 'hi' ? (opt.label_hi || opt.label_en) : opt.label_en}
                        </option>
                      ))}
                    </select>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={handleAddMajorMinorRow}
                        disabled={!selectedMajorHead || !selectedMinorHead}
                        className="bg-[#ea580c] hover:bg-[#c2410c] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[10px] font-bold px-2 py-0.5 rounded transition shadow-sm flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                </div>

                <div className="w-full overflow-x-auto mt-1">
                  <table className="w-full border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-[#d0e0f8] text-[#0d2a4a] border-b border-[#7a9cc5]">
                        <th className="px-2 py-1 text-left font-bold w-10 border-r border-[#7a9cc5]">S.No.</th>
                        <th className="px-2 py-1 text-left font-bold border-r border-[#7a9cc5]">Major Head</th>
                        <th className="px-2 py-1 text-left font-bold border-r border-[#7a9cc5]">Minor Head</th>
                        {!readOnly && <th className="px-2 py-1 text-center font-bold w-14">Delete</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {majorMinorRows.length === 0 ? (
                        <tr>
                          <td colSpan={readOnly ? 3 : 4} className="px-2 py-2 text-center text-gray-500 italic">
                            No entries added yet.
                          </td>
                        </tr>
                      ) : (
                        majorMinorRows.map((row, idx) => (
                          <tr key={idx} className="border-b border-[#7a9cc5] bg-white">
                            <td className="px-2 py-1 border-r border-[#7a9cc5] text-[#0d2a4a] font-mono text-center">{idx + 1}</td>
                            <td className="px-2 py-1 border-r border-[#7a9cc5] text-[#0d2a4a]">{row.majorHead}</td>
                            <td className="px-2 py-1 border-r border-[#7a9cc5] text-[#0d2a4a]">{row.minorHead}</td>
                            {!readOnly && (
                              <td className="px-2 py-1 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMajorMinorRow(idx)}
                                  className="text-red-600 hover:text-red-800 text-[10px] font-bold underline cursor-pointer"
                                >
                                  Delete
                                </button>
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </fieldset>

            <fieldset className="border border-[#7a9cc5] rounded px-3 py-2 bg-[#f0f4f8]/20 flex-shrink-0">
              <legend className="text-[#0d2a4a] text-[11px] font-bold px-1.5 uppercase tracking-wide">
                Local Head
              </legend>
              <div className="grid grid-cols-[80px_1fr] gap-x-2 text-[11px] items-center">
                <span className="text-[#0d2a4a] font-bold">Local Head</span>
                <select
                  disabled={readOnly}
                  value={values.local_head || ''}
                  onChange={(e) => handleChange('local_head', e.target.value)}
                  className="w-full h-6 px-1 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="">------Select------</option>
                  {getLocalHeadOptions().map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {lang === 'hi' ? (opt.label_hi || opt.label_en) : opt.label_en}
                    </option>
                  ))}
                </select>
              </div>
            </fieldset>
          </div>
        </div>

        {/* Modal for adding Act & Section */}
        {showAddRow && (
          <>
            <div 
              className="fixed inset-0 z-40 bg-black/40" 
              onClick={() => {
                setNewAct('');
                setNewSection('');
                setShowAddRow(false);
              }}
            />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] bg-white border border-[#7a9cc5] rounded shadow-2xl z-50 p-4 flex flex-col justify-between text-slate-800">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h3 className="text-xs font-bold text-[#0d2a4a] uppercase tracking-wider">
                    Add Acts & Section
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setNewAct('');
                      setNewSection('');
                      setShowAddRow(false);
                    }}
                    className="text-slate-400 hover:text-slate-600 text-sm font-bold bg-transparent border-none cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                
                <div className="space-y-3">
                  <div className="flex flex-col gap-1 text-[11px] text-left">
                    <label className="text-[#0d2a4a] font-bold">Act / Law Name</label>
                    <select
                      value={newAct}
                      onChange={(e) => {
                        setNewAct(e.target.value);
                        setNewSection('');
                      }}
                      className="w-full h-8 px-2 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-[#ea580c] cursor-pointer"
                      autoFocus
                    >
                      <option value="">----select----</option>
                      {actsSectionsRegistry.map((item) => (
                        <option key={item.act} value={item.act}>
                          {item.act}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1 text-[11px] text-left">
                    <label className="text-[#0d2a4a] font-bold">Section(s)</label>
                    <select
                      value={newSection}
                      onChange={(e) => setNewSection(e.target.value)}
                      disabled={!newAct}
                      className="w-full h-8 px-2 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-[#ea580c] cursor-pointer disabled:bg-slate-50 disabled:cursor-not-allowed"
                    >
                      <option value="">----select----</option>
                      {availableSections.map((sec) => (
                        <option key={sec} value={sec}>
                          {sec}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 mt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setNewAct('');
                    setNewSection('');
                    setShowAddRow(false);
                  }}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-[#0d2a4a] text-[11px] font-bold rounded cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (newAct.trim() || newSection.trim()) {
                      const updatedActs = [...acts, newAct.trim()].join(', ');
                      const updatedSections = [...secs, newSection.trim()].join(', ');
                      handleChange('act_name', updatedActs);
                      handleChange('sections', updatedSections);
                    }
                    setNewAct('');
                    setNewSection('');
                    setShowAddRow(false);
                  }}
                  className="px-3 py-1 bg-[#ea580c] hover:bg-[#c2410c] text-white text-[11px] font-bold rounded cursor-pointer transition-colors shadow-sm"
                >
                  Save
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };


  const renderActsAndSectionsStep = () => {
    const allFields = schema ? schema.reduce((acc, sec) => [...acc, ...(sec.fields || [])], []) : [];
    const isWritten = values.type_of_information !== 'Oral';
    const acts = values.act_name ? values.act_name.split(',').map(s => s.trim()).filter(Boolean) : [];
    const secs = values.sections ? values.sections.split(',').map(s => s.trim()).filter(Boolean) : [];
    const maxLen = Math.max(acts.length, secs.length);

    const chosenActObj = actsSectionsRegistry.find(item => item.act === newAct);
    const availableSections = chosenActObj ? chosenActObj.sections : [];
    
    return (
      <div className="space-y-3">
        {/* Main Table for GD and Complaint details */}
        <div className="bg-[#f0f4f8] border border-[#7a9cc5] rounded overflow-visible shadow-sm">
          <table className="w-full border-collapse">
            <tbody>
              {/* Row 1: GD/SD/DD Number / Date / Time */}
              <tr className="border-b border-[#7a9cc5]">
                <td className="w-1/3 bg-[#d0e0f8] text-[#0d2a4a] text-[11px] font-bold px-2.5 py-1 border-r border-[#7a9cc5] align-middle">
                  GD/SD/DD Number / Date / Time <span className="text-red-500">*</span>
                </td>
                <td className="w-2/3 bg-white px-2.5 py-1 flex items-center gap-2" style={{ position: 'relative' }}>
                  <input
                    type="text"
                    disabled={readOnly}
                    value={values.gd_no || ''}
                    onChange={(e) => handleChange('gd_no', e.target.value.replace(/\D/g, ''))}
                    className="w-20 h-6 px-1.5 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-blue-500"
                    placeholder="Number"
                  />
                  <input
                    type="text"
                    disabled={readOnly}
                    value={values.gd_date_time || ''}
                    onClick={() => setShowDatePicker(prev => !prev)}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleChange('gd_date_time', val);
                      const parts = val.split(' ');
                      if (parts[0]) {
                        handleChange('gd_date', parts[0]);
                        handleChange('fir_date', parts[0]);
                      }
                      if (parts[1]) {
                        handleChange('gd_time', parts[1]);
                        handleChange('fir_time', parts[1]);
                      }
                    }}
                    className="w-40 h-6 px-1.5 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-blue-500 cursor-pointer"
                    placeholder="DD/MM/YYYY HH:MM"
                    readOnly
                  />
                  <button 
                    ref={searchBtnRef}
                    type="button" 
                    className="p-1 text-[#0f52ba] hover:text-blue-700 bg-transparent border-none cursor-pointer flex items-center justify-center"
                    title="Pick Date & Time"
                    onClick={() => {
                      if (!showDatePicker && values.gd_date_time) {
                        const parts = values.gd_date_time.split(' ');
                        if (parts[0]) {
                          const dateParts = parts[0].split('/');
                          if (dateParts.length === 3) {
                            setPickerDay(parseInt(dateParts[0], 10) || new Date().getDate());
                            setPickerMonth((parseInt(dateParts[1], 10) || 1) - 1);
                            setPickerYear(parseInt(dateParts[2], 10) || new Date().getFullYear());
                          }
                        }
                        if (parts[1]) {
                          const timeParts = parts[1].split(':');
                          setPickerHour(parseInt(timeParts[0], 10) || 0);
                          setPickerMinute(parseInt(timeParts[1], 10) || 0);
                        }
                      } else if (!showDatePicker) {
                        const now = new Date();
                        setPickerDay(now.getDate());
                        setPickerMonth(now.getMonth());
                        setPickerYear(now.getFullYear());
                        setPickerHour(now.getHours());
                        setPickerMinute(now.getMinutes());
                      }
                      setShowDatePicker(prev => !prev);
                    }}
                  >
                    <Search size={14} className="stroke-[2.5]" />
                  </button>

                  {/* ── Custom Date & Time Picker Popup ──────────────────── */}
                  {showDatePicker && (() => {
                    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                    const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];
                    const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
                    const firstDayOfWeek = new Date(pickerYear, pickerMonth, 1).getDay();
                    const blanks = Array.from({ length: firstDayOfWeek }, (_, i) => i);
                    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

                    const handlePrevMonth = () => {
                      if (pickerMonth === 0) { setPickerMonth(11); setPickerYear(y => y - 1); }
                      else setPickerMonth(m => m - 1);
                    };
                    const handleNextMonth = () => {
                      if (pickerMonth === 11) { setPickerMonth(0); setPickerYear(y => y + 1); }
                      else setPickerMonth(m => m + 1);
                    };
                    const handleToday = () => {
                      const now = new Date();
                      setPickerDay(now.getDate()); setPickerMonth(now.getMonth()); setPickerYear(now.getFullYear());
                      setPickerHour(now.getHours()); setPickerMinute(now.getMinutes());
                    };
                    const handleDone = () => {
                      const dd = String(pickerDay).padStart(2, '0');
                      const mm = String(pickerMonth + 1).padStart(2, '0');
                      const hh = String(pickerHour).padStart(2, '0');
                      const mi = String(pickerMinute).padStart(2, '0');
                      const formatted = `${dd}/${mm}/${pickerYear} ${hh}:${mi}`;
                      const dVal = `${dd}/${mm}/${pickerYear}`;
                      const tVal = `${hh}:${mi}`;
                      handleChange('gd_date_time', formatted);
                      handleChange('gd_date', dVal);
                      handleChange('gd_time', tVal);
                      handleChange('fir_date', dVal);
                      handleChange('fir_time', tVal);
                      setShowDatePicker(false);
                    };

                    return (
                      <div
                        ref={datePickerRef}
                        className="absolute top-full left-0 mt-1 bg-white border border-[#7a9cc5] shadow-2xl rounded-lg p-3 z-50 flex gap-4 text-slate-800 select-none"
                        style={{ width: 340 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Left: Calendar Panel */}
                        <div className="flex-1 min-w-0">
                          {/* Month / Year header with arrows */}
                          <div className="flex items-center justify-between mb-2">
                            <button type="button" onClick={handlePrevMonth} className="p-0.5 rounded hover:bg-slate-100 text-[#0d2a4a] cursor-pointer bg-transparent border-none">
                              <ChevronLeft size={16} />
                            </button>
                            <div className="flex items-center gap-1.5">
                              <select
                                value={pickerMonth}
                                onChange={(e) => setPickerMonth(Number(e.target.value))}
                                className="text-[11px] font-bold text-[#0d2a4a] border border-[#7a9cc5] rounded px-1 py-0.5 bg-white cursor-pointer outline-none"
                              >
                                {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                              </select>
                              <select
                                value={pickerYear}
                                onChange={(e) => setPickerYear(Number(e.target.value))}
                                className="text-[11px] font-bold text-[#0d2a4a] border border-[#7a9cc5] rounded px-1 py-0.5 bg-white cursor-pointer outline-none"
                              >
                                {Array.from({ length: 21 }, (_, i) => 2015 + i).map(y => <option key={y} value={y}>{y}</option>)}
                              </select>
                            </div>
                            <button type="button" onClick={handleNextMonth} className="p-0.5 rounded hover:bg-slate-100 text-[#0d2a4a] cursor-pointer bg-transparent border-none">
                              <ChevronRight size={16} />
                            </button>
                          </div>

                          {/* Day-of-week headers */}
                          <div className="grid grid-cols-7 gap-0 text-center mb-1">
                            {DAY_LABELS.map(d => (
                              <span key={d} className="text-[10px] font-bold text-slate-500 py-0.5">{d}</span>
                            ))}
                          </div>

                          {/* Day grid */}
                          <div className="grid grid-cols-7 gap-0 text-center">
                            {blanks.map(b => <span key={`b-${b}`} />)}
                            {days.map(d => (
                              <button
                                key={d}
                                type="button"
                                onClick={() => setPickerDay(d)}
                                className={`text-[11px] py-1 rounded cursor-pointer border-none transition-colors ${
                                  d === pickerDay
                                    ? 'bg-[#0f52ba] text-white font-bold'
                                    : 'bg-transparent text-slate-700 hover:bg-blue-50'
                                }`}
                              >
                                {d}
                              </button>
                            ))}
                          </div>

                          {/* Today / Done buttons */}
                          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200">
                            <button type="button" onClick={handleToday} className="text-[10px] font-bold text-[#0f52ba] hover:underline cursor-pointer bg-transparent border-none">
                              Today
                            </button>
                            <button type="button" onClick={handleDone} className="text-[10px] font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white px-3 py-1 rounded cursor-pointer border-none transition-colors shadow-sm">
                              Done
                            </button>
                          </div>
                        </div>

                        {/* Right: Time sliders */}
                        <div className="flex flex-col items-center gap-2 border-l border-slate-200 pl-3" style={{ minWidth: 80 }}>
                          {/* Time display box */}
                          <div className="bg-[#f0f4f8] border border-[#7a9cc5] rounded px-2.5 py-1 text-center">
                            <span className="text-[12px] font-bold text-[#0d2a4a] font-mono">
                              {String(pickerHour).padStart(2, '0')}:{String(pickerMinute).padStart(2, '0')}
                            </span>
                          </div>
                          <div className="flex gap-3 items-start" style={{ height: 150 }}>
                            {/* Hour slider */}
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-[9px] text-slate-500 font-bold">Hr</span>
                              <input
                                type="range"
                                min={0} max={23}
                                value={pickerHour}
                                onChange={(e) => setPickerHour(Number(e.target.value))}
                                className="datetime-picker-vertical-slider"
                              />
                            </div>
                            {/* Minute slider */}
                            <div className="flex flex-col items-center gap-1">
                              <span className="text-[9px] text-slate-500 font-bold">Min</span>
                              <input
                                type="range"
                                min={0} max={59}
                                value={pickerMinute}
                                onChange={(e) => setPickerMinute(Number(e.target.value))}
                                className="datetime-picker-vertical-slider"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </td>
              </tr>

              {/* Row 2: Type of Information
              <tr className="border-b border-[#7a9cc5]">
                <td className="w-1/3 bg-[#d0e0f8] text-[#0d2a4a] text-[11px] font-bold px-2.5 py-1 border-r border-[#7a9cc5] align-middle">
                  Type of Information
                </td>
                <td className="w-2/3 bg-white px-2.5 py-1 flex items-center gap-4 text-[11px]">
                  <label className="flex items-center gap-1 cursor-pointer select-none">
                    <input
                      type="radio"
                      disabled={readOnly}
                      name="type_of_information"
                      checked={values.type_of_information === 'Written' || !values.type_of_information}
                      onChange={() => {
                        handleChange('type_of_information', 'Written');
                      }}
                      className="accent-[#0f52ba] cursor-pointer"
                    />
                    <span>Written</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer select-none">
                    <input
                      type="radio"
                      disabled={readOnly}
                      name="type_of_information"
                      checked={values.type_of_information === 'Oral'}
                      onChange={() => {
                        handleChange('type_of_information', 'Oral');
                      }}
                      className="accent-[#0f52ba] cursor-pointer"
                    />
                    <span>Oral</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer select-none">
                    <input
                      type="radio"
                      disabled={readOnly}
                      name="type_of_information"
                      checked={values.type_of_information === 'Court Order'}
                      onChange={() => {
                        handleChange('type_of_information', 'Court Order');
                      }}
                      className="accent-[#0f52ba] cursor-pointer"
                    />
                    <span>Court Order</span>
                  </label>
                </td>
              </tr> */}

              {/* Row: Case Registration Type */}
              <tr className="border-b border-[#7a9cc5]">
                <td className="w-1/3 bg-[#d0e0f8] text-[#0d2a4a] text-[11px] font-bold px-2.5 py-1 border-r border-[#7a9cc5] align-middle">
                  {lang === 'hi' ? 'मामला पंजीकरण प्रकार' : 'Case Registration Type'}
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
                    />
                  </div>
                </td>
              </tr>

              {/* Row 3: Complaint No. */}
              <tr className="border-b border-[#7a9cc5]">
                <td className="w-1/3 bg-[#d0e0f8] text-[#0d2a4a] text-[11px] font-bold px-2.5 py-1 border-r border-[#7a9cc5] align-middle">
                  Complaint No.
                </td>
                <td className="w-2/3 bg-white px-2.5 py-1">
                  <input
                    type="number"
                    disabled={readOnly}
                    value={values.complaint_no || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      handleChange('complaint_no', val);
                      handleChange('fir_no', val);
                    }}
                    className="w-64 h-6 px-1.5 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-blue-500"
                  />
                </td>
              </tr>

              {/* Row 4: Source / Reference of Complaint */}
              <tr>
                <td className="w-1/3 bg-[#d0e0f8] text-[#0d2a4a] text-[11px] font-bold px-2.5 py-1 border-r border-[#7a9cc5] align-middle">
                  Source / Reference of Complaint <span className="text-red-500">*</span>
                </td>
                <td className="w-2/3 bg-white px-2.5 py-1">
                  <select
                    disabled={readOnly}
                    value={values.source_reference || ''}
                    onChange={(e) => handleChange('source_reference', e.target.value)}
                    className="w-64 h-6 px-1 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="">-----Select-----</option>
                    <option value="PCR Call">PCR Call</option>
                    <option value="Physical Appearance">Physical Appearance</option>
                    <option value="Public Informant">Public Informant</option>
                    <option value="Police Beat Officer">Police Beat Officer</option>
                    <option value="Individual/Group/Company,Agency">Individual/Group/Company,Agency </option>
                    <option value="Court Order">Court Order</option>
                    <option value="Other">Other</option>
                  </select>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Two Containers Below */}
        <div className="flex flex-col md:flex-row gap-3">
          {/* Left container: Acts & Sections (50% width) */}
          <fieldset className="flex-1 border border-[#7a9cc5] rounded px-3 py-2 bg-[#f0f4f8]/20 min-h-[140px]">
            <legend className="text-[#0d2a4a] text-[11px] font-bold px-1.5 uppercase tracking-wide">
              Acts & Sections
            </legend>

            <div className="flex items-center justify-between mb-2">
              <span className="text-[#0d2a4a] text-[10px] font-bold opacity-60">Registered List</span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => setShowAddRow(true)}
                  className="bg-[#ea580c] hover:bg-[#c2410c] text-white text-[10px] font-bold px-2 py-0.5 rounded transition shadow-sm flex items-center gap-1 cursor-pointer"
                >
                  + Add Acts & Section
                </button>
              )}
            </div>

            <div className="w-full overflow-x-auto">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-[#d0e0f8] text-[#0d2a4a] border-b border-[#7a9cc5]">
                    <th className="px-2 py-1 text-left font-bold w-12 border-r border-[#7a9cc5]">S.No.</th>
                    <th className="px-2 py-1 text-left font-bold border-r border-[#7a9cc5]">Acts</th>
                    <th className="px-2 py-1 text-left font-bold border-r border-[#7a9cc5]">Sections</th>
                    {!readOnly && <th className="px-2 py-1 text-center font-bold w-16">Delete</th>}
                  </tr>
                </thead>
                <tbody>
                  {maxLen === 0 ? (
                    <tr>
                      <td colSpan={readOnly ? 3 : 4} className="px-2 py-3 text-center text-gray-500 italic">
                        No Acts & Sections added yet. Click "+ Add Acts & Section" to add.
                      </td>
                    </tr>
                  ) : (
                    Array.from({ length: maxLen }).map((_, i) => (
                      <tr key={i} className="border-b border-[#7a9cc5] bg-white">
                        <td className="px-2 py-1 border-r border-[#7a9cc5] text-[#0d2a4a] font-mono text-center">
                          {i + 1}
                        </td>
                        <td className="px-2 py-1 border-r border-[#7a9cc5] text-[#0d2a4a]">
                          {acts[i] || ''}
                        </td>
                        <td className="px-2 py-1 border-r border-[#7a9cc5] text-[#0d2a4a]">
                          {secs[i] || ''}
                        </td>
                        {!readOnly && (
                          <td className="px-2 py-1 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                const newActs = acts.filter((_, idx) => idx !== i);
                                const newSecs = secs.filter((_, idx) => idx !== i);
                                handleChange('act_name', newActs.join(', '));
                                handleChange('sections', newSecs.join(', '));
                              }}
                              className="text-red-600 hover:text-red-800 text-[10px] font-bold underline cursor-pointer"
                            >
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </fieldset>

          {/* Right container: Major / Minor (50% width) — reserved for future use */}
        <fieldset className="flex-1 border border-[#7a9cc5] rounded px-3 py-2 bg-[#f0f4f8]/20">
            <legend className="text-[#0d2a4a] text-[11px] font-bold px-1.5 uppercase tracking-wide">
              Major / Minor
            </legend>
            <div className="flex flex-col gap-2 text-[11px]">
              {/* ── Major Head Dropdown ──────────────────────────────────── */}
              <div className="flex flex-col gap-1">
                <label className="text-[#0d2a4a] font-bold">Major Head</label>
                <select
                  disabled={readOnly}
                  value={selectedMajorHead}
                  onChange={(e) => {
                    setSelectedMajorHead(e.target.value);
                    setSelectedMinorHead('');
                  }}
                  className="w-full h-6 px-1 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="">------Select------</option>
                  {getMajorHeadOptions().map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {lang === 'hi' ? (opt.label_hi || opt.label_en) : opt.label_en}
                    </option>
                  ))}
                </select>
              </div>
              {/* ── Minor Head Dropdown + Add Button ─────────────────────── */}
              <div className="flex flex-col gap-1">
                <label className="text-[#0d2a4a] font-bold">Minor Head</label>
                <div className="flex items-center gap-2">
                  <select
                    disabled={readOnly || !selectedMajorHead}
                    value={selectedMinorHead}
                    onChange={(e) => setSelectedMinorHead(e.target.value)}
                    className="flex-1 h-6 px-1 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="">------Select------</option>
                    {getMinorHeadOptions().map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {lang === 'hi' ? (opt.label_hi || opt.label_en) : opt.label_en}
                      </option>
                    ))}
                  </select>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={handleAddMajorMinorRow}
                      disabled={!selectedMajorHead || !selectedMinorHead}
                      className="bg-[#ea580c] hover:bg-[#c2410c] disabled:opacity-40 disabled:cursor-not-allowed text-white text-[10px] font-bold px-2 py-0.5 rounded transition shadow-sm flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      + Add
                    </button>
                  )}
                </div>
              </div>
              {/* ── Major/Minor Head Table ───────────────────────────────── */}
              <div className="w-full overflow-x-auto mt-1">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-[#d0e0f8] text-[#0d2a4a] border-b border-[#7a9cc5]">
                      <th className="px-2 py-1 text-left font-bold w-10 border-r border-[#7a9cc5]">S.No.</th>
                      <th className="px-2 py-1 text-left font-bold border-r border-[#7a9cc5]">Major Head</th>
                      <th className="px-2 py-1 text-left font-bold border-r border-[#7a9cc5]">Minor Head</th>
                      {!readOnly && <th className="px-2 py-1 text-center font-bold w-14">Delete</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {majorMinorRows.length === 0 ? (
                      <tr>
                        <td colSpan={readOnly ? 3 : 4} className="px-2 py-2 text-center text-gray-500 italic">
                          No entries added yet.
                        </td>
                      </tr>
                    ) : (
                      majorMinorRows.map((row, idx) => (
                        <tr key={idx} className="border-b border-[#7a9cc5] bg-white">
                          <td className="px-2 py-1 border-r border-[#7a9cc5] text-[#0d2a4a] font-mono text-center">{idx + 1}</td>
                          <td className="px-2 py-1 border-r border-[#7a9cc5] text-[#0d2a4a]">{row.majorHead}</td>
                          <td className="px-2 py-1 border-r border-[#7a9cc5] text-[#0d2a4a]">{row.minorHead}</td>
                          {!readOnly && (
                            <td className="px-2 py-1 text-center">
                              <button
                                type="button"
                                onClick={() => handleDeleteMajorMinorRow(idx)}
                                className="text-red-600 hover:text-red-800 text-[10px] font-bold underline cursor-pointer"
                              >
                                Delete
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {/* ── Local Head Dropdown ──────────────────────────────────── */}
              <div className="flex flex-col gap-1 mt-1">
                <label className="text-[#0d2a4a] font-bold">Local Head</label>
                <select
                  disabled={readOnly}
                  value={values.local_head || ''}
                  onChange={(e) => handleChange('local_head', e.target.value)}
                  className="w-full h-6 px-1 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="">------Select------</option>
                  {getLocalHeadOptions().map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {lang === 'hi' ? (opt.label_hi || opt.label_en) : opt.label_en}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </fieldset>
        </div>        

        {/* Dialogue Box / Modal for adding Act & Section */}
        {showAddRow && (
          <>
            {/* Click-away backdrop overlay (slightly dimmed bg, z-40) */}
            <div 
              className="fixed inset-0 z-40 bg-black/40" 
              onClick={() => {
                setNewAct('');
                setNewSection('');
                setShowAddRow(false);
              }}
            />
            {/* Centered Horizontal Modal dialogue box (z-50) */}
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] bg-white border border-[#7a9cc5] rounded shadow-2xl z-50 p-4 flex flex-col justify-between text-slate-800">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <h3 className="text-xs font-bold text-[#0d2a4a] uppercase tracking-wider">
                    Add Acts & Section
                  </h3>
                  <button
                    type="button"
                    onClick={() => {
                      setNewAct('');
                      setNewSection('');
                      setShowAddRow(false);
                    }}
                    className="text-slate-400 hover:text-slate-600 text-sm font-bold bg-transparent border-none cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                
                {/* Vertical up-and-down selects layout */}
                <div className="space-y-3">
                  <div className="flex flex-col gap-1 text-[11px] text-left">
                    <label className="text-[#0d2a4a] font-bold">Act / Law Name</label>
                    <select
                      value={newAct}
                      onChange={(e) => {
                        setNewAct(e.target.value);
                        setNewSection('');
                      }}
                      className="w-full h-8 px-2 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-[#ea580c] cursor-pointer"
                      autoFocus
                    >
                      <option value="">----select----</option>
                      {actsSectionsRegistry.map((item) => (
                        <option key={item.act} value={item.act}>
                          {item.act}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1 text-[11px] text-left">
                    <label className="text-[#0d2a4a] font-bold">Section(s)</label>
                    <select
                      value={newSection}
                      onChange={(e) => setNewSection(e.target.value)}
                      disabled={!newAct}
                      className="w-full h-8 px-2 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-[#ea580c] cursor-pointer disabled:bg-slate-50 disabled:cursor-not-allowed"
                    >
                      <option value="">----select----</option>
                      {availableSections.map((sec) => (
                        <option key={sec} value={sec}>
                          {sec}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3 mt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setNewAct('');
                    setNewSection('');
                    setShowAddRow(false);
                  }}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-[#0d2a4a] text-[11px] font-bold rounded cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (newAct.trim() || newSection.trim()) {
                      const updatedActs = [...acts, newAct.trim()].join(', ');
                      const updatedSections = [...secs, newSection.trim()].join(', ');
                      handleChange('act_name', updatedActs);
                      handleChange('sections', updatedSections);
                    }
                    setNewAct('');
                    setNewSection('');
                    setShowAddRow(false);
                  }}
                  className="px-3 py-1 bg-[#ea580c] hover:bg-[#c2410c] text-white text-[11px] font-bold rounded cursor-pointer transition-colors shadow-sm"
                >
                  Save
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

const renderOccurrenceStep = () => {
  const allFields = schema ? schema.reduce((acc, sec) => [...acc, ...(sec.fields || [])], []) : [];

  const occurrenceInfoKeys = [
    'occurrence_time_type',
    'occurrence_from_date_time',
    'occurrence_to_date_time',
    'info_received_at_ps_date_time'
  ];

  const occurrencePlaceKeys = [
    'occurrence_house_no',
    'occurrence_street',
    'occurrence_colony',
    'occurrence_city_town_village',
    'occurrence_tehsil_block_mandal',
    'occurrence_pincode',
    'occurrence_police_station',
    'Police_district/zone',
    'occurrence_district' ,
    'occurrence_state',
  ];

  return (
    <div className="grid grid-cols-2 gap-4 text-sm">

      {/* LEFT COLUMN */}
      <div className="space-y-3">

        {/* OCCURRENCE INFORMATION */}
        <fieldset className="border border-[#7a9cc5] rounded px-2 py-2">
          <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
            Occurrence Information
          </legend>

          <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea]">
            {(() => {
              const activeFields = occurrenceInfoKeys
                .map(key => allFields.find(f => f.field_key === key))
                .filter(Boolean);

              return activeFields.map((field, index) => {
                const key = field.field_key;
                const label = lang === 'hi' ? (field.label_hi || field.label_en) : field.label_en;
                const rules = parseRules(field.validation_rules);
                const isRequired = !!rules.required;
                const isLast = index === activeFields.length - 1;

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
                        readOnly={readOnly || field.readonly === true || field.readonly === 'true'}
                        hasError={touched[key] && !!errors[key]}
                        lang={lang}
                        values={values}
                      />
                    </div>
                  </React.Fragment>
                );
              });
            })()}
          </div>
        </fieldset>

        {/* FOREST AREA */}
        <fieldset className="border border-[#7a9cc5] rounded px-2 py-3">
          <div className="flex items-center gap-6 text-[12px]">

            <span className="font-medium">
              Area of Crime
            </span>

            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={values?.area_of_crime === "Rural"}
                onChange={() => handleChange("area_of_crime", "Rural")}
              />
              Rural
            </label>

            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={values?.area_of_crime === "Urban"}
                onChange={() => handleChange("area_of_crime", "Urban")}
              />
              Urban
            </label>

            
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={values?.area_of_crime === "Semi-Rural"}
                onChange={() => handleChange("area_of_crime", "Semi-Rural")}
              />
              Semi-Rural
            </label>

            
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={values?.area_of_crime === "Deserted Area"}
                onChange={() => handleChange("area_of_crime", "Deserted Area")}
              />
              Deserted Area
            </label>

            
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={values?.area_of_crime === "Forest"}
                onChange={() => handleChange("area_of_crime", "Forest")}
              />
              Forest
            </label>

          </div>
        </fieldset>

      </div>


      {/* RIGHT COLUMN */}
      <div>

        <fieldset className="border border-[#7a9cc5] rounded px-2 py-2 h-full">
          <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
            Place of Occurrence
          </legend>

          <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea]">
            {(() => {
              const activeFields = occurrencePlaceKeys
                .map(key => allFields.find(f => f.field_key === key))
                .filter(Boolean);

              return activeFields.map((field, index) => {
                const key = field.field_key;
                const label = lang === 'hi' ? (field.label_hi || field.label_en) : field.label_en;
                const rules = parseRules(field.validation_rules);
                const isRequired = !!rules.required;
                const isLast = index === activeFields.length - 1;

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
                        readOnly={readOnly || field.readonly === true || field.readonly === 'true'}
                        hasError={touched[key] && !!errors[key]}
                        lang={lang}
                        values={values}
                      />
                    </div>
                  </React.Fragment>
                );
              });
            })()}
          </div>
        </fieldset>

      </div>

    </div>
  );
};

const renderComplainantStep = () => {
  const allFields = schema ? schema.reduce((acc, sec) => [...acc, ...(sec.fields || [])], []) : [];

  const renderField = (key) => {
    const field = allFields.find(f => f.field_key === key);
    if (!field) return null;
    return (
      <FieldRenderer
        field={field}
        value={values[key]}
        onChange={handleChange}
        readOnly={readOnly || field.readonly === true || field.readonly === 'true'}
        hasError={touched[key] && !!errors[key]}
        lang={lang}
        values={values}
      />
    );
  };

  const renderFieldWithLabel = (key, customLabel = null, isLast = false, forceReadOnly = false) => {
    const field = allFields.find(f => f.field_key === key);
    if (!field) return null;
    const label = customLabel || (lang === 'hi' ? (field.label_hi || field.label_en) : field.label_en);
    const rules = parseRules(field.validation_rules);
    const isRequired = !!rules.required;
    const isDisabled = forceReadOnly || readOnly || field.readonly === true || field.readonly === 'true';

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

  const renderPersonalInfoSubTab = () => {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          
          {/* Left Column - Personal Info (no border outline) */}
          <div className="space-y-3">
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea]">
              {renderFieldWithLabel('complainant_npr', lang === 'hi' ? 'यूआईडी (UID)' : 'UID')}
              {renderFieldWithLabel('complainant_first_name')}
              {renderFieldWithLabel('complainant_middle_name')}
              {renderFieldWithLabel('complainant_last_name', null, true)}
            </div>
          </div>

          {/* Right Column - Gender, Marital Status, Mobile, Email, checkbox */}
          <div className="border border-[#7a9cc5] rounded px-2 py-2 self-start">
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea]">
              {renderFieldWithLabel('complainant_gender')}
              {renderFieldWithLabel('complainant_marital_status')}
              
              {/* Mobile number with country code */}
              <React.Fragment>
                <div className="bg-[#dfeaf5] px-2 py-2 border-b text-[12px] font-medium flex items-center gap-1">
                  <span>{lang === 'hi' ? 'मोबाइल नंबर' : 'Mobile No.'}</span>
                </div>
                <div className="px-2 py-1 border-b flex gap-1.5 items-center">
                  <div className="w-14">
                    <FieldRenderer
                      field={allFields.find(f => f.field_key === 'complainant_mobile_country_code')}
                      value={values.complainant_mobile_country_code || '+91'}
                      onChange={handleChange}
                      readOnly={readOnly}
                      lang={lang}
                      values={values}
                    />
                  </div>
                  <div className="flex-1">
                    <FieldRenderer
                      field={allFields.find(f => f.field_key === 'complainant_mobile')}
                      value={values.complainant_mobile}
                      onChange={handleChange}
                      readOnly={readOnly}
                      lang={lang}
                      values={values}
                    />
                  </div>
                </div>
              </React.Fragment>

              {renderFieldWithLabel('complainant_email')}
              {renderFieldWithLabel('complainant_same_as_victim', null, true)}
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
              {renderFieldWithLabel('complainant_relation_type')}
              {renderFieldWithLabel('complainant_relative_name', null, true)}
            </div>
          </div>

          {/* Age Panel */}
          <fieldset className="border border-[#7a9cc5] rounded px-2 py-2">
            <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
              {lang === 'hi' ? 'आयु विवरण' : 'Age Panel'}
            </legend>
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] mt-2">
              {renderFieldWithLabel('complainant_dob')}
              
              {/* Age (Year / Month) */}
              <React.Fragment>
                <div className="bg-[#dfeaf5] px-2 py-2 border-b text-[12px] font-medium flex items-center gap-1">
                  <span>{lang === 'hi' ? 'आयु (वर्ष / महीने)' : 'Age (Year / Month)'}</span>
                </div>
                <div className="px-2 py-1 border-b flex gap-2">
                  <div className="flex-1">
                    <FieldRenderer
                      field={allFields.find(f => f.field_key === 'complainant_age_year')}
                      value={values.complainant_age_year}
                      onChange={handleChange}
                      readOnly={readOnly}
                      lang={lang}
                      values={values}
                    />
                  </div>
                  <div className="flex-1">
                    <FieldRenderer
                      field={allFields.find(f => f.field_key === 'complainant_age_month')}
                      value={values.complainant_age_month}
                      onChange={handleChange}
                      readOnly={readOnly}
                      lang={lang}
                      values={values}
                    />
                  </div>
                </div>
              </React.Fragment>

              {renderFieldWithLabel('complainant_birth_year', null, true)}
            </div>
          </fieldset>

        </div>
      </div>
    );
  };

  const renderAddressSubTab = () => {
    const isSame = values.complainant_perm_same === 'Yes' || values.complainant_perm_same === true;
    return (
      <div className="space-y-6">
        
        {/* PRESENT ADDRESS PANEL */}
        <fieldset className="border border-[#7a9cc5] rounded px-2 py-2">
          <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
            {lang === 'hi' ? 'वर्तमान पता' : 'Present Address'}
          </legend>

          <div className="grid grid-cols-2 gap-4 mt-2">
            
            {/* Left Box (Present Address granular fields) */}
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] self-start">
              {renderFieldWithLabel('complainant_house_no')}
              {renderFieldWithLabel('complainant_street')}
              {renderFieldWithLabel('complainant_colony')}
              {renderFieldWithLabel('complainant_city_town_village')}
              {renderFieldWithLabel('complainant_tehsil_block_mandal', null, true)}
            </div>

            {/* Right Box (Present Address dropdowns/info) */}
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] self-start">
              {renderFieldWithLabel('complainant_country')}
              {renderFieldWithLabel('complainant_state')}
              {renderFieldWithLabel('complainant_district')}
              {renderFieldWithLabel('complainant_police_station')}
              {renderFieldWithLabel('complainant_pincode', null, true)}
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
                field={allFields.find(f => f.field_key === 'complainant_perm_same')}
                value={values.complainant_perm_same}
                onChange={handleChange}
                readOnly={readOnly}
                lang={lang}
                values={values}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            
            {/* Left Box (Permanent Address fields) */}
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] self-start">
              {renderFieldWithLabel('complainant_perm_house_no', null, false, isSame)}
              {renderFieldWithLabel('complainant_perm_street', null, false, isSame)}
              {renderFieldWithLabel('complainant_perm_colony', null, false, isSame)}
              {renderFieldWithLabel('complainant_perm_city_town_village', null, false, isSame)}
              {renderFieldWithLabel('complainant_perm_tehsil_block_mandal', null, true, isSame)}
            </div>

            {/* Right Box (Permanent Address fields) */}
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] self-start">
              {renderFieldWithLabel('complainant_perm_country', null, false, isSame)}
              {renderFieldWithLabel('complainant_perm_state', null, false, isSame)}
              {renderFieldWithLabel('complainant_perm_district', null, false, isSame)}
              {renderFieldWithLabel('complainant_perm_police_station', null, false, isSame)}
              {renderFieldWithLabel('complainant_perm_pincode', null, true, isSame)}
            </div>

          </div>
        </fieldset>

      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Sub-Tab selection bar */}
      <div className="flex gap-2 border-b border-[#7a9cc5] pb-0 bg-slate-100/50 rounded-t p-1">
        <button
          type="button"
          onClick={() => setComplainantTab('personal')}
          className={`px-4 py-1.5 text-xs font-bold border border-b-0 border-[#7a9cc5] rounded-t cursor-pointer transition-colors ${
            complainantTab === 'personal'
              ? 'bg-[#ea580c] text-white'
              : 'bg-[#0d2a4a] text-white hover:bg-[#16406d]'
          }`}
        >
          {lang === 'hi' ? 'व्यक्तिगत जानकारी' : 'Personal Information'}
        </button>
        <button
          type="button"
          onClick={() => setComplainantTab('address')}
          className={`px-4 py-1.5 text-xs font-bold border border-b-0 border-[#7a9cc5] rounded-t cursor-pointer transition-colors ${
            complainantTab === 'address'
              ? 'bg-[#ea580c] text-white'
              : 'bg-[#0d2a4a] text-white hover:bg-[#16406d]'
          }`}
        >
          {lang === 'hi' ? 'पता' : 'Address'}
        </button>
      </div>

      {/* Sub-tab content */}
      <div className="p-2 border border-t-0 border-[#7a9cc5] rounded-b bg-transparent">
        {complainantTab === 'personal' ? renderPersonalInfoSubTab() : renderAddressSubTab()}
      </div>
    </div>
  );
};

const renderVictimStep = () => {
  const victims = repeaterState?.PERSON_VICTIM || [];
  const allFields = schema ? schema.reduce((acc, sec) => [...acc, ...(sec.fields || [])], []) : [];

  // Helper: render a field inside the modal using victimTempValues
  const renderVictimModalField = (key, customLabel = null, isLast = false, forceReadOnly = false) => {
    const field = allFields.find(f => f.field_key === key);
    if (!field) return null;
    const label = customLabel || (lang === 'hi' ? (field.label_hi || field.label_en) : field.label_en);
    const rules = parseRules(field.validation_rules);
    const isRequired = !!rules.required || key === 'victim_first_name' || key === 'victim_gender';
    const isDisabled = forceReadOnly || readOnly || field.readonly === true || field.readonly === 'true';

    return (
      <React.Fragment key={key}>
        <div className={`bg-[#dfeaf5] px-2 py-2 text-[12px] font-medium flex items-center gap-1 ${!isLast ? 'border-b border-[#c7d8ea]' : ''}`}>
          <span>{label}</span>
          {isRequired && <span className="text-red-500 font-bold">*</span>}
        </div>
        <div className={`px-2 py-1 ${!isLast ? 'border-b border-[#c7d8ea]' : ''}`}>
          <FieldRenderer
            field={field}
            value={victimTempValues[key]}
            onChange={handleVictimModalChange}
            readOnly={isDisabled}
            hasError={victimModalTouched[key] && !!victimModalErrors[key]}
            lang={lang}
            values={victimTempValues}
          />
          {victimModalTouched[key] && victimModalErrors[key] && (
            <p className="text-red-500 text-[10px] mt-0.5">{victimModalErrors[key]}</p>
          )}
        </div>
      </React.Fragment>
    );
  };

  // ── Personal Information sub-tab inside modal ──
  const renderVictimPersonalInfoSubTab = () => {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">

          {/* Left Column - Personal Info (no border outline) */}
          <div className="space-y-3">
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea]">
              {renderVictimModalField('victim_npr', lang === 'hi' ? 'यूआईडी (UID)' : 'UID')}
              {renderVictimModalField('victim_first_name')}
              {renderVictimModalField('victim_middle_name')}
              {renderVictimModalField('victim_last_name')}
              {renderVictimModalField('victim_nickname', lang === 'hi' ? 'उपनाम / Alias' : 'Nickname/Alias', true)}
            </div>
          </div>

          {/* Right Column - Gender, Marital Status, Mobile, Email */}
          <div className="border border-[#7a9cc5] rounded px-2 py-2 self-start">
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea]">
              {renderVictimModalField('victim_gender')}
              {renderVictimModalField('victim_marital_status')}

              {/* Mobile number with country code */}
              <React.Fragment>
                <div className="bg-[#dfeaf5] px-2 py-2 border-b text-[12px] font-medium flex items-center gap-1">
                  <span>{lang === 'hi' ? 'मोबाइल नंबर' : 'Mobile No.'}</span>
                </div>
                <div className="px-2 py-1 border-b flex gap-1.5 items-center">
                  <div className="w-14">
                    <FieldRenderer
                      field={allFields.find(f => f.field_key === 'victim_mobile_country_code')}
                      value={victimTempValues.victim_mobile_country_code || '+91'}
                      onChange={handleVictimModalChange}
                      readOnly={readOnly}
                      lang={lang}
                      values={victimTempValues}
                    />
                  </div>
                  <div className="flex-1">
                    <FieldRenderer
                      field={allFields.find(f => f.field_key === 'victim_mobile')}
                      value={victimTempValues.victim_mobile}
                      onChange={handleVictimModalChange}
                      readOnly={readOnly}
                      lang={lang}
                      values={victimTempValues}
                    />
                  </div>
                </div>
              </React.Fragment>

              {renderVictimModalField('victim_email', null, true)}
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
              {renderVictimModalField('victim_relation_type')}
              {renderVictimModalField('victim_relative_name', null, true)}
            </div>
          </div>

          {/* Age Panel */}
          <fieldset className="border border-[#7a9cc5] rounded px-2 py-2">
            <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
              {lang === 'hi' ? 'आयु विवरण' : 'Age Panel'}
            </legend>
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] mt-2">
              {renderVictimModalField('victim_dob')}

              {/* Age (Year / Month) */}
              <React.Fragment>
                <div className="bg-[#dfeaf5] px-2 py-2 border-b text-[12px] font-medium flex items-center gap-1">
                  <span>{lang === 'hi' ? 'आयु (वर्ष / महीने)' : 'Age (Year / Month)'}</span>
                </div>
                <div className="px-2 py-1 border-b flex gap-2">
                  <div className="flex-1">
                    <FieldRenderer
                      field={allFields.find(f => f.field_key === 'victim_age_year')}
                      value={victimTempValues.victim_age_year}
                      onChange={handleVictimModalChange}
                      readOnly={readOnly}
                      lang={lang}
                      values={victimTempValues}
                    />
                  </div>
                  <div className="flex-1">
                    <FieldRenderer
                      field={allFields.find(f => f.field_key === 'victim_age_month')}
                      value={victimTempValues.victim_age_month}
                      onChange={handleVictimModalChange}
                      readOnly={readOnly}
                      lang={lang}
                      values={victimTempValues}
                    />
                  </div>
                </div>
              </React.Fragment>

              {renderVictimModalField('victim_birth_year', null, true)}
            </div>
          </fieldset>

        </div>
      </div>
    );
  };

  // ── Address sub-tab inside modal (mirrors complainant address) ──
  const renderVictimAddressSubTab = () => {
    const isSame = victimTempValues.victim_perm_same === 'Yes' || victimTempValues.victim_perm_same === true;
    return (
      <div className="space-y-6">

        {/* PRESENT ADDRESS PANEL */}
        <fieldset className="border border-[#7a9cc5] rounded px-2 py-2">
          <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
            {lang === 'hi' ? 'वर्तमान पता' : 'Present Address'}
          </legend>

          <div className="grid grid-cols-2 gap-4 mt-2">

            {/* Left Box */}
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] self-start">
              {renderVictimModalField('victim_house_no')}
              {renderVictimModalField('victim_street')}
              {renderVictimModalField('victim_colony')}
              {renderVictimModalField('victim_city_town_village')}
              {renderVictimModalField('victim_tehsil_block_mandal', null, true)}
            </div>

            {/* Right Box */}
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] self-start">
              {renderVictimModalField('victim_country')}
              {renderVictimModalField('victim_state')}
              {renderVictimModalField('victim_district')}
              {renderVictimModalField('victim_police_station')}
              {renderVictimModalField('victim_pincode', null, true)}
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
                field={allFields.find(f => f.field_key === 'victim_perm_same')}
                value={victimTempValues.victim_perm_same}
                onChange={handleVictimModalChange}
                readOnly={readOnly}
                lang={lang}
                values={victimTempValues}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">

            {/* Left Box */}
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] self-start">
              {renderVictimModalField('victim_perm_house_no', null, false, isSame)}
              {renderVictimModalField('victim_perm_street', null, false, isSame)}
              {renderVictimModalField('victim_perm_colony', null, false, isSame)}
              {renderVictimModalField('victim_perm_city_town_village', null, false, isSame)}
              {renderVictimModalField('victim_perm_tehsil_block_mandal', null, true, isSame)}
            </div>

            {/* Right Box */}
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] self-start">
              {renderVictimModalField('victim_perm_country', null, false, isSame)}
              {renderVictimModalField('victim_perm_state', null, false, isSame)}
              {renderVictimModalField('victim_perm_district', null, false, isSame)}
              {renderVictimModalField('victim_perm_police_station', null, false, isSame)}
              {renderVictimModalField('victim_perm_pincode', null, true, isSame)}
            </div>

          </div>
        </fieldset>

      </div>
    );
  };

  // Build name & address strings for the summary table
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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
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
            <div className="flex gap-2 border-b border-[#7a9cc5] pb-0 bg-slate-100/50 p-1">
              <button
                type="button"
                onClick={() => setVictimSubTab('personal')}
                className={`px-4 py-1.5 text-xs font-bold border border-b-0 border-[#7a9cc5] rounded-t cursor-pointer transition-colors ${
                  victimSubTab === 'personal'
                    ? 'bg-[#ea580c] text-white'
                    : 'bg-[#0d2a4a] text-white hover:bg-[#16406d]'
                }`}
              >
                {lang === 'hi' ? 'व्यक्तिगत जानकारी' : 'Personal Information'}
              </button>
              <button
                type="button"
                onClick={() => setVictimSubTab('address')}
                className={`px-4 py-1.5 text-xs font-bold border border-b-0 border-[#7a9cc5] rounded-t cursor-pointer transition-colors ${
                  victimSubTab === 'address'
                    ? 'bg-[#ea580c] text-white'
                    : 'bg-[#0d2a4a] text-white hover:bg-[#16406d]'
                }`}
              >
                {lang === 'hi' ? 'पता' : 'Address'}
              </button>
            </div>

            {/* Modal Body (scrollable) */}
            <div className="flex-1 overflow-y-auto p-4 border border-t-0 border-[#7a9cc5] bg-white">
              {victimSubTab === 'personal' ? renderVictimPersonalInfoSubTab() : renderVictimAddressSubTab()}
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
  const accusedList = repeaterState?.PERSON_ACCUSED || [];
  const allFields = schema ? schema.reduce((acc, sec) => [...acc, ...(sec.fields || [])], []) : [];

  // Helper: render a field inside the modal using accusedTempValues
  const renderAccusedModalField = (key, customLabel = null, isLast = false, forceReadOnly = false) => {
    const field = allFields.find(f => f.field_key === key);
    if (!field) return null;
    const label = customLabel || (lang === 'hi' ? (field.label_hi || field.label_en) : field.label_en);
    const rules = parseRules(field.validation_rules);
    const isRequired = !!rules.required || key === 'accused_first_name' || key === 'accused_gender';
    const isDisabled = forceReadOnly || readOnly || field.readonly === true || field.readonly === 'true';

    return (
      <React.Fragment key={key}>
        <div className={`bg-[#dfeaf5] px-2 py-2 text-[12px] font-medium flex items-center gap-1 ${!isLast ? 'border-b border-[#c7d8ea]' : ''}`}>
          <span>{label}</span>
          {isRequired && <span className="text-red-500 font-bold">*</span>}
        </div>
        <div className={`px-2 py-1 ${!isLast ? 'border-b border-[#c7d8ea]' : ''}`}>
          <FieldRenderer
            field={field}
            value={accusedTempValues[key]}
            onChange={handleAccusedModalChange}
            readOnly={isDisabled}
            hasError={accusedModalTouched[key] && !!accusedModalErrors[key]}
            lang={lang}
            values={accusedTempValues}
          />
          {accusedModalTouched[key] && accusedModalErrors[key] && (
            <p className="text-red-500 text-[10px] mt-0.5">{accusedModalErrors[key]}</p>
          )}
        </div>
      </React.Fragment>
    );
  };

  // ── Personal Information sub-tab inside modal ──
  const renderAccusedPersonalInfoSubTab = () => {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">

          {/* Left Column - Personal Info (no border outline) */}
          <div className="space-y-3">
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea]">
              {renderAccusedModalField('accused_npr', lang === 'hi' ? 'यूआईडी (UID)' : 'UID')}
              {renderAccusedModalField('accused_first_name')}
              {renderAccusedModalField('accused_middle_name')}
              {renderAccusedModalField('accused_last_name')}
              {renderAccusedModalField('accused_nickname', lang === 'hi' ? 'उपनाम / Alias' : 'Nickname/Alias', true)}
            </div>
          </div>

          {/* Right Column - Gender, Marital Status, Mobile, Email */}
          <div className="border border-[#7a9cc5] rounded px-2 py-2 self-start">
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea]">
              {renderAccusedModalField('accused_gender')}
              {renderAccusedModalField('accused_marital_status')}

              {/* Mobile number with country code */}
              <React.Fragment>
                <div className="bg-[#dfeaf5] px-2 py-2 border-b text-[12px] font-medium flex items-center gap-1">
                  <span>{lang === 'hi' ? 'मोबाइल नंबर' : 'Mobile No.'}</span>
                </div>
                <div className="px-2 py-1 border-b flex gap-1.5 items-center">
                  <div className="w-14">
                    <FieldRenderer
                      field={allFields.find(f => f.field_key === 'accused_mobile_country_code')}
                      value={accusedTempValues.accused_mobile_country_code || '+91'}
                      onChange={handleAccusedModalChange}
                      readOnly={readOnly}
                      lang={lang}
                      values={accusedTempValues}
                    />
                  </div>
                  <div className="flex-1">
                    <FieldRenderer
                      field={allFields.find(f => f.field_key === 'accused_mobile')}
                      value={accusedTempValues.accused_mobile}
                      onChange={handleAccusedModalChange}
                      readOnly={readOnly}
                      lang={lang}
                      values={accusedTempValues}
                    />
                  </div>
                </div>
              </React.Fragment>

              {renderAccusedModalField('accused_qualification')}
              {renderAccusedModalField('accused_email', null, true)}
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
              {renderAccusedModalField('accused_relation_type')}
              {renderAccusedModalField('accused_relative_name', null, true)}
            </div>
          </div>

          {/* Age Panel */}
          <fieldset className="border border-[#7a9cc5] rounded px-2 py-2">
            <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
              {lang === 'hi' ? 'आयु विवरण' : 'Age Panel'}
            </legend>
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] mt-2">
              {renderAccusedModalField('accused_dob')}

              {/* Age (Year / Month) */}
              <React.Fragment>
                <div className="bg-[#dfeaf5] px-2 py-2 border-b text-[12px] font-medium flex items-center gap-1">
                  <span>{lang === 'hi' ? 'आयु (वर्ष / महीने)' : 'Age (Year / Month)'}</span>
                </div>
                <div className="px-2 py-1 border-b flex gap-2">
                  <div className="flex-1">
                    <FieldRenderer
                      field={allFields.find(f => f.field_key === 'accused_age_year')}
                      value={accusedTempValues.accused_age_year}
                      onChange={handleAccusedModalChange}
                      readOnly={readOnly}
                      lang={lang}
                      values={accusedTempValues}
                    />
                  </div>
                  <div className="flex-1">
                    <FieldRenderer
                      field={allFields.find(f => f.field_key === 'accused_age_month')}
                      value={accusedTempValues.accused_age_month}
                      onChange={handleAccusedModalChange}
                      readOnly={readOnly}
                      lang={lang}
                      values={accusedTempValues}
                    />
                  </div>
                </div>
              </React.Fragment>

              {renderAccusedModalField('accused_birth_year', null, true)}
            </div>
          </fieldset>

        </div>
      </div>
    );
  };

  // ── Address sub-tab inside modal ──
  const renderAccusedAddressSubTab = () => {
    const isSame = accusedTempValues.accused_perm_same === 'Yes' || accusedTempValues.accused_perm_same === true;
    return (
      <div className="space-y-6">

        {/* PRESENT ADDRESS PANEL */}
        <fieldset className="border border-[#7a9cc5] rounded px-2 py-2">
          <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
            {lang === 'hi' ? 'वर्तमान पता' : 'Present Address'}
          </legend>

          <div className="grid grid-cols-2 gap-4 mt-2">

            {/* Left Box */}
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] self-start">
              {renderAccusedModalField('accused_house_no')}
              {renderAccusedModalField('accused_street')}
              {renderAccusedModalField('accused_colony')}
              {renderAccusedModalField('accused_city_town_village')}
              {renderAccusedModalField('accused_tehsil_block_mandal', null, true)}
            </div>

            {/* Right Box */}
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] self-start">
              {renderAccusedModalField('accused_country')}
              {renderAccusedModalField('accused_state')}
              {renderAccusedModalField('accused_district')}
              {renderAccusedModalField('accused_police_station')}
              {renderAccusedModalField('accused_pincode', null, true)}
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
                field={allFields.find(f => f.field_key === 'accused_perm_same')}
                value={accusedTempValues.accused_perm_same}
                onChange={handleAccusedModalChange}
                readOnly={readOnly}
                lang={lang}
                values={accusedTempValues}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">

            {/* Left Box */}
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] self-start">
              {renderAccusedModalField('accused_perm_house_no', null, false, isSame)}
              {renderAccusedModalField('accused_perm_street', null, false, isSame)}
              {renderAccusedModalField('accused_perm_colony', null, false, isSame)}
              {renderAccusedModalField('accused_perm_city_town_village', null, false, isSame)}
              {renderAccusedModalField('accused_perm_tehsil_block_mandal', null, true, isSame)}
            </div>

            {/* Right Box */}
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] self-start">
              {renderAccusedModalField('accused_perm_country', null, false, isSame)}
              {renderAccusedModalField('accused_perm_state', null, false, isSame)}
              {renderAccusedModalField('accused_perm_district', null, false, isSame)}
              {renderAccusedModalField('accused_perm_police_station', null, false, isSame)}
              {renderAccusedModalField('accused_perm_pincode', null, true, isSame)}
            </div>

          </div>
        </fieldset>

      </div>
    );
  };

  // Build name & address strings for the summary table
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
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
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
            <div className="flex gap-2 border-b border-[#7a9cc5] pb-0 bg-slate-100/50 p-1">
              <button
                type="button"
                onClick={() => setAccusedSubTab('personal')}
                className={`px-4 py-1.5 text-xs font-bold border border-b-0 border-[#7a9cc5] rounded-t cursor-pointer transition-colors ${
                  accusedSubTab === 'personal'
                    ? 'bg-[#ea580c] text-white'
                    : 'bg-[#0d2a4a] text-white hover:bg-[#16406d]'
                }`}
              >
                {lang === 'hi' ? 'व्यक्तिगत जानकारी' : 'Personal Information'}
              </button>
              <button
                type="button"
                onClick={() => setAccusedSubTab('address')}
                className={`px-4 py-1.5 text-xs font-bold border border-b-0 border-[#7a9cc5] rounded-t cursor-pointer transition-colors ${
                  accusedSubTab === 'address'
                    ? 'bg-[#ea580c] text-white'
                    : 'bg-[#0d2a4a] text-white hover:bg-[#16406d]'
                }`}
              >
                {lang === 'hi' ? 'पता' : 'Address'}
              </button>
            </div>

            {/* Modal Body (scrollable) */}
            <div className="flex-1 overflow-y-auto p-4 border border-t-0 border-[#7a9cc5] bg-white">
              {accusedSubTab === 'personal' ? renderAccusedPersonalInfoSubTab() : renderAccusedAddressSubTab()}
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

const renderPropertyStep = () => {
  const propertyList = repeaterState?.property_details || [];
  const allFields = schema ? schema.reduce((acc, sec) => [...acc, ...(sec.fields || [])], []) : [];
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
    let targetKey = null;
    const cat = String(majorCategory).toLowerCase().trim();
    if (cat === 'vehicle') targetKey = 'prop_vehicle_type';
    else if (cat === 'jewellery' || cat === 'gold/jewellery') targetKey = 'prop_gold_item_type';
    else if (cat === 'electronics' || cat === 'electronics/gadgets') targetKey = 'prop_elec_device_type';
    else if (cat === 'documents' || cat === 'official/personal documents') targetKey = 'prop_doc_type';
    else if (cat === 'drugs' || cat === 'drugs/narcotics') targetKey = 'prop_drug_type';
    else if (cat === 'arms' || cat === 'arms/ammunition') targetKey = 'prop_arms_type';
    else if (cat === 'cash') targetKey = 'prop_cash_currency';

    if (targetKey) {
      const field = allFields.find(f => f.field_key === targetKey);
      if (field) {
        try {
          const opts = typeof field.options === 'string' ? JSON.parse(field.options) : field.options;
          return Array.isArray(opts) ? opts : [];
        } catch (e) {
          return Array.isArray(field.options) ? field.options : [];
        }
      }
    }
    return [];
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
    const cv = row[tf];
    if (operator === 'filled') return cv !== undefined && cv !== null && String(cv).trim() !== '';
    return Array.isArray(tv)
      ? tv.map(v => String(v || '').toLowerCase()).includes(String(cv || '').toLowerCase())
      : String(cv || '').toLowerCase() === String(tv || '').toLowerCase();
  };

  const getExtraFields = (row) =>
    allFields.filter(f => {
      if (!f.repeater_entity || f.repeater_entity.toUpperCase() !== 'PROPERTY') return false;
      if (BASE_PROP_KEYS.has(f.field_key)) return false;
      if (TYPE_COL_KEYS.has(f.field_key)) return false;
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
              if (field.field_type === 'SELECT') {
                const opts = (() => { try { return typeof field.options === 'string' ? JSON.parse(field.options) : (field.options || []); } catch { return []; } })();
                return (
                  <div key={field.field_key} className={wrapCls}>
                    {labelEl}
                    <select value={fieldVal} onChange={e => handlePropertyRowChange(idx, field.field_key, e.target.value)} disabled={readOnly} className={cls}>
                      <option value="">---{lang === 'hi' ? 'चुनें' : 'Select'}---</option>
                      {opts.map(o => <option key={o.value ?? o} value={o.value ?? o}>{lang === 'hi' ? (o.label_hi || o.label_en || o) : (o.label_en || o.value || o)}</option>)}
                    </select>
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
    const list = [...propertyList];
    list.push({
      property_major_category: '',
      property_minor_category: '',
      property_details: '',
      property_value_inr: '',
      property_stolen_recovered: 'Stolen'
    });
    setRepeaterState(prev => ({ ...prev, property_details: list }));
  };

  const clearAllProperties = () => {
    setRepeaterState(prev => ({ ...prev, property_details: [] }));
  };

  const deletePropertyRow = (idx) => {
    const list = propertyList.filter((_, i) => i !== idx);
    setRepeaterState(prev => ({ ...prev, property_details: list }));
  };

  const handlePropertyRowChange = (idx, key, val) => {
    const list = [...propertyList];
    if (!list[idx]) return;
    const updatedRow = { ...list[idx], [key]: val };
    if (key === 'property_major_category') {
      // Clear minor category and any category-specific extra detail fields
      const KEEP = new Set(['property_major_category', 'property_minor_category', 'property_details', 'property_stolen_recovered', 'property_value_inr']);
      Object.keys(updatedRow).forEach(k => { if (!KEEP.has(k)) delete updatedRow[k]; });
      updatedRow.property_minor_category = '';
    }
    list[idx] = updatedRow;
    setRepeaterState(prev => ({ ...prev, property_details: list }));
  };

  const renderTypeCell = (row, idx) => {
    const opts = getMinorCategoryOptions(row.property_major_category);
    const isDisabled = !row.property_major_category || readOnly;

    if (opts.length > 0) {
      return (
        <select
          value={row.property_minor_category || ''}
          onChange={(e) => handlePropertyRowChange(idx, 'property_minor_category', e.target.value)}
          disabled={isDisabled}
          className="w-full px-2 py-1 text-xs border border-[#c7d8ea] rounded bg-white focus:outline-none focus:border-[#0d2a4a] disabled:bg-slate-50 disabled:text-slate-400 font-semibold"
        >
          <option value="">{lang === 'hi' ? '---चुनें---' : '---Select---'}</option>
          {opts.map(o => (
            <option key={o.value} value={o.value}>
              {lang === 'hi' ? (o.label_hi || o.label_en) : o.label_en}
            </option>
          ))}
        </select>
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
                      <select
                        value={row.property_major_category || ''}
                        onChange={(e) => handlePropertyRowChange(idx, 'property_major_category', e.target.value)}
                        disabled={readOnly}
                        className="w-full px-2 py-1 text-xs border border-[#c7d8ea] rounded bg-white focus:outline-none focus:border-[#0d2a4a] disabled:bg-slate-50 disabled:text-slate-400 font-semibold"
                      >
                        <option value="">{lang === 'hi' ? '---चुनें---' : '---Select---'}</option>
                        {majorCategoryOptions.map(o => (
                          <option key={o.value} value={o.value}>
                            {lang === 'hi' ? (o.label_hi || o.label_en) : o.label_en}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Type of Property */}
                    <td className="px-3 py-2 min-w-[180px]">
                      {renderTypeCell(row, idx)}
                    </td>

                    {/* Status (Stolen / Recovered / Involved / Seized) */}
                    <td className="px-3 py-2 w-32">
                      <select
                        value={row.property_stolen_recovered || 'Stolen'}
                        onChange={(e) => handlePropertyRowChange(idx, 'property_stolen_recovered', e.target.value)}
                        disabled={readOnly}
                        className="w-full px-2 py-1 text-xs border border-[#c7d8ea] rounded bg-white focus:outline-none focus:border-[#0d2a4a] disabled:bg-slate-50 disabled:text-slate-400 font-semibold"
                      >
                        {[
                          { value: 'Stolen',    en: 'Stolen',    hi: 'चोरी हुई' },
                          { value: 'Recovered', en: 'Recovered', hi: 'बरामद' },
                          { value: 'Involved',  en: 'Involved',  hi: 'शामिल' },
                          { value: 'Seized',    en: 'Seized',    hi: 'जब्त' },
                        ].map(o => (
                          <option key={o.value} value={o.value}>{lang === 'hi' ? o.hi : o.en}</option>
                        ))}
                      </select>
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

const renderArrestedStep = () => {
  const arrestedList = repeaterState?.arrested_info || [];
  const allFields = schema ? schema.reduce((acc, sec) => [...acc, ...(sec.fields || [])], []) : [];

  const renderArrestedModalField = (key, customLabel = null, isLast = false, forceReadOnly = false) => {
    const field = allFields.find(f => f.field_key === key);
    if (!field) return null;

    if (field.show_when) {
      try {
        const cond = typeof field.show_when === 'string' ? JSON.parse(field.show_when) : field.show_when;
        if (cond && cond.field) {
          const val = arrestedTempValues[cond.field];
          const checkVals = Array.isArray(cond.value) ? cond.value : [cond.value];
          const isShown = checkVals.some(v => String(v || '').toLowerCase() === String(val || '').toLowerCase());
          if (!isShown) return null;
        }
      } catch (e) {
        // ignore
      }
    }

    const label = customLabel || (lang === 'hi' ? (field.label_hi || field.label_en) : field.label_en);
    const rules = parseRules(field.validation_rules);
    const isRequired = !!rules.required || key === 'arrested_first_name' || key === 'arrested_gender';
    const isDisabled = forceReadOnly || readOnly || field.readonly === true || field.readonly === 'true';

    return (
      <React.Fragment key={key}>
        <div className={`bg-[#dfeaf5] px-2 py-2 text-[12px] font-medium flex items-center gap-1 ${!isLast ? 'border-b border-[#c7d8ea]' : ''}`}>
          <span>{label}</span>
          {isRequired && <span className="text-red-500 font-bold">*</span>}
        </div>
        <div className={`px-2 py-1 ${!isLast ? 'border-b border-[#c7d8ea]' : ''}`}>
          <FieldRenderer
            field={field}
            value={arrestedTempValues[key]}
            onChange={handleArrestedModalChange}
            readOnly={isDisabled}
            hasError={arrestedModalTouched[key] && !!arrestedModalErrors[key]}
            lang={lang}
            values={arrestedTempValues}
          />
          {arrestedModalTouched[key] && arrestedModalErrors[key] && (
            <p className="text-red-500 text-[10px] mt-0.5">{arrestedModalErrors[key]}</p>
          )}
        </div>
      </React.Fragment>
    );
  };

  const renderArrestedDetailsSubTab = () => {
    return (
      <fieldset className="bg-white">
        <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
          {lang === 'hi' ? 'गिरफ्तारी का विवरण' : 'Arrest Details'}
        </legend>
        <div className="grid grid-cols-[220px_1fr] border border-[#7a9cc5] rounded overflow-hidden mt-2">
          {renderArrestedModalField('arrest_date')}
          {renderArrestedModalField('arrest_place', null, true)}
        </div>
      </fieldset>
    );
  };

  const renderArrestedPersonalInfoSubTab = () => {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          {/* Left Column - Personal Info */}
          <div className="space-y-3">
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea]">
              {renderArrestedModalField('arrested_npr', lang === 'hi' ? 'यूआईडी (UID)' : 'UID')}
              {renderArrestedModalField('arrested_first_name')}
              {renderArrestedModalField('arrested_middle_name')}
              {renderArrestedModalField('arrested_last_name')}
              {renderArrestedModalField('nick_name', null, true)}
            </div>
          </div>

          {/* Right Column - Gender, Marital Status, Mobile */}
          <div className="border border-[#7a9cc5] rounded px-2 py-2 self-start">
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea]">
              {renderArrestedModalField('arrested_gender')}
              {renderArrestedModalField('arrested_marital_status')}

              {/* Mobile with country code */}
              <React.Fragment>
                <div className="bg-[#dfeaf5] px-2 py-2 border-b text-[12px] font-medium flex items-center gap-1">
                  <span>{lang === 'hi' ? 'मोबाइल नंबर' : 'Mobile No.'}</span>
                </div>
                <div className="px-2 py-1 border-b flex gap-1.5 items-center">
                  <div className="w-14">
                    <FieldRenderer
                      field={allFields.find(f => f.field_key === 'arrested_mobile_country_code')}
                      value={arrestedTempValues.arrested_mobile_country_code || '+91'}
                      onChange={handleArrestedModalChange}
                      readOnly={readOnly}
                      lang={lang}
                      values={arrestedTempValues}
                    />
                  </div>
                  <div className="flex-1">
                    <FieldRenderer
                      field={allFields.find(f => f.field_key === 'arrested_mobile')}
                      value={arrestedTempValues.arrested_mobile}
                      onChange={handleArrestedModalChange}
                      readOnly={readOnly}
                      lang={lang}
                      values={arrestedTempValues}
                    />
                  </div>
                </div>
              </React.Fragment>
              {renderArrestedModalField('arrested_qualification')}
              {renderArrestedModalField('scheme_of_arrest')}
              {renderArrestedModalField('arrested_landline')}
              {renderArrestedModalField('arrested_email', null, true)}
            </div>
          </div>
        </div>

        {/* Bottom fields: relation + age panel */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="border border-[#7a9cc5] rounded px-2 py-2 self-start">
            <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
              {lang === 'hi' ? 'रिश्तेदार का विवरण' : 'Relative Details'}
            </legend>
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] mt-2">
              {renderArrestedModalField('arrested_relation_type')}
              {renderArrestedModalField('arrested_relative_name', null, true)}
            </div>
          </div>

          <fieldset className="border border-[#7a9cc5] rounded px-2 py-2">
            <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
              {lang === 'hi' ? 'आयु विवरण' : 'Age Panel'}
            </legend>
            <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] mt-2">
              {renderArrestedModalField('arrested_dob')}
              {renderArrestedModalField('arrested_age_year')}
              {renderArrestedModalField('arrested_age_month')}
              {renderArrestedModalField('arrested_birth_year', null, true, true)}
            </div>
          </fieldset>
        </div>
      </div>
    );
  };

  const renderArrestedParticularDetailsSubTab = () => {
    return (
      <fieldset className="bg-white">
        <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
          {lang === 'hi' ? 'विवरण' : 'Particular Details'}
        </legend>
        <div className="grid grid-cols-[220px_1fr] border border-[#7a9cc5] rounded overflow-hidden mt-2">
          {renderArrestedModalField('prev_involvement')}
          {renderArrestedModalField('proclaimed_offender')}
          {renderArrestedModalField('nafis_prepared')}
          {renderArrestedModalField('dossier_prepared')}
          {renderArrestedModalField('arresting_officer')}
          {renderArrestedModalField('arresting_officer_mobile')}
          {renderArrestedModalField('listed_criminal', null, true)}
        </div>
      </fieldset>
    );
  };

  const renderArrestedCustodyStatusSubTab = () => {
    return (
      <fieldset className="bg-white">
        <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
          {lang === 'hi' ? 'हिरासत की स्थिति' : 'Custody Status'}
        </legend>
        <div className="grid grid-cols-[220px_1fr] border border-[#7a9cc5] rounded overflow-hidden mt-2">
          {renderArrestedModalField('status')}
          {renderArrestedModalField('other_status_reason')}
          {renderArrestedModalField('recovery', null, true)}
        </div>
      </fieldset>
    );
  };

  const renderArrestedAddressSubTab = () => {
    return (
      <div className="grid grid-cols-2 gap-4">
        {/* Present address */}
        <fieldset className="border border-[#7a9cc5] rounded px-2 py-2">
          <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
            {lang === 'hi' ? 'वर्तमान पता' : 'Present Address'}
          </legend>
          <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] mt-2">
            {renderArrestedModalField('arrested_present_address')}
            {renderArrestedModalField('arrested_house_no')}
            {renderArrestedModalField('arrested_street')}
            {renderArrestedModalField('arrested_colony')}
            {renderArrestedModalField('arrested_city_town_village')}
            {renderArrestedModalField('arrested_tehsil_block_mandal')}
            {renderArrestedModalField('arrested_country')}
            {renderArrestedModalField('arrested_state')}
            {renderArrestedModalField('arrested_district')}
            {renderArrestedModalField('arrested_police_station')}
            {renderArrestedModalField('arrested_pincode', null, true)}
          </div>
        </fieldset>

        {/* Permanent address */}
        <fieldset className="border border-[#7a9cc5] rounded px-2 py-2">
          <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs flex items-center gap-2">
            <span>{lang === 'hi' ? 'स्थायी पता' : 'Permanent Address'}</span>
            <div className="flex items-center gap-1 text-[10px] normal-case font-normal text-slate-600 bg-slate-100 border border-slate-300 px-1.5 py-0.5 rounded cursor-pointer">
              <input
                type="checkbox"
                id="arrested_perm_same"
                disabled={readOnly}
                checked={arrestedTempValues.arrested_perm_same === true || arrestedTempValues.arrested_perm_same === 'Yes'}
                onChange={(e) => handleArrestedModalChange('arrested_perm_same', e.target.checked)}
                className="cursor-pointer"
              />
              <label htmlFor="arrested_perm_same" className="cursor-pointer">
                {lang === 'hi' ? 'वर्तमान पते के समान' : 'Same as Present'}
              </label>
            </div>
          </legend>
          <div className="grid grid-cols-[220px_1fr] border border-[#c7d8ea] mt-2">
            {renderArrestedModalField('arrested_perm_address')}
            {renderArrestedModalField('arrested_perm_house_no')}
            {renderArrestedModalField('arrested_perm_street')}
            {renderArrestedModalField('arrested_perm_colony')}
            {renderArrestedModalField('arrested_perm_city_town_village')}
            {renderArrestedModalField('arrested_perm_tehsil_block_mandal')}
            {renderArrestedModalField('arrested_perm_country')}
            {renderArrestedModalField('arrested_perm_state')}
            {renderArrestedModalField('arrested_perm_district')}
            {renderArrestedModalField('arrested_perm_police_station')}
            {renderArrestedModalField('arrested_perm_pincode', null, true)}
          </div>
        </fieldset>
      </div>
    );
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
                    <button
                      type="button"
                      onClick={() => openArrestedEditModal(idx)}
                      className="text-[#0d2a4a] hover:text-[#ea580c] font-semibold mr-3 cursor-pointer underline transition-colors"
                    >
                      {lang === 'hi' ? 'संपादन' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteArrestedEntry(idx)}
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

      {/* Modal Dialog */}
      {isArrestedModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-[1050px] h-[85vh] max-h-[750px] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between bg-[#0d2a4a] text-white px-5 py-3">
              <h2 className="text-sm font-bold uppercase tracking-wide">
                {activeArrestedIndex !== null
                  ? (lang === 'hi' ? 'गिरफ्तार व्यक्ति की जानकारी संपादित करें' : 'Edit Arrested Person Information')
                  : (lang === 'hi' ? 'गिरफ्तार व्यक्ति की जानकारी' : 'Arrested Person Information')}
              </h2>
              <button
                type="button"
                onClick={() => setIsArrestedModalOpen(false)}
                className="text-white/80 hover:text-white text-2xl leading-none font-bold cursor-pointer transition-colors"
                title="Close"
              >
                ×
              </button>
            </div>

            {/* Sub-tabs selectors */}
            <div className="flex gap-2 border-b border-[#7a9cc5] pb-0 bg-slate-100/50 p-1">
              {[
                { id: 'arrest_details', label_en: 'Arrest Details', label_hi: 'गिरफ्तारी का विवरण' },
                { id: 'person_particulars', label_en: 'Person Particulars', label_hi: 'व्यक्तिगत जानकारी' },
                { id: 'particular_details', label_en: 'Particular Details', label_hi: 'विवरण' },
                { id: 'custody_status', label_en: 'Custody Status', label_hi: 'हिरासत की स्थिति' },
                { id: 'address', label_en: 'Address', label_hi: 'पता' }
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setArrestedSubTab(t.id)}
                  className={`px-4 py-1.5 text-xs font-bold border border-b-0 border-[#7a9cc5] rounded-t cursor-pointer transition-colors ${
                    arrestedSubTab === t.id
                      ? 'bg-[#ea580c] text-white'
                      : 'bg-[#0d2a4a] text-white hover:bg-[#16406d]'
                  }`}
                >
                  {lang === 'hi' ? t.label_hi : t.label_en}
                </button>
              ))}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 border border-t-0 border-[#7a9cc5] bg-white">
              {arrestedSubTab === 'arrest_details' && renderArrestedDetailsSubTab()}
              {arrestedSubTab === 'person_particulars' && renderArrestedPersonalInfoSubTab()}
              {arrestedSubTab === 'particular_details' && renderArrestedParticularDetailsSubTab()}
              {arrestedSubTab === 'custody_status' && renderArrestedCustodyStatusSubTab()}
              {arrestedSubTab === 'address' && renderArrestedAddressSubTab()}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-5 py-3 border-t border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={saveArrestedEntry}
                className="px-6 py-2 bg-[#0d2a4a] text-white text-xs font-bold rounded hover:bg-[#16406d] cursor-pointer transition-colors"
              >
                {lang === 'hi' ? 'सहेजें' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setIsArrestedModalOpen(false)}
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

const renderIntimationStep = () => {
  const intimationList = repeaterState?.intimation_details || [];
  const allFields = schema ? schema.reduce((acc, sec) => [...acc, ...(sec.fields || [])], []) : [];

  const renderIntimationModalField = (key, customLabel = null, isLast = false) => {
    const field = allFields.find(f => f.field_key === key);
    if (!field) return null;
    const label = customLabel || (lang === 'hi' ? (field.label_hi || field.label_en) : field.label_en);
    const rules = parseRules(field.validation_rules);
    const isRequired = !!rules.required || key === 'intimated_relative_name';
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
            value={intimationTempValues[key]}
            onChange={handleIntimationModalChange}
            readOnly={isDisabled}
            hasError={intimationModalTouched[key] && !!intimationModalErrors[key]}
            lang={lang}
            values={intimationTempValues}
          />
          {intimationModalTouched[key] && intimationModalErrors[key] && (
            <p className="text-red-500 text-[10px] mt-0.5">{intimationModalErrors[key]}</p>
          )}
        </div>
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header bar with Add Button */}
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-bold text-[#0d2a4a] uppercase tracking-wide">
          {lang === 'hi' ? `सूचना प्राप्तकर्ताओं की सूची (${intimationList.length})` : `Intimation Details List (${intimationList.length})`}
        </h3>
        <button
          type="button"
          onClick={openIntimationAddModal}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-[#0d2a4a] text-white text-xs font-bold rounded hover:bg-[#16406d] transition-colors cursor-pointer"
        >
          <span className="text-base leading-none">+</span>
          {lang === 'hi' ? 'सूचना विवरण जोड़ें' : 'Add Intimation Details'}
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
            {intimationList.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-400 italic">
                  {lang === 'hi' ? 'कोई सूचना विवरण नहीं जोड़ा गया। "+ सूचना विवरण जोड़ें" पर क्लिक करें।' : 'No intimation details added yet. Click "+ Add Intimation Details" to add.'}
                </td>
              </tr>
            ) : (
              intimationList.map((item, idx) => (
                <tr key={idx} className={`border-t border-[#c7d8ea] ${idx % 2 === 0 ? 'bg-white' : 'bg-[#f0f5fa]'}`}>
                  <td className="px-3 py-2 font-medium">{idx + 1}</td>
                  <td className="px-3 py-2">{getIntimationName(item)}</td>
                  <td className="px-3 py-2 text-slate-600">{getIntimationAddress(item)}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      type="button"
                      onClick={() => openIntimationEditModal(idx)}
                      className="text-[#0d2a4a] hover:text-[#ea580c] font-semibold mr-3 cursor-pointer underline transition-colors"
                    >
                      {lang === 'hi' ? 'संपादन' : 'Edit'}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteIntimationEntry(idx)}
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

      {/* Modal Dialog */}
      {isIntimationModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-lg shadow-2xl border border-slate-200 w-full max-w-[1050px] h-[85vh] max-h-[750px] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between bg-[#0d2a4a] text-white px-5 py-3">
              <h2 className="text-sm font-bold uppercase tracking-wide">
                {activeIntimationIndex !== null
                  ? (lang === 'hi' ? 'सूचना विवरण संपादित करें' : 'Edit Intimation Details')
                  : (lang === 'hi' ? 'सूचना विवरण' : 'Intimation Details')}
              </h2>
              <button
                type="button"
                onClick={() => setIsIntimationModalOpen(false)}
                className="text-white/80 hover:text-white text-2xl leading-none font-bold cursor-pointer transition-colors"
                title="Close"
              >
                ×
              </button>
            </div>

            {/* Sub-tabs selectors */}
            <div className="flex gap-2 border-b border-[#7a9cc5] pb-0 bg-slate-100/50 p-1">
              {[
                { id: 'personal', label_en: 'Personal Information', label_hi: 'व्यक्तिगत जानकारी' },
                { id: 'address', label_en: 'Address', label_hi: 'पता' }
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setIntimationSubTab(t.id)}
                  className={`px-4 py-1.5 text-xs font-bold border border-b-0 border-[#7a9cc5] rounded-t cursor-pointer transition-colors ${
                    intimationSubTab === t.id
                      ? 'bg-[#ea580c] text-white'
                      : 'bg-[#0d2a4a] text-white hover:bg-[#16406d]'
                  }`}
                >
                  {lang === 'hi' ? t.label_hi : t.label_en}
                </button>
              ))}
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {intimationSubTab === 'personal' ? (
                <fieldset className="bg-white">
                  <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
                    {lang === 'hi' ? 'सूचना विवरण' : 'Intimation Details'}
                  </legend>
                  <div className="grid grid-cols-[220px_1fr] border border-[#7a9cc5] rounded overflow-hidden mt-2">
                    {renderIntimationModalField('intimation_date_time')}
                    {renderIntimationModalField('intimated_relative_name')}
                    {renderIntimationModalField('intimated_relative_relation')}
                    {renderIntimationModalField('intimation_mode', null, true)}
                  </div>
                </fieldset>
              ) : (
                <fieldset className="bg-white">
                  <legend className="px-2 text-[#0d2a4a] font-bold uppercase text-xs">
                    {lang === 'hi' ? 'पता' : 'Address'}
                  </legend>
                  <div className="grid grid-cols-[220px_1fr] border border-[#7a9cc5] rounded overflow-hidden mt-2">
                    {renderIntimationModalField('intimation_house_no')}
                    {renderIntimationModalField('intimation_street')}
                    {renderIntimationModalField('intimation_colony')}
                    {renderIntimationModalField('intimation_city_town_village')}
                    {renderIntimationModalField('intimation_tehsil_block_mandal')}
                    {renderIntimationModalField('intimation_country')}
                    {renderIntimationModalField('intimation_state')}
                    {renderIntimationModalField('intimation_district')}
                    {renderIntimationModalField('intimation_police_station')}
                    {renderIntimationModalField('intimation_pincode', null, true)}
                  </div>
                </fieldset>
              )}
            </div>

            {/* Footer */}
            <div className="bg-slate-100 border-t border-slate-200 px-5 py-3 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsIntimationModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded cursor-pointer transition-colors"
              >
                {lang === 'hi' ? 'रद्द करें' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={saveIntimationEntry}
                className="px-4 py-2 bg-[#ea580c] hover:bg-[#c2410c] text-white text-xs font-bold rounded cursor-pointer transition-colors shadow-sm"
              >
                {lang === 'hi' ? 'सहेजें' : 'Save'}
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
  const allFields = schema ? schema.reduce((acc, sec) => [...acc, ...(sec.fields || [])], []) : [];
  const actionTakenKeys = [
    'io_name', 'io_rank', 'io_pis', 'io_mobile',
    'status', 'rc_no', 'disposal_type', 'transfer_to',
    'remarks', 'cctns_flag', 'zero_fir_flag',
  ];

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


  const activeFields = actionTakenKeys
    .map(key => allFields.find(f => f.field_key === key))
    .filter(Boolean)
    .filter(f => evalActionCond(f.show_when, values));

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

    if (recordType === 'CASE') {
      const allFields = schema.reduce((acc, sec) => [...acc, ...(sec.fields || [])], []);
      const tabSpecs = [
        { title_en: 'Acts & Sections', title_hi: 'अधिनियम और धाराएं', keys: ['uid', 'district', 'police_station', 'submission_status', 'case_type', 'fir_no', 'fir_date', 'gd_no', 'gd_date', 'gd_time', 'beat_no', 'act_name', 'sections'] },
        { title_en: 'Occurrence',      title_hi: 'घटना', keys: ['occurrence_time_type', 'occurrence_from_date_time', 'occurrence_to_date_time', 'info_received_at_ps_date_time', 'occurrence_house_no', 'occurrence_street', 'occurrence_colony', 'occurrence_city_town_village', 'occurrence_tehsil_block_mandal', 'occurrence_pincode', 'occurrence_state', 'occurrence_district', 'occurrence_police_station', 'forest_place'] },
        { title_en: 'Complainant',     title_hi: 'शिकायतकर्ता', keys: [
          'complainant_npr', 'complainant_first_name', 'complainant_middle_name', 'complainant_last_name',
          'complainant_gender', 'complainant_marital_status', 'complainant_mobile_country_code', 'complainant_mobile',
          'complainant_email', 'complainant_same_as_victim', 'complainant_relation_type', 'complainant_relative_name',
          'complainant_dob', 'complainant_age_year', 'complainant_age_month', 'complainant_birth_year',
          'complainant_house_no', 'complainant_street', 'complainant_colony', 'complainant_city_town_village',
          'complainant_tehsil_block_mandal', 'complainant_country', 'complainant_state', 'complainant_district',
          'complainant_police_station', 'complainant_pincode',
          'complainant_perm_same', 'complainant_perm_house_no', 'complainant_perm_street', 'complainant_perm_colony',
          'complainant_perm_city_town_village', 'complainant_perm_tehsil_block_mandal', 'complainant_perm_country',
          'complainant_perm_state', 'complainant_perm_district', 'complainant_perm_police_station', 'complainant_perm_pincode'
        ] },
        { title_en: 'FIR Contents',    title_hi: 'प्राथमिकी विवरण', keys: ['brief_facts'] },
        { title_en: 'Victim Information', title_hi: 'पीड़ित का विवरण', keys: [
          'victim_npr', 'victim_first_name', 'victim_middle_name', 'victim_last_name', 'victim_nickname',
          'victim_gender', 'victim_marital_status', 'victim_mobile_country_code', 'victim_mobile',
          'victim_email', 'victim_relation_type', 'victim_relative_name',
          'victim_dob', 'victim_age_year', 'victim_age_month', 'victim_birth_year',
          'victim_house_no', 'victim_street', 'victim_colony', 'victim_city_town_village',
          'victim_tehsil_block_mandal', 'victim_country', 'victim_state', 'victim_district',
          'victim_police_station', 'victim_pincode', 'victim_present_address',
          'victim_perm_same', 'victim_perm_house_no', 'victim_perm_street', 'victim_perm_colony',
          'victim_perm_city_town_village', 'victim_perm_tehsil_block_mandal', 'victim_perm_country',
          'victim_perm_state', 'victim_perm_district', 'victim_perm_police_station', 'victim_perm_pincode'
        ] },
        { title_en: 'Accused',          title_hi: 'आरोपी', keys: [
          'accused_npr', 'accused_first_name', 'accused_middle_name', 'accused_last_name', 'accused_nickname',
          'accused_gender', 'accused_marital_status', 'accused_mobile_country_code', 'accused_mobile',
          'accused_email', 'accused_relation_type', 'accused_relative_name',
          'accused_dob', 'accused_age_year', 'accused_age_month', 'accused_birth_year',
          'accused_house_no', 'accused_street', 'accused_colony', 'accused_city_town_village',
          'accused_tehsil_block_mandal', 'accused_country', 'accused_state', 'accused_district',
          'accused_police_station', 'accused_pincode', 'accused_present_address',
          'accused_perm_same', 'accused_perm_house_no', 'accused_perm_street', 'accused_perm_colony',
          'accused_perm_city_town_village', 'accused_perm_tehsil_block_mandal', 'accused_perm_country',
          'accused_perm_state', 'accused_perm_district', 'accused_perm_police_station', 'accused_perm_pincode'
        ] },
        { title_en: 'Property of Interest', title_hi: 'संबद्ध संपत्ति', keys: [
          'property_major_category', 'property_minor_category', 'property_details', 'property_stolen_recovered'
        ], is_repeater: true, entity_type: 'property', section: 'property_details' },
        { title_en: 'Action Taken',    title_hi: 'की गई कार्रवाई', keys: ['io_name', 'io_rank', 'io_pis', 'io_mobile', 'status', 'rc_no', 'disposal_type', 'transfer_to', 'remarks', 'cctns_flag', 'zero_fir_flag'] },
      ];

      return tabSpecs.map(spec => {
        const fields = spec.keys
          .map(k => allFields.find(f => f.field_key === k))
          .filter(Boolean);
        return {
          title_en: spec.title_en,
          title_hi: spec.title_hi,
          fields: fields,
          is_repeater: spec.is_repeater,
          entity_type: spec.entity_type,
          section: spec.section
        };
      });
    }

    if (recordType === 'ARREST') {
      const allFields = schema.reduce((acc, sec) => [...acc, ...(sec.fields || [])], []);
      const statusField = allFields.find(f => f.field_key === 'status');
      if (statusField) {
        const effectiveCaseType = caseType || 'kalandra';
        if (effectiveCaseType === 'against_fir') {
          statusField.options = JSON.stringify([
            { value: 'JC', label_en: 'JC', label_hi: 'जेसी' },
            { value: 'PC', label_en: 'PC', label_hi: 'पीसी' },
            { value: 'Bail', label_en: 'Bail', label_hi: 'जमानत पर रिहा' },
            { value: 'Bound Down', label_en: 'Bound Down', label_hi: 'Bound Down' },
            { value: 'Released', label_en: 'Released', label_hi: 'रिहा' },
            { value: 'Lockup', label_en: 'Lockup', label_hi: 'जेल' },
            { value: '35(3) BNS Notice', label_en: '35(3) BNS Notice', label_hi: '35(3) BNS Notice' },
            { value: 'others', label_en: 'Others', label_hi: 'अन्य' }
          ]);
        } else {
          statusField.options = JSON.stringify([
            { value: 'JC', label_en: 'JC', label_hi: 'जेसी' },
            { value: 'Bound Down', label_en: 'Bound Down', label_hi: 'Bound Down' },
            { value: 'Lockup', label_en: 'Lockup', label_hi: 'जेल' },
            { value: 'Fine', label_en: 'Fine', label_hi: 'Fine' },
            { value: 'others', label_en: 'Others', label_hi: 'अन्य' }
          ]);
        }
        statusField.label_en = 'Status';
        statusField.label_hi = 'बंदी की स्थिति';
      }

      if (!allFields.find(f => f.field_key === 'recovery')) {
        allFields.push({
          field_key: 'recovery',
          field_type: 'TEXTAREA',
          label_en: 'Recovered Material Items',
          label_hi: 'बरामद की गई सामग्री',
          visible_to_levels: ['L1', 'L2', 'L3'],
          editable_by_levels: ['L1', 'L2', 'L3'],
          section: 'custody_status',
          validation_rules: JSON.stringify({ required: false })
        });
      }

      if (!allFields.find(f => f.field_key === 'scheme_of_arrest')) {
        allFields.push({
          field_key: 'scheme_of_arrest',
          field_type: 'SELECT',
          label_en: 'Scheme of Arrest',
          label_hi: 'गिरफ्तारी की योजना',
          visible_to_levels: ['L1', 'L2', 'L3'],
          editable_by_levels: ['L1', 'L2', 'L3'],
          section: 'arrested_info',
          validation_rules: JSON.stringify({ required: false }),
          options: JSON.stringify([
            { value: 'Integrated Pride', label_en: 'Integrated Pride', label_hi: 'Integrated Pride' },
            { value: 'Group Patrolling', label_en: 'Group Patrolling', label_hi: 'Group Patrolling' },
            { value: 'Anti-snatching', label_en: 'Anti-snatching', label_hi: 'Anti-snatching' },
            { value: 'By Prahari', label_en: 'By Prahari', label_hi: 'By Prahari' },
            { value: 'By Eyes & Ears Scheme Members', label_en: 'By Eyes & Ears Scheme Members', label_hi: 'By Eyes & Ears Scheme Members' }
          ])
        });
      }

      const effectiveCaseType = caseType || 'kalandra'; // null = edit mode, treat as kalandra
      const tabSpecs = [];
      if (effectiveCaseType === 'against_fir') {
        tabSpecs.push({
          title_en: 'Select FIR',
          title_hi: 'प्राथमिकी (FIR) चुनें',
          keys: ['selected_fir'],
          is_virtual: true
        });
      }
      tabSpecs.push(
        {
          title_en: 'General Information',
          title_hi: 'सामान्य जानकारी',
          keys: [
            'uid', 'district', 'police_station', 'submission_status', 'case_type',
            'gd_no', 'gd_date', 'gd_time', 'act_name', 'sections', 'crime_head', 'linked_fir_dd_no'
          ]
        },
        {
          title_en: 'Arrested',
          title_hi: 'गिरफ्तार व्यक्ति',
          keys: [
            'arrest_date', 'arrest_place',
            'nick_name', 'arrested_mobile_country_code', 'arrested_npr', 'arrested_first_name', 'arrested_middle_name', 'arrested_last_name',
            'arrested_gender', 'arrested_marital_status', 'arrested_relation_type', 'arrested_relative_name', 'arrested_mobile',
            'scheme_of_arrest',
            'arrested_dob', 'arrested_age_year', 'arrested_age_month', 'arrested_birth_year',
            'prev_involvement', 'proclaimed_offender',
            'nafis_prepared', 'dossier_prepared', 'arresting_officer_mobile', 'arresting_officer', 'listed_criminal',
            'status', 'other_status_reason', 'recovery',
            'arrested_present_address', 'arrested_perm_same', 'arrested_house_no', 'arrested_street', 'arrested_colony', 'arrested_city_town_village',
            'arrested_tehsil_block_mandal', 'arrested_country', 'arrested_state', 'arrested_district', 'arrested_police_station', 'arrested_pincode',
            'arrested_perm_address', 'arrested_perm_country', 'arrested_perm_state', 'arrested_perm_district',
            'arrested_perm_house_no', 'arrested_perm_street', 'arrested_perm_colony', 'arrested_perm_city_town_village', 'arrested_perm_tehsil_block_mandal', 'arrested_perm_police_station', 'arrested_perm_pincode'
          ],
          is_repeater: true,
          entity_type: 'person',
          person_type: 'ARRESTED',
          section: 'arrested_info'
        },

        {
          title_en: 'Particulars',
          title_hi: 'विवरण',
          keys: allFields.filter(f => f.section === 'property_details').map(f => f.field_key),
          is_repeater: true,
          entity_type: 'property',
          section: 'property_details'
        },
        // {
        //   title_en: 'Intimation Details',
        //   title_hi: 'सूचना का विवरण',
        //   keys: [
        //     'intimation_date_time', 'intimated_relative_name', 'intimated_relative_relation', 'intimation_mode',
        //     'intimation_house_no', 'intimation_street', 'intimation_colony', 'intimation_city_town_village', 'intimation_tehsil_block_mandal',
        //     'intimation_country', 'intimation_state', 'intimation_district', 'intimation_police_station', 'intimation_pincode'
        //   ],
        //   is_repeater: true,
        //   entity_type: 'person',
        //   person_type: 'INTIMATED',
        //   section: 'intimation_details'
        // },

        {
          title_en: 'Investigating Officer',
          title_hi: 'जांच अधिकारी',
          keys: ['io_name', 'io_rank', 'io_pis', 'io_mobile']
        }
      );

      return tabSpecs.map(spec => {
        if (spec.is_virtual) {
          return {
            title_en: spec.title_en,
            title_hi: spec.title_hi,
            fields: [
              {
                field_key: 'selected_fir',
                field_type: 'SELECT',
                label_en: 'Select FIR Number',
                label_hi: 'प्राथमिकी (FIR) संख्या चुनें',
                validation_rules: JSON.stringify({ required: true }),
                options: finalFirOptions
              }
            ]
          };
        }

        const fields = spec.keys
          .map(k => {
            if (k === 'uid' || k === 'district' || k === 'police_station' || k === 'submission_status' || k === 'case_type') {
              return allFields.find(f => f.field_key === k) || {
                field_key: k,
                field_type: 'TEXT',
                label_en: k.replace('_', ' ').toUpperCase(),
                label_hi: k,
                readonly: true
              };
            }
            return allFields.find(f => f.field_key === k);
          })
          .filter(Boolean);

        return {
          title_en: spec.title_en,
          title_hi: spec.title_hi,
          fields: fields,
          is_repeater: spec.is_repeater,
          entity_type: spec.entity_type,
          person_type: spec.person_type,
          section: spec.section
        };
      });
    }
    if (recordType === 'UIDB') {
      const allFields = schema.reduce((acc, sec) => [...acc, ...(sec.fields || [])], []);
      const tabSpecs = [
        {
          title_en: 'General Information',
          title_hi: 'सामान्य जानकारी',
          keys: [
            'uid', 'district', 'police_station', 'submission_status', 'case_type',
            'gd_no', 'gd_date', 'gd_time', 'act_name', 'sections', 'crime_head', 'status'
          ]
        },
        {
          title_en: 'UIDB Details',
          title_hi: 'यूआईडीबी विवरण',
          keys: allFields.filter(f => f.section === 'corpse_desc').map(f => f.field_key)
        },
        {
          title_en: 'Inquest Details',
          title_hi: 'पूछताछ विवरण',
          keys: allFields.filter(f => f.section === 'inquest_details').map(f => f.field_key)
        },
        {
          title_en: 'Investigating Officer',
          title_hi: 'जांच अधिकारी',
          keys: allFields.filter(f => f.section === 'investigation_officer').map(f => f.field_key)
        }
      ];

      return tabSpecs.map(spec => {
        const fields = spec.keys
          .map(k => {
            if (k === 'uid' || k === 'district' || k === 'police_station' || k === 'submission_status' || k === 'case_type') {
              return allFields.find(f => f.field_key === k) || {
                field_key: k,
                field_type: 'TEXT',
                label_en: k.replace('_', ' ').toUpperCase(),
                label_hi: k,
                readonly: true
              };
            }
            return allFields.find(f => f.field_key === k);
          })
          .filter(Boolean);

        return {
          title_en: spec.title_en,
          title_hi: spec.title_hi,
          fields: fields,
          is_repeater: spec.is_repeater,
          entity_type: spec.entity_type,
          section: spec.section
        };
      });
    }
    return schema;
  },
  [schema, recordType, caseType, finalFirOptions]);
  const { triggerAutosave, saveImmediately, saveStatus, savedRecord } = useAutosave(
    recordType,
    initialValues?.id
  );

  const [values,       setValues      ] = useState({});
  const [errors,       setErrors      ] = useState({});
  const [touched,      setTouched     ] = useState({});
  const [currentStep,  setCurrentStep ] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [repeaterState, setRepeaterState] = useState({});
  const [showAddRow,   setShowAddRow  ] = useState(false);
  const [newAct,       setNewAct      ] = useState('');
  const [newSection,   setNewSection  ] = useState('');
  const [newSectionVal, setNewSectionVal] = useState('');
  const [actsSectionsRegistry, setActsSectionsRegistry] = useState(ACTS_SECTIONS_REGISTRY);
  const [showOccurrencePlace, setShowOccurrencePlace] = useState(false);

  // Victim Modal state hooks
  const [isVictimModalOpen, setIsVictimModalOpen] = useState(false);
  const [activeVictimIndex, setActiveVictimIndex] = useState(null);
  const [victimTempValues, setVictimTempValues]   = useState({});
  const [victimSubTab, setVictimSubTab]           = useState('personal');
  const [victimModalErrors, setVictimModalErrors] = useState({});
  const [victimModalTouched, setVictimModalTouched] = useState({});

  // Accused Modal state hooks
  const [isAccusedModalOpen, setIsAccusedModalOpen] = useState(false);
  const [activeAccusedIndex, setActiveAccusedIndex] = useState(null);
  const [accusedTempValues, setAccusedTempValues]   = useState({});
  const [accusedSubTab, setAccusedSubTab]           = useState('personal');
  const [accusedModalErrors, setAccusedModalErrors] = useState({});
  const [accusedModalTouched, setAccusedModalTouched] = useState({});

  // Arrested Modal state hooks
  const [isArrestedModalOpen, setIsArrestedModalOpen] = useState(false);
  const [activeArrestedIndex, setActiveArrestedIndex] = useState(null);
  const [arrestedTempValues, setArrestedTempValues]   = useState({});
  const [arrestedSubTab, setArrestedSubTab]           = useState('arrest_details'); // 'arrest_details' | 'person_particulars' | 'particular_details' | 'address'
  const [arrestedModalErrors, setArrestedModalErrors] = useState({});
  const [arrestedModalTouched, setArrestedModalTouched] = useState({});

  // Intimation Details tab state
  const [isIntimationModalOpen, setIsIntimationModalOpen] = useState(false);
  const [activeIntimationIndex, setActiveIntimationIndex] = useState(null);
  const [intimationTempValues, setIntimationTempValues]   = useState({});
  const [intimationSubTab, setIntimationSubTab]           = useState('personal'); // 'personal' | 'address'
  const [intimationModalErrors, setIntimationModalErrors] = useState({});
  const [intimationModalTouched, setIntimationModalTouched] = useState({});

  /* ── Major / Minor Head state ────────────────────────────────────────────── */
  const [selectedMajorHead, setSelectedMajorHead] = useState('');
  const [selectedMinorHead, setSelectedMinorHead] = useState('');
  const [majorMinorRows, setMajorMinorRows]       = useState([]);
  /**
   * Helper: extract all fields from the schema (flat list).
   * Used to look up field options dynamically — no hardcoding.
   */
  const allSchemaFields = React.useMemo(() => {
    if (!schema || schema.length === 0) return [];
    return schema.reduce((acc, sec) => [...acc, ...(sec.fields || [])], []);
  }, [schema]);

  const openVictimAddModal = () => {
    setVictimTempValues({});
    setActiveVictimIndex(null);
    setVictimSubTab('personal');
    setVictimModalErrors({});
    setVictimModalTouched({});
    setIsVictimModalOpen(true);
  };

  const openVictimEditModal = (idx) => {
    const list = repeaterState.PERSON_VICTIM || [];
    setVictimTempValues({ ...(list[idx] || {}) });
    setActiveVictimIndex(idx);
    setVictimSubTab('personal');
    setVictimModalErrors({});
    setVictimModalTouched({});
    setIsVictimModalOpen(true);
  };

  const deleteVictimEntry = (idx) => {
    const list = repeaterState.PERSON_VICTIM || [];
    const nextList = list.filter((_, i) => i !== idx);
    setRepeaterState(prev => ({ ...prev, PERSON_VICTIM: nextList }));
  };

  const handleVictimModalChange = (key, val) => {
    setVictimTempValues((prev) => {
      const next = { ...prev, [key]: val };

      // DOB, Age (Years) and Year of Birth interlinking
      if (key === 'victim_dob') {
        const dateStr = val;
        if (dateStr && dateStr.length >= 4) {
          const dobDate = new Date(dateStr);
          if (!isNaN(dobDate.getTime())) {
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
      if (key === 'victim_perm_same' && (val === true || val === 'Yes')) {
        next.victim_perm_house_no = next.victim_house_no || '';
        next.victim_perm_street = next.victim_street || '';
        next.victim_perm_colony = next.victim_colony || '';
        next.victim_perm_city_town_village = next.victim_city_town_village || '';
        next.victim_perm_tehsil_block_mandal = next.victim_tehsil_block_mandal || '';
        next.victim_perm_country = next.victim_country || 'Indian';
        next.victim_perm_state = next.victim_state || '';
        next.victim_perm_district = next.victim_district || '';
        next.victim_perm_police_station = next.victim_police_station || '';
        next.victim_perm_pincode = next.victim_pincode || '';
      }

      if (next.victim_perm_same === true || next.victim_perm_same === 'Yes') {
        if (key === 'victim_house_no') next.victim_perm_house_no = val;
        if (key === 'victim_street') next.victim_perm_street = val;
        if (key === 'victim_colony') next.victim_perm_colony = val;
        if (key === 'victim_city_town_village') next.victim_perm_city_town_village = val;
        if (key === 'victim_tehsil_block_mandal') next.victim_perm_tehsil_block_mandal = val;
        if (key === 'victim_country') next.victim_perm_country = val;
        if (key === 'victim_state') next.victim_perm_state = val;
        if (key === 'victim_district') next.victim_perm_district = val;
        if (key === 'victim_police_station') next.victim_perm_police_station = val;
        if (key === 'victim_pincode') next.victim_perm_pincode = val;
      }

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
    const list = repeaterState.PERSON_ACCUSED || [];
    setAccusedTempValues({ ...(list[idx] || {}) });
    setActiveAccusedIndex(idx);
    setAccusedSubTab('personal');
    setAccusedModalErrors({});
    setAccusedModalTouched({});
    setIsAccusedModalOpen(true);
  };

  const deleteAccusedEntry = (idx) => {
    const list = repeaterState.PERSON_ACCUSED || [];
    const nextList = list.filter((_, i) => i !== idx);
    setRepeaterState(prev => ({ ...prev, PERSON_ACCUSED: nextList }));
  };

  const handleAccusedModalChange = (key, val) => {
    setAccusedTempValues((prev) => {
      const next = { ...prev, [key]: val };

      // DOB, Age (Years) and Year of Birth interlinking
      if (key === 'accused_dob') {
        const dateStr = val;
        if (dateStr && dateStr.length >= 4) {
          const dobDate = new Date(dateStr);
          if (!isNaN(dobDate.getTime())) {
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
      if (key === 'accused_perm_same' && (val === true || val === 'Yes')) {
        next.accused_perm_house_no = next.accused_house_no || '';
        next.accused_perm_street = next.accused_street || '';
        next.accused_perm_colony = next.accused_colony || '';
        next.accused_perm_city_town_village = next.accused_city_town_village || '';
        next.accused_perm_tehsil_block_mandal = next.accused_tehsil_block_mandal || '';
        next.accused_perm_country = next.accused_country || 'Indian';
        next.accused_perm_state = next.accused_state || '';
        next.accused_perm_district = next.accused_district || '';
        next.accused_perm_police_station = next.accused_police_station || '';
        next.accused_perm_pincode = next.accused_pincode || '';
      }

      if (next.accused_perm_same === true || next.accused_perm_same === 'Yes') {
        if (key === 'accused_house_no') next.accused_perm_house_no = val;
        if (key === 'accused_street') next.accused_perm_street = val;
        if (key === 'accused_colony') next.accused_perm_colony = val;
        if (key === 'accused_city_town_village') next.accused_perm_city_town_village = val;
        if (key === 'accused_tehsil_block_mandal') next.accused_perm_tehsil_block_mandal = val;
        if (key === 'accused_country') next.accused_perm_country = val;
        if (key === 'accused_state') next.accused_perm_state = val;
        if (key === 'accused_district') next.accused_perm_district = val;
        if (key === 'accused_police_station') next.accused_perm_police_station = val;
        if (key === 'accused_pincode') next.accused_perm_pincode = val;
      }

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

    const list = [...(repeaterState.PERSON_ACCUSED || [])];
    if (activeAccusedIndex !== null) {
      list[activeAccusedIndex] = accusedTempValues;
    } else {
      list.push(accusedTempValues);
    }

    setRepeaterState(prev => ({ ...prev, PERSON_ACCUSED: list }));
    setIsAccusedModalOpen(false);
  };

  const openArrestedAddModal = () => {
    setArrestedTempValues({});
    setActiveArrestedIndex(null);
    setArrestedSubTab('arrest_details');
    setArrestedModalErrors({});
    setArrestedModalTouched({});
    setIsArrestedModalOpen(true);
  };

  const openArrestedEditModal = (idx) => {
    const list = repeaterState.arrested_info || [];
    setArrestedTempValues({ ...(list[idx] || {}) });
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
    const dobDate = new Date(dobVal);
    if (!isNaN(dobDate.getTime())) {
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

  const syncArrestedPermAddress = (currentTemp) => {
    if (!currentTemp.arrested_perm_same) return currentTemp;
    return {
      ...currentTemp,
      arrested_perm_house_no: currentTemp.arrested_house_no || '',
      arrested_perm_street: currentTemp.arrested_street || '',
      arrested_perm_colony: currentTemp.arrested_colony || '',
      arrested_perm_city_town_village: currentTemp.arrested_city_town_village || '',
      arrested_perm_tehsil_block_mandal: currentTemp.arrested_tehsil_block_mandal || '',
      arrested_perm_country: currentTemp.arrested_country || 'Indian',
      arrested_perm_state: currentTemp.arrested_state || '',
      arrested_perm_district: currentTemp.arrested_district || '',
      arrested_perm_police_station: currentTemp.arrested_police_station || '',
      arrested_perm_pincode: currentTemp.arrested_pincode || '',
    };
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

      if (key === 'arrested_perm_same' && (val === true || val === 'Yes')) {
        next = syncArrestedPermAddress(next);
      }

      if (next.arrested_perm_same === true || next.arrested_perm_same === 'Yes') {
        if (key === 'arrested_house_no') next.arrested_perm_house_no = val;
        if (key === 'arrested_street') next.arrested_perm_street = val;
        if (key === 'arrested_colony') next.arrested_perm_colony = val;
        if (key === 'arrested_city_town_village') next.arrested_perm_city_town_village = val;
        if (key === 'arrested_tehsil_block_mandal') next.arrested_perm_tehsil_block_mandal = val;
        if (key === 'arrested_country') next.arrested_perm_country = val;
        if (key === 'arrested_state') next.arrested_perm_state = val;
        if (key === 'arrested_district') next.arrested_perm_district = val;
        if (key === 'arrested_police_station') next.arrested_perm_police_station = val;
        if (key === 'arrested_pincode') next.arrested_perm_pincode = val;
      }

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
        } catch (e) {}
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

  const getIntimationName = (item) => {
    return item?.intimated_relative_name || '—';
  };

  const getIntimationAddress = (item) => {
    const parts = [
      item?.intimation_house_no,
      item?.intimation_street,
      item?.intimation_colony,
      item?.intimation_city_town_village,
      item?.intimation_district,
      item?.intimation_state
    ].filter(Boolean);
    return parts.join(', ') || '—';
  };

  const openIntimationAddModal = () => {
    setActiveIntimationIndex(null);
    setIntimationTempValues({});
    setIntimationModalErrors({});
    setIntimationModalTouched({});
    setIntimationSubTab('personal');
    setIsIntimationModalOpen(true);
  };

  const openIntimationEditModal = (index) => {
    const list = repeaterState.intimation_details || [];
    setActiveIntimationIndex(index);
    setIntimationTempValues(list[index] || {});
    setIntimationModalErrors({});
    setIntimationModalTouched({});
    setIntimationSubTab('personal');
    setIsIntimationModalOpen(true);
  };

  const deleteIntimationEntry = (index) => {
    const list = repeaterState.intimation_details || [];
    const nextList = list.filter((_, idx) => idx !== index);
    setRepeaterState(prev => ({ ...prev, intimation_details: nextList }));
  };

  const handleIntimationModalChange = (key, val) => {
    setIntimationTempValues(prev => {
      const next = { ...prev, [key]: val };
      if (intimationModalErrors[key]) {
        setIntimationModalErrors(e => { const n = { ...e }; delete n[key]; return n; });
      }
      return next;
    });
  };

  const saveIntimationEntry = () => {
    const intimationFields = allSchemaFields.filter(f => f.field_key?.startsWith('intimation_') || f.field_key?.startsWith('intimated_') || f.section === 'intimation_details');
    const errs = {};
    const touchedFields = {};

    intimationFields.forEach(f => {
      if (f.show_when) {
        try {
          const cond = typeof f.show_when === 'string' ? JSON.parse(f.show_when) : f.show_when;
          if (cond && cond.field) {
            const currentValue = String(intimationTempValues[cond.field] || '').toLowerCase();
            const allowed = Array.isArray(cond.value)
              ? cond.value.map(v => String(v).toLowerCase())
              : [String(cond.value || '').toLowerCase()];
            if (!allowed.includes(currentValue)) return;
          }
        } catch (e) {}
      }

      const rules = parseRules(f.validation_rules);
      if (rules.required) {
        const val = intimationTempValues[f.field_key];
        const isEmpty = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);
        if (isEmpty) {
          const label = lang === 'hi' ? (f.label_hi || f.label_en) : f.label_en;
          errs[f.field_key] = lang === 'hi' ? `${label} आवश्यक है` : `${label} is required`;
        }
      }
    });

    if (!intimationTempValues.intimated_relative_name) {
      errs.intimated_relative_name = lang === 'hi' ? 'रिश्तेदार का नाम आवश्यक है' : 'Relative Name is required';
    }

    if (Object.keys(errs).length > 0) {
      setIntimationModalErrors(errs);
      intimationFields.forEach(f => { touchedFields[f.field_key] = true; });
      setIntimationModalTouched(touchedFields);
      toast.error(lang === 'hi' ? 'कृपया सभी आवश्यक फ़ील्ड भरें।' : 'Please fill all required fields.');
      return;
    }

    const list = [...(repeaterState.intimation_details || [])];
    if (activeIntimationIndex !== null) {
      list[activeIntimationIndex] = intimationTempValues;
    } else {
      list.push(intimationTempValues);
    }

    setRepeaterState(prev => ({ ...prev, intimation_details: list }));
    setIsIntimationModalOpen(false);
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

    const list = [...(repeaterState.PERSON_VICTIM || [])];
    if (activeVictimIndex !== null) {
      list[activeVictimIndex] = victimTempValues;
    } else {
      list.push(victimTempValues);
    }

    setRepeaterState(prev => ({ ...prev, PERSON_VICTIM: list }));
    setIsVictimModalOpen(false);
  };

  /**
   * Fetch major-head options from the schema.
   * act_name is a comma-separated list of all registered acts.
   * We split it, normalise each name to the value used in schema show_when,
   * collect options from every matching major-head schema field, and return
   * the merged (deduplicated) list.
   *
   * Alias map: UI display name -> schema show_when value
   */

  const getMajorHeadOptions = useCallback(() => {
    const actNameRaw = values.act_name || '';
    if (!actNameRaw) return [];

    // Split comma-separated acts and normalise to schema keys
    const actKeys = actNameRaw
      .split(',')
      .map(a => a.trim())
      .filter(Boolean)
      .map(a => ACT_NAME_ALIAS[a] || a);

    // Collect options from all matching major-head schema fields
    const seen = new Set();
    const allOptions = [];
    for (const actKey of actKeys) {
      const majorFields = allSchemaFields.filter(
        f => f.field_key?.includes('major_head') && f.show_when?.value === actKey
      );
      for (const mf of majorFields) {
        if (mf.options && Array.isArray(mf.options)) {
          for (const opt of mf.options) {
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
  /**
   * Fetch minor-head options from the schema.
   * Looks for fields whose field_key matches `*_minor_head` and whose
   * show_when condition references the currently selected major head value.
   * Returns the options array from the matching field, or [] if none found.
   */
  const getMinorHeadOptions = useCallback(() => {
    if (!selectedMajorHead) return [];
    const minorField = allSchemaFields.find(
      f => f.field_key?.includes('minor_head') && f.show_when?.value === selectedMajorHead
    );
    if (minorField?.options && Array.isArray(minorField.options)) {
      return minorField.options;
    }
    return [];
  }, [allSchemaFields, selectedMajorHead]);
  /**
   * Fetch local-head options from the schema.
   * Looks for the field with field_key === 'local_head'.
   */
  const getLocalHeadOptions = useCallback(() => {
    const localField = allSchemaFields.find(f => f.field_key === 'local_head');
    if (localField?.options && Array.isArray(localField.options)) {
      return localField.options;
    }
    return [];
  }, [allSchemaFields]);

  /* ── Date-Time Picker state ─────────────────────────────────────────────── */
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth());
  const [pickerYear,  setPickerYear]  = useState(new Date().getFullYear());
  const [pickerDay,   setPickerDay]   = useState(new Date().getDate());
  const [pickerHour,  setPickerHour]  = useState(new Date().getHours());
  const [pickerMinute,setPickerMinute] = useState(new Date().getMinutes());
  const [complainantTab, setComplainantTab] = useState('personal');
  const datePickerRef = useRef(null);
  const searchBtnRef  = useRef(null);

  useEffect(() => {
    if (!showDatePicker) return;
    const handleClickOutside = (e) => {
      if (e.target?.placeholder === 'DD/MM/YYYY HH:MM') return;
      if (
        datePickerRef.current && !datePickerRef.current.contains(e.target) &&
        searchBtnRef.current  && !searchBtnRef.current.contains(e.target)
      ) {
        setShowDatePicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDatePicker]);

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
          initial[section.section] = matching.map(p => ({ ...(p.data || {}) }));
        }
      } else if (section.entity_type === 'property') {
        if (initialProperties.length > 0) {
          initial[section.section] = initialProperties.map(prop => ({
            property_major_category: prop.major_category || '',
            property_minor_category: prop.minor_category || '',
            property_stolen_recovered: prop.status || 'Stolen',
            property_details: prop.details || '',
          }));
        }
      }
    }
    if (Object.keys(initial).length > 0) {
      setRepeaterState(prev => ({ ...prev, ...initial }));
    }
  }, [initialPersons, initialProperties, finalSchema.length]);

  // Auto-populate 1 empty row for property details if empty and not read-only
  useEffect(() => {
    if (!readOnly && recordType === 'CASE') {
      const propertyList = repeaterState?.property_details || [];
      if (propertyList.length === 0) {
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

  useEffect(() => {
    const seed = { ...(initialValues?.data || initialValues || {}) };
    
    // Auto-populate GD date & time with current local time if creating a new record and gd_date_time is empty
    if (!initialValues?.id && !seed.gd_date_time) {
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const yyyy = now.getFullYear();
      const hh = String(now.getHours()).padStart(2, '0');
      const mi = String(now.getMinutes()).padStart(2, '0');
      seed.gd_date_time = `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
      if (recordType === 'UIDB') {
        seed.dd_date = `${dd}/${mm}/${yyyy}`;
        seed.dd_time = `${hh}:${mi}`;
      } else {
        seed.gd_date = `${dd}/${mm}/${yyyy}`;
        seed.gd_time = `${hh}:${mi}`;
        if (recordType === 'CASE') {
          seed.fir_date = `${dd}/${mm}/${yyyy}`;
          seed.fir_time = `${hh}:${mi}`;
          seed.case_type = 'cctns(manual FIR)';
        }
      }
    }

    // Combine date and time into gd_date_time for existing records if empty
    if (!seed.gd_date_time) {
      if (recordType === 'UIDB') {
        const dDate = seed.dd_date || seed.ddDate;
        const dTime = seed.dd_time || seed.ddTime;
        if (dDate && dTime) {
          seed.gd_date_time = `${dDate} ${dTime}`;
        }
      } else {
        if (seed.gd_date && seed.gd_time) {
          seed.gd_date_time = `${seed.gd_date} ${seed.gd_time}`;
          if (recordType === 'CASE') {
            seed.fir_date = seed.fir_date || seed.gd_date;
            seed.fir_time = seed.fir_time || seed.gd_time;
          }
        }
      }
    } else {
      if (recordType === 'CASE') {
        seed.fir_date = seed.fir_date || seed.gd_date || seed.gd_date_time.split(' ')[0];
        seed.fir_time = seed.fir_time || seed.gd_time || seed.gd_date_time.split(' ')[1];
      }
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

    // Formulate gd_date_time if missing but gd_date/gd_time exist
    if (!updatedSeed.gd_date_time && updatedSeed.gd_date) {
      let datePart = String(updatedSeed.gd_date).split('T')[0];
      if (datePart.includes('-')) {
        const parts = datePart.split('-');
        if (parts.length === 3) {
          datePart = `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
        }
      }
      const timePart = updatedSeed.gd_time || '00:00';
      updatedSeed.gd_date_time = `${datePart} ${timePart.substring(0, 5)}`;
    }
    
    setValues(updatedSeed);
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
    section.fields.forEach((field) => {
      // Skip validating if field is hidden by condition
      if (field.show_when) {
        const isShown = (() => {
          try {
            const cond = typeof field.show_when === 'string' ? JSON.parse(field.show_when) : field.show_when;
            if (!cond || !cond.field) return true;
            const val = currentValues[cond.field];
            const checkVals = Array.isArray(cond.value) ? cond.value : [cond.value];
            return checkVals.some(v => String(v || '').toLowerCase() === String(val || '').toLowerCase());
          } catch (e) {
            return true;
          }
        })();
        if (!isShown) return;
      }

      const rules = parseRules(field.validation_rules);

      if (field.field_key === 'gd_no') {
        const num = currentValues.gd_no;
        const dt = currentValues.gd_date;
        const tm = currentValues.gd_time;
        const isAnyFilled = !!(num || dt || tm);
        const isAllFilled = !!(num && dt && tm);

        if (rules.required && !isAllFilled) {
          errs.gd_no = lang === 'hi'
            ? 'जीडी नंबर, दिनांक और समय तीनों भरना आवश्यक है।'
            : 'GD Number, Date and Time are all required.';
        } else if (isAnyFilled && !isAllFilled) {
          errs.gd_no = lang === 'hi'
            ? 'जीडी नंबर, दिनांक और समय तीनों भरें।'
            : 'Please fill all three: GD Number, Date and Time.';
        }
        return;
      }

      if (field.field_key === 'fir_no') {
        const num = currentValues.fir_no;
        const dt = currentValues.fir_date;
        const tm = currentValues.fir_time;
        const isAnyFilled = !!(num || dt || tm);
        const isAllFilled = !!(num && dt && tm);

        if (rules.required && !isAllFilled) {
          errs.fir_no = lang === 'hi'
            ? 'प्राथमिकी संख्या, दिनांक और समय तीनों भरना आवश्यक है।'
            : 'FIR Number, Date and Time are all required.';
        } else if (isAnyFilled && !isAllFilled) {
          errs.fir_no = lang === 'hi'
            ? 'प्राथमिकी संख्या, दिनांक और समय तीनों भरें।'
            : 'Please fill all three: FIR Number, Date and Time.';
        }
        return;
      }

      if (!rules.required) return;

      const val = currentValues[field.field_key];
      const isEmpty = val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0);

      if (isEmpty) {
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

    setValues((prev) => {
      const next = { ...prev, [key]: val };

      // DOB, Age (Years) and Year of Birth interlinking
      if (key.endsWith('_dob')) {
        const prefix = key.substring(0, key.lastIndexOf('_dob'));
        if (val) {
          const dobDate = new Date(val);
          if (!isNaN(dobDate.getTime())) {
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

      if (key === 'arrested_perm_same' && val === true) {
        next.arrested_perm_house_no = next.arrested_house_no || '';
        next.arrested_perm_street = next.arrested_street || '';
        next.arrested_perm_colony = next.arrested_colony || '';
        next.arrested_perm_city_town_village = next.arrested_city_town_village || '';
        next.arrested_perm_tehsil_block_mandal = next.arrested_tehsil_block_mandal || '';
        next.arrested_perm_country = next.arrested_country || 'Indian';
        next.arrested_perm_state = next.arrested_state || '';
        next.arrested_perm_district = next.arrested_district || '';
        next.arrested_perm_police_station = next.arrested_police_station || '';
        next.arrested_perm_pincode = next.arrested_pincode || '';
        next.arrested_perm_address = next.arrested_present_address || '';
      }

      if (next.arrested_perm_same === true) {
        if (key === 'arrested_house_no') next.arrested_perm_house_no = val;
        if (key === 'arrested_street') next.arrested_perm_street = val;
        if (key === 'arrested_colony') next.arrested_perm_colony = val;
        if (key === 'arrested_city_town_village') next.arrested_perm_city_town_village = val;
        if (key === 'arrested_tehsil_block_mandal') next.arrested_perm_tehsil_block_mandal = val;
        if (key === 'arrested_country') next.arrested_perm_country = val;
        if (key === 'arrested_state') next.arrested_perm_state = val;
        if (key === 'arrested_district') next.arrested_perm_district = val;
        if (key === 'arrested_police_station') next.arrested_perm_police_station = val;
        if (key === 'arrested_pincode') next.arrested_perm_pincode = val;
        if (key === 'arrested_present_address') next.arrested_perm_address = val;
      }

      if (key === 'complainant_perm_same' && (val === true || val === 'Yes')) {
        next.complainant_perm_house_no = next.complainant_house_no || '';
        next.complainant_perm_street = next.complainant_street || '';
        next.complainant_perm_colony = next.complainant_colony || '';
        next.complainant_perm_city_town_village = next.complainant_city_town_village || '';
        next.complainant_perm_tehsil_block_mandal = next.complainant_tehsil_block_mandal || '';
        next.complainant_perm_country = next.complainant_country || 'Indian';
        next.complainant_perm_state = next.complainant_state || '';
        next.complainant_perm_district = next.complainant_district || '';
        next.complainant_perm_police_station = next.complainant_police_station || '';
        next.complainant_perm_pincode = next.complainant_pincode || '';
      }

      if (next.complainant_perm_same === true || next.complainant_perm_same === 'Yes') {
        if (key === 'complainant_house_no') next.complainant_perm_house_no = val;
        if (key === 'complainant_street') next.complainant_perm_street = val;
        if (key === 'complainant_colony') next.complainant_perm_colony = val;
        if (key === 'complainant_city_town_village') next.complainant_perm_city_town_village = val;
        if (key === 'complainant_tehsil_block_mandal') next.complainant_perm_tehsil_block_mandal = val;
        if (key === 'complainant_country') next.complainant_perm_country = val;
        if (key === 'complainant_state') next.complainant_perm_state = val;
        if (key === 'complainant_district') next.complainant_perm_district = val;
        if (key === 'complainant_police_station') next.complainant_perm_police_station = val;
        if (key === 'complainant_pincode') next.complainant_perm_pincode = val;
      }

      // Clear error on change
      if (errors[key]) {
        setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
      }

      // Auto-save using custom hook (2 seconds debounce)
      triggerAutosave(next, activeRecordIdRef.current);

      return next;
    });

    setTouched((prev) => ({ ...prev, [key]: true }));
  }, [readOnly, errors, triggerAutosave]);

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
    setSelectedMajorHead('');
    setSelectedMinorHead('');
  }, [selectedMajorHead, selectedMinorHead, majorMinorRows, handleChange]);
  /** Delete a major/minor head row from the table */
  const handleDeleteMajorMinorRow = useCallback((index) => {
    const updated = majorMinorRows.filter((_, i) => i !== index);
    setMajorMinorRows(updated);
    handleChange('major_heads', updated.map(r => r.majorHead).join(', '));
    handleChange('minor_heads', updated.map(r => r.minorHead).join(', '));
  }, [majorMinorRows, handleChange]);

  /* ── Navigate forward (with step validation) ──────────────────────────── */
  const handleNext = () => {
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

    // Build persons and properties from repeater sections
    const persons = [];
    const properties = [];
    for (const section of finalSchema) {
      if (!section.is_repeater) continue;
      const entries = repeaterState[section.section] || [];
      if (section.entity_type === 'person' && section.person_type) {
        for (const entry of entries) {
          persons.push({ person_type: section.person_type, data: entry });
        }
      } else if (section.entity_type === 'property') {
        for (const entry of entries) {
          properties.push(entry);
        }
      }
    }

    onSubmit?.(finalValues, persons, properties, activeRecordIdRef.current);
  };

  /* ── Manual save draft (button click) ────────────────────────────────────*/
  const handleManualSave = () => {
    const finalValues = { ...values };
    if (finalValues.time_of_occurrence !== undefined) {
      finalValues.occurrence_time = finalValues.time_of_occurrence;
    }
    saveImmediately(finalValues, activeRecordIdRef.current);
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
  const isLastStep    = currentStep === finalSchema.length - 1;

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
                  className={`px-3 py-1.5 text-[10px] font-bold transition-all rounded-md cursor-pointer uppercase tracking-tight whitespace-nowrap flex items-center gap-1 select-none border border-[#0d2a4a] ${
                    isSelected
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
          {/* Wrap ONLY the fields in a form so Enter key doesn't auto-submit
              when navigating between steps. The submit action is wired via
              an explicit onClick on the Submit button in FormToolbar. */}
          <form onSubmit={(e) => e.preventDefault()} noValidate>
            {recordType === 'ARREST' && caseType === 'against_fir' && currentStep === 0 ? (
              renderFirSearchStep()
            ) : (recordType === 'ARREST' || recordType === 'UIDB') && activeSection?.title_en === 'General Information' ? (
              renderArrestGeneralInfoStep()
            ) : recordType === 'ARREST' && activeSection?.title_en === 'Arrested' ? (
              renderArrestedStep()
            ) : recordType === 'ARREST' && activeSection?.title_en === 'Intimation Details' ? (
              renderIntimationStep()
            ) : recordType === 'CASE' && currentStep === 0 ? (
              renderActsAndSectionsStep()
              ) : recordType === 'CASE' && currentStep === 1 ? ( 
               renderOccurrenceStep() 
              ) : recordType === 'CASE' && currentStep === 2 ? ( 
               renderComplainantStep() 
              ) : recordType === 'CASE' && currentStep === 4 ? ( 
               renderVictimStep() 
              ) : recordType === 'CASE' && currentStep === 5 ? ( 
               renderAccusedStep() 
              ) : (recordType === 'CASE' && currentStep === 6) ||
                  (recordType === 'ARREST' && activeSection?.entity_type === 'property') ? (
               renderPropertyStep()
              ) : recordType === 'CASE' && currentStep === 7 ? (
               renderActionTakenStep() 
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
