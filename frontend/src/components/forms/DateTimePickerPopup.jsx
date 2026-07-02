import { useState, useRef, useEffect } from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

/**
 * Shared calendar + hour/minute-slider date-time picker.
 * Renders a read-only "DD/MM/YYYY HH:MM" input, a search-icon trigger button, and
 * the popup itself, as siblings (no wrapping element) — the caller's own container
 * must already be `position: relative` so the popup anchors correctly, matching the
 * layout every call site already uses. Callers own any sibling inputs (e.g. a GD/FIR
 * number field) and receive the formatted result via onDone.
 */
export default function DateTimePickerPopup({
  value,
  onDone,
  disabled = false,
  placeholder = 'DD/MM/YYYY HH:MM',
  inputClassName = "w-40 h-6 px-1.5 border border-[#7a9cc5] rounded bg-white text-[11px] outline-none focus:border-blue-500 cursor-pointer",
  popupWidth = 340,
}) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(new Date().getDate());
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [hour, setHour] = useState(new Date().getHours());
  const [minute, setMinute] = useState(new Date().getMinutes());

  const popupRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const togglePicker = () => {
    if (disabled) return;
    if (!open) {
      if (value) {
        const [datePart, timePart] = value.split(' ');
        const dateParts = (datePart || '').split('/');
        if (dateParts.length === 3) {
          setDay(parseInt(dateParts[0], 10) || new Date().getDate());
          setMonth((parseInt(dateParts[1], 10) || 1) - 1);
          setYear(parseInt(dateParts[2], 10) || new Date().getFullYear());
        }
        if (timePart) {
          const timeParts = timePart.split(':');
          setHour(parseInt(timeParts[0], 10) || 0);
          setMinute(parseInt(timeParts[1], 10) || 0);
        }
      } else {
        const now = new Date();
        setDay(now.getDate());
        setMonth(now.getMonth());
        setYear(now.getFullYear());
        setHour(now.getHours());
        setMinute(now.getMinutes());
      }
    }
    setOpen((prev) => !prev);
  };

  const handlePrevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const handleNextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };
  const handleToday = () => {
    const now = new Date();
    setDay(now.getDate()); setMonth(now.getMonth()); setYear(now.getFullYear());
    setHour(now.getHours()); setMinute(now.getMinutes());
  };
  const handleDone = () => {
    const dd = String(day).padStart(2, '0');
    const mm = String(month + 1).padStart(2, '0');
    const hh = String(hour).padStart(2, '0');
    const mi = String(minute).padStart(2, '0');
    const formatted = `${dd}/${mm}/${year} ${hh}:${mi}`;
    onDone(formatted, `${dd}/${mm}/${year}`, `${hh}:${mi}`);
    setOpen(false);
  };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const blanks = Array.from({ length: firstDayOfWeek }, (_, i) => i);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <>
      <input
        type="text"
        disabled={disabled}
        value={value || ''}
        onClick={togglePicker}
        className={inputClassName}
        placeholder={placeholder}
        readOnly
      />
      {!disabled && (
        <button
          ref={triggerRef}
          type="button"
          onClick={togglePicker}
          className="p-1 text-[#0f52ba] hover:text-blue-700 bg-transparent border-none cursor-pointer flex items-center justify-center"
          title="Pick Date & Time"
        >
          <Search size={14} className="stroke-[2.5]" />
        </button>
      )}

      {open && (
        <div
          ref={popupRef}
          className="absolute top-full left-0 mt-1 bg-white border border-[#7a9cc5] shadow-2xl rounded-lg p-3 z-50 flex gap-4 text-slate-800 select-none"
          style={{ width: popupWidth }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Left: Calendar Panel */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-2">
              <button type="button" onClick={handlePrevMonth} className="p-0.5 rounded hover:bg-slate-100 text-[#0d2a4a] cursor-pointer bg-transparent border-none">
                <ChevronLeft size={16} />
              </button>
              <div className="flex items-center gap-1.5">
                <select
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="text-[11px] font-bold text-[#0d2a4a] border border-[#7a9cc5] rounded px-1.5 py-0.5 bg-white cursor-pointer outline-none font-display"
                >
                  {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
                </select>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="text-[11px] font-bold text-[#0d2a4a] border border-[#7a9cc5] rounded px-1.5 py-0.5 bg-white cursor-pointer outline-none font-display"
                >
                  {Array.from({ length: 21 }, (_, i) => 2015 + i).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <button type="button" onClick={handleNextMonth} className="p-0.5 rounded hover:bg-slate-100 text-[#0d2a4a] cursor-pointer bg-transparent border-none">
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-0 text-center mb-1">
              {DAY_LABELS.map((d) => (
                <span key={d} className="text-[10px] font-bold text-slate-500 py-0.5">{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0 text-center">
              {blanks.map((b) => <span key={`b-${b}`} />)}
              {days.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDay(d)}
                  className={`text-[11px] py-1 rounded cursor-pointer border-none transition-colors ${
                    d === day
                      ? 'bg-[#0f52ba] text-white font-bold'
                      : 'bg-transparent text-slate-700 hover:bg-blue-50'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200">
              <button type="button" onClick={handleToday} className="text-[10px] font-bold text-[#0f52ba] hover:underline cursor-pointer bg-transparent border-none">
                Today
              </button>
              <button type="button" onClick={handleDone} className="text-[10px] font-bold bg-[#ea580c] hover:bg-[#c2410c] text-white px-3 py-1 rounded cursor-pointer border-none transition-colors shadow-sm font-display">
                Done
              </button>
            </div>
          </div>

          {/* Right: Time sliders */}
          <div className="flex flex-col items-center gap-2 border-l border-slate-200 pl-3" style={{ minWidth: 80 }}>
            <div className="bg-[#f0f4f8] border border-[#7a9cc5] rounded px-2.5 py-1 text-center">
              <span className="text-[12px] font-bold text-[#0d2a4a] font-mono">
                {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')}
              </span>
            </div>
            <div className="flex gap-3 items-start" style={{ height: 150 }}>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[9px] text-slate-500 font-bold">Hr</span>
                <input
                  type="range"
                  min={0} max={23}
                  value={hour}
                  onChange={(e) => setHour(Number(e.target.value))}
                  className="datetime-picker-vertical-slider"
                />
              </div>
              <div className="flex flex-col items-center gap-1">
                <span className="text-[9px] text-slate-500 font-bold">Min</span>
                <input
                  type="range"
                  min={0} max={59}
                  value={minute}
                  onChange={(e) => setMinute(Number(e.target.value))}
                  className="datetime-picker-vertical-slider"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
