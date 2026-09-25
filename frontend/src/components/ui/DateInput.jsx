import { useEffect, useRef, useState } from 'react';
import { parseDMY, formatDMY } from '../../utils/dateFormat';

/**
 * dd/mm/yyyy date input. Displays and commits only dd/mm/yyyy text —
 * never a native `yyyy-mm-dd` value — while still offering a native
 * browser calendar via a hidden `<input type="date">` picker helper.
 *
 * Replaces every native `<input type="date">` in the app, since those
 * are hard-locked to yyyy-mm-dd internally by the HTML spec.
 */
export default function DateInput({
  id,
  value,
  onChange,
  disabled,
  placeholder = 'DD/MM/YYYY',
  status,
  className = '',
  inputClassName = '',
}) {
  const [text, setText] = useState(value || '');
  const hiddenRef = useRef(null);

  useEffect(() => {
    setText(value || '');
  }, [value]);

  const commit = (raw) => {
    if (!raw) {
      onChange('');
      return;
    }
    const d = parseDMY(raw);
    if (d) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (d > today) {
        onChange(formatDMY(today));
        setText(formatDMY(today));
      } else {
        onChange(formatDMY(d));
      }
    }
    // incomplete/invalid text is left as-is for the user to keep editing
  };

  const handleTextChange = (e) => {
    let v = e.target.value.replace(/[^\d/]/g, '');
    if (/^\d{2}$/.test(v) || /^\d{2}\/\d{2}$/.test(v)) v += '/';
    setText(v.slice(0, 10));
  };

  const openPicker = () => {
    if (disabled) return;
    if (hiddenRef.current?.showPicker) hiddenRef.current.showPicker();
    else hiddenRef.current?.focus();
  };

  const handleHiddenChange = (e) => {
    const iso = e.target.value;
    if (!iso) return;
    const [y, mo, d] = iso.split('-');
    const dmy = `${d}/${mo}/${y}`;
    setText(dmy);
    onChange(dmy);
  };

  return (
    <div className={`relative inline-flex items-center w-full ${className}`}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        value={text}
        placeholder={placeholder}
        onChange={handleTextChange}
        onBlur={() => commit(text)}
        className={
          inputClassName ||
          `w-full h-10 pl-3 pr-9 rounded-lg border text-sm outline-none transition-colors ${
            status === 'error'
              ? 'border-red-400 bg-red-50 focus:border-red-500'
              : 'border-slate-200 bg-white focus:border-[var(--accent-color)]'
          } disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed`
        }
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        tabIndex={-1}
        aria-label="Open calendar"
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 disabled:opacity-40 cursor-pointer"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </button>
      <input
        ref={hiddenRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        max={new Date().toISOString().split('T')[0]}
        className="absolute opacity-0 w-0 h-0 pointer-events-none"
        onChange={handleHiddenChange}
      />
    </div>
  );
}
