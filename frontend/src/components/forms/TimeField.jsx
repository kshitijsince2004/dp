import React, { useState } from 'react';

const base = "w-full bg-white border-2 border-slate-200 text-slate-800 text-sm px-3.5 py-2.5 rounded-xl outline-none focus:border-[var(--accent-color)] transition-colors placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed";
const err  = "border-red-400 focus:border-red-500 bg-red-50";

export default function TimeField({ id, disabled, value, onChange, status, placeholder }) {
  const [focused, setFocused] = useState(false);

  // Switch dynamically to native time input on focus or when value exists
  const showTimeInput = focused || !!value;

  return (
    <div className="w-full flex flex-col gap-1">
      <input
        id={id}
        type={showTimeInput ? "time" : "text"}
        disabled={disabled}
        value={value ? value.slice(0, 5) : ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder || 'HH:MM AM/PM'}
        className={`${base} ${status === 'error' ? err : ''}`}
      />
    </div>
  );
}
