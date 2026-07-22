import React, { useEffect } from 'react';
import { log } from '../../utils/logger.js';

const base = "w-full bg-white border-2 border-slate-200 text-slate-800 text-sm px-3.5 py-2.5 rounded-xl outline-none focus:border-[var(--accent-color)] transition-colors placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed";
const err  = "border-red-400 focus:border-red-500 bg-red-50";

export default function NumberField({ id, disabled, value, onChange, status, placeholder, min, max }) {
  useEffect(() => {
    log.debug('form:field_mount', { fieldId: id, fieldType: 'NUMBER' });
  }, [id]);

  return (
    <input
      id={id}
      type="number"
      disabled={disabled}
      value={value ?? ''}
      onChange={(e) => {
        log.debug('form:field_value_change', { fieldId: id, fieldType: 'NUMBER' });
        onChange(e.target.value === '' ? '' : Number(e.target.value));
      }}
      placeholder={placeholder || ''}
      min={min}
      max={max}
      className={`${base} ${status === 'error' ? err : ''}`}
    />
  );
}
