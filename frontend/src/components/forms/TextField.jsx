import { useEffect } from 'react';
import { log } from '../../utils/logger.js';

const base = "w-full min-h-[36px] bg-white border-2 border-slate-200 text-slate-800 text-sm font-medium px-4 py-2.5 rounded-xl outline-none focus:border-[var(--accent-color)] transition-colors placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed";
const err  = "border-red-400 focus:border-red-500 bg-red-50";

export default function TextField({ id, disabled, value, onChange, status, placeholder, className, maxLength, inputMode }) {
  useEffect(() => {
    log.debug('form:field_mount', { fieldId: id, fieldType: 'TEXT' });
  }, [id]);

  return (
    <input
      id={id}
      type="text"
      disabled={disabled}
      value={value ?? ''}
      onChange={(e) => {
        log.debug('form:field_value_change', { fieldId: id, fieldType: 'TEXT' });
        onChange(e.target.value);
      }}
      placeholder={placeholder || ''}
      maxLength={maxLength}
      inputMode={inputMode}
      className={className || `${base} ${status === 'error' ? err : ''}`}
    />
  );
}
