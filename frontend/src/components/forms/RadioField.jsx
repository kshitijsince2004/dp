import { useEffect } from 'react';
import { log } from '../../utils/logger.js';

export default function RadioField({ id, disabled, value, onChange, options = [], lang = 'en', variant = 'default', wrapperClassName, inputClassName }) {
  const getLabel = (opt) => lang === 'hi' ? (opt.label_hi || opt.label_en) : opt.label_en;

  useEffect(() => {
    log.debug('form:field_mount', { fieldId: id, fieldType: 'RADIO', optionCount: options.length });
  }, [id, options.length]);

  const handleSelect = (val) => {
    log.debug('form:field_value_change', { fieldId: id, fieldType: 'RADIO' });
    onChange(val);
  };

  // Native mode: plain browser radio inputs with an accent color, laid out inline —
  // used inside dense table-row layouts where the default custom-circle style
  // (hidden native input + drawn circle) would look out of place.
  if (variant === 'native') {
    return (
      <div className={wrapperClassName || "flex items-center gap-6"}>
        {options.map((opt) => (
          <label key={String(opt.value)} className={`flex items-center gap-2 cursor-pointer select-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input
              type="radio"
              name={id}
              disabled={disabled}
              checked={value === opt.value}
              onChange={() => handleSelect(opt.value)}
              className={inputClassName || "cursor-pointer w-4 h-4"}
              style={{ accentColor: 'var(--primary)' }}
            />
            <span className="text-sm sm:text-base font-bold text-[var(--primary)]">{getLabel(opt)}</span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-4 pt-1">
      {options.map((opt) => {
        const checked = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && handleSelect(opt.value)}
            className={`inline-flex items-center gap-2.5 cursor-pointer select-none bg-transparent border-0 p-0 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0 bg-white ${
                checked ? '' : 'border-slate-300'
              }`}
              style={checked ? { borderColor: 'var(--primary)' } : {}}
            >
              {checked && (
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: 'var(--primary)' }}
                />
              )}
            </div>
            <span className="text-sm sm:text-base text-[var(--primary)] font-bold">{getLabel(opt)}</span>
          </button>
        );
      })}
    </div>
  );
}
