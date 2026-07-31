import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import api from '../../utils/api.js';
import { log } from '../../utils/logger.js';

import DateTimePickerPopup from './DateTimePickerPopup.jsx';
import TextField     from './TextField.jsx';
import TextAreaField from './TextAreaField.jsx';
import NumberField   from './NumberField.jsx';
import DateField     from './DateField.jsx';
import TimeField     from './TimeField.jsx';
import SelectField   from './SelectField.jsx';
import CheckboxField from './CheckboxField.jsx';
import RadioField    from './RadioField.jsx';
import { DISTRICTS_AND_STATIONS } from '../../utils/policeData.js';
import { sanitizeFieldValue } from '../../utils/fieldValidation.js';

// #5 dual-mode (2026-07-20): all Delhi PS, flattened+deduped+sorted from the district map. Shown
// for a PERSON-address PS field only when that person's state = Delhi (mirrors the import
// template's flat OPT_POLICE_STATION list). Person DISTRICT uses admin names that don't key into
// the police-district map, so a flat Delhi-wide list is the correct dual-mode dropdown.
const DELHI_STATE = 'Delhi';
const ALL_DELHI_PS = Array.from(new Set(Object.values(DISTRICTS_AND_STATIONS).flat())).sort((a, b) => a.localeCompare(b));
// Delhi-scoped EVENT police-station fields (place of occurrence / arrest / the record's own PS) —
// these keep the district-filtered Delhi list; everything else *_police_station is a person address.
const EVENT_PS_KEYS = new Set(['occurrence_police_station', 'arrest_police_station', 'police_station']);

const inputBase = "w-full bg-white border-2 border-slate-200 text-slate-800 text-sm px-3.5 py-2.5 rounded-xl outline-none focus:border-[var(--accent-color)] transition-colors placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed";

