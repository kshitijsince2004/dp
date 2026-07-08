import SearchableSelect from './SearchableSelect.jsx';

export default function SelectField({
  id,
  disabled,
  value,
  onChange,
  status,
  placeholder,
  options = [],
  lang = 'en',
  variant = 'default',
  className,
  multiple = false,
}) {
  const isError = status === 'error';

  let inputClassName = className;
  if (!inputClassName) {
    if (variant === 'compact') {
      inputClassName = `w-full h-6 px-1 border rounded bg-white text-[11px] outline-none focus:border-blue-500 cursor-text disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed ${
        isError ? 'border-red-400 bg-red-50 focus:border-red-500' : 'border-[#7a9cc5]'
      }`;
    } else {
      inputClassName = `w-full bg-white border-2 text-slate-800 text-sm px-3.5 py-2.5 rounded-xl outline-none focus:border-[var(--accent-color)] transition-colors disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed cursor-text ${
        isError ? 'border-red-400 bg-red-50 focus:border-red-500' : 'border-slate-200'
      }`;
    }
  } else if (isError) {
    inputClassName = `${inputClassName} border-red-400 bg-red-50 focus:border-red-500`;
  }

  let dropdownClassName = undefined;
  if (variant === 'compact') {
    dropdownClassName = "max-h-48 overflow-y-auto border border-[#7a9cc5] rounded bg-white shadow-lg text-left z-[9999]";
  } else {
    dropdownClassName = "max-h-56 overflow-y-auto border-2 border-slate-200 rounded-xl bg-white shadow-xl text-left z-[9999]";
  }

  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      disabled={disabled}
      lang={lang}
      placeholder={placeholder}
      className={inputClassName}
      dropdownClassName={dropdownClassName}
      multiple={multiple}
    />
  );
}

