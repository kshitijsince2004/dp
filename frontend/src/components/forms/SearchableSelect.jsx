import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';


export default function SearchableSelect({
  value,
  onChange,
  options = [],
  disabled,
  lang = 'en',
  placeholder,
  className,
  dropdownClassName,
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState({});
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  const getLabel = (opt) => opt.label || (lang === 'hi' ? (opt.label_hi || opt.label_en) : opt.label_en) || String(opt.value ?? '');

  const selected = options.find((o) => String(o.value) === String(value));
  const displayValue = open ? search : (selected ? getLabel(selected) : '');

  const closeDropdown = () => {
    setOpen(false);
    setSearch('');
  };

  useEffect(() => {
    function handleClickOutside(e) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) {
        closeDropdown();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Recalculate fixed position whenever the dropdown opens or the page scrolls/resizes.
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropHeight = 200;
      const openUpward = spaceBelow < dropHeight && rect.top > dropHeight;
      setDropdownStyle({
        position: 'fixed',
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
        ...(openUpward
          ? { bottom: window.innerHeight - rect.top + 2 }
          : { top: rect.bottom + 2 }),
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  const filtered = options.filter((opt) =>
    getLabel(opt).toLowerCase().includes(search.toLowerCase())
  );

  const dropdown = open && !disabled && (
    <div
      ref={dropdownRef}
      style={dropdownStyle}
      className={dropdownClassName || "max-h-48 overflow-y-auto border border-[#7a9cc5] rounded bg-white shadow-lg text-left"}
    >
      {filtered.length === 0 ? (
        <div className="px-2 py-1.5 text-gray-500 italic text-[11px]">
          {lang === 'hi' ? 'कोई परिणाम नहीं' : 'No results found'}
        </div>
      ) : (
        filtered.map((opt) => (
          <div
            key={opt.value}
            onMouseDown={(e) => {
              e.preventDefault();
              onChange(opt.value);
              closeDropdown();
            }}
            className={`px-2 py-1.5 cursor-pointer text-[11px] hover:bg-[#f0f4f8] transition-colors ${
              String(value) === String(opt.value) ? 'bg-[#d0e0f8] font-bold text-[#0d2a4a]' : 'text-slate-700'
            }`}
          >
            {getLabel(opt)}
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="relative w-full" ref={triggerRef}>
      <input
        type="text"
        disabled={disabled}
        value={displayValue}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder || (lang === 'hi' ? '------चुनें------' : 'Select an option')}
        className={className || "w-full h-6 px-1 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-blue-500 cursor-text disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed"}
      />
      {createPortal(dropdown, document.body)}
    </div>
  );
}