function FieldRendererCore({
  field, value, onChange, readOnly, hasError, lang, values, handleChange,
  wrapperClassName,
  // Generic style override for TEXT/TEXTAREA/NUMBER inputs (e.g. dense table rows).
  inputClassName,
  // SELECT overrides — 'compact' swaps the searchable-dropdown widget for a plain native <select>.
  selectVariant, selectClassName, selectPlaceholder,
  // RADIO overrides — 'native' swaps the custom-circle widget for plain accent-colored radios.
  radioVariant, radioWrapperClassName, radioInputClassName,
}) {
  // Generic options_source fetch (P4/item 5): any field whose registry row carries
  // options_source and no inline options resolves its dropdown from
  // /fields/lookup/:options_source — the same convention already used ad hoc elsewhere
  // (major-heads, property-items) generalized to every field, not just the hardcoded ones.
  // Hook must run before the `!field` early return (Rules of Hooks) — `enabled` guards it.
  const optionsSource = field?.options_source;
  const hasInlineOptions = field?.options && (Array.isArray(field.options) ? field.options.length > 0 : true);
  const { data: sourceOptions } = useQuery({
    queryKey: ['fieldOptionsSource', optionsSource],
    queryFn: async () => {
      const res = await api.get(`/fields/lookup/${optionsSource}`);
      return res.data.data || [];
    },
    enabled: !!optionsSource && !hasInlineOptions,
    staleTime: 60_000,
  });

  // India address state→district cascading: a person-address *_district dropdown narrows to
  // its sibling *_state's districts (static LGD-snapshot map from the backend, cached long).
  // 'district' (the record's police district), occurrence_district and arrest_district are
  // Delhi-Police-scoped event fields — never cascaded here.
  const fieldKey = field?.field_key || '';
  const isAddressDistrict = fieldKey.endsWith('_district')
    && fieldKey !== 'occurrence_district' && fieldKey !== 'arrest_district';
  const { data: stateDistrictMap } = useQuery({
    queryKey: ['stateDistricts'],
    queryFn: async () => {
      const res = await api.get('/fields/lookup/state-districts');
      return res.data.data || {};
    },
    enabled: isAddressDistrict,
    staleTime: Infinity,
  });

  if (!field) return null;
  const key     = field.field_key;
  // Composite Number+Date(+Time) widgets (gd_no/fir_no/arrest_date, below) render their own
  // date/time cell inline via DateTimePickerPopup. gd_date/gd_time/fir_date/fir_time/arrest_time
  // are ALSO separate field_registry rows in the same section, so FormSection's per-field loop
  // renders them a SECOND time as standalone DateField/TimeField inputs next to the composite —
  // a visible duplicate widget (bug batch 2026-07-23, #B8, reported on Missing Person's GD
  // Number). Suppressing them here (their value is still collected/submitted normally by
  // DynamicForm — only the extra standalone INPUT is removed) fixes the duplicate without
  // touching FormSection.jsx's section.fields list (owned by another agent). NOTE for FE-core:
  // a fully clean fix additionally removes the now-empty label row by adding these keys to
  // FormSection.jsx's `keysToSkip` array.
  if (key === 'gd_date' || key === 'gd_time' || key === 'fir_date' || key === 'fir_time' || key === 'arrest_time') {
    return null;
  }
  const type    = (field.field_type || 'TEXT').toUpperCase();
  const status  = hasError ? 'error' : '';
  const placeholder = lang === 'hi' ? field.placeholder_hi : field.placeholder_en;

  const containerBg = readOnly ? 'bg-slate-50' : 'bg-white';
  const disabledClass = readOnly ? 'cursor-not-allowed text-slate-400' : 'text-slate-800';

  let options = field.options;
  if (typeof options === 'string') {
    try { options = JSON.parse(options); } catch { options = []; }
  }
  options = options || [];

  if (optionsSource && !hasInlineOptions && Array.isArray(sourceOptions)) {
    // /fields/lookup/* endpoints return {value, label} — SearchableSelect's getLabel()
    // checks opt.label first, so no further reshaping is needed.
    options = sourceOptions;
  }

  // #5 dual-mode: a person-address PS (complainant/victim/accused/arrested + perm) shows the Delhi
  // PS dropdown ONLY when that person's state = Delhi, and is free-text otherwise (their address
  // can be anywhere in India). Delhi-scoped EVENT PS fields (occurrence/arrest/record PS) keep the
  // district-filtered Delhi list. `forcePsFreeText` flips the SELECT render to a text input below.
  let forcePsFreeText = false;
  if (key.endsWith('_police_station') && values) {
    const prefix = key.substring(0, key.lastIndexOf('_police_station'));
    if (EVENT_PS_KEYS.has(key)) {
      const districtVal = values[`${prefix}_district`] || values.district;
      options = (districtVal && DISTRICTS_AND_STATIONS[districtVal])
        ? DISTRICTS_AND_STATIONS[districtVal].map(ps => ({ value: ps, label_en: ps, label_hi: ps }))
        : [];
    } else {
      const stateVal = values[`${prefix}_state`];
      if (stateVal === DELHI_STATE) {
        options = ALL_DELHI_PS.map(ps => ({ value: ps, label_en: ps, label_hi: ps }));
      } else {
        forcePsFreeText = true; // non-Delhi (or state not yet chosen) → free-type any PS
      }
      log.debug('form:ps_dropdown_mode', { fieldKey: key, mode: forcePsFreeText ? 'free_text' : 'delhi_dropdown', stateVal: stateVal || null });
    }
  }

  // Address district cascading (see the stateDistricts query above): sibling state selected
  // and known → narrow to that state's districts; no state (or 'Other UT/State') → keep the
  // field's own full-India options untouched.
  if (isAddressDistrict && values && stateDistrictMap?.districtsByState) {
    const prefix = key.slice(0, -'_district'.length);
    const stateVal = values[`${prefix}_state`];
    const stateDistricts = stateVal && stateDistrictMap.districtsByState[stateVal];
    if (stateDistricts) {
      options = stateDistricts.map(d => ({ value: d, label_en: d, label_hi: d }));
    }
  }

  const handleFieldChange = (k, v) => {
    log.debug('form:field_change', { fieldKey: k, fieldType: type, routedTo: handleChange ? 'handleChange' : 'onChange' });
    if (handleChange) {
      handleChange(k, v);
    } else {
      onChange(k, v);
    }
  };

  // Each cell in a composite number+date+time row (e.g. GD Number / GD Date & Time) sits
  // borderless inside its (already-bordered) table cell — no separate pill/box around it.
  const compositeCellBox = `flex items-center min-w-0 ${containerBg} ${status === 'error' ? 'bg-red-50' : ''}`;

  // Shared composite-field date+time cell: a single DateTimePickerPopup driving two
  // separate values (e.g. gd_date + gd_time), replacing the old DateInput (native
  // calendar) + native <input type="time"> pairing — same calendar+slider popup as
  // plain DATETIME fields, so the whole form has one consistent date+time picker.
  const compositeDateTimeCell = (dateKey, timeKey, widthClass) => {
    const combined = values?.[dateKey] ? `${values[dateKey]} ${values?.[timeKey] || '00:00'}` : '';
    log.debug('form:composite_datetime_render', { dateKey, timeKey, hasDate: !!values?.[dateKey], hasTime: !!values?.[timeKey] });
    return (
      <div className={`${widthClass} ${compositeCellBox} px-3.5 py-1`}>
        <DateTimePickerPopup
          value={combined}
          onDone={(_formatted, datePart, timePart) => {
            log.debug('form:composite_datetime_commit', { dateKey, timeKey, datePart, timePart });
            handleFieldChange(dateKey, datePart);
            handleFieldChange(timeKey, timePart);
          }}
          disabled={readOnly}
          inputClassName={`w-full bg-transparent border-0 text-sm py-1 outline-none placeholder:text-slate-400 cursor-pointer ${disabledClass}`}
        />
      </div>
    );
  };

  if (key === 'gd_no') {
    return (
      <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className={`flex-1 ${compositeCellBox}`}>
          <input
            type="text"
            disabled={readOnly}
            value={values?.gd_no || ''}
            onChange={(e) => handleFieldChange('gd_no', sanitizeFieldValue(field, e.target.value))}
            placeholder={lang === 'hi' ? 'जीडी नंबर' : 'GD Number'}
            className={`w-full bg-transparent border-0 text-sm px-3.5 py-2.5 outline-none placeholder:text-slate-400 ${disabledClass}`}
          />
        </div>
        {compositeDateTimeCell('gd_date', 'gd_time', 'w-full sm:w-[220px]')}
      </div>
    );
  }

  if (key === 'arrest_date') {
    return compositeDateTimeCell('arrest_date', 'arrest_time', 'w-full');
  }

  if (key === 'fir_no') {
    return (
      <div className="w-full flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <div className={`flex-1 ${compositeCellBox}`}>
          <input
            type="text"
            disabled={readOnly}
            value={values?.fir_no || ''}
            onChange={(e) => handleFieldChange('fir_no', sanitizeFieldValue(field, e.target.value))}
            placeholder={lang === 'hi' ? 'प्राथमिकी (FIR) संख्या' : 'FIR Number'}
            className={`w-full bg-transparent border-0 text-sm px-3.5 py-2.5 outline-none placeholder:text-slate-400 ${disabledClass}`}
          />
        </div>
        {compositeDateTimeCell('fir_date', 'fir_time', 'w-full sm:w-[220px]')}
      </div>
    );
  }

function NicknameChipsField({ disabled, value, onChange, lang, placeholder }) {
  const list = Array.isArray(value)
    ? value.filter(Boolean)
    : String(value || '').split(',').map(v => v.trim()).filter(Boolean);
  const [inputVal, setInputVal] = React.useState('');

  const handleAdd = () => {
    const trimmed = inputVal.trim();
    if (trimmed && !list.includes(trimmed)) {
      const nextList = [...list, trimmed];
      onChange(nextList);
    }
    setInputVal('');
  };

  const handleRemove = (item) => {
    const nextList = list.filter(v => v !== item);
    onChange(nextList);
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Chips Container */}
      <div className="flex flex-wrap gap-1.5 min-h-[44px] p-2 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl items-center">
        {list.length === 0 ? (
          <span className="text-xs text-slate-400 font-medium px-2">
            {lang === 'hi' ? 'कोई उपनाम नहीं जोड़ा गया है' : 'No nicknames added yet.'}
          </span>
        ) : (
          list.map((item, idx) => (
            <span
              key={idx}
              className="inline-flex items-center gap-1.5 bg-slate-800 text-white text-xs font-bold pl-2.5 pr-1.5 py-1.5 rounded-lg transition-all animate-in zoom-in-95 duration-100"
            >
              <span>{item}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(item)}
                  className="hover:bg-slate-700 p-0.5 rounded-md transition-colors"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="stroke-white" strokeWidth="1.5">
                    <path d="M1 1l8 8M9 1L1 9" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
            </span>
          ))
        )}
      </div>

      {/* Input box to add */}
      {!disabled && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder={placeholder || (lang === 'hi' ? 'उपनाम दर्ज करें...' : 'Enter nickname...')}
            className="flex-1 bg-white border-2 border-slate-200 text-slate-800 text-sm px-3.5 py-2 rounded-xl outline-none focus:border-[var(--accent-color)] transition-all"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="px-4 py-2 bg-slate-800 text-white hover:bg-slate-700 font-bold text-xs rounded-xl transition-all active:scale-95 cursor-pointer"
          >
            {lang === 'hi' ? 'जोड़ें' : 'Add'}
          </button>
        </div>
      )}
    </div>
  );
}

  if (key.endsWith('_nickname') || key.endsWith('_nick_name') || key.endsWith('_alias') || key === 'nick_name') {
    return <NicknameChipsField disabled={readOnly} value={value} onChange={(v) => handleFieldChange(key, v)} lang={lang} placeholder={placeholder} />;
  }

  if (type === 'TEXT') {
    return <TextField id={`field-${key}`} disabled={readOnly} value={value} onChange={(v) => handleFieldChange(key, sanitizeFieldValue(field, v))} status={status} placeholder={placeholder} className={inputClassName} />;
  }

  if (type === 'NUMBER') {
    return <NumberField id={`field-${key}`} disabled={readOnly} value={value} onChange={(v) => handleFieldChange(key, v)} status={status} placeholder={placeholder} sanitize={(v) => sanitizeFieldValue(field, v)} />;
  }

  if (type === 'DATE') {
    return <DateField id={`field-${key}`} disabled={readOnly} value={value} onChange={(v) => handleFieldChange(key, v)} status={status} placeholder={placeholder} showTime={false} />;
  }

  if (type === 'DATETIME') {
    return <DateField id={`field-${key}`} disabled={readOnly} value={value} onChange={(v) => handleFieldChange(key, v)} status={status} placeholder={placeholder} showTime={true} />;
  }

  if (type === 'TIME') {
    return <TimeField id={`field-${key}`} disabled={readOnly} value={value} onChange={(v) => handleFieldChange(key, v)} status={status} placeholder={placeholder} />;
  }

  if (type === 'TEXTAREA') {
    return <TextAreaField id={`field-${key}`} disabled={readOnly} value={value} onChange={(v) => handleFieldChange(key, v)} status={status} placeholder={placeholder} />;
  }

  // #5 dual-mode free-text: a non-Delhi person-address PS renders as a plain text input (their
  // police station may be any station in India, not in the Delhi list) instead of an empty select.
  if (forcePsFreeText) {
    return <TextField id={`field-${key}`} disabled={readOnly} value={value} onChange={(v) => handleFieldChange(key, v)} status={status} placeholder={placeholder} className={inputClassName} />;
  }

  if (type === 'SELECT' || type === 'DROPDOWN') {
    const isCaseStatus = key === 'case_status';
    const isTransferSelected = value === 'TRANSFER';

    return (
      <div className="flex flex-col gap-2 w-full">
        <SelectField
          id={`field-${key}`}
          disabled={readOnly}
          value={value}
          onChange={(v) => {
            handleFieldChange(key, v);
            if (isCaseStatus && v !== 'TRANSFER') {
              handleFieldChange('transfer_to', '');
            }
          }}
          status={status}
          placeholder={selectPlaceholder || placeholder}
          options={options}
          lang={lang}
          variant={selectVariant || 'compact'}
          className={selectClassName}
          multiple={key === 'sections' || key.endsWith('_sections') || key.includes('sections')}
        />
        {isCaseStatus && isTransferSelected && (
          <div className="flex flex-col gap-2 mt-1">
            <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 animate-in slide-in-from-top-1 duration-100">
              <span className="text-xs font-bold text-[#0d2a4a]">
                {lang === 'hi' ? 'स्थानांतरण का प्रकार:' : 'Transfer To:'}
              </span>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                <input
                  type="radio"
                  name="case_status_transfer_to"
                  disabled={readOnly}
                  checked={values?.transfer_to === 'PS'}
                  onChange={() => handleFieldChange('transfer_to', 'PS')}
                  className="accent-[#0f52ba] cursor-pointer"
                />
                <span>{lang === 'hi' ? 'पुलिस स्टेशन (PS)' : 'PS'}</span>
              </label>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer select-none">
                <input
                  type="radio"
                  name="case_status_transfer_to"
                  disabled={readOnly}
                  checked={values?.transfer_to === 'Agency'}
                  onChange={() => handleFieldChange('transfer_to', 'Agency')}
                  className="accent-[#0f52ba] cursor-pointer"
                />
                <span>{lang === 'hi' ? 'एजेंसी (Agency)' : 'Agency'}</span>
              </label>
            </div>
            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 animate-in slide-in-from-top-1 duration-100">
              <span className="text-xs font-bold text-[#0d2a4a] shrink-0">
                {lang === 'hi' ? 'स्थानांतरण की तिथि:' : 'Date of Transfer:'}
              </span>
              <DateField
                id="field-date_of_transfer"
                disabled={readOnly}
                value={values?.date_of_transfer}
                onChange={(v) => handleFieldChange('date_of_transfer', v)}
                placeholder={lang === 'hi' ? 'तिथि चुनें' : 'Select date'}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  if (type === 'RADIO') {
    return (
      <RadioField
        id={`field-${key}`}
        disabled={readOnly}
        value={value}
        onChange={(v) => handleFieldChange(key, v)}
        options={options}
        lang={lang}
        variant={radioVariant}
        wrapperClassName={radioWrapperClassName}
        inputClassName={radioInputClassName}
      />
    );
  }

  if (type === 'BOOLEAN' || type === 'CHECKBOX') {
    return <CheckboxField id={`field-${key}`} disabled={readOnly} value={value} onChange={(v) => handleFieldChange(key, v)} label="" />;
  }

  if (type === 'PHONE' || type === 'EMAIL') {
    return (
      <input
        id={`field-${key}`}
        type={type === 'PHONE' ? 'tel' : 'email'}
        disabled={readOnly}
        value={value ?? ''}
        onChange={(e) => handleFieldChange(key, sanitizeFieldValue(field, e.target.value))}
        placeholder={placeholder || ''}
        className={`${inputBase} ${status === 'error' ? 'border-red-400 bg-red-50' : ''}`}
      />
    );
  }

  if (type === 'FILE') {
    return (
      <input
        id={`field-${key}`}
        type="file"
        disabled={readOnly}
        onChange={(e) => handleFieldChange(key, e.target.files?.[0]?.name || '')}
        className="w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[var(--accent-glow)] file:text-[var(--accent-color)] hover:file:bg-[var(--accent-color)]/20 file:cursor-pointer cursor-pointer disabled:opacity-50"
      />
    );
  }

  // Fallback — render as plain text input
  return <TextField id={`field-${key}`} disabled={readOnly} value={value} onChange={(v) => handleFieldChange(key, sanitizeFieldValue(field, v))} status={status} placeholder={placeholder} />;
}

export default function FieldRenderer(props) {
  const { error } = props;
  return (
    <div className="w-full">
      <FieldRendererCore {...props} hasError={props.hasError || !!error} />
      {error && (
        <span className="flex items-center gap-1 text-xs text-red-500 font-medium mt-1">
          <AlertCircle size={12} className="flex-shrink-0" />
          {error}
        </span>
      )}
    </div>
  );
}
