import React from 'react';

import DateTimePickerPopup from './DateTimePickerPopup.jsx';
import TextField     from './TextField.jsx';
import TextAreaField from './TextAreaField.jsx';
import NumberField   from './NumberField.jsx';
import DateField     from './DateField.jsx';
import TimeField     from './TimeField.jsx';
import SelectField   from './SelectField.jsx';
import CheckboxField from './CheckboxField.jsx';
import RadioField    from './RadioField.jsx';
import DateInput     from '../ui/DateInput.jsx';
import { DISTRICTS_AND_STATIONS } from '../../utils/policeData.js';

const inputBase = "w-full bg-white border-2 border-slate-200 text-slate-800 text-sm px-3.5 py-2.5 rounded-xl outline-none focus:border-[var(--accent-color)] transition-colors placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed";

export default function FieldRenderer({
  field, value, onChange, readOnly, hasError, lang, values, handleChange,
  // gd_no composite overrides — different call sites use slightly different sizing
  // (compact table row vs. taller top card) and need to sync extra date/time fields.
  wrapperClassName, numberInputClassName, numberPlaceholder, dateInputClassName, onDateSync,
  // Generic style override for TEXT/TEXTAREA/NUMBER inputs (e.g. dense table rows).
  inputClassName,
  // SELECT overrides — 'compact' swaps the searchable-dropdown widget for a plain native <select>.
  selectVariant, selectClassName, selectPlaceholder,
  // RADIO overrides — 'native' swaps the custom-circle widget for plain accent-colored radios.
  radioVariant, radioWrapperClassName, radioInputClassName,
}) {
  if (!field) return null;
  const key     = field.field_key;
  const type    = (field.field_type || 'TEXT').toUpperCase();
  const status  = hasError ? 'error' : '';
  const placeholder = lang === 'hi' ? field.placeholder_hi : field.placeholder_en;

  let options = field.options;
  if (typeof options === 'string') {
    try { options = JSON.parse(options); } catch { options = []; }
  }
  options = options || [];

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
    if (handleChange) {
      handleChange(k, v);
    } else {
      onChange(k, v);
    }  const containerBg = readOnly ? 'bg-slate-50' : 'bg-white';
  const disabledClass = readOnly ? 'text-slate-500' : 'text-slate-800';

  if (key === 'gd_no') {
    const gdNumber = values?.gd_no || '';

    return (
      <div className={wrapperClassName || `w-full ${containerBg} border-2 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center divide-y sm:divide-y-0 sm:divide-x-2 divide-slate-100 overflow-hidden focus-within:border-[var(--accent-color)] transition-colors ${status === 'error' ? 'border-red-400 bg-red-50 focus-within:border-red-500' : 'border-slate-200'}`}>
        <div className="flex-1 flex items-center min-w-0">
          <input
            type="text"
            disabled={readOnly}
            value={gdNumber}
            onChange={(e) => handleFieldChange('gd_no', e.target.value.replace(/\D/g, ''))}
            placeholder={numberPlaceholder || (lang === 'hi' ? 'जीडी नंबर' : 'GD Number')}
            className={numberInputClassName || `w-full bg-transparent border-0 text-sm px-3.5 py-2.5 outline-none placeholder:text-slate-400 ${disabledClass}`}
          />
        </div>
        <div className="w-full sm:w-[180px] flex items-center min-w-0">
          <DateInput
            id="field-gd_date"
            disabled={readOnly}
            value={values?.gd_date || ''}
            onChange={(val) => {
              handleFieldChange('gd_date', val);
              if (onDateSync) onDateSync(val, values?.gd_time || '');
            }}
            inputClassName={dateInputClassName || `w-full bg-transparent border-0 text-sm px-3.5 py-2.5 pr-9 outline-none placeholder:text-slate-400 cursor-pointer ${disabledClass}`}
          />
        </div>
        <div className="w-full sm:w-[140px] flex items-center min-w-0">
          <input
            type="time"
            disabled={readOnly}
            value={values?.gd_time || ''}
            onChange={(e) => {
              handleFieldChange('gd_time', e.target.value);
              if (onDateSync) onDateSync(values?.gd_date || '', e.target.value);
            }}
            className={`w-full bg-transparent border-0 text-sm px-3.5 py-2.5 outline-none placeholder:text-slate-400 cursor-pointer ${disabledClass}`}
          />
        </div>
      </div>
    );
  }

  if (key === 'arrest_date') {
    return (
      <div className={wrapperClassName || `w-full ${containerBg} border-2 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center divide-y sm:divide-y-0 sm:divide-x-2 divide-slate-100 overflow-hidden focus-within:border-[var(--accent-color)] transition-colors ${status === 'error' ? 'border-red-400 bg-red-50 focus-within:border-red-500' : 'border-slate-200'}`}>
        <div className="flex-1 flex items-center min-w-0">
          <DateInput
            id="field-arrest_date"
            disabled={readOnly}
            value={values?.arrest_date || ''}
            onChange={(val) => {
              handleFieldChange('arrest_date', val);
              if (onDateSync) onDateSync(val, values?.arrest_time || '');
            }}
            inputClassName={dateInputClassName || `w-full bg-transparent border-0 text-sm px-3.5 py-2.5 pr-9 outline-none placeholder:text-slate-400 cursor-pointer ${disabledClass}`}
          />
        </div>
        <div className="w-full sm:w-[220px] flex items-center min-w-0">
          <input
            type="time"
            disabled={readOnly}
            value={values?.arrest_time || ''}
            onChange={(e) => {
              handleFieldChange('arrest_time', e.target.value);
              if (onDateSync) onDateSync(values?.arrest_date || '', e.target.value);
            }}
            className={`w-full bg-transparent border-0 text-sm px-3.5 py-2.5 outline-none placeholder:text-slate-400 cursor-pointer ${disabledClass}`}
          />
        </div>
      </div>
    );
  }

  if (key === 'fir_no') {
    const firNumber = values?.fir_no || '';

    return (
      <div className={wrapperClassName || `w-full ${containerBg} border-2 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center divide-y sm:divide-y-0 sm:divide-x-2 divide-slate-100 overflow-hidden focus-within:border-[var(--accent-color)] transition-colors ${status === 'error' ? 'border-red-400 bg-red-50 focus-within:border-red-500' : 'border-slate-200'}`}>
        <div className="flex-1 flex items-center min-w-0">
          <input
            type="text"
            disabled={readOnly}
            value={firNumber}
            onChange={(e) => handleFieldChange('fir_no', e.target.value)}
            placeholder={numberPlaceholder || (lang === 'hi' ? 'प्राथमिकी (FIR) संख्या' : 'FIR Number')}
            className={numberInputClassName || `w-full bg-transparent border-0 text-sm px-3.5 py-2.5 outline-none placeholder:text-slate-400 ${disabledClass}`}
          />
        </div>
        <div className="w-full sm:w-[220px] flex items-center min-w-0">
          <DateInput
            id="field-fir_date"
            disabled={readOnly}
            value={values?.fir_date || ''}
            onChange={(val) => {
              handleFieldChange('fir_date', val);
              if (onDateSync) onDateSync(val, values?.fir_time || '');
            }}
            inputClassName={dateInputClassName || `w-full bg-transparent border-0 text-sm px-3.5 py-2.5 pr-9 outline-none placeholder:text-slate-400 cursor-pointer ${disabledClass}`}
          />
        </div>
        <div className="w-full sm:w-[140px] flex items-center min-w-0">
          <input
            type="time"
            disabled={readOnly}
            value={values?.fir_time || ''}
            onChange={(e) => {
              handleFieldChange('fir_time', e.target.value);
              if (onDateSync) onDateSync(values?.fir_date || '', e.target.value);
            }}
            className={`w-full bg-transparent border-0 text-sm px-3.5 py-2.5 outline-none placeholder:text-slate-400 cursor-pointer ${disabledClass}`}
          />
        </div>
      </div>
    );
  }3a508d049c9e43696097237923ca
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

  if (key.endsWith('_nickname') || key.endsWith('_nick_name') || key.endsWith('_alias')) {
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
    return (
      <SelectField
        id={`field-${key}`}
        disabled={readOnly}
        value={value}
        onChange={(v) => handleFieldChange(key, v)}
        status={status}
        placeholder={selectPlaceholder || placeholder}
        options={options}
        lang={lang}
        variant={selectVariant}
        className={selectClassName}
      />
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
