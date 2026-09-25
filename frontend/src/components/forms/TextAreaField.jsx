import React, { useEffect } from 'react';
import { log } from '../../utils/logger.js';

const base = "w-full bg-white border-2 border-slate-200 text-slate-800 text-sm px-3.5 py-2.5 rounded-xl outline-none focus:border-[var(--accent-color)] transition-colors placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed resize-y";
const err  = "border-red-400 focus:border-red-500 bg-red-50";

export default function TextAreaField({ id, disabled, value, onChange, status, placeholder, rows = 3 }) {
  useEffect(() => {
    log.debug('form:field_mount', { fieldId: id, fieldType: 'TEXTAREA' });
  }, [id]);

  return (
    <textarea
      id={id}
      disabled={disabled}
      value={value ?? ''}
      onChange={(e) => {
        log.debug('form:field_value_change', { fieldId: id, fieldType: 'TEXTAREA' });
        onChange(e.target.value);
      }}
      placeholder={placeholder || ''}
      rows={rows}
      className={`${base} ${status === 'error' ? err : ''}`}
    />
  );
}
