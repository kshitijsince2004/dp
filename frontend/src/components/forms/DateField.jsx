import React from 'react';
import DateInput from '../ui/DateInput.jsx';

const base = "w-full bg-white border-2 border-slate-200 text-slate-800 text-sm px-3.5 py-2.5 rounded-xl outline-none focus:border-[var(--accent-color)] transition-colors placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed";
const err  = "border-red-400 focus:border-red-500 bg-red-50";

export default function DateField({ id, disabled, value, onChange, status, placeholder, showTime = false }) {
  // DATE fields: dd/mm/yyyy. DATETIME fields: 'dd/mm/yyyy HH:mm' — split the
  // date portion into DateInput and keep the time portion in a plain input.
  const [datePart, timePart] = showTime ? String(value || '').split(' ') : [value, null];

  const handleDateChange = (dmy) => {
    if (!showTime) { onChange(dmy); return; }
    onChange(dmy ? `${dmy} ${timePart || '00:00'}` : '');
  };

  const handleTimeChange = (e) => {
    const t = e.target.value;
    onChange(datePart ? `${datePart} ${t}` : '');
  };

  if (!showTime) {
    return (
      <DateInput
        id={id}
        disabled={disabled}
        value={datePart || ''}
        onChange={handleDateChange}
        placeholder={placeholder || 'DD/MM/YYYY'}
        status={status}
        inputClassName={`${base} pr-9 ${status === 'error' ? err : ''}`}
      />
    );
  }

  return (
    <div className="flex gap-2">
      <DateInput
        id={id}
        disabled={disabled}
        value={datePart || ''}
        onChange={handleDateChange}
        placeholder="DD/MM/YYYY"
        status={status}
        className="flex-1"
        inputClassName={`${base} pr-9 ${status === 'error' ? err : ''}`}
      />
      <input
        type="time"
        disabled={disabled}
        value={timePart || ''}
        onChange={handleTimeChange}
        className={`${base} w-32 ${status === 'error' ? err : ''}`}
      />
    </div>
  );
}
