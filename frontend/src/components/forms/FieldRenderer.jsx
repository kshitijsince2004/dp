import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api.js';

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

const inputBase = "w-full bg-white border-2 border-slate-200 text-slate-800 text-sm px-3.5 py-2.5 rounded-xl outline-none focus:border-[var(--accent-color)] transition-colors placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed";

export default function FieldRenderer({
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

  if (!field) return null;
  const key     = field.field_key;
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

  if (key.endsWith('_police_station') && values) {
    const prefix = key.substring(0, key.lastIndexOf('_police_station'));
    const districtVal = values[`${prefix}_district`] || values.district;
    if (districtVal && DISTRICTS_AND_STATIONS[districtVal]) {
      options = DISTRICTS_AND_STATIONS[districtVal].map(ps => ({
        value: ps,
        label_en: ps,
        label_hi: ps
      }));
    } else {
      options = [];
    }
  }

  const handleFieldChange = (k, v) => {
    console.log('[PHAROS-DEBUG][FieldRenderer] handleFieldChange(', JSON.stringify(k), ',', JSON.stringify(v), ') — routing to', handleChange ? 'handleChange (DynamicForm)' : 'onChange (local prop)');
    if (handleChange) {
      handleChange(k, v);
    } else {
      onChange(k, v);
    }
  };

  // Shared composite-field date+time cell: a single DateTimePickerPopup driving two
  // separate values (e.g. gd_date + gd_time), replacing the old DateInput (native
  // calendar) + native <input type="time"> pairing — same calendar+slider popup as
  // plain DATETIME fields, so the whole form has one consistent date+time picker.
  const compositeDateTimeCell = (dateKey, timeKey, widthClass) => {
    const combined = values?.[dateKey] ? `${values[dateKey]} ${values?.[timeKey] || '00:00'}` : '';
    console.log('[PHAROS-DEBUG][FieldRenderer.compositeDateTimeCell] render', { dateKey, timeKey, rawDateVal: values?.[dateKey], rawTimeVal: values?.[timeKey], combinedPassedToPopup: combined });
    return (
      <div className={`${widthClass} flex items-center min-w-0 px-3.5 py-1`}>
        <DateTimePickerPopup
          value={combined}
          onDone={(_formatted, datePart, timePart) => {
            console.log('[PHAROS-DEBUG][FieldRenderer.compositeDateTimeCell] onDone fired for', dateKey, '/', timeKey, '→', { datePart, timePart });
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
      <div className={`w-full ${containerBg} border-2 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center divide-y sm:divide-y-0 sm:divide-x-2 divide-slate-100 overflow-hidden focus-within:border-[var(--accent-color)] transition-colors ${status === 'error' ? 'border-red-400 bg-red-50 focus-within:border-red-500' : 'border-slate-200'}`}>
        <div className="flex-1 flex items-center min-w-0">
          <input
            type="text"
            disabled={readOnly}
            value={values?.gd_no || ''}
            onChange={(e) => {
              const val = e.target.value.replace(/\D/g, ''); // type sirf numeric rkhna
              handleFieldChange('gd_no', val);
            }}
            placeholder={lang === 'hi' ? 'जीडी नंबर' : 'GD Number'}
            className={`w-full bg-transparent border-0 text-sm px-3.5 py-2.5 outline-none placeholder:text-slate-400 ${disabledClass}`}
          />
        </div>
        {compositeDateTimeCell('gd_date', 'gd_time', 'w-full sm:w-[220px]')}
      </div>
    );
  }

  if (key === 'arrest_date') {
    return (
      <div className={`w-full ${containerBg} border-2 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center divide-y sm:divide-y-0 sm:divide-x-2 divide-slate-100 overflow-hidden focus-within:border-[var(--accent-color)] transition-colors ${status === 'error' ? 'border-red-400 bg-red-50 focus-within:border-red-500' : 'border-slate-200'}`}>
        {compositeDateTimeCell('arrest_date', 'arrest_time', 'w-full')}
      </div>
    );
  }

  if (key === 'fir_no') {
    return (
      <div className={`w-full ${containerBg} border-2 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center divide-y sm:divide-y-0 sm:divide-x-2 divide-slate-100 overflow-hidden focus-within:border-[var(--accent-color)] transition-colors ${status === 'error' ? 'border-red-400 bg-red-50 focus-within:border-red-500' : 'border-slate-200'}`}>
        <div className="flex-1 flex items-center min-w-0">
          <input
            type="text"
            disabled={readOnly}
            value={values?.fir_no || ''}
            onChange={(e) => handleFieldChange('fir_no', e.target.value)}
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
    return <TextField id={`field-${key}`} disabled={readOnly} value={value} onChange={(v) => handleFieldChange(key, v)} status={status} placeholder={placeholder} className={inputClassName} />;
  }

  if (type === 'NUMBER') {
    return <NumberField id={`field-${key}`} disabled={readOnly} value={value} onChange={(v) => handleFieldChange(key, v)} status={status} placeholder={placeholder} />;
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
          // Every FieldRenderer consumer in this codebase (DynamicForm.jsx, FormSection.jsx)
          // is a dense police-form wizard — 'compact' (search-box, no big portal chrome) is
          // the only variant actually used anywhere; default to it so call sites that render
          // SELECT fields generically (person sub-tabs, address grids, etc.) don't have to
          // repeat `selectVariant="compact"` individually to avoid falling back to
          // SelectField's bigger default styling.
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
        onChange={(e) => handleFieldChange(key, e.target.value)}
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
  return <TextField id={`field-${key}`} disabled={readOnly} value={value} onChange={(v) => handleFieldChange(key, v)} status={status} placeholder={placeholder} />;
}
