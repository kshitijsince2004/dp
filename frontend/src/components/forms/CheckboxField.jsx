import React, { useEffect } from 'react';
import { log } from '../../utils/logger.js';

export default function CheckboxField({ id, disabled, value, onChange, label }) {
  const isChecked = value === true || value === 'true' || value === 1;

  useEffect(() => {
    log.debug('form:field_mount', { fieldId: id, fieldType: 'CHECKBOX' });
  }, [id]);

  return (
    <label
      className={`inline-flex items-center gap-3 pt-1 cursor-pointer select-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <div className="relative flex-shrink-0">
        <input
          id={id}
          type="checkbox"
          disabled={disabled}
          checked={isChecked}
          onChange={(e) => {
            log.debug('form:field_value_change', { fieldId: id, fieldType: 'CHECKBOX' });
            onChange(e.target.checked);
          }}
          className="sr-only peer"
        />
        <div className="w-5 h-5 rounded border-2 border-slate-300 bg-white peer-checked:bg-[var(--primary-accent,#0f52ba)] peer-checked:border-[var(--primary-accent,#0f52ba)] transition-colors flex items-center justify-center">
          {isChecked && (
            <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
              <path d="M1 4l3 3 6-6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      </div>
      {label && <span className="text-sm text-slate-700 font-medium">{label}</span>}
    </label>
  );
}
