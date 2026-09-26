import React, { useState } from 'react';
import { AlertTriangle, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import FieldRenderer from './FieldRenderer.jsx';
import FormAutosave from './FormAutosave.jsx';
import SelectField from './SelectField.jsx';
import ActsSectionsTable from './ActsSectionsTable.jsx';
import { parseRules } from '../../utils/fieldValidation.js';
import { log } from '../../utils/logger.js';
import { asArray } from '../../utils/dataShape.js';

export const KEYS_TO_SKIP = [
  'uid', 'district', 'police_station', 'submission_status', 'status',
  'sections',
  'ipc_sections', 'excise_sections', 'arms_sections', 'gambling_sections', 'other_sections',
  'ipc_major_head', 'excise_major_head', 'arms_major_head', 'gambling_major_head', 'other_major_head',
  'theft_minor_head', 'murder_minor_head', 'hurt_minor_head', 'cheating_minor_head', 'robbery_minor_head',
  'excise_minor_head', 'arms_minor_head', 'gambling_minor_head', 'other_minor_head',
  'major_heads', 'minor_heads',
  'heinous_offence',
  'gd_date', 'gd_time', 'fir_date', 'fir_time', 'arrest_time',
  'transfer_to', 'transferred_to_ps_id', 'transferred_to_ps', 'transferred_to_agency_id', 'transferred_to_agency', 'date_of_transfer'
];

const ACTS_OPTIONS = [
  { value: 'IPC', label_en: 'IPC', label_hi: 'आईपीसी (IPC)' },
  { value: 'Delhi Excise Act', label_en: 'Delhi Excise Act', label_hi: 'दिल्ली उत्पाद शुल्क अधिनियम' },
  { value: 'Arms Act', label_en: 'Arms Act', label_hi: 'शस्त्र अधिनियम' },
  { value: 'Gambling Act', label_en: 'Gambling Act', label_hi: 'जुआ अधिनियम' },
  { value: 'Other Act', label_en: 'Other Act', label_hi: 'अन्य अधिनियम' }
];

const SECTIONS_BY_ACT = {
  'IPC': [
    { value: 'Sec 379 IPC', label_en: 'Sec 379 IPC', label_hi: 'धारा 379 आईपीसी' },
    { value: 'Sec 302 IPC', label_en: 'Sec 302 IPC', label_hi: 'धारा 302 आईपीसी' },
    { value: 'Sec 323 IPC', label_en: 'Sec 323 IPC', label_hi: 'धारा 323 आईपीसी' },
    { value: 'Sec 406 IPC', label_en: 'Sec 406 IPC', label_hi: 'धारा 406 आईपीसी' },
    { value: 'Sec 392 IPC', label_en: 'Sec 392 IPC', label_hi: 'धारा 392 आईपीसी' },
    { value: 'Sec 356 IPC', label_en: 'Sec 356 IPC', label_hi: 'धारा 356 आईपीसी' }
  ],
  'Delhi Excise Act': [
    { value: 'Sec 33 Excise Act', label_en: 'Sec 33 Excise Act', label_hi: 'धारा 33 उत्पाद शुल्क अधिनियम' },
    { value: 'Sec 38 Excise Act', label_en: 'Sec 38 Excise Act', label_hi: 'धारा 38 उत्पाद शुल्क अधिनियम' },
    { value: 'Sec 42 Excise Act', label_en: 'Sec 42 Excise Act', label_hi: 'धारा 42 उत्पाद शुल्क अधिनियम' }
  ],
  'Arms Act': [
    { value: 'Sec 25 Arms Act', label_en: 'Sec 25 Arms Act', label_hi: 'धारा 25 शस्त्र अधिनियम' },
    { value: 'Sec 27 Arms Act', label_en: 'Sec 27 Arms Act', label_hi: 'धारा 27 शस्त्र अधिनियम' },
    { value: 'Sec 30 Arms Act', label_en: 'Sec 30 Arms Act', label_hi: 'धारा 30 शस्त्र अधिनियम' }
  ],
  'Gambling Act': [
    { value: 'Sec 3 Gambling Act', label_en: 'Sec 3 Gambling Act', label_hi: 'धारा 3 जुआ अधिनियम' },
    { value: 'Sec 4 Gambling Act', label_en: 'Sec 4 Gambling Act', label_hi: 'धारा 4 जुआ अधिनियम' },
    { value: 'Sec 13 Gambling Act', label_en: 'Sec 13 Gambling Act', label_hi: 'धारा 13 जुआ अधिनियम' }
  ]
};

const MAJOR_HEADS_BY_ACT = {
  'IPC': [
    { value: 'Theft', label_en: 'Theft', label_hi: 'चोरी' },
    { value: 'Murder', label_en: 'Murder', label_hi: 'हत्या' },
    { value: 'Hurt', label_en: 'Hurt', label_hi: 'चोट / नुकसान' },
    { value: 'Cheating', label_en: 'Cheating', label_hi: 'धोखाधड़ी' },
    { value: 'Robbery', label_en: 'Robbery', label_hi: 'डकैती / लूट' }
  ],
  'Delhi Excise Act': [
    { value: 'Possession', label_en: 'Possession', label_hi: 'कब्जा' },
    { value: 'Sale', label_en: 'Sale', label_hi: 'बिक्री' },
    { value: 'Smuggling', label_en: 'Smuggling', label_hi: 'तस्करी' }
  ],
  'Arms Act': [
    { value: 'Possession of illegal arms', label_en: 'Possession of illegal arms', label_hi: 'अवैध हथियारों का कब्जा' },
    { value: 'Use of illegal arms', label_en: 'Use of illegal arms', label_hi: 'अवैध हथियारों का उपयोग' }
  ],
  'Gambling Act': [
    { value: 'Gaming House', label_en: 'Gaming House', label_hi: 'गेमिंग हाउस / जुआघर' },
    { value: 'Public Gambling', label_en: 'Public Gambling', label_hi: 'सार्वजनिक जुआ' }
  ]
};

const MINOR_HEADS_BY_MAJOR_HEAD = {
  'Theft': [
    { value: 'Simple Theft', label_en: 'Simple Theft', label_hi: 'साधारण चोरी' },
    { value: 'House Theft', label_en: 'House Theft', label_hi: 'घर की चोरी' },
    { value: 'Snatching', label_en: 'Snatching', label_hi: 'छीना-झपटी' },
    { value: 'Pick Pocketing', label_en: 'Pick Pocketing', label_hi: 'जेब कटना' },
    { value: 'Vehicle Theft', label_en: 'Vehicle Theft', label_hi: 'वाहन चोरी' }
  ],
  'Murder': [
    { value: 'Culpable Homicide', label_en: 'Culpable Homicide', label_hi: 'गैर-इरादतन हत्या' },
    { value: 'Attempt to Murder', label_en: 'Attempt to Murder', label_hi: 'हत्या का प्रयास' },
    { value: 'Dowry Death', label_en: 'Dowry Death', label_hi: 'दहेज हत्या' }
  ],
  'Hurt': [
    { value: 'Simple Hurt', label_en: 'Simple Hurt', label_hi: 'साधारण चोट' },
    { value: 'Grievous Hurt', label_en: 'Grievous Hurt', label_hi: 'गंभीर चोट' },
    { value: 'Acid Attack', label_en: 'Acid Attack', label_hi: 'तेजाब हमला' }
  ],
  'Cheating': [
    { value: 'Forgery', label_en: 'Forgery', label_hi: 'जालसाजी' },
    { value: 'Cheating by Impersonation', label_en: 'Cheating by Impersonation', label_hi: 'भेष बदलकर धोखाधड़ी' },
    { value: 'Criminal Breach of Trust', label_en: 'Criminal Breach of Trust', label_hi: 'आपराधिक विश्वासघात' }
  ],
  'Robbery': [
    { value: 'Dacoity', label_en: 'Dacoity', label_hi: 'डकैती' },
    { value: 'Robbery on Highway', label_en: 'Robbery on Highway', label_hi: 'राजमार्ग पर डकैती' },
    { value: 'Extortion', label_en: 'Extortion', label_hi: 'जबरन वसूली' }
  ]
};

function ActsAndSectionsManager({ values, handleChange, readOnly, lang }) {
  const acts = React.useMemo(() => {
    if (Array.isArray(values.acts) && values.acts.length > 0) {
      return values.acts;
    }
    if (values.act_name) {
      return [{
        act_name: values.act_name,
        sections: values.sections || '',
        major_head: values.local_head || values.crime_head || '',
        minor_head: ''
      }];
    }
    return [{ act_name: '', sections: '', major_head: '', minor_head: '' }];
  }, [values.acts, values.act_name, values.sections, values.local_head, values.crime_head]);

  const updateActs = (newActs) => {
    if (readOnly) return;
    handleChange('acts', newActs);

    const joinedActNames = newActs.map(a => a.act_name).filter(Boolean).join(', ');
    const joinedSections = newActs.map(a => a.sections).filter(Boolean).join(', ');
    
    handleChange('act_name', joinedActNames);
    handleChange('sections', joinedSections);

    if (newActs[0]) {
      const firstMajor = newActs[0].major_head || '';
      handleChange('local_head', firstMajor);
      handleChange('crime_head', firstMajor);
    }
  };

  const handleActChange = (index, key, val) => {
    const updated = acts.map((act, i) => {
      if (i !== index) return act;
      const newAct = { ...act, [key]: val };
      if (key === 'act_name') {
        newAct.sections = '';
        newAct.major_head = '';
        newAct.minor_head = '';
      }
      if (key === 'major_head') {
        newAct.minor_head = '';
      }
      return newAct;
    });
    updateActs(updated);
  };

  const addAct = () => {
    updateActs([...acts, { act_name: '', sections: '', major_head: '', minor_head: '' }]);
  };

  const removeAct = (index) => {
    if (acts.length <= 1) return;
    updateActs(acts.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4 w-full p-4 border border-slate-200 rounded-xl bg-slate-50/30">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700 tracking-wide">
          {lang === 'hi' ? 'अधिनियम, धारा और अपराध शीर्ष विवरण' : 'Acts, Sections & Crime Heads Details'}
        </h3>
        {!readOnly && (
          <button
            type="button"
            onClick={addAct}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[var(--accent-color)] hover:bg-[var(--accent-color)]/90 rounded-control transition-colors cursor-pointer"
          >
            <Plus size={14} />
            {lang === 'hi' ? 'अधिनियम जोड़ें' : 'Add Act'}
          </button>
        )}
      </div>

      <div className="space-y-4">
        {acts.map((act, index) => {
          const actName = act.act_name;
          const majorHead = act.major_head;
          const sectionsOptions = SECTIONS_BY_ACT[actName] || [];
          const majorHeadOptions = MAJOR_HEADS_BY_ACT[actName] || [];
          const minorHeadOptions = MINOR_HEADS_BY_MAJOR_HEAD[majorHead] || [];

          return (
            <div
              key={index}
              className="p-4 border border-slate-200 rounded-control bg-white space-y-3 relative"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">
                  {lang === 'hi' ? `अधिनियम #${index + 1}` : `Act #${index + 1}`}
                </span>
                {!readOnly && acts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeAct(index)}
                    className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors cursor-pointer"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Act Name */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    {lang === 'hi' ? 'अधिनियम का नाम' : 'Act Name'}
                  </label>
                  <SelectField
                    disabled={readOnly}
                    value={act.act_name}
                    onChange={(val) => handleActChange(index, 'act_name', val)}
                    options={ACTS_OPTIONS}
                    lang={lang}
                  />
                </div>

                {/* Sections */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    {lang === 'hi' ? 'धाराएँ' : 'Sections'}
                  </label>
                  {sectionsOptions.length > 0 ? (
                    <SelectField
                      disabled={readOnly || !actName}
                      value={act.sections}
                      onChange={(val) => handleActChange(index, 'sections', val)}
                      options={sectionsOptions}
                      lang={lang}
                      multiple={true}
                    />
                  ) : (
                    <input
                      type="text"
                      disabled={readOnly || !actName}
                      value={act.sections || ''}
                      onChange={(e) => handleActChange(index, 'sections', e.target.value)}
                      placeholder={lang === 'hi' ? 'धारा दर्ज करें' : 'Enter Section'}
                      className="w-full bg-white border-2 border-slate-200 text-slate-800 text-sm px-3 py-2 rounded-xl outline-none focus:border-[var(--accent-color)] transition-colors placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                    />
                  )}
                </div>

                {/* Major Head */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    {lang === 'hi' ? 'मुख्य शीर्ष' : 'Major Head'}
                  </label>
                  {majorHeadOptions.length > 0 ? (
                    <SelectField
                      disabled={readOnly || !actName}
                      value={act.major_head}
                      onChange={(val) => handleActChange(index, 'major_head', val)}
                      options={majorHeadOptions}
                      lang={lang}
                    />
                  ) : (
                    <input
                      type="text"
                      disabled={readOnly || !actName}
                      value={act.major_head || ''}
                      onChange={(e) => handleActChange(index, 'major_head', e.target.value)}
                      placeholder={lang === 'hi' ? 'मुख्य शीर्ष दर्ज करें' : 'Enter Major Head'}
                      className="w-full bg-white border-2 border-slate-200 text-slate-800 text-sm px-3 py-2 rounded-xl outline-none focus:border-[var(--accent-color)] transition-colors placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                    />
                  )}
                </div>

                {/* Minor Head */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase">
                    {lang === 'hi' ? 'लघु शीर्ष' : 'Minor Head'}
                  </label>
                  {minorHeadOptions.length > 0 ? (
                    <SelectField
                      disabled={readOnly || !majorHead}
                      value={act.minor_head}
                      onChange={(val) => handleActChange(index, 'minor_head', val)}
                      options={minorHeadOptions}
                      lang={lang}
                    />
                  ) : (
                    <input
                      type="text"
                      disabled={readOnly || !actName}
                      value={act.minor_head || ''}
                      onChange={(e) => handleActChange(index, 'minor_head', e.target.value)}
                      placeholder={lang === 'hi' ? 'लघु शीर्ष दर्ज करें' : 'Enter Minor Head'}
                      className="w-full bg-white border-2 border-slate-200 text-slate-800 text-sm px-3 py-2 rounded-xl outline-none focus:border-[var(--accent-color)] transition-colors placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function isFullWidth(field) {
  const fw = ['TEXTAREA', 'FILE'];
  return fw.includes((field.field_type || '').toUpperCase()) || field.full_width === true;
}

// Exported: the ONE show_when evaluator — used by the render path here AND by
// DynamicForm's validateSection. Render and validation must always agree on
// visibility, or validation blocks on fields the user cannot see.
export function evaluateShowWhen(condition, values) {
  if (!condition) return true;
  if (condition.and) {
    return asArray(condition.and).every(c => evaluateShowWhen(c, values));
  }
  const { field: targetField, value: targetValue, value_in, not_in, operator } = condition;
  if (!targetField) return true;
  const currentValue = values[targetField];
  if (operator === 'filled') {
    return currentValue !== undefined && currentValue !== null && String(currentValue).trim() !== '';
  }
  const allowedValues = value_in || (Array.isArray(targetValue) ? targetValue : null);
  if (allowedValues) {
    return asArray(allowedValues).map(v => String(v || '').toLowerCase()).includes(String(currentValue || '').toLowerCase());
  }
  if (not_in) {
    return !asArray(not_in).map(v => String(v || '').toLowerCase()).includes(String(currentValue || '').toLowerCase());
  }
  return String(currentValue || '').toLowerCase() === String(targetValue || '').toLowerCase();
}

/**
 * evaluateDisabledWhen — mirrors evaluateShowWhen grammar but also supports
 * an `or` operator (array of sub-conditions where ANY match = disabled).
 * Returns true when the field SHOULD be disabled.
 */
export function evaluateDisabledWhen(condition, values) {
  if (!condition) return false;
  if (condition.or) {
    return asArray(condition.or).some(c => evaluateDisabledWhen(c, values));
  }
  if (condition.and) {
    return asArray(condition.and).every(c => evaluateDisabledWhen(c, values));
  }
  const { field: targetField, value: targetValue, value_in, not_in, operator } = condition;
  if (!targetField) return false;
  const currentValue = values[targetField];
  if (operator === 'empty') {
    return currentValue === undefined || currentValue === null || String(currentValue).trim() === '';
  }
  if (operator === 'filled') {
    return currentValue !== undefined && currentValue !== null && String(currentValue).trim() !== '';
  }
  const allowedValues = value_in || (Array.isArray(targetValue) ? targetValue : null);
  if (allowedValues) {
    return asArray(allowedValues).map(v => String(v || '').toLowerCase()).includes(String(currentValue || '').toLowerCase());
  }
  if (not_in) {
    return !asArray(not_in).map(v => String(v || '').toLowerCase()).includes(String(currentValue || '').toLowerCase());
  }
  return String(currentValue || '').toLowerCase() === String(targetValue || '').toLowerCase();
}

function RepeaterSection({
  section,
  currentStep,
  entries = [],
  onEntriesChange,
  readOnly,
  lang = 'en',
}) {
  const [collapsed, setCollapsed] = useState({});

  log.debug('form:section_render', { section: section.section, isRepeater: true, entityType: section.entity_type, entryCount: entries.length });

  const addEntry = () => {
    log.debug('form:repeater_add_entry', { section: section.section, entityType: section.entity_type, countAfter: entries.length + 1 });
    onEntriesChange([...entries, {}]);
  };

  const removeEntry = (idx) => {
    log.debug('form:repeater_remove_entry', { section: section.section, entityType: section.entity_type, index: idx, countBefore: entries.length });
    const next = entries.filter((_, i) => i !== idx);
    onEntriesChange(next);
  };

  const updateEntryField = (idx, key, val) => {
    const next = entries.map((e, i) => i === idx ? { ...e, [key]: val } : e);
    onEntriesChange(next);
  };

  const toggleCollapse = (idx) => {
    log.debug('form:section_toggle_collapse', { section: section.section, index: idx, collapsedAfter: !collapsed[idx] });
    setCollapsed(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const entityLabel = section.entity_type === 'property'
    ? (lang === 'hi' ? 'संपत्ति' : 'Property')
    : (lang === 'hi' ? 'व्यक्ति' : 'Person');

  return (
    <div className="bg-white border border-slate-200 rounded-card overflow-hidden">
      <div className="flex items-center justify-between bg-slate-50 border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-bold text-slate-800 tracking-wide">
            {lang === 'hi' ? (section.title_hi || section.title_en) : section.title_en}
          </h2>
          <span className="text-xs font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">
            {entries.length}
          </span>
        </div>
        {!readOnly && (
          <button
            type="button"
            onClick={addEntry}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[var(--accent-color)] hover:bg-[var(--accent-color)]/90 rounded-control transition-colors cursor-pointer"
          >
            <Plus size={13} />
            {lang === 'hi' ? `${entityLabel} जोड़ें` : `Add ${entityLabel}`}
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {entries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
            <p className="text-sm font-semibold">
              {lang === 'hi'
                ? `कोई ${entityLabel} नहीं जोड़ा गया`
                : `No ${entityLabel.toLowerCase()} added yet`}
            </p>
            {!readOnly && (
              <p className="text-xs">
                {lang === 'hi'
                  ? `ऊपर "जोड़ें" बटन दबाएं`
                  : `Click "Add ${entityLabel}" above to begin`}
              </p>
            )}
          </div>
        )}

        {entries.map((entry, idx) => {
          const isCollapsed = collapsed[idx];
          const summaryKey = asArray(section.fields).find(f => f.field_key.endsWith('_first_name') || f.field_key.endsWith('_major_category'))?.field_key;
          const summary = summaryKey ? entry[summaryKey] : null;

          return (
            <div key={idx} className="border border-slate-200 rounded-control overflow-hidden">
              <div className="flex items-center justify-between bg-slate-50 px-4 py-3 border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => toggleCollapse(idx)}
                  className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer"
                >
                  {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  <span>
                    {entityLabel} #{idx + 1}
                    {summary && <span className="text-slate-400 font-normal ml-2">{summary}</span>}
                  </span>
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeEntry(idx)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>

              {!isCollapsed && (
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                  {asArray(section.fields).map((field) => {
                    const key = field.field_key;
                    if (!evaluateShowWhen(field.show_when, entry)) return null;


                    const rules = parseRules(field.validation_rules);
                    const label = lang === 'hi' ? (field.label_hi || field.label_en) : field.label_en;
                    const fw = isFullWidth(field);

                    return (
                      <div
                        key={key}
                        className={`flex flex-col gap-1.5 ${fw ? 'md:col-span-2' : ''}`}
                      >
                        <label className="form-label-custom">
                          {label}
                          {rules.required && <span className="text-red-500 font-bold ml-0.5">*</span>}
                        </label>
                        <FieldRenderer
                          field={field}
                          value={entry[key]}
                          onChange={(k, v) => updateEntryField(idx, k, v)}
                          readOnly={readOnly}
                          hasError={false}
                          lang={lang}
                          values={entry}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FormSection({
  section,
  currentStep,
  totalSteps = 1,
  values,
  errors,
  touched,
  handleChange,
  handleBlur,
  readOnly,
  targetFields = [],
  lang = 'en',
  hideHeader = false,
  saveStatus = 'idle',
  isFieldEditableForReview = () => true,
  // Repeater props (only used when section.is_repeater === true)
  entries,
  onEntriesChange,
  actsSectionsProps,
  recordType = null,
}) {
  if (!section) return null;

  log.debug('form:section_render', { section: section.section, isRepeater: !!section.is_repeater, fieldCount: section.fields?.length ?? 0 });

  if (section.is_repeater) {
    return (
      <RepeaterSection
        section={section}
        currentStep={currentStep}
        entries={entries || []}
        onEntriesChange={onEntriesChange}
        readOnly={readOnly}
        lang={lang}
      />
    );
  }

  return (
    <div className={hideHeader ? "bg-transparent overflow-visible" : "bg-white border-2 border-[#7a9cc5] rounded-2xl overflow-hidden shadow-sm"}>
      {/* Section header */}
      {!hideHeader && (
        <div className="flex items-center justify-between bg-[#f0f5fa] border-b-2 border-[#7a9cc5] px-6 py-3.5">
          <div className="flex items-center gap-3">
            <h2 className="text-lg sm:text-xl font-bold text-[var(--primary)] tracking-wide">
              {lang === 'hi'
                ? (section.title_hi || section.title_en)
                : section.title_en}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <FormAutosave status={saveStatus} lang={lang} />
            {totalSteps > 1 && (
              <span className="text-sm font-bold text-[var(--primary)] bg-[#dfeaf5] border border-[#7a9cc5]/20 px-3 py-1.5 rounded-xl">
                {lang === 'hi' ? `चरण ${currentStep + 1} / ${totalSteps}` : `Step ${currentStep + 1} / ${totalSteps}`}
              </span>
            )}
            {readOnly && (
              <span className="text-xs font-bold text-slate-600 bg-slate-200 border border-slate-300 px-3 py-1 rounded-lg uppercase tracking-wider">
                {lang === 'hi' ? 'केवल पठन' : 'Read Only'}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Fields grid container */}
      <div className={hideHeader ? "p-0" : "p-4"}>
        {/* Enclose standard fields inside the styled blue border grid box */}
        <fieldset className={hideHeader ? "border-none p-0 bg-transparent" : "border-2 border-[#7a9cc5] rounded-2xl px-4 py-4 bg-white shadow-sm"}>
          {!hideHeader && (
            <legend className="px-2.5 text-[var(--primary)] font-bold uppercase text-sm tracking-wide">
              {lang === 'hi'
                ? (section.title_hi || section.title_en)
                : section.title_en}
            </legend>
          )}

          <div className={hideHeader ? "grid grid-cols-1 md:grid-cols-[220px_1fr] rounded-2xl overflow-hidden border-2 border-[#c7d8ea] shadow-sm" : "grid grid-cols-1 md:grid-cols-[220px_1fr] border-2 border-[#c7d8ea] rounded-xl overflow-hidden shadow-sm"}>
            {(() => {
              const visibleFields = asArray(section.fields).filter(f => {
                if (KEYS_TO_SKIP.includes(f.field_key)) return false;
                if (!evaluateShowWhen(f.show_when, values)) return false;
                return true;
              });

              if (visibleFields.length === 0) {
                return (
                  <div className="col-span-1 md:col-span-2 p-8 text-center bg-[#f0f5fa] border border-[#c7d8ea] rounded-xl space-y-2">
                    <p className="text-sm font-bold text-[#0d2a4a]">
                      {lang === 'hi' ? 'इस अनुभाग में कोई फ़ील्ड वर्तमान स्थिति के लिए सक्रिय नहीं है।' : 'No fields currently required for this section.'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {lang === 'hi' ? 'फ़ील्ड संबंधित स्थिति के अनुसार स्वतः सक्रिय हो जाते हैं।' : 'Fields in this section activate dynamically based on case progress and status.'}
                    </p>
                  </div>
                );
              }

              return visibleFields.map((field, index) => {
                const key = field.field_key;
                const label = lang === 'hi' ? (field.label_hi || field.label_en) : field.label_en;
                const rules = parseRules(field.validation_rules);
                const isRequired = !!rules.required;
                const isHighlighted = targetFields.includes(key);
                const error = touched[key] ? errors[key] : null;
                const isLast = index === visibleFields.length - 1;
                const isDisabledByCondition = !readOnly && evaluateDisabledWhen(field.disabled_when, values);
                const effectiveReadOnly = readOnly || isDisabledByCondition || field.readonly === true || field.readonly === 'true' || !isFieldEditableForReview(field);

                if (key === 'act_name') {
                  if (recordType === 'UIDB') return null;
                  return (
                    <div key="acts-manager-block" className="col-span-1 md:col-span-2 p-3 border-b border-[#c7d8ea] overflow-visible bg-white">
                      {actsSectionsProps ? (
                        <ActsSectionsTable {...actsSectionsProps} localHeadLayout={recordType === 'UIDB' ? 'hidden' : 'combined'} showActsPanel={recordType !== 'UIDB'} />
                      ) : (
                        <ActsAndSectionsManager
                          values={values}
                          handleChange={handleChange}
                          readOnly={readOnly}
                          lang={lang}
                        />
                      )}
                    </div>
                  );
                }

                return (
                  <React.Fragment key={key}>
                    {/* Left label cell */}
                    <div className={`bg-[#dfeaf5] px-4 py-2 text-sm ${isRequired ? 'font-bold' : 'font-medium'} text-[var(--primary)] flex items-center gap-2 min-h-[38px] border-r border-[#c7d8ea]
                      ${!isLast ? 'border-b border-[#c7d8ea]' : ''}
                      ${isHighlighted ? 'bg-amber-50 text-amber-900' : ''}
                    `}>
                      <span>{label}</span>
                      {isRequired && <span className="text-red-500 font-bold">*</span>}
                      {isHighlighted && (
                        <span className="flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded shadow-sm ml-auto">
                          <AlertTriangle size={12} />
                          {lang === 'hi' ? 'संशोधन' : 'Fix'}
                        </span>
                      )}
                      {(isDisabledByCondition || !isFieldEditableForReview(field)) && (
                        <span className="flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded ml-auto" title={lang === 'hi' ? 'वर्तमान स्थिति में अनुपलब्ध' : 'Not available in current status'}>
                          🔒 {lang === 'hi' ? 'लॉक' : 'Locked'}
                        </span>
                      )}
                    </div>

                    {/* Right field cell */}
                    <div className={`px-4 py-2 bg-white flex flex-col justify-center min-h-[38px]
                      ${!isLast ? 'border-b border-[#c7d8ea]' : ''}
                    `}>
                      <FieldRenderer
                        field={field}
                        value={values[key]}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        error={error}
                        readOnly={effectiveReadOnly}
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
}
