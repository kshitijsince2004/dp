import React from 'react';

// Unified color-coded record type badges — covers every record type in PHAROS.
// FIR/CASE and ARREST are distinct from each other and from UIDB/MISSING/PCR_CALL/LEFT_OUT/KALANDRA.
export const RECORD_TYPE_BADGE = {
  CASE:      { label: 'FIR / Case',  bg: 'bg-blue-100 dark:bg-blue-950/60',     text: 'text-blue-800 dark:text-blue-300',     border: 'border-blue-300 dark:border-blue-800',     dot: 'bg-blue-600 dark:bg-blue-400' },
  ARREST:    { label: 'Arrest',      bg: 'bg-violet-100 dark:bg-violet-950/60', text: 'text-violet-800 dark:text-violet-300', border: 'border-violet-300 dark:border-violet-800', dot: 'bg-violet-600 dark:bg-violet-400' },
  UIDB:      { label: 'UIDB',        bg: 'bg-teal-100 dark:bg-teal-950/60',     text: 'text-teal-800 dark:text-teal-300',     border: 'border-teal-300 dark:border-teal-800',     dot: 'bg-teal-600 dark:bg-teal-400' },
  MISSING:   { label: 'Missing',     bg: 'bg-amber-100 dark:bg-amber-950/60',  text: 'text-amber-800 dark:text-amber-300',  border: 'border-amber-300 dark:border-amber-800',  dot: 'bg-amber-600 dark:bg-amber-400' },
  PCR_CALL:  { label: 'PCR Call',    bg: 'bg-orange-100 dark:bg-orange-950/60', text: 'text-orange-800 dark:text-orange-300', border: 'border-orange-300 dark:border-orange-800', dot: 'bg-orange-600 dark:bg-orange-400' },
  LEFT_OUT:  { label: 'Left Out',    bg: 'bg-rose-100 dark:bg-rose-950/60',     text: 'text-rose-800 dark:text-rose-300',     border: 'border-rose-300 dark:border-rose-800',     dot: 'bg-rose-600 dark:bg-rose-400' },
  KALANDRA:  { label: 'Kalandra',    bg: 'bg-emerald-100 dark:bg-emerald-950/60', text: 'text-emerald-800 dark:text-emerald-300', border: 'border-emerald-300 dark:border-emerald-800', dot: 'bg-emerald-600 dark:bg-emerald-400' },
};

export default function RecordTypeBadge({ recordType, className = '' }) {
  const key = String(recordType || '').toUpperCase();
  const cfg = RECORD_TYPE_BADGE[key] || {
    label: recordType || 'Unknown',
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-300 dark:border-slate-700',
    dot: 'bg-slate-500'
  };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-bold border shadow-xs ${cfg.bg} ${cfg.text} ${cfg.border} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}
