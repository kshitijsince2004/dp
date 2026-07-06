export default function RadioField({ id, disabled, value, onChange, options = [], lang = 'en', variant = 'default', wrapperClassName, inputClassName }) {
  const getLabel = (opt) => lang === 'hi' ? (opt.label_hi || opt.label_en) : opt.label_en;

  // Native mode: plain browser radio inputs with an accent color, laid out inline —
  // used inside dense table-row layouts where the default custom-circle style
  // (hidden native input + drawn circle) would look out of place.
  if (variant === 'native') {
    return (
      <div className={wrapperClassName || "flex items-center gap-4"}>
        {options.map((opt) => (
          <label key={String(opt.value)} className={`flex items-center gap-1 cursor-pointer select-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input
              type="radio"
              name={id}
              disabled={disabled}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className={inputClassName || "cursor-pointer"}
              style={{ accentColor: '#0f52ba' }}
            />
            <span>{getLabel(opt)}</span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3 pt-1">
      {options.map((opt) => {
        const checked = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(opt.value)}
            className={`inline-flex items-center gap-2 cursor-pointer select-none bg-transparent border-0 p-0 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors flex-shrink-0 bg-white ${
                checked ? '' : 'border-slate-300'
              }`}
              style={checked ? { borderColor: '#0f52ba' } : {}}
            >
              {checked && (
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: '#0f52ba' }}
                />
              )}
            </div>
            <span className="text-sm text-slate-700 font-medium">{getLabel(opt)}</span>
          </button>
        );
      })}
    </div>
  );
}
