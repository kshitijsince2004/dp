import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { log } from '../../utils/logger.js';


export default function SearchableSelect({
  value,
  onChange,
  options = [],
  disabled,
  lang = 'en',
  placeholder,
  className,
  dropdownClassName,
  multiple = false,
  style,
  title,
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState({});
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  const getLabel = (opt) => opt.label || (lang === 'hi' ? (opt.label_hi || opt.label_en) : opt.label_en) || String(opt.value ?? '');

  const selectedValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',').map((v) => v.trim()).filter(Boolean)
      : [];

  const selected = options.find((o) => String(o.value) === String(value));

  const getSelectedLabels = () => {
    return selectedValues
      .map((val) => {
        const opt = options.find((o) => String(o.value) === String(val));
        return opt ? getLabel(opt) : val;
      })
      .filter(Boolean);
  };

  const displayValue = open
    ? search
    : multiple
      ? getSelectedLabels().join(', ')
      : selected
        ? getLabel(selected)
        : (value !== null && value !== undefined ? String(value) : '');

  const closeDropdown = () => {
    if (!multiple && search.trim() && !selected) {
      onChange(search.trim());
    }
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
        minWidth: Math.max(rect.width, 260),
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
        filtered.map((opt) => {
          const isChecked = selectedValues.some((v) => String(v) === String(opt.value));
          return (
            <div
              key={opt.value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                if (multiple) {
                  let nextValues;
                  if (isChecked) {
                    nextValues = selectedValues.filter((v) => String(v) !== String(opt.value));
                  } else {
                    nextValues = [...selectedValues, opt.value];
                  }
                  log.debug('form:searchable_select_change', { multiple: true, action: isChecked ? 'deselect' : 'select', value: opt.value });
                  onChange(Array.isArray(value) ? nextValues : nextValues.join(', '));
                } else {
                  log.debug('form:searchable_select_change', { multiple: false, value: opt.value });
                  onChange(opt.value);
                  closeDropdown();
                }
              }}
              className={`px-3.5 py-2.5 cursor-pointer text-sm sm:text-base hover:bg-[#f0f4f8] transition-colors flex items-center gap-2.5 ${
                isChecked ? 'bg-[#d0e0f8] font-bold text-[#0d2a4a]' : 'text-slate-700 font-medium'
              }`}
            >
              {multiple && (
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {}}
                  className="accent-[#0f52ba] h-4 w-4 rounded cursor-pointer"
                />
              )}
              <span>{getLabel(opt)}</span>
            </div>
          );
        })
      )}
    </div>
  );

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      if (open) {
        if (filtered.length > 0) {
          e.preventDefault();
          const targetOpt = filtered[0];
          if (multiple) {
            const isChecked = selectedValues.some((v) => String(v) === String(targetOpt.value));
            let nextValues;
            if (isChecked) {
              nextValues = selectedValues.filter((v) => String(v) !== String(targetOpt.value));
            } else {
              nextValues = [...selectedValues, targetOpt.value];
            }
            onChange(Array.isArray(value) ? nextValues : nextValues.join(', '));
          } else {
            onChange(targetOpt.value);
            setOpen(false);
            setSearch('');
          }
        } else if (search.trim()) {
          e.preventDefault();
          onChange(search.trim());
          setOpen(false);
          setSearch('');
        }
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const wrapperLayoutClass = className
    ? className.split(' ').filter(c => c.startsWith('flex') || c.startsWith('w-') || c.startsWith('h-') || c.startsWith('col-') || c.startsWith('grow') || c.startsWith('shrink')).join(' ')
    : 'w-full';

  let inputClass = className
    ? className.replace('flex-1', 'w-full')
    : "w-full min-h-[44px] px-3.5 py-2 border-2 border-[#7a9cc5] rounded-xl bg-white text-sm sm:text-base font-medium outline-none focus:border-blue-500 cursor-text disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed";

  if (!inputClass.includes('pr-')) {
    inputClass = `${inputClass} pr-7`;
  }

  return (
    <div className={`relative ${wrapperLayoutClass || 'w-full'}`} ref={triggerRef} title={title}>
      <input
        type="text"
        disabled={disabled}
        value={displayValue}
        onChange={(e) => {
          const text = e.target.value;
          setSearch(text);
          setOpen(true);
          if (!multiple && text.trim()) {
            const exactMatch = options.find((o) =>
              String(o.value).toUpperCase() === text.trim().toUpperCase() ||
              String(getLabel(o)).toUpperCase() === text.trim().toUpperCase()
            );
            if (exactMatch) {
              onChange(exactMatch.value);
            }
          }
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        placeholder={placeholder || (lang === 'hi' ? 'विकल्प चुनें' : 'select an option')}
        className={inputClass}
        style={style}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-xs">
        ▼
      </span>
      {createPortal(dropdown, document.body)}
    </div>
  );
}
