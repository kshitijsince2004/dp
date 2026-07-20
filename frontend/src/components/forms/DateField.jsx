import React from 'react';
import DateInput from '../ui/DateInput.jsx';
import DateTimePickerPopup from './DateTimePickerPopup.jsx';

const base = "w-full bg-white border-2 border-slate-200 text-slate-800 text-sm px-3.5 py-2.5 rounded-xl outline-none focus:border-[var(--accent-color)] transition-colors placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed";
const err  = "border-red-400 focus:border-red-500 bg-red-50";

export default function DateField({ id, disabled, value, onChange, status, placeholder, showTime = false }) {
  const handleDateChange = (dmy) => {
    onChange(dmy);
  };

  if (!showTime) {
    return (
      <DateInput
        id={id}
        disabled={disabled}
        value={value || ''}
        onChange={handleDateChange}
        placeholder={placeholder || 'DD/MM/YYYY'}
        status={status}
        inputClassName={`${base} pr-9 ${status === 'error' ? err : ''}`}
      />
    );
  }

  // DATETIME fields: single "dd/mm/yyyy HH:mm" string, edited via the calendar +
  // hour/minute-slider popup (matches DATE fields' calendar styling, replaces the
  // previous plain native <input type="time"> pairing). DateTimePickerPopup renders
  // its input + trigger button as plain siblings (no wrapping element, by design —
  // see its own header comment), so the flex row + `position: relative` anchor for
  // the popup are supplied here.
  return (
    <div className="relative w-full">
      <DateTimePickerPopup
        value={value || ''}
        onDone={(formatted) => onChange(formatted)}
        disabled={disabled}
        placeholder={placeholder || 'DD/MM/YYYY HH:MM'}
        inputClassName={`${base} cursor-pointer flex-1 ${status === 'error' ? err : ''}`}
      />
    </div>
  );
}
