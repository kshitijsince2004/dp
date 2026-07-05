import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const base = "w-full bg-white border-2 border-slate-200 text-slate-800 text-sm px-3.5 py-2.5 rounded-xl outline-none focus:border-[var(--accent-color)] transition-colors disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed appearance-none cursor-pointer";
const err  = "border-red-400 focus:border-red-500 bg-red-50";

export default function SelectField({ id, disabled, value, onChange, status, placeholder, options = [], lang = 'en', variant = 'default', className }) {
  const getLabel = (opt) => lang === 'hi' ? (opt.label_hi || opt.label_en) : opt.label_en;

  // Hooks below are only used by the default searchable-dropdown widget, but must
  // still be called unconditionally on every render (Rules of Hooks) even when the
  // 'compact' variant's early return further down never uses their values.
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState({});
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  // Close on outside click (portal is outside DOM tree so check both refs)
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        triggerRef.current && !triggerRef.current.contains(event.target) &&
        dropdownRef.current && !dropdownRef.current.contains(event.target)
      ) {
        setIsOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Recalculate fixed position whenever dropdown opens or page scrolls/resizes
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const update = () => {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropHeight = 280;
      const openUpward = spaceBelow < dropHeight && rect.top > dropHeight;
      setDropdownStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
        ...(openUpward
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [isOpen]);

  // Compact mode: plain native <select> with caller-supplied styling — used inside
  // dense table-row layouts where the default searchable-dropdown widget (custom
  // chevron, portal dropdown) would look out of place.
  if (variant === 'compact') {
    return (
      <select
        id={id}
        disabled={disabled}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      >
        <option value="">{placeholder || (lang === 'hi' ? '------चुनें------' : '------Select------')}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {getLabel(opt)}
          </option>
        ))}
      </select>
    );
  }

  // Short lists: use a native <select> (no clipping issue)
  if (options.length <= 10) {
    return (
      <div className="relative">
        <select
          id={id}
          disabled={disabled}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={`${base} ${status === 'error' ? err : ''} pr-10`}
        >
          <option value="" disabled>
            {placeholder || (lang === 'hi' ? 'विकल्प चुनें' : 'Select an option')}
          </option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {getLabel(opt)}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    );
  }

  const selectedOpt = options.find(o => String(o.value) === String(value));
  const selectedLabel = selectedOpt ? getLabel(selectedOpt) : '';
  const displayPlaceholder = placeholder || (lang === 'hi' ? 'विकल्प चुनें' : 'Select an option');
  const filteredOptions = options.filter(opt =>
    getLabel(opt).toLowerCase().includes(search.toLowerCase())
  );

  const dropdown = isOpen && !disabled && (
    <div
      ref={dropdownRef}
      style={dropdownStyle}
      className="bg-white border border-slate-200 rounded-xl shadow-xl flex flex-col overflow-hidden"
    >
      <div className="p-2 border-b border-slate-100 shrink-0 bg-slate-50">
        <input
          type="text"
          autoFocus
          className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:border-[var(--accent-color)] transition-colors"
          placeholder={lang === 'hi' ? 'खोजें...' : 'Search...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
      <div className="overflow-y-auto p-1 bg-white" style={{ maxHeight: '224px' }}>
        {filteredOptions.length === 0 ? (
          <div className="px-3 py-4 text-sm text-slate-400 text-center">
            {lang === 'hi' ? 'कोई परिणाम नहीं' : 'No results found'}
          </div>
        ) : (
          filteredOptions.map((opt) => (
            <div
              key={opt.value}
              className={`px-3 py-2 text-sm rounded-lg cursor-pointer transition-colors ${
                String(value) === String(opt.value)
                  ? 'bg-[var(--accent-glow)] text-[var(--accent-color)] font-medium'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt.value);
                setIsOpen(false);
                setSearch('');
              }}
            >
              {getLabel(opt)}
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="relative" ref={triggerRef}>
      <div
        className={`${base} ${status === 'error' ? err : ''} pr-10 flex items-center ${disabled ? 'opacity-70' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        id={id}
      >
        <span className={`block truncate ${!selectedLabel ? 'text-slate-400' : ''}`}>
          {selectedLabel || displayPlaceholder}
        </span>
      </div>

      <svg
        className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        width="16" height="16" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>

      {createPortal(dropdown, document.body)}
    </div>
  );
}
